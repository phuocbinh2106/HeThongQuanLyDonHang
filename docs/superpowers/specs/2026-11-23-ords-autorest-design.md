# Thiết kế: ORDS AutoREST cho 3 Duality View

Ngày: 2026-11-23 · Trạng thái: chờ duyệt

## Mục đích
Đề tài 15 yêu cầu phục vụ front-end bằng REST JSON. Ứng dụng hiện có API C# tự viết đọc/ghi Duality View.
ORDS AutoREST cho thấy cách "tự nhiên" của Oracle: bật một lần, Oracle **tự sinh** REST API đầy đủ
(GET/POST/PUT/DELETE, ETag) cho Duality View mà không viết code. Dùng để lấy điểm cộng (bước 8 trong CLAUDE.md)
và trả lời câu vấn đáp "Duality View giúp gì cho việc xây REST API so với cách truyền thống?".

## Mục tiêu
- ORDS chạy trong Docker cạnh container `oracle23ai`, AutoREST cho `ORDER_DV`, `PRODUCT_DV`, `CUSTOMER_DV`.
- Trang demo trên web đặt cạnh nhau: cùng một đơn đọc qua API C# và qua ORDS (cùng dữ liệu, cùng ETag).
- Chứng minh quy tắc nghiệp vụ nằm ở CSDL: ghi qua ORDS vẫn bị trigger chặn (ví dụ đặt quá tồn kho -> ORA-20001).

## Không làm
- Xác thực ORDS (OAuth2) — người dùng chọn "đọc + ghi, không xác thực", chỉ chạy trên máy cá nhân.
- Thay API C# bằng ORDS; phân quyền theo vai trò vẫn chỉ có ở API C#.

## Điều không được xảy ra
- ORDS chưa chạy làm hỏng phần còn lại của web: trang demo chỉ báo "ORDS chưa chạy", các trang khác không phụ thuộc ORDS.
- Mật khẩu SYS bị ghi vào mã / commit.

## Ràng buộc
- Oracle 23.26.3 (≥ 23.4), ORDS ≥ 24.1 (dùng image chính thức `container-registry.oracle.com/database/ords`).
- Container `oracle23ai` đang có sẵn (không do docker-compose tạo); ORDS nối qua `host.docker.internal:1521/ecom`.
- Mật khẩu SYS đọc lúc chạy từ biến môi trường của container Oracle, không lưu trong repo.

## Cách làm đã cân nhắc
| Cách | Đánh đổi | Chọn |
|---|---|---|
| Container ORDS chính thức + AutoREST | Tải thêm một image vài trăm MB; cài schema ORDS vào PDB lần đầu | **Chọn** |
| ORDS bản standalone trên Windows | Phải cài Java, khó chạy lại trên máy khác | Không |
| ORDS có OAuth2 | Đúng chuẩn sản xuất nhưng thêm nhiều bước cấu hình, khó giải thích | Không (người dùng chọn không xác thực) |

## Thiết kế
1. **Hạ tầng:** `scripts/ords.ps1` (start | stop | status): chạy container `ords` (cổng 8181), lần đầu cài ORDS vào PDB `ecom`.
   Thêm dịch vụ `ords` vào `docker-compose.yml` cho máy mới.
2. **CSDL:** `sql/11_ords_autorest.sql` (chạy bằng `ecom_schema`): `ORDS.ENABLE_SCHEMA` (đường dẫn `/ords/ecom/`) và
   `ORDS.ENABLE_OBJECT` cho 3 Duality View, không yêu cầu xác thực. Có lệnh tắt lại.
3. **Web:** trang `/Ords` (quản trị) "API C# và ORDS":
   - Đọc: chọn mã đơn -> hai cột: `GET /api/orders/{id}` (C#) và `GET /ords/ecom/order_dv/{id}` (ORDS), kèm URL, mã HTTP, ETag.
   - Ghi thử qua ORDS: gửi một đơn đặt quá tồn kho -> hiện lỗi ORA-20001 do trigger trả về qua ORDS.
   - Trình duyệt gọi ORDS **qua API C# chuyển tiếp** (`/api/ords/...`, chỉ quản trị) để tránh lỗi CORS khác cổng;
     trang vẫn in URL ORDS gốc, mở thẳng được trong tab mới.
   - Cấu hình `Ords:BaseUrl` trong appsettings (mặc định `http://localhost:8181/ords/ecom/`).
4. **Kiểm thử:** `tests/ords_test.mjs`: tài liệu đọc qua C# và ORDS trùng nhau; ghi quá tồn kho qua ORDS bị từ chối.
5. **Tài liệu:** README mục ORDS; `THAY_DOI_THIET_KE.md` Đ17. Báo cáo Word chưa cập nhật (đang tạm dừng).

## Để người làm tự quyết
Tên container/cổng cụ thể, bố cục trang demo, cách hiển thị so sánh JSON.
