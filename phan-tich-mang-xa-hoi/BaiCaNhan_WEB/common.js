(() => {
  const THEME_KEY = "tmdb-sna-theme";

  const fmt = {
    int: (n) => (n == null || Number.isNaN(n) ? "—" : Number(n).toLocaleString("vi-VN")),
    float: (n, d = 4) => (n == null || Number.isNaN(n) ? "—" : Number(n).toFixed(d)),
    year: (dateStr) => (dateStr ? String(dateStr).slice(0, 4) : "—"),
  };

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }

  function setLoading(text, hide = false) {
    const el = document.getElementById("loading");
    if (!el) return;
    if (hide) {
      el.classList.add("hidden");
      return;
    }
    el.setAttribute("role", "status");
    el.textContent = text;
    el.classList.remove("hidden");
  }

  /** Hiện lỗi tải kèm nút "Thử lại"; nếu mở bằng file:// thì gợi ý chạy server cục bộ. */
  function showError(message, detail) {
    const el = document.getElementById("loading");
    if (!el) return;
    el.textContent = "";
    el.setAttribute("role", "alert");
    el.classList.remove("hidden");
    const box = document.createElement("div");
    box.className = "load-error";
    const title = document.createElement("p");
    title.className = "load-error-title";
    title.textContent = message;
    box.appendChild(title);
    if (detail) {
      const p = document.createElement("p");
      p.className = "load-error-hint";
      p.textContent = detail;
      box.appendChild(p);
    }
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "cine-btn cine-btn-primary";
    retry.textContent = "Thử lại";
    retry.addEventListener("click", () => window.location.reload());
    box.appendChild(retry);
    el.appendChild(box);
    retry.focus();
  }

  function setupThemeToggle(onChange) {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;
    const apply = (theme) => {
      document.documentElement.setAttribute("data-theme", theme);
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch (_) {}
      btn.setAttribute(
        "aria-label",
        theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"
      );
      if (typeof onChange === "function") onChange(theme);
    };
    btn.addEventListener("click", () => {
      apply(currentTheme() === "dark" ? "light" : "dark");
    });
    apply(currentTheme());
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function queryParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (_) {
      return null;
    }
  }

  const IDB_NAME = "cineinfo";
  const IDB_STORE = "json";
  let dbPromise = null;

  function openCacheDb() {
    if (!window.indexedDB) return Promise.reject(new Error("IndexedDB không có"));
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch((err) => {
        dbPromise = null;
        throw err;
      });
    }
    return dbPromise;
  }

  function idbGet(db, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  function idbPut(db, key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("idb abort"));
    });
  }

  function readCached(record) {
    if (!record) return null;
    if (typeof record.text === "string") return JSON.parse(record.text);
    if (record.data != null) return record.data;
    return null;
  }

  async function fetchJson(url, cached) {
    const headers = {};
    if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;
    const res = await fetch(url, { cache: "no-store", headers });
    if (res.status === 304 && cached) return { changed: false };
    if (!res.ok) {
      const error = new Error(`${url} HTTP ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return {
      text: await res.text(),
      changed: true,
      lastModified: res.headers.get("Last-Modified") || "",
    };
  }

  /** file:// chặn fetch. Đọc bản .js bọc sẵn trong file-data/. */
  function loadJsonFromScript(url) {
    const name = url.split("/").pop();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "file-data/" + name + ".js";
      script.onload = () => {
        const data = globalThis.__SNA_FILES && globalThis.__SNA_FILES[name];
        script.remove();
        if (data == null) reject(new Error("Không đọc được " + url));
        else resolve(data);
      };
      script.onerror = () => {
        script.remove();
        reject(new Error("Không đọc được " + url));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Hỏi Last-Modified trước khi vẽ.
   * 304: file không đổi, đọc IndexedDB.
   * 200: file mới, ghi đè IndexedDB rồi trả bản mới.
   * Mất mạng mà đã có cache thì dùng cache.
   * Mở trực tiếp file thì đọc file-data/*.js.
   */
  async function loadJson(url, options = {}) {
    const { required = true } = options;
    if (location.protocol === "file:") {
      try {
        return await loadJsonFromScript(url);
      } catch (err) {
        if (!required) return null;
        throw err;
      }
    }
    let db = null;
    let cached = null;
    try {
      db = await openCacheDb();
      cached = await idbGet(db, url);
    } catch (err) {
      console.warn("IndexedDB", err);
    }

    let result;
    try {
      result = await fetchJson(url, cached);
    } catch (err) {
      const fallback = readCached(cached);
      if (fallback != null) return fallback;
      if (!required || err.status === 404) return null;
      throw err;
    }

    if (!result.changed) {
      if (db && cached && typeof cached.text !== "string" && cached.data != null) {
        try {
          await idbPut(db, url, {
            text: JSON.stringify(cached.data),
            lastModified: cached.lastModified || "",
            savedAt: Date.now(),
          });
        } catch (_) {}
      }
      const data = readCached(cached);
      if (data != null) return data;
      if (!required) return null;
      throw new Error(`Không tải được ${url}`);
    }

    if (result.text == null) {
      if (!required) return null;
      throw new Error(`Không tải được ${url}`);
    }

    if (db) {
      try {
        await idbPut(db, url, {
          text: result.text,
          lastModified: result.lastModified,
          savedAt: Date.now(),
        });
      } catch (err) {
        console.warn("Không ghi được IndexedDB", url, err);
      }
    }
    return JSON.parse(result.text);
  }

  window.SNA = {
    THEME_KEY,
    fmt,
    currentTheme,
    setLoading,
    showError,
    setupThemeToggle,
    escapeHtml,
    queryParam,
    loadJson,
  };
})();
