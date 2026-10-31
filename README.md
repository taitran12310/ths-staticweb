# ths-staticweb — ThS HUIT

Site HTML tĩnh deploy lên **GitHub Pages**.

**Site:** https://taitran12310.github.io/ths-staticweb/

## Cấu trúc

```
ths-staticweb/
├── data/menu.json                      # Nguồn dữ liệu duy nhất (sửa file này)
├── scripts/generate_listings.py        # Sinh toàn bộ trang index + file SEO bên dưới
├── index.html                          # (sinh tự động) Trang chủ
├── <môn>/index.html                    # (sinh tự động) Danh sách tài liệu từng môn
├── sitemap.xml · robots.txt · llms.txt # (sinh tự động) SEO / GEO
├── 404.html                            # Trang lỗi (viết tay)
├── css/site.css                        # Giao diện clay pastel (light/dark)
├── css/style.css                       # Style cũ, vẫn dùng cho DeAn_Plan.html
├── js/site.js                          # Đổi theme + lọc tìm kiếm (không bắt buộc để xem nội dung)
├── assets/                             # Ảnh WebP: hero, mascot, icon môn, og-cover.jpg
├── favicon.svg / favicon.png / apple-touch-icon.png / logo.*
└── .github/workflows/deploy-pages.yml  # Auto deploy Pages
```

Mọi trang index được render sẵn thành HTML tĩnh từ `data/menu.json`, nên mở được cả `file://` lẫn HTTP, và công cụ tìm kiếm / AI crawler đọc được nội dung mà không cần chạy JS. Link nội bộ trỏ thẳng tới `.../index.html`, còn `canonical` dùng URL dạng thư mục.

### SEO / GEO

- Mỗi trang có `title`, `description`, `canonical`, Open Graph (`assets/og-cover.jpg`) và JSON-LD (`WebSite`, `CollectionPage`, `Course`, `LearningResource`, `BreadcrumbList`).
- `sitemap.xml` có `lastmod` lấy từ lịch sử commit. `llms.txt` tóm tắt site dạng Markdown cho AI search.
- Đổi domain: sửa `siteUrl` trong `data/menu.json`.
- Site dạng project page (`/ths-staticweb/`) nên `robots.txt` không nằm ở gốc domain — hãy khai báo `sitemap.xml` trong Google Search Console.

### Hiệu năng

- Ảnh WebP có sẵn `width`/`height` (không CLS); ảnh hero được preload với `fetchpriority="high"`, ảnh dưới màn hình `loading="lazy"`.
- Một font biến thiên (Nunito) nạp không chặn render; JS duy nhất là `site.js` (`defer`, ~3 KB).

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

Có thể mở trực tiếp `index.html` bằng trình duyệt (`file://`), hoặc chạy HTTP server:

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

Script chỉ ghi lại file khi nội dung thực sự đổi. Khi thêm bài một môn, thường chỉ đổi:

- file nội dung mới
- `<môn>/index.html` (danh sách file môn đó)
- `index.html` (card + thống kê trang chủ)
- `data/listings.js` (số liệu badge sidebar — một file cho cả HTTP và `file://`)
- `sitemap.xml` / `llms.txt`

Các `*/index.html` môn khác **không** còn bị đụng vì sidebar không bake số tài liệu chéo nữa. Badge do `site.js` nạp `listings.js` qua thẻ `<script>`.

## Thêm mục mới

1. Tạo folder, ví dụ `ten-muc/`.
2. Thêm file HTML vào folder đó.
3. Thêm object mới vào `items` trong `data/menu.json`:

```json
{
  "id": "ten-muc",
  "title": "Tên mục",
  "description": "Mô tả ngắn",
  "path": "ten-muc/",
  "icon": "folder",
  "term": "Học kỳ 1",
  "schoolYear": "2026–2027"
}
```

`icon` nhận một trong: `algorithm`, `code`, `research`, `network`, `vision`, `philosophy`, `math`, `folder`.  
`term` / `schoolYear` gắn theo từng môn — học kỳ sau thêm môn mới với giá trị khác, không sửa chung toàn site.

4. Chạy `python3 scripts/generate_listings.py`.

## Trang 404

File `404.html` ở root — GitHub Pages hiện trang này khi đường dẫn không tồn tại.
