# ths-staticweb — ThS HUIT

Site HTML tĩnh deploy lên **GitHub Pages**.

**Site:** https://taitran12310.github.io/ths-staticweb/

## Cấu trúc

```
ths-staticweb/
├── index.html                          # Trang menu (load từ JSON)
├── data/menu.json                      # Dữ liệu menu
├── js/menu.js                          # Render menu từ JSON
├── 404.html                            # Trang lỗi tùy chỉnh
├── css/style.css
├── scripts/generate_listings.py        # Sinh danh sách file HTML
├── .github/workflows/deploy-pages.yml  # Auto deploy Pages
├── giai-thuat-nang-cao/index.html
├── cong-nghe-phan-mem-tien-tien/index.html
├── phuong-phap-nghien-cuu-khoa-hoc/index.html
└── phan-tich-mang-xa-hoi/index.html
```

Menu ở `index.html` load từ `data/menu.json`. Link tới `folder/` — GitHub Pages mặc định mở `index.html`.

## Deploy GitHub Pages

### 1. Bật Pages (một lần)

1. Vào repo → **Settings** → **Pages**
2. **Source**: chọn **GitHub Actions** (không chọn Deploy from a branch)

### 2. Push lên `main`

Mỗi lần push `main` (hoặc chạy workflow thủ công trong tab **Actions**), site sẽ được build + deploy.

Workflow: `.github/workflows/deploy-pages.yml`

- Chạy `python3 scripts/generate_listings.py` trước khi publish
- Publish toàn bộ site tĩnh lên GitHub Pages

### 3. Kiểm tra

- Tab **Actions** → workflow **Deploy GitHub Pages** phải màu xanh
- Mở: https://taitran12310.github.io/ths-staticweb/

## Xem local

Không mở bằng `file://`. Chạy:

```bash
cd ths-staticweb
python3 -m http.server 8080
```

Rồi mở `http://localhost:8080/`.

## Cập nhật danh sách file

1. Thêm / xóa file `.html` trong folder con.
2. Chạy local (tuỳ chọn — CI cũng chạy khi deploy):

```bash
python3 scripts/generate_listings.py
```

## Thêm mục mới

1. Tạo folder, ví dụ `ten-muc/`.
2. Thêm file HTML vào folder đó.
3. Thêm object mới vào `items` trong `data/menu.json`:

```json
{
  "id": "ten-muc",
  "title": "Tên mục",
  "description": "Mô tả ngắn",
  "path": "ten-muc/"
}
```

4. Chạy `python3 scripts/generate_listings.py`.

## Trang 404

File `404.html` ở root — GitHub Pages hiện trang này khi đường dẫn không tồn tại.
