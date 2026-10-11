#!/usr/bin/env python3
"""Quét folder con và cập nhật bảng danh sách file trong từng index.html."""

from __future__ import annotations

import html
import json
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
MENU_JSON = ROOT / "data" / "menu.json"
SKIP_NAMES = {"index.html", ".DS_Store", "files.json"}
SKIP_DIRS = {".git", "css", "js", "scripts", ".github", "data"}
DISPLAY_TZ = ZoneInfo("Asia/Ho_Chi_Minh")  # UTC+7


def format_size(num: int) -> str:
    if num < 1024:
        return f"{num} B"
    for unit in ("KB", "MB", "GB"):
        num /= 1024.0
        if num < 1024:
            return f"{num:.1f} {unit}"
    return f"{num:.1f} TB"


def format_mtime(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=DISPLAY_TZ).strftime("%d/%m/%y, %H:%M:%S")


def collect_entries(folder: Path) -> list[dict]:
    entries: list[dict] = []
    for path in sorted(folder.iterdir(), key=lambda p: p.name.lower()):
        if not path.is_file():
            continue
        if path.name in SKIP_NAMES or path.name.startswith("."):
            continue
        if path.suffix.lower() != ".html":
            continue
        stat = path.stat()
        entries.append(
            {
                "name": path.name,
                "is_dir": False,
                "size": format_size(stat.st_size),
                "mtime": format_mtime(stat.st_mtime),
                "href": path.name,
            }
        )
    return entries


def render_rows(entries: list[dict]) -> str:
    if not entries:
        return (
            '        <tr class="file-table__empty">\n'
            '          <td colspan="3">Chưa có file HTML trong thư mục này.</td>\n'
            "        </tr>"
        )

    rows: list[str] = []
    for item in entries:
        icon = "📁" if item["is_dir"] else "📄"
        name = html.escape(item["name"])
        href = html.escape(item["href"])
        size = html.escape(item["size"])
        mtime = html.escape(item["mtime"])
        label = f"{name}/" if item["is_dir"] else name
        rows.append(
            "        <tr>\n"
            f'          <td class="file-table__name">'
            f'<a href="{href}"><span class="file-table__icon" aria-hidden="true">{icon}</span>'
            f"{html.escape(label)}</a></td>\n"
            f'          <td class="file-table__size">{size}</td>\n'
            f'          <td class="file-table__date">{mtime}</td>\n'
            "        </tr>"
        )
    return "\n".join(rows)


def build_page(title: str, folder_label: str, back_href: str, css_href: str, rows: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Danh sách file — {html.escape(title)}">
  <title>{html.escape(title)} — ThS HUIT</title>
  <link rel="icon" href="../favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="../apple-touch-icon.png">
  <link rel="stylesheet" href="{css_href}">
</head>
<body>
  <a class="skip-link" href="#main-content">Bỏ qua đến nội dung chính</a>

  <div class="container">
    <nav class="page-nav" aria-label="Điều hướng">
      <a href="{back_href}index.html">← Back</a>
    </nav>

    <header class="site-header site-header--compact">
      <span class="site-header__brand">ThS HUIT</span>
      <h1>Index of {html.escape(folder_label)}/</h1>
      <p>Danh sách file HTML trong thư mục.</p>
    </header>

    <main id="main-content">
      <div class="file-panel">
        <table class="file-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Size</th>
              <th scope="col">Date Modified</th>
            </tr>
          </thead>
          <tbody>
{rows}
          </tbody>
        </table>
      </div>
    </main>

    <footer class="site-footer">
      <p>ThS HUIT · {html.escape(title)}</p>
    </footer>
  </div>
</body>
</html>
"""


def load_folder_titles() -> dict[str, str]:
    if not MENU_JSON.exists():
        return {}
    data = json.loads(MENU_JSON.read_text(encoding="utf-8"))
    titles: dict[str, str] = {}
    for item in data.get("items", []):
        folder_id = item.get("id")
        if folder_id:
            titles[folder_id] = item.get("title") or folder_id
    return titles


def main() -> None:
    folder_titles = load_folder_titles()
    updated = 0
    for child in sorted(ROOT.iterdir()):
        if not child.is_dir() or child.name in SKIP_DIRS or child.name.startswith("."):
            continue

        title = folder_titles.get(child.name, child.name.replace("-", " ").title())
        entries = collect_entries(child)
        rows = render_rows(entries)
        page = build_page(
            title=title,
            folder_label=child.name,
            back_href="../",
            css_href="../css/style.css",
            rows=rows,
        )
        (child / "index.html").write_text(page, encoding="utf-8")
        updated += 1
        print(f"✓ {child.name}/index.html ({len(entries)} mục)")

    print(f"\nĐã cập nhật {updated} trang danh sách.")


if __name__ == "__main__":
    os.chdir(ROOT)
    main()
