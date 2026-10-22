---
name: generate-image
description: >-
  Tạo hoặc sửa ảnh minh họa cho slide HTML bằng công cụ GenerateImage của
  Cursor. Dùng khi người dùng muốn generate image, tạo hình minh họa, sơ đồ,
  icon, hoặc ảnh nền cho slide trong ths-staticweb.
---

# Generate image

Tạo ảnh slide bằng công cụ **GenerateImage** của Cursor (namespace `cursor`). Không gọi Gemini, không đọc `.env`, không xin API key.

## Cách gọi

1. Đọc schema `GenerateImage` trong namespace `cursor` trước khi gọi.
2. Gọi với:
   - `description`: mô tả cụ thể (chủ thể, bố cục, màu, ràng buộc). Ít nhất một câu.
   - `filename`: chỉ tên file, không kèm thư mục, ví dụ `gen-hero.png`.
   - `aspect_ratio`: `16:9` cho slide ngang, `4:3` cho ảnh cạnh nội dung, `1:1` cho icon.
   - `reference_image_paths`: đường dẫn ảnh có sẵn khi cần sửa hoặc giữ cùng phong cách.
3. Công cụ trả về đường dẫn tuyệt đối. Copy file đó vào thư mục ảnh của slide, ví dụ `giai-thuat-nang-cao/assets/drag/`.
4. Chèn bằng `<img>` (thêm `data-zoom` nếu slide đã có lightbox). Không nhúng base64 vào HTML.

## Prompt cho slide DRAG

- Nền trắng hoặc nền teal đậm, bảng màu `#0e7490`, `#083344`, `#22d3ee`.
- Minh họa phẳng, dễ đọc từ xa, ít chi tiết rối.
- Không chữ, không logo, không watermark. Nếu người dùng đã mô tả nội dung, giữ nguyên ý đó.
- Ảnh nền Q&A có thể nền teal đậm; ảnh đặt cạnh chữ thì nền trắng.

## Báo lại

Nêu slide đã chèn và đường dẫn file trong repo. Nếu công cụ lỗi, nói lỗi đó và dừng, không chuyển sang API khác.
