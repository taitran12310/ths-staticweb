#!/usr/bin/env python3
"""Gỡ symlink data đứt trước khi upload GitHub Pages.

actions/upload-pages-artifact đóng gói bằng `tar --dereference`.
Hai symlink dưới đây trỏ ra repo PhanTichMangXaHoi, không có trên runner:

    phan-tich-mang-xa-hoi/data
        -> ../../PhanTichMangXaHoi/BaiTap/BaiCaNhan/tmdb_sna_project/data
    phan-tich-mang-xa-hoi/BaiCaNhan_WEB/data -> ../data

Link đứt khiến tar báo "File removed before we read it" và fail cả job.

Trang BaiCaNhan_WEB khi chạy HTTPS fetch data/*.json. Bản đó đã commit trong
file-data/*.json.js (dùng cho file://). Trên runner, script ghi lại thành file
thật. Máy local symlink còn trỏ đúng thì giữ nguyên.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARENT = ROOT / "phan-tich-mang-xa-hoi" / "data"
WEB = ROOT / "phan-tich-mang-xa-hoi" / "BaiCaNhan_WEB"
FILE_DATA = WEB / "file-data"
OUT = WEB / "data"


def dangling(path: Path) -> bool:
    return path.is_symlink() and not path.exists()


def extract_json(text: str, name: str) -> str:
    marker = f"__SNA_FILES['{name}']="
    idx = text.find(marker)
    if idx < 0:
        raise SystemExit(f"Không thấy {name} trong file-data")
    payload = text[idx + len(marker) :].strip()
    if payload.endswith(";"):
        payload = payload[:-1].rstrip()
    json.loads(payload)
    return payload + "\n"


def materialize() -> None:
    if not dangling(PARENT) and not dangling(OUT):
        if PARENT.is_symlink() or OUT.is_symlink():
            print("symlink data còn hợp lệ, giữ nguyên.")
        else:
            print("không còn symlink data đứt, bỏ qua.")
        return

    if dangling(PARENT):
        PARENT.unlink()
        print(f"gỡ symlink đứt {PARENT.relative_to(ROOT)}")
    if OUT.is_symlink():
        OUT.unlink()
        print(f"gỡ symlink {OUT.relative_to(ROOT)}")

    sources = sorted(FILE_DATA.glob("*.json.js"))
    if not sources:
        raise SystemExit(f"Không có {FILE_DATA}/*.json.js")

    OUT.mkdir(parents=True, exist_ok=True)
    for src in sources:
        name = src.name[: -len(".js")]
        payload = extract_json(src.read_text(encoding="utf-8"), name)
        dest = OUT / name
        dest.write_text(payload, encoding="utf-8")
        print(f"ghi {dest.relative_to(ROOT)} ({dest.stat().st_size} bytes)")

    if PARENT.is_symlink() or OUT.is_symlink():
        raise SystemExit("còn symlink data, tar --dereference sẽ fail")
    required = ("catalog.json", "network_data.json", "titles.json")
    missing = [name for name in required if not (OUT / name).is_file()]
    if missing:
        raise SystemExit(f"thiếu {', '.join(missing)}")


if __name__ == "__main__":
    materialize()
