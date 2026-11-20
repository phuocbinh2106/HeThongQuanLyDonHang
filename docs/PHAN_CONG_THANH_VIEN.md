# Phân công thành viên (Bảng 5.2 của báo cáo)

Toàn bộ công việc được chia thành **3 mảng có khối lượng tương đương (mỗi người ≈ 1/3)**. Mỗi mảng gồm cả phần
**lõi CSDL** lẫn phần **ứng dụng** tương ứng, để khi vấn đáp cá nhân (giải thích code bất kỳ, câu hỏi tình huống,
viết thêm truy vấn) mỗi người đều trình bày trọn vẹn được phần của mình, từ bảng / PL/SQL đến API và giao diện.

> Đây là bảng phân công đề xuất dựa trên các hạng mục thực tế đã làm (lịch sử commit). Nhóm thống nhất lại trước khi nộp;
> nếu thực tế ai làm phần nào khác thì sửa cho đúng – giảng viên sẽ đối chiếu khi vấn đáp.

## Tổng hợp các hạng mục đã làm

| # | Hạng mục | Kết quả |
|---|---|---|
| 1 | Môi trường | Oracle 23ai Free trong Docker, PDB `ecom`, `docker-compose.yml`, `scripts/db.ps1`, `.env.example` |
| 2 | Lược đồ quan hệ | 10 bảng 3NF, ràng buộc PK/FK/UNIQUE/CHECK, cột JSON có JSON Schema, sequence số đơn |
| 3 | Duality View | `ORDER_DV`, `PRODUCT_DV`, `CUSTOMER_DV` với annotation từng trường; xử lý ORA-32795, ORA-40896, ORA-40940 |
| 4 | PL/SQL nghiệp vụ | `PKG_ORDER_CTX`, `PKG_ORDER` (4 function + 8 procedure), 6 trigger (2 compound), BR-01…BR-12, mã lỗi -20001…-20010 |
| 5 | Báo cáo SQL | `PKG_ORDER_RPT` R1–R6 (window function, ROLLUP, DENSE_RANK, PIVOT, JSON_VALUE) |
| 6 | Dữ liệu | Dữ liệu mẫu 60 đơn / 36 sản phẩm; dữ liệu lớn ≈ 200.000 đơn; script reset |
| 7 | Ứng dụng web | ASP.NET Core MVC: kết nối Oracle, đường JSON, đường quan hệ, ánh xạ lỗi ORA → HTTP, 8 màn hình M0–M7 |
| 8 | Giao diện & API docs | Giao diện Shopia, tìm khách phía server, Swagger `/api-docs` |
| 9 | Kiểm thử | 14 kịch bản mức CSDL, 16 kịch bản qua API (gồm TC-10 đồng thời) |
| 10 | Tối ưu | Execution plan trước / sau Q1–Q3, chỉ mục IX-1 / IX-5 / IX-6, viết lại SQL màn hình M1, M3 |
| 11 | Tài liệu | Báo cáo Chương 1–5, kịch bản demo, README, GitHub |

## 1. Tống Phước Bình – 24DH110200 (trưởng nhóm) · ≈ 33,3 %

**Mảng: Thiết kế CSDL, Duality View và đường JSON của API**

- Dựng môi trường: Docker, PDB `ecom`, `docker-compose.yml`, `scripts/db.ps1`; quản lý repo GitHub, README.
- Thiết kế lược đồ 10 bảng (ERD, chuẩn hoá 3NF, 3 điểm phi chuẩn hoá có chủ đích), ràng buộc, JSON Schema của `products.attributes`.
- Thiết kế và cài đặt 3 Duality View, chọn annotation (NOUPDATE / NOCHECK / UNNEST / NODELETE); xử lý các hành vi thật
  của Duality View (Đ1–Đ6: identity BY DEFAULT ON NULL, JSON Schema trên kiểu cột, ORA-40896, lỗi bọc trong ORA-42692).
- API đường JSON: `DualityViewStore` (SELECT / INSERT / UPDATE trên Duality View), ETag ↔ If-Match (`DocEtag`, 412),
  các API controller; tài liệu Swagger `/api-docs`.
- Màn hình M4 Chi tiết đơn (hai tab JSON ↔ bảng quan hệ).
- Báo cáo: Chương 1, Chương 2 (2.1–2.3), mục 3.1–3.4, 3.7.

**Tệp cần nắm:** `sql/02_tables.sql`, `sql/06_duality_views.sql`, `src/Ecom.Web/Data/DualityViewStore.cs`,
`Infrastructure/DocEtag.cs`, `Infrastructure/SwaggerSetup.cs`, `Controllers/Api/*`, `wwwroot/js/orders-details.js`.

**Câu hỏi nên chuẩn bị:** Vì sao `attributes` lưu JSON? Duality View giúp gì cho REST API? Vì sao subtotal là NOCHECK,
status là NOUPDATE? ETag hoạt động thế nào, khi nào ra 412? Thêm một trường vào tài liệu ORDER_DV thì sửa gì?

## 2. Nguyễn Thị Khánh Uyên – 24DH112109 · ≈ 33,3 %

**Mảng: PL/SQL nghiệp vụ, trigger và kiểm thử**

- Cài đặt `PKG_ORDER_CTX` và `PKG_ORDER`: trừ / hoàn kho nguyên tử, kiểm tra chuyển trạng thái, tính tổng tiền,
  đổi trạng thái, huỷ đơn, ghi thanh toán, hoàn tiền (BR-12).
- 6 trigger: sinh số đơn, kiểm tra trạng thái, ghi lịch sử, chốt giá / khoá dòng hàng; 2 compound trigger
  `TRG_OI_TOTALS`, `TRG_PAY_CHECK` (tránh mutating table ORA-04091).
- Quy tắc nghiệp vụ BR-01…BR-12, mã lỗi tự định nghĩa; ánh xạ lỗi ORA → HTTP (`OracleErrorMapper`, `OracleExceptionFilter`).
- API đường quan hệ: gọi procedure trong giao dịch (`OrderRepository.CallAsync`), màn hình M5 Xử lý đơn.
- Kiểm thử: `t01_smoke_test.sql`, `t02_test_cases.sql` (14/14 PASS), `tests/api_test_cases.mjs` (16/16 PASS, TC-10
  20 request đồng thời), tổng hợp kết quả `docs/KET_QUA_KIEM_THU.md`.
- Báo cáo: mục 2.4, 3.5, 4.1–4.3.

**Tệp cần nắm:** `sql/04_pkg_order.sql`, `sql/05_triggers.sql`, `sql/t01_smoke_test.sql`, `sql/t02_test_cases.sql`,
`src/Ecom.Web/Services/OracleErrorMapper.cs`, `Data/OrderRepository.cs`, `tests/api_test_cases.mjs`.

**Câu hỏi nên chuẩn bị:** Trigger có gây mutating table không, compound trigger xử lý thế nào? Hai giao dịch cùng mua
sản phẩm cuối cùng thì sao (READ COMMITTED + UPDATE có điều kiện)? Bỏ trigger `TRG_OI_TOTALS` thì điều gì xảy ra?
Thêm trạng thái mới vào vòng đời đơn thì sửa những đâu?

## 3. Hoàng Hồng Minh Anh – 24DH112475 · ≈ 33,3 %

**Mảng: Báo cáo SQL, tối ưu hoá, dữ liệu và giao diện**

- Gói báo cáo `PKG_ORDER_RPT` R1–R6 (SUM() OVER, LAG, ROLLUP / GROUPING, DENSE_RANK, PIVOT, JSON_VALUE), màn hình M6.
- Dữ liệu mẫu `08_seed.sql` (đủ mọi trạng thái, nhiều tháng), dữ liệu lớn `09_bulk_data.sql` (≈ 200.000 đơn),
  `t00_reset.sql`.
- Tối ưu hoá: đo execution plan trước / sau Q1–Q3, chỉ mục IX-1 / IX-5 / IX-6, viết lại câu SQL màn hình M1, M3
  (CROSS APPLY, NO_UNNEST), ghi số liệu `docs/TOI_UU.md`.
- Giao diện Shopia: M0, M1, M2, M3, M7 (`site.css`, `shopia.js`), tìm khách phía server
  (`CustomerRepository.SearchAsync`: COUNT(*) OVER, OFFSET … FETCH, COLLATE BINARY_AI).
- Báo cáo: mục 2.5–2.6, 3.6, 4.4–4.5, Chương 5; kịch bản demo `docs/KICH_BAN_DEMO.md`.

**Tệp cần nắm:** `sql/07_pkg_order_rpt.sql`, `sql/03b_indexes_toi_uu.sql`, `sql/10_toi_uu_Q1_Q3.sql`, `sql/toi_uu/*`,
`sql/08_seed.sql`, `Data/ProductRepository.cs`, `Data/CustomerRepository.cs`, `wwwroot/js/shopia.js`, `wwwroot/js/reports.js`.

**Câu hỏi nên chuẩn bị:** Execution plan trước / sau khác nhau ở bước nào? Bỏ chỉ mục IX-5 thì sao? Vì sao truy vấn
phải dùng đúng biểu thức `JSON_VALUE(... RETURNING VARCHAR2(60))`? Viết thêm một báo cáo (ví dụ doanh thu theo tỉnh)?
Vì sao không tải tất cả khách vào dropdown?

## Gợi ý chia phần demo (8–10 phút)

| Người | Bước trong `docs/KICH_BAN_DEMO.md` |
|---|---|
| Tống Phước Bình | Bước 1–4: kiến trúc, TH-6, tạo đơn bằng một tài liệu (TH-1, TH-4), hai cách nhìn (TH-2) |
| Nguyễn Thị Khánh Uyên | Bước 5–7, 9: giao dịch nguyên tử (TH-3), ETag 412 (TH-5), trạng thái / huỷ / hoàn tiền, TC-10 đồng thời |
| Hoàng Hồng Minh Anh | Bước 8: báo cáo R1–R6; phần tối ưu (plan trước / sau) trên slide |
