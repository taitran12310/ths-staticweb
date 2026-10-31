(function () {
  const THEME_KEY = "ths-theme";
  const root = document.documentElement;

  function storedTheme() {
    try {
      const t = localStorage.getItem(THEME_KEY);
      return t === "light" || t === "dark" ? t : null;
    } catch (e) {
      return null;
    }
  }

  function systemTheme() {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      const label = theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối";
      btn.setAttribute("aria-label", label);
      btn.title = label;
      btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    });
  }

  applyTheme(root.dataset.theme || storedTheme() || systemTheme());

  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        /* localStorage bị chặn → chỉ đổi trong phiên hiện tại */
      }
      applyTheme(next);
    });
  });

  // Chưa chọn theme thủ công → đi theo hệ điều hành
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (!storedTheme()) applyTheme(systemTheme());
  });

  /* ---------- Lọc danh sách ---------- */
  const normalize = (s) =>
    String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d");

  function setupFilter(input) {
    const scope = document.querySelector(input.dataset.filter);
    if (!scope) return;
    const countEl = document.querySelector(input.dataset.filterCount || "");
    const emptyEl = document.querySelector(input.dataset.filterEmpty || "");
    const unit = input.dataset.filterUnit || "mục";

    const run = () => {
      const q = normalize(input.value.trim());
      const items = scope.querySelectorAll("[data-filter-item]");
      let shown = 0;
      items.forEach((el) => {
        const match = !q || normalize(el.dataset.filterText || el.textContent).includes(q);
        el.hidden = !match;
        if (match) shown++;
      });
      if (countEl) {
        countEl.textContent = q ? `${shown}/${items.length} ${unit}` : `${items.length} ${unit}`;
      }
      if (emptyEl) emptyEl.hidden = !(q && shown === 0 && items.length > 0);
    };

    input.addEventListener("input", run);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && input.value) {
        input.value = "";
        run();
      }
    });
    input.refreshFilter = run;
    run();
  }

  document.querySelectorAll("input[data-filter]").forEach(setupFilter);

  document.querySelectorAll("[data-focus-search]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.querySelector("input[data-filter]");
      if (!input) return;
      input.scrollIntoView({ block: "center" });
      input.focus({ preventScroll: true });
    });
  });

  // Phím "/" để nhảy vào ô tìm kiếm
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const input = document.querySelector("input[data-filter]");
    if (input) {
      e.preventDefault();
      input.focus();
    }
  });
})();
