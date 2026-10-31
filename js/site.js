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

  const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Tooltip chỉ khi chữ bị cắt bằng … ---------- */
  function syncEllipsisTips() {
    document.querySelectorAll("[data-ellipsis-tip]").forEach((el) => {
      const full = (el.dataset.fullTitle || el.getAttribute("title") || el.textContent || "").trim();
      if (!full) return;
      el.dataset.fullTitle = full;
      if (el.scrollWidth > el.clientWidth + 1) el.title = full;
      else el.removeAttribute("title");
    });
  }

  syncEllipsisTips();
  window.addEventListener("resize", syncEllipsisTips);

  /* ---------- Cuộn mượt cho link nội trang (không dùng scroll-behavior toàn trang) ---------- */
  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link || link.getAttribute("href").length < 2) return;
    const target = document.getElementById(decodeURIComponent(link.getAttribute("href").slice(1)));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    if (!target.matches("a, button, input, [tabindex]")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
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
    const pager = scope.id ? document.querySelector(`[data-pager-for="#${scope.id}"]`) : null;
    const pageSize = pager ? parseInt(scope.dataset.pageSize, 10) || 0 : 0;
    let page = 1;
    let lastQuery = "";

    const renderPager = (pages) => {
      pager.hidden = pages <= 1;
      const list = pager.querySelector(".pager__list");
      if (list.children.length !== pages) {
        list.innerHTML = Array.from({ length: pages }, (_, i) =>
          `<li><button type="button" class="pager__num" data-page="${i + 1}" aria-label="Trang ${i + 1}">${i + 1}</button></li>`
        ).join("");
      }
      list.querySelectorAll("[data-page]").forEach((btn) => {
        if (Number(btn.dataset.page) === page) btn.setAttribute("aria-current", "page");
        else btn.removeAttribute("aria-current");
      });
      pager.querySelector('[data-page-step="-1"]').disabled = page <= 1;
      pager.querySelector('[data-page-step="1"]').disabled = page >= pages;
    };

    const run = () => {
      const q = normalize(input.value.trim());
      if (q !== lastQuery) {
        page = 1;
        lastQuery = q;
      }
      const items = scope.querySelectorAll("[data-filter-item]");
      const matched = [];
      items.forEach((el) => {
        const match = !q || normalize(el.dataset.filterText || el.textContent).includes(q);
        if (match) matched.push(el);
        el.hidden = !match;
      });
      const shown = matched.length;
      if (pageSize) {
        const pages = Math.max(1, Math.ceil(shown / pageSize));
        page = Math.min(page, pages);
        const start = (page - 1) * pageSize;
        matched.forEach((el, i) => {
          el.hidden = i < start || i >= start + pageSize;
        });
        scope.dataset.paged = "";
        renderPager(pages);
      }
      if (countEl) {
        countEl.textContent = q ? `${shown}/${items.length} ${unit}` : `${items.length} ${unit}`;
      }
      if (emptyEl) emptyEl.hidden = !(q && shown === 0 && items.length > 0);
    };

    if (pager) {
      pager.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn || btn.disabled) return;
        if (btn.dataset.page) page = Number(btn.dataset.page);
        else if (btn.dataset.pageStep) page += Number(btn.dataset.pageStep);
        else return;
        run();
        const section = scope.closest("section") || scope;
        if (section.getBoundingClientRect().top < 0) {
          section.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
        }
      });
    }

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

  /* ---------- Search thu gọn thành icon trên màn hình hẹp ---------- */
  const header = document.querySelector(".site-header");
  const searchToggle = document.querySelector("[data-search-toggle]");

  function setSearchOpen(open) {
    if (!header || !searchToggle) return;
    if (open) header.dataset.searchOpen = "";
    else delete header.dataset.searchOpen;
    searchToggle.setAttribute("aria-expanded", open ? "true" : "false");
    requestAnimationFrame(syncEllipsisTips);
  }

  function focusSearch() {
    const input = document.querySelector("input[data-filter]");
    if (!input) return null;
    if (searchToggle && getComputedStyle(searchToggle).display !== "none") setSearchOpen(true);
    input.focus({ preventScroll: true });
    return input;
  }

  if (searchToggle) {
    const input = document.querySelector("input[data-filter]");
    searchToggle.addEventListener("click", () => focusSearch());
    input.addEventListener("blur", () => {
      if (!input.value) setSearchOpen(false);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !input.value) {
        setSearchOpen(false);
        searchToggle.focus();
      }
    });
  }

  document.querySelectorAll("[data-focus-search]").forEach((btn) => {
    btn.addEventListener("click", () => focusSearch());
  });

  // Phím "/" để nhảy vào ô tìm kiếm
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (document.querySelector("input[data-filter]")) {
      e.preventDefault();
      focusSearch();
    }
  });

  /* ---------- Thu gọn / mở rộng menu ---------- */
  const NAV_KEY = "ths-nav";
  if (!window.__thsNavBound) {
    window.__thsNavBound = true;

    function navState() {
      return root.dataset.nav === "collapsed" ? "collapsed" : "expanded";
    }

    function applyNav(state) {
      const next = state === "collapsed" ? "collapsed" : "expanded";
      root.dataset.nav = next;
      const expanded = next === "expanded";
      document.querySelectorAll("[data-nav-toggle]").forEach((btn) => {
        const label = expanded ? "Thu gọn menu" : "Mở rộng menu";
        btn.setAttribute("aria-expanded", expanded ? "true" : "false");
        btn.setAttribute("aria-label", label);
        btn.title = label;
      });
    }

    applyNav(navState());

    document.querySelectorAll("[data-nav-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        root.dataset.navAnim = "1";
        const next = navState() === "collapsed" ? "expanded" : "collapsed";
        try {
          localStorage.setItem(NAV_KEY, next);
        } catch (e) {
          /* ignore */
        }
        applyNav(next);
      });
    });
  }
})();
