(function () {
  const DATA_URL = "data/menu.json";

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderMenu(data) {
    const brand = document.querySelector("[data-bind='brand']");
    const title = document.querySelector("[data-bind='title']");
    const description = document.querySelector("[data-bind='description']");
    const footer = document.querySelector("[data-bind='footer']");
    const list = document.getElementById("menu-list");

    if (brand) brand.textContent = data.brand || "ThS HUIT";
    if (title) title.textContent = data.title || "Menu tài liệu";
    if (description) description.textContent = data.description || "";
    if (footer) footer.textContent = data.footer || "";

    if (!list) return;

    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) {
      list.innerHTML =
        '<li class="menu__status" role="status">Chưa có mục nào trong menu.json.</li>';
      return;
    }

    list.innerHTML = items
      .map((item) => {
        const href = escapeHtml(item.path || `${item.id}/`);
        const itemTitle = escapeHtml(item.title || item.id || "Không tên");
        const itemDesc = escapeHtml(item.description || "");
        return (
          `<li class="menu__item">` +
          `<a href="${href}">` +
          `<span>` +
          `<span class="menu__title">${itemTitle}</span>` +
          (itemDesc ? `<span class="menu__desc">${itemDesc}</span>` : "") +
          `</span>` +
          `<span class="menu__arrow" aria-hidden="true">→</span>` +
          `</a>` +
          `</li>`
        );
      })
      .join("");
  }

  function showError(message) {
    const list = document.getElementById("menu-list");
    if (!list) return;
    list.innerHTML =
      `<li class="menu__status menu__status--error" role="alert">${escapeHtml(message)}</li>`;
  }

  async function loadMenu() {
    try {
      const response = await fetch(DATA_URL, { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(`Không tải được ${DATA_URL} (${response.status})`);
      }
      const data = await response.json();
      renderMenu(data);
    } catch (error) {
      console.error(error);
      showError(
        "Không tải được dữ liệu menu. Hãy mở site bằng HTTP server (không dùng file://)."
      );
    }
  }

  loadMenu();
})();
