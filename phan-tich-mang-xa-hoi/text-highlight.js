(() => {
  const STORAGE_KEY = "sna-noidung-bt-buoi1-bai1-highlights";
  const MARK_CLASS = "user-hl";

  const getRoot = () => document.getElementById("script-content");

  const unwrapMark = (mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  };

  const clearHighlights = () => {
    const root = getRoot();
    if (!root) return;
    root.querySelectorAll(`mark.${MARK_CLASS}`).forEach(unwrapMark);
    persist();
  };

  const selectionInsideRoot = (range, root) =>
    root.contains(range.commonAncestorContainer);

  const surroundsMarkOnly = (range) => {
    const node = range.commonAncestorContainer;
    if (node.nodeType === Node.ELEMENT_NODE && node.matches?.(`mark.${MARK_CLASS}`)) {
      return node;
    }
    const start = range.startContainer;
    const end = range.endContainer;
    const startMark = start.nodeType === Node.TEXT_NODE ? start.parentElement : start;
    const endMark = end.nodeType === Node.TEXT_NODE ? end.parentElement : end;
    if (
      startMark?.matches?.(`mark.${MARK_CLASS}`) &&
      startMark === endMark &&
      range.toString() === startMark.textContent
    ) {
      return startMark;
    }
    return null;
  };

  const highlightSelection = () => {
    const root = getRoot();
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    if (!selectionInsideRoot(range, root)) return;
    if (!range.toString().trim()) return;

    const existing = surroundsMarkOnly(range);
    if (existing) {
      unwrapMark(existing);
      sel.removeAllRanges();
      persist();
      return;
    }

    const mark = document.createElement("mark");
    mark.className = MARK_CLASS;
    mark.title = "Bấm để bỏ highlight đoạn này";

    try {
      range.surroundContents(mark);
    } catch (_) {
      const fragment = range.extractContents();
      mark.appendChild(fragment);
      range.insertNode(mark);
    }

    sel.removeAllRanges();
    persist();
  };

  const plainText = (source) => {
    const el =
      typeof source === "string"
        ? Object.assign(document.createElement("div"), { innerHTML: source })
        : source.cloneNode(true);
    el.querySelectorAll(`mark.${MARK_CLASS}`).forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
    });
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  };

  const persist = () => {
    const root = getRoot();
    if (!root) return;
    try {
      localStorage.setItem(`${STORAGE_KEY}:html`, root.innerHTML);
      localStorage.setItem(`${STORAGE_KEY}:text`, plainText(root));
    } catch (_) {
      /* ignore quota / private mode */
    }
  };

  const restore = () => {
    const root = getRoot();
    if (!root) return;
    try {
      const html = localStorage.getItem(`${STORAGE_KEY}:html`);
      const savedText = localStorage.getItem(`${STORAGE_KEY}:text`);
      if (!html || !html.includes(MARK_CLASS) || !savedText) return;
      if (plainText(root) !== savedText) return;
      if (plainText(html) !== savedText) return;
      root.innerHTML = html;
    } catch (_) {
      /* ignore */
    }
  };

  const bind = () => {
    const hlBtn = document.getElementById("highlightBtn");
    const clearBtn = document.getElementById("clearHighlightBtn");
    const root = getRoot();

    restore();

    hlBtn?.addEventListener("click", highlightSelection);
    clearBtn?.addEventListener("click", () => {
      if (!root?.querySelector(`mark.${MARK_CLASS}`)) return;
      clearHighlights();
    });

    root?.addEventListener("click", (e) => {
      const mark = e.target.closest?.(`mark.${MARK_CLASS}`);
      if (!mark || !root.contains(mark)) return;
      unwrapMark(mark);
      persist();
    });
  };

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;

    const key = e.key.toLowerCase();
    if (key === "h") {
      e.preventDefault();
      highlightSelection();
    } else if (key === "c" && e.shiftKey) {
      e.preventDefault();
      clearHighlights();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
