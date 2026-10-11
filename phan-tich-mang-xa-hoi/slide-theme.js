(() => {
  const KEY = "sna-slide-theme";
  const root = document.documentElement;

  const getTheme = () => (root.getAttribute("data-theme") === "dark" ? "dark" : "light");

  const updateBtn = () => {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;
    const isLight = getTheme() === "light";
    btn.setAttribute("aria-pressed", String(isLight));
    btn.setAttribute(
      "aria-label",
      isLight ? "Chuyển sang theme tối" : "Chuyển sang theme sáng (máy chiếu)"
    );
    btn.title = isLight
      ? "Theme sáng (mặc định) · bấm để về tối (phím T)"
      : "Theme tối · bấm để sáng — phù hợp máy chiếu (phím T)";
    btn.textContent = isLight ? "Dark" : "Light";
  };

  const apply = (theme) => {
    root.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    try {
      localStorage.setItem(KEY, theme === "dark" ? "dark" : "light");
    } catch (_) {
      /* ignore */
    }
    updateBtn();
  };

  const toggle = () => apply(getTheme() === "light" ? "dark" : "light");

  const bind = () => {
    const btn = document.getElementById("themeToggle");
    if (btn) btn.addEventListener("click", toggle);
    updateBtn();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "t" || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
    e.preventDefault();
    toggle();
  });
})();
