#!/usr/bin/env python3
"""Sinh trang chủ, trang danh sách từng môn, sitemap.xml, robots.txt và llms.txt.

Mọi nội dung được render sẵn thành HTML tĩnh (không phụ thuộc JS) để công cụ tìm kiếm
và AI crawler đọc được, đồng thời mở trực tiếp bằng file:// vẫn chạy.

Date Modified lấy thời điểm commit cuối sửa từng file (author date, UTC+7).
mtime trên đĩa không dùng được lúc deploy: checkout ghi mọi file cùng một lúc.
"""

from __future__ import annotations

import html
import json
import os
import re
import subprocess
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
MENU_JSON = ROOT / "data" / "menu.json"
SKIP_NAMES = {"index.html", ".DS_Store", "files.json"}
SKIP_DIRS = {".git", "css", "js", "scripts", ".github", "data", "assets"}
DISPLAY_TZ = ZoneInfo("Asia/Ho_Chi_Minh")  # UTC+7
DEFAULT_SITE_URL = "https://taitran12310.github.io/ths-staticweb/"
TONES = ("mint", "peach", "butter", "sky")
# Môn có icon clay riêng trong assets/course-<icon>.webp
CLAY_ICONS = {"algorithm", "code", "research", "network", "vision", "philosophy", "math"}
UNIVERSITY = {
    "@type": "CollegeOrUniversity",
    "@id": "https://huit.edu.vn/#org",
    "name": "Trường Đại học Công Thương TP. Hồ Chí Minh (HUIT)",
    "url": "https://huit.edu.vn/",
}


# ---------------------------------------------------------------- dữ liệu file

def format_size(num: float) -> str:
    if num < 1024:
        return f"{int(num)} B"
    for unit in ("KB", "MB", "GB"):
        num /= 1024.0
        if num < 1024:
            return f"{num:.1f} {unit}"
    return f"{num:.1f} TB"


def to_dt(ts: float) -> datetime:
    return datetime.fromtimestamp(ts, tz=DISPLAY_TZ)


def format_mtime(ts: float) -> str:
    return to_dt(ts).strftime("%d/%m/%y, %H:%M:%S")


def format_date(ts: float) -> str:
    return to_dt(ts).strftime("%d/%m/%Y")


def iso(ts: float) -> str:
    return to_dt(ts).isoformat(timespec="seconds")


def git_output(args: list[str]) -> subprocess.CompletedProcess[str] | None:
    try:
        return subprocess.run(["git", *args], cwd=ROOT, check=False, capture_output=True, text=True)
    except OSError:
        return None


def ensure_full_git_history() -> bool:
    """True khi đọc được lịch sử git. Shallow clone không đủ để biết lần sửa từng file."""
    result = git_output(["rev-parse", "--is-inside-work-tree"])
    if result is None or result.returncode != 0 or result.stdout.strip() != "true":
        print("Không thấy git repo — Date Modified dùng mtime trên đĩa.")
        return False

    shallow = git_output(["rev-parse", "--is-shallow-repository"])
    if shallow is not None and shallow.stdout.strip() == "true":
        raise SystemExit(
            "Kho git đang shallow. Checkout cần fetch-depth: 0 "
            "để Date Modified là lần commit cuối của từng file, không phải lúc deploy."
        )
    return True


def load_git_mtimes() -> dict[str, float]:
    """Đường dẫn tương đối repo -> unix time của commit cuối cùng sửa file đó."""
    result = git_output(["log", "--diff-filter=ACMR", "--pretty=format:%at", "--name-only"])
    if result is None or result.returncode != 0:
        return {}

    mtimes: dict[str, float] = {}
    current_ts: float | None = None
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            current_ts = None
            continue
        if current_ts is None and line.isdigit():
            current_ts = float(line)
            continue
        if current_ts is None or line in mtimes:
            continue
        mtimes[line] = current_ts
    return mtimes


def file_timestamp(path: Path, git_mtimes: dict[str, float]) -> float:
    rel = path.relative_to(ROOT).as_posix()
    if rel in git_mtimes:
        return git_mtimes[rel]
    return path.stat().st_mtime


TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.S | re.I)


def html_title(path: Path) -> str | None:
    head = path.read_text(encoding="utf-8", errors="ignore")[:200_000]
    m = TITLE_RE.search(head)
    if not m:
        return None
    title = html.unescape(re.sub(r"\s+", " ", m.group(1))).strip()
    return title or None


def collect_entries(folder: Path, git_mtimes: dict[str, float]) -> list[dict]:
    entries: list[dict] = []
    if not folder.is_dir():
        return entries
    for path in sorted(folder.iterdir(), key=lambda p: p.name.lower()):
        if not path.is_file() or path.name in SKIP_NAMES or path.name.startswith("."):
            continue
        if path.suffix.lower() != ".html":
            continue
        ts = file_timestamp(path, git_mtimes)
        entries.append(
            {
                "name": path.name,
                "title": html_title(path) or path.stem.replace("_", " "),
                "size": format_size(path.stat().st_size),
                "mtime": format_mtime(ts),
                "ts": ts,
                "href": path.name,
            }
        )
    return entries


def load_site(git_mtimes: dict[str, float]) -> tuple[dict, list[dict]]:
    menu = json.loads(MENU_JSON.read_text(encoding="utf-8")) if MENU_JSON.exists() else {}
    site_url = (menu.get("siteUrl") or DEFAULT_SITE_URL).rstrip("/") + "/"
    menu["siteUrl"] = site_url

    courses: list[dict] = []
    seen: set[str] = set()
    for item in menu.get("items", []):
        cid = item.get("id")
        if not cid:
            continue
        seen.add(cid)
        courses.append(dict(item))

    # Folder có trên đĩa nhưng chưa khai báo trong menu.json
    for child in sorted(ROOT.iterdir()):
        if child.is_dir() and child.name not in SKIP_DIRS and not child.name.startswith(".") and child.name not in seen:
            courses.append({"id": child.name, "title": child.name.replace("-", " ").title()})

    for i, c in enumerate(courses):
        c.setdefault("title", c["id"])
        c.setdefault("description", "")
        c["tone"] = c.get("tone") if c.get("tone") in TONES else TONES[i % len(TONES)]
        c["entries"] = collect_entries(ROOT / c["id"], git_mtimes)
        c["latest"] = max((e["ts"] for e in c["entries"]), default=None)
        c["href"] = f"{c['id']}/index.html"
        c["url"] = f"{site_url}{c['id']}/"
    return menu, courses


def term_label(c: dict) -> str:
    bits = []
    if c.get("term"):
        bits.append(c["term"])
    if c.get("schoolYear"):
        bits.append(f"Năm học {c['schoolYear']}")
    return " · ".join(bits)


# ---------------------------------------------------------------- khối HTML dùng chung

e = html.escape

SPRITE = """<svg class="sprite" aria-hidden="true" focusable="false">
  <symbol id="i-home" viewBox="0 0 24 24"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></symbol>
  <symbol id="i-file" viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></symbol>
  <symbol id="i-folder" viewBox="0 0 24 24"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></symbol>
  <symbol id="i-layers" viewBox="0 0 24 24"><path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></symbol>
  <symbol id="i-book" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></symbol>
  <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></symbol>
  <symbol id="i-calendar" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></symbol>
  <symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></symbol>
  <symbol id="i-moon" viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></symbol>
  <symbol id="i-chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></symbol>
  <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></symbol>
  <symbol id="i-panel" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></symbol>
</svg>"""

COURSES_PER_PAGE = 4

THEME_BOOT = """<script>(function(){var d=document.documentElement,t=null,n=null;d.classList.add("js");try{t=localStorage.getItem("ths-theme");n=localStorage.getItem("ths-nav")}catch(e){}if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.dataset.theme=t;if(n==="collapsed"||n==="expanded")d.dataset.nav=n})();</script>"""

def icon(name: str, cls: str = "icon") -> str:
    return f'<svg class="{cls}" aria-hidden="true"><use href="#i-{name}"/></svg>'


def json_ld(data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f'<script type="application/ld+json">{payload}</script>'


def head(*, title: str, description: str, canonical: str, prefix: str, site: dict, ld: dict, extra: str = "") -> str:
    og_image = f"{site['siteUrl']}assets/og-cover.jpg"
    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(description)}">
<link rel="canonical" href="{e(canonical)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f3e9dd" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#171310" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:locale" content="vi_VN">
<meta property="og:site_name" content="{e(site.get('brand', 'ThS HUIT'))}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">
<meta property="og:url" content="{e(canonical)}">
<meta property="og:image" content="{og_image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
{THEME_BOOT}
<link rel="icon" href="{prefix}favicon.svg" type="image/svg+xml">
<link rel="icon" href="{prefix}favicon.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="{prefix}apple-touch-icon.png">
<link rel="preload" as="font" type="font/woff2" href="{prefix}assets/fonts/nunito-latin.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="{prefix}assets/fonts/nunito-vietnamese.woff2" crossorigin>
{extra}<link rel="stylesheet" href="{prefix}css/site.css">
<script src="{prefix}js/site.js?v={int((ROOT / 'js' / 'site.js').stat().st_mtime)}" defer></script>
{json_ld(ld)}
</head>"""


def theme_toggle() -> str:
    return (
        '<button type="button" class="icon-btn theme-toggle" data-theme-toggle aria-label="Đổi giao diện sáng/tối">'
        f'{icon("sun", "icon i-sun")}{icon("moon", "icon i-moon")}</button>'
    )


def course_tile(c: dict, prefix: str, size: int, *, lazy: bool = True) -> str:
    load = ' loading="lazy"' if lazy else ""
    if c.get("icon") in CLAY_ICONS:
        return (
            f'<img src="{prefix}assets/course-{c["icon"]}.webp" width="{size}" height="{size}" alt=""'
            f'{load} decoding="async">'
        )
    return f'<span class="stat__icon tone-{c["tone"]}" style="margin:0">{icon("folder")}</span>'


def nav_label(full: str, short: str | None = None) -> str:
    short = short or full
    return (
        f'<span class="side-nav__label">'
        f'<span class="side-nav__full">{e(full)}</span>'
        f'<span class="side-nav__short">{e(short)}</span>'
        f"</span>"
    )


def nav_badge(count: int, *, unit: str = "tài liệu") -> str:
    empty = " side-nav__badge--empty" if count == 0 else ""
    label = f"{count} {unit}"
    return f'<span class="side-nav__badge{empty}" aria-label="{e(label)}">{count}</span>'


def sidebar(prefix: str, courses: list[dict], active: str | None, site: dict) -> str:
    home_cur = ' aria-current="page"' if active is None else ""
    items = [
        f'<li><a href="{prefix}index.html"{home_cur} title="Trang chủ" aria-label="Trang chủ, {len(courses)} môn">'
        f'<span class="side-nav__icon tone-sky">{icon("home")}</span>'
        f"{nav_label('Trang chủ')}{nav_badge(len(courses), unit='môn')}</a></li>"
    ]
    for c in courses:
        cur = ' aria-current="page"' if c["id"] == active else ""
        n = len(c.get("entries") or [])
        items.append(
            f'<li><a href="{prefix}{c["href"]}"{cur} title="{e(c["title"])}" '
            f'aria-label="{e(c["title"])}, {n} tài liệu">'
            f'<span class="side-nav__icon tone-{c["tone"]}">'
            f'{course_tile(c, prefix, 32)}</span>'
            f'{nav_label(c["title"], c.get("shortTitle"))}'
            f"{nav_badge(n)}</a></li>"
        )
    return f"""<aside class="sidebar" aria-label="Điều hướng">
  <div class="side-top">
    <span class="side-top__label">Danh mục</span>
    <button type="button" class="side-toggle" data-nav-toggle aria-controls="side-nav" aria-expanded="true" aria-label="Thu gọn menu" title="Thu gọn menu">{icon("panel")}</button>
  </div>
  <nav class="side-nav" id="side-nav" aria-label="Môn học"><ul>
    {"".join(items)}
  </ul></nav>
  <div class="side-card">
    <img src="{prefix}assets/owl.webp" width="72" height="72" alt="" loading="lazy" decoding="async">
    <strong>Chúc học tốt!</strong>
    <span>Tài liệu được cập nhật sau mỗi buổi học.</span>
  </div>
</aside>"""


def search_box(*, target: str, placeholder: str, unit: str) -> str:
    return f"""<label class="search" id="site-search">
      <span class="sr-only">{e(placeholder)}</span>
      {icon("search")}
      <input type="search" placeholder="{e(placeholder)}" autocomplete="off" data-filter="{target}" data-filter-count="#result-count" data-filter-empty="#no-result" data-filter-unit="{unit}">
      <kbd aria-hidden="true">/</kbd>
    </label>"""


def site_header(*, prefix: str, site: dict, page_title: str, search: str) -> str:
    toggle = (
        '<button type="button" class="icon-btn search-toggle" data-search-toggle aria-controls="site-search" '
        f'aria-expanded="false" aria-label="Mở ô tìm kiếm" title="Tìm kiếm">{icon("search")}</button>'
        if search
        else ""
    )
    return f"""<header class="site-header">
  <div class="site-header__inner">
    <a class="brand" href="{prefix}index.html"><img src="{prefix}assets/logo-80.webp" width="40" height="40" alt="" decoding="async"><span>{e(site.get('brand', 'ThS HUIT'))}</span></a>
    <span class="site-header__sep" aria-hidden="true"></span>
    <div class="site-header__page">{page_title}</div>
    {search}
    {toggle}
    {theme_toggle()}
  </div>
</header>"""


def pager(total: int, size: int) -> str:
    pages = max(1, -(-total // size))
    current = ' aria-current="page"'
    nums = "".join(
        f'<li><button type="button" class="pager__num" data-page="{i}"'
        f'{current if i == 1 else ""} aria-label="Trang {i}">{i}</button></li>'
        for i in range(1, pages + 1)
    )
    hidden = " hidden" if pages <= 1 else ""
    return (
        f'<nav class="pager" aria-label="Phân trang môn học" data-pager-for="#course-list"{hidden}>'
        f'<button type="button" class="pager__step" data-page-step="-1" aria-label="Trang trước" disabled>'
        f'{icon("chevron", "icon icon--flip")}</button>'
        f'<ol class="pager__list">{nums}</ol>'
        f'<button type="button" class="pager__step" data-page-step="1" aria-label="Trang sau"'
        f'{" disabled" if pages <= 1 else ""}>{icon("chevron")}</button>'
        "</nav>"
    )


def footer(site: dict, prefix: str, updated: float | None) -> str:
    upd = f"<p>Cập nhật: <time datetime=\"{iso(updated)}\">{format_date(updated)}</time></p>" if updated else ""
    return f"""<footer class="site-footer">
    <p>{e(site.get('footer', 'ThS HUIT'))}</p>
    {upd}
  </footer>"""


def page(head_html: str, body: str) -> str:
    return f"""{head_html}
<body>
{SPRITE}
<a class="skip-link" href="#main-content">Bỏ qua đến nội dung chính</a>
{body}
</body>
</html>
"""


# ---------------------------------------------------------------- trang chủ

def build_home(site: dict, courses: list[dict]) -> str:
    base = site["siteUrl"]
    all_entries = [x for c in courses for x in c["entries"]]
    latest = max((x["ts"] for x in all_entries), default=None)
    terms = sorted({(c.get("schoolYear", ""), c.get("term", "")) for c in courses if c.get("term") or c.get("schoolYear")})
    title = site.get("title", "Tài liệu học tập")
    desc = site.get("description", "")

    if len(terms) == 1:
        year, term = terms[0]
        term_value, term_note = term or "—", f"Năm học {year}" if year else ""
    elif terms:
        year, term = terms[-1]
        term_value, term_note = f"{len(terms)} học kỳ", f"Mới nhất: {term} · {year}".strip(" ·")
    else:
        term_value, term_note = "—", "chưa khai báo"

    stats = [
        ("mint", "layers", "Môn học", str(len(courses)), "đang theo học", ""),
        ("peach", "file", "Tài liệu", str(len(all_entries)), "file HTML", ""),
        ("butter", "clock", "Cập nhật gần nhất", format_date(latest) if latest else "—", "theo lịch sử commit", " stat__value--sm"),
        ("sky", "calendar", "Học kỳ", term_value, term_note, " stat__value--sm"),
    ]
    stats_html = "".join(
        f'<li class="stat tone-{tone}"><span class="stat__icon">{icon(ic)}</span>'
        f'<span class="stat__label">{label}</span><span class="stat__value{vcls}">{e(value)}</span>'
        f'<span class="stat__note">{e(note)}</span></li>'
        for tone, ic, label, value, note, vcls in stats
    )

    cards = []
    for c in courses:
        n = len(c["entries"])
        tl = term_label(c)
        upd = f" · cập nhật {format_date(c['latest'])}" if c["latest"] else ""
        cards.append(
            f'<li class="course-card" data-filter-item data-filter-text="{e(c["title"])} {e(c["description"])} {e(tl)}">'
            f'<a class="tone-{c["tone"]}" href="{e(c["href"])}">'
            f'<div class="course-card__top"><span class="course-card__tile">{course_tile(c, "", 64)}</span></div>'
            f'<div>'
            + (f'<span class="badge">{icon("calendar", "icon icon--sm")}{e(tl)}</span>' if tl else "")
            + f'<h3>{e(c["title"])}</h3>'
            + (f'<p>{e(c["description"])}</p>' if c["description"] else "")
            + "</div>"
            f'<div class="course-card__foot"><span>{n} tài liệu{upd}</span><span class="go">{icon("arrow")}</span></div>'
            "</a></li>"
        )

    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "WebSite", "@id": f"{base}#website", "url": base, "name": site.get("brand", "ThS HUIT"), "inLanguage": "vi", "description": desc},
            UNIVERSITY,
            {
                "@type": "CollectionPage",
                "@id": f"{base}#page",
                "url": base,
                "name": title,
                "description": desc,
                "inLanguage": "vi",
                "isPartOf": {"@id": f"{base}#website"},
                "primaryImageOfPage": f"{base}assets/og-cover.jpg",
                **({"dateModified": iso(latest)} if latest else {}),
                "mainEntity": {
                    "@type": "ItemList",
                    "numberOfItems": len(courses),
                    "itemListElement": [
                        {
                            "@type": "ListItem",
                            "position": i + 1,
                            "item": {
                                "@type": "Course",
                                "@id": f"{c['url']}#course",
                                "name": c["title"],
                                "description": c["description"] or c["title"],
                                "url": c["url"],
                                "inLanguage": "vi",
                                "educationalLevel": "Thạc sĩ",
                                "provider": {"@id": UNIVERSITY["@id"]},
                                **(
                                    {"hasCourseInstance": {"@type": "CourseInstance", "courseMode": "Onsite", "name": term_label(c)}}
                                    if term_label(c)
                                    else {}
                                ),
                            },
                        }
                        for i, c in enumerate(courses)
                    ],
                },
            },
        ],
    }

    preload = (
        '<link rel="preload" as="image" href="assets/hero-desk-720.webp" '
        'imagesrcset="assets/hero-desk-420.webp 420w, assets/hero-desk-720.webp 720w" '
        'imagesizes="(max-width: 640px) 92vw, 40vw" fetchpriority="high">\n'
    )
    head_html = head(title=f"{title} | {site.get('brand', 'ThS HUIT')}", description=desc, canonical=base, prefix="", site=site, ld=ld, extra=preload)

    header = site_header(
        prefix="",
        site=site,
        page_title='<p class="page-label" data-ellipsis-tip title="Trang chủ">Trang chủ</p>',
        search=search_box(target="#course-list", placeholder="Tìm môn học…", unit="môn học"),
    )
    body = f"""{header}
<div class="shell">
{sidebar("", courses, None, site)}
<main class="main" id="main-content">
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero__body">
      <p class="hero__kicker">{icon("book", "icon icon--sm")}Tài liệu học tập</p>
      <h1 id="hero-title">{e(title)}</h1>
      <p class="hero__lead">{e(desc)}</p>
      <a class="btn btn--coral" href="#courses">Xem môn học {icon("arrow", "icon icon--sm")}</a>
    </div>
    <div class="hero__art">
      <img src="assets/hero-desk-720.webp" srcset="assets/hero-desk-420.webp 420w, assets/hero-desk-720.webp 720w" sizes="(max-width: 640px) 92vw, 40vw" width="720" height="536" alt="Minh hoạ clay: laptop, chồng sách và cây cảnh nhỏ trên bàn học" fetchpriority="high" decoding="async">
    </div>
  </section>

  <ul class="stats" aria-label="Tổng quan">{stats_html}</ul>

  <section class="section" id="courses" aria-labelledby="courses-title">
    <div class="section__head">
      <h2 id="courses-title">Môn học</h2>
      <span class="result-count" id="result-count" aria-live="polite">{len(courses)} môn học</span>
    </div>
    <ul class="course-grid" id="course-list" data-page-size="{COURSES_PER_PAGE}">
      {"".join(cards)}
    </ul>
    {pager(len(courses), COURSES_PER_PAGE)}
    <div class="panel empty" id="no-result" hidden>
      <strong>Không có môn học phù hợp</strong>
      <span>Thử từ khoá khác hoặc nhấn Esc để xoá tìm kiếm.</span>
    </div>
  </section>

  <aside class="cta" aria-label="Mẹo tìm kiếm">
    <img src="assets/owl.webp" width="58" height="58" alt="" loading="lazy" decoding="async">
    <p>Tìm nhanh tài liệu<span>Nhấn <kbd>/</kbd> ở bất kỳ trang nào để mở ô tìm kiếm.</span></p>
    <button type="button" class="btn btn--teal" data-focus-search>{icon("search", "icon icon--sm")}Tìm kiếm</button>
  </aside>

  {footer(site, "", latest)}
</main>
</div>"""
    return page(head_html, body)


# ---------------------------------------------------------------- trang môn học

def build_course(site: dict, courses: list[dict], c: dict) -> str:
    base = site["siteUrl"]
    entries = c["entries"]
    tl = term_label(c)
    title = c["title"]
    desc = c["description"] or f"Tài liệu môn {title}"
    meta_desc = f"{title}{' — ' + tl if tl else ''}: {len(entries)} tài liệu HTML (bài tập, slide, tiểu luận). {c['description']}".strip()

    chips = []
    if tl:
        chips.append(f"<li>{icon('calendar', 'icon icon--sm')}{e(tl)}</li>")
    chips.append(f"<li>{icon('file', 'icon icon--sm')}{len(entries)} file HTML</li>")
    if c["latest"]:
        chips.append(f"<li>{icon('clock', 'icon icon--sm')}Cập nhật {format_date(c['latest'])}</li>")

    if entries:
        rows = "".join(
            f'<li class="file-row" data-filter-item data-filter-text="{e(x["title"])} {e(x["name"])}">'
            f'<a href="{e(x["href"])}"><span class="file-row__thumb">{icon("file")}</span>'
            f'<span><span class="file-row__name">{e(x["title"])}</span>'
            f'<span class="file-row__meta"><span class="file-row__file">{e(x["name"])}</span> · {e(x["size"])} · '
            f'<time datetime="{iso(x["ts"])}">{e(x["mtime"])}</time></span></span>'
            f'<span class="go">{icon("arrow")}</span></a></li>'
            for x in entries
        )
        listing = f"""<div class="section__head">
      <h2 id="files-title">Tài liệu</h2>
      <span class="result-count" id="result-count" aria-live="polite">{len(entries)} file</span>
    </div>
    <div class="panel">
      <ul class="file-list" id="file-list">{rows}</ul>
      <div class="empty" id="no-result" hidden>
        <strong>Không tìm thấy file phù hợp</strong>
        <span>Thử từ khoá khác hoặc nhấn Esc để xoá tìm kiếm.</span>
      </div>
    </div>"""
        search = search_box(target="#file-list", placeholder="Tìm tài liệu…", unit="file")
    else:
        listing = f"""<div class="section__head"><h2 id="files-title">Tài liệu</h2></div>
    <div class="panel empty">
      <img src="../assets/owl.webp" width="96" height="96" alt="" loading="lazy" decoding="async">
      <strong>Chưa có tài liệu</strong>
      <span>Môn này chưa có file HTML nào — quay lại sau nhé.</span>
    </div>"""
        search = ""

    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CollectionPage",
                "@id": f"{c['url']}#page",
                "url": c["url"],
                "name": title,
                "description": meta_desc,
                "inLanguage": "vi",
                "isPartOf": {"@id": f"{base}#website"},
                "breadcrumb": {"@id": f"{c['url']}#breadcrumb"},
                "about": {"@id": f"{c['url']}#course"},
                **({"dateModified": iso(c["latest"])} if c["latest"] else {}),
                "mainEntity": {
                    "@type": "ItemList",
                    "numberOfItems": len(entries),
                    "itemListElement": [
                        {
                            "@type": "ListItem",
                            "position": i + 1,
                            "item": {
                                "@type": "LearningResource",
                                "name": x["title"],
                                "url": f"{c['url']}{x['href']}",
                                "inLanguage": "vi",
                                "encodingFormat": "text/html",
                                "dateModified": iso(x["ts"]),
                                "isPartOf": {"@id": f"{c['url']}#course"},
                            },
                        }
                        for i, x in enumerate(entries)
                    ],
                },
            },
            {
                "@type": "Course",
                "@id": f"{c['url']}#course",
                "name": title,
                "description": desc,
                "url": c["url"],
                "inLanguage": "vi",
                "educationalLevel": "Thạc sĩ",
                "provider": UNIVERSITY,
                **({"hasCourseInstance": {"@type": "CourseInstance", "courseMode": "Onsite", "name": tl}} if tl else {}),
            },
            {
                "@type": "BreadcrumbList",
                "@id": f"{c['url']}#breadcrumb",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Trang chủ", "item": base},
                    {"@type": "ListItem", "position": 2, "name": title, "item": c["url"]},
                ],
            },
        ],
    }
    head_html = head(title=f"{title} | {site.get('brand', 'ThS HUIT')}", description=meta_desc, canonical=c["url"], prefix="../", site=site, ld=ld)

    crumbs = f"""<nav aria-label="Breadcrumb"><ol class="breadcrumb">
      <li><a href="../index.html">{icon("home", "icon icon--sm")}Trang chủ</a></li>
      <li aria-hidden="true">{icon("chevron", "icon icon--sm")}</li>
      <li><span aria-current="page" data-ellipsis-tip title="{e(title)}">{e(title)}</span></li>
    </ol></nav>"""
    header = site_header(prefix="../", site=site, page_title=crumbs, search=search)
    body = f"""{header}
<div class="shell">
{sidebar("../", courses, c["id"], site)}
<main class="main" id="main-content">
  <section class="hero hero--compact tone-{c["tone"]}" aria-labelledby="course-title">
    <span class="hero__tile">{course_tile(c, "../", 96, lazy=False)}</span>
    <div class="hero__body">
      <p class="hero__kicker">{icon("book", "icon icon--sm")}Môn học</p>
      <h1 id="course-title">{e(title)}</h1>
      {f'<p class="hero__lead">{e(c["description"])}</p>' if c["description"] else ""}
      <ul class="chips">{"".join(chips)}</ul>
    </div>
  </section>

  <section class="section" aria-labelledby="files-title">
    {listing}
  </section>

  {footer(site, "../", c["latest"])}
</main>
</div>"""
    return page(head_html, body)


# ---------------------------------------------------------------- SEO / GEO

def write_sitemap(site: dict, courses: list[dict]) -> None:
    base = site["siteUrl"]
    latest = max((c["latest"] for c in courses if c["latest"]), default=None)
    urls = [(base, latest, "1.0")]
    for c in courses:
        urls.append((c["url"], c["latest"], "0.8"))
        urls.extend((f"{c['url']}{x['href']}", x["ts"], "0.6") for x in c["entries"])
    body = "".join(
        f"  <url><loc>{e(u)}</loc>" + (f"<lastmod>{iso(ts)}</lastmod>" if ts else "") + f"<priority>{p}</priority></url>\n"
        for u, ts, p in urls
    )
    (ROOT / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}</urlset>\n',
        encoding="utf-8",
    )
    (ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {base}sitemap.xml\n", encoding="utf-8")


def write_llms_txt(site: dict, courses: list[dict]) -> None:
    """Tóm tắt dạng Markdown cho LLM/AI search (chuẩn llms.txt)."""
    base = site["siteUrl"]
    lines = [
        f"# {site.get('brand', 'ThS HUIT')}",
        "",
        f"> {site.get('description', '')}",
        "",
        "Trang tổng hợp tài liệu học tập. "
        "Mỗi môn có một trang danh sách; tài liệu là các trang HTML độc lập (bài tập, slide, tiểu luận, đồ án).",
        "",
        "## Môn học",
        "",
    ]
    for c in courses:
        tl = term_label(c)
        extra = " — ".join(x for x in (c["description"], tl, f"{len(c['entries'])} tài liệu") if x)
        lines.append(f"- [{c['title']}]({c['url']}): {extra}")
    for c in courses:
        if not c["entries"]:
            continue
        lines += ["", f"## {c['title']}", ""]
        lines += [f"- [{x['title']}]({c['url']}{x['href']}): {x['name']}, cập nhật {format_date(x['ts'])}, {x['size']}" for x in c["entries"]]
    (ROOT / "llms.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    git_mtimes = load_git_mtimes() if ensure_full_git_history() else {}
    site, courses = load_site(git_mtimes)

    (ROOT / "index.html").write_text(build_home(site, courses), encoding="utf-8")
    print(f"✓ index.html ({len(courses)} môn)")
    for c in courses:
        folder = ROOT / c["id"]
        if not folder.is_dir():
            print(f"! Bỏ qua {c['id']}: chưa có thư mục")
            continue
        (folder / "index.html").write_text(build_course(site, courses, c), encoding="utf-8")
        print(f"✓ {c['id']}/index.html ({len(c['entries'])} mục)")

    write_sitemap(site, courses)
    write_llms_txt(site, courses)
    print("✓ sitemap.xml, robots.txt, llms.txt")


if __name__ == "__main__":
    os.chdir(ROOT)
    main()
