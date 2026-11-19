# Nhật ký thay đổi thiết kế và phát hiện khi chạy trên Oracle thật

Mục đích: ghi lại **mọi chỗ khác với bản thiết kế ban đầu** (CLAUDE.md mục 5–6, báo cáo Chương 3)
kèm **lý do**, để cập nhật báo cáo và trả lời vấn đáp.

Môi trường kiểm chứng: Oracle AI Database 26ai Free **Release 23.26.3.0.0** (dòng 23ai), Docker,
PDB `ecom`, schema `ecom_schema`.

---

## 1. Ràng buộc JSON Schema của `products.attributes` (quan trọng)

| | Bản đầu | Bản hiện tại |
|---|---|---|
| Cách khai báo | `ALTER TABLE products ADD CONSTRAINT products_attr_chk CHECK (attributes IS JSON VALIDATE '{...}')` | Khai báo **ngay trên kiểu cột**: `attributes JSON CONSTRAINT products_attr_chk VALIDATE '{...}'` |

**Phát hiện (2026-11-19, TC-11):** với bản đầu, `INSERT INTO products ...` thiếu `brand` bị chặn
(ORA-02290) nhưng **`INSERT INTO product_dv ...` thiếu `brand` lại thành công** — tức ràng buộc
CHECK rời bị bỏ qua khi ghi qua Duality View. Với cách khai báo trên kiểu cột, cả hai kênh đều bị
chặn. Các CHECK thường (ví dụ `price >= 0`) vẫn được kiểm tra bình thường qua Duality View.

**Ý nghĩa cho vấn đáp:** "Mọi quy tắc nằm ở bảng nền nên có hiệu lực ở cả hai kênh" là đúng về
nguyên tắc, **nhưng phải kiểm chứng bằng kiểm thử**, không được mặc định. TC-11 kiểm tra cả hai kênh.

## 2. Lỗi nghiệp vụ khi ghi qua Duality View bị "bọc" trong ORA-42692

Ví dụ hết hàng khi tạo đơn qua `ORDER_DV`:
```
ORA-42692: Cannot insert into JSON Relational Duality View 'ECOM_SCHEMA'.'ORDER_DV': Error while inserting into table 'ORDER_ITEMS'
ORA-20001: Không đủ tồn kho cho sản phẩm 2
ORA-06512: at "ECOM_SCHEMA.PKG_ORDER", ...
```
→ Mã lỗi ngoài cùng (`SQLCODE`) là **-42692**, không phải -20001. Tầng API (C#) phải **quét toàn bộ
chuỗi lỗi** tìm `ORA-200xx` đầu tiên để ánh xạ đúng HTTP status (409/422...). Script kiểm thử dùng
`INSTR(SQLERRM, 'ORA-200xx')` vì lý do này. Riêng xung đột ETag trả thẳng **ORA-42699** (không bọc).

## 3. Báo cáo `PKG_ORDER_RPT` viết lại theo đúng đặc tả R1–R5

Trong CSDL cũ có sẵn một `PKG_ORDER_RPT` (không có file nguồn trong `sql/`) với R1 theo ngày,
R2 theo danh mục, R3 top toàn sàn, R4 theo trạng thái, R5 theo thương hiệu — chưa dùng các kỹ thuật
mà CLAUDE.md yêu cầu. Bản mới (`sql/07_pkg_order_rpt.sql`):

| Mã | Nội dung | Kỹ thuật |
|---|---|---|
| R1 | Doanh thu theo tháng, luỹ kế, % tăng trưởng | `SUM() OVER (ORDER BY)`, `LAG` |
| R2 | Doanh thu người bán × danh mục + tổng phụ + tổng cộng | `GROUP BY ROLLUP`, `GROUPING`, `GROUPING_ID` |
| R3 | Top N sản phẩm mỗi danh mục | `DENSE_RANK() OVER (PARTITION BY ...)` |
| R4 | Ma trận số đơn tháng × trạng thái | `PIVOT` |
| R5 | Tỉ lệ huỷ/trả theo người bán | `COUNT(DISTINCT CASE ...)`, `NULLIF` |
| R6 | (giữ lại từ bản cũ) Doanh thu theo thương hiệu | `JSON_VALUE` trên cột JSON |

Quy ước doanh thu: chỉ tính đơn `DELIVERED`. Tham số sai → `ORA-20010` (mã mới, HTTP 422).
Bản cũ được lưu ở `sql/_backup/pkg_order_rpt_old.sql` (không đưa lên GitHub).

## 4. Dữ liệu mẫu (`08_seed.sql`) mở rộng

5 người bán, 7 danh mục (có cây cha–con), 36 sản phẩm thuộc 6 ngành hàng với `attributes` khác
nhau, 10 khách (1 bị khoá), 60 đơn trải từ tháng 3 đến tháng 11/2026, đủ 7 trạng thái, có thanh
toán (kể cả REFUNDED), vận đơn, lịch sử.

- Đơn mẫu được tạo **qua đúng trigger/procedure** (giá, tổng tiền, tồn kho, lịch sử đều do CSDL
  sinh ra), sau đó mới lùi `order_date`, `order_no`, `changed_at`, `paid_at`... bằng cờ
  `pkg_order.g_internal` để báo cáo có nhiều tháng.
- Giá sản phẩm đổi sang giá thực tế (ví dụ S24 22.990.000đ thay vì 1.000.000đ) → các con số minh
  hoạ trong báo cáo Chương 4 cần cập nhật.
- ID dành riêng cho kiểm thử: sản phẩm 1–3 (tồn 10/20/50), 4 (INACTIVE), 5 (tồn đúng 5 cho TC-10).

## 5. Script mới

| File | Vai trò |
|---|---|
| `sql/01_drop_all.sql` | Xoá sạch schema để cài lại từ đầu |
| `sql/install_all.sql` | Chạy 01→08 đúng thứ tự (SQL*Plus/SQLcl) |
| `sql/t00_reset.sql` | Đưa **dữ liệu** về ban đầu (TRUNCATE + đặt lại identity/sequence + seed) |
| `sql/t01_smoke_test.sql` | TC-01, 03, 05 — tự in PASS/FAIL, không còn phụ thuộc `order_id = 1` |
| `sql/t02_test_cases.sql` | TC-02, 04, 06, 07, 08, 09, 11, 12, 13 — tự kiểm tra rồi ROLLBACK |
| `scripts/db.ps1` | Chạy các script trên bằng SQL*Plus có sẵn trong container |

## 6. Lưu ý kỹ thuật khi chạy script

- **SQL*Plus 23.26:** không đặt chú thích `-- ...` sau dấu `;` trên cùng một dòng. SQL*Plus khi đó
  không nhận ra `;` là kết thúc lệnh, gộp hai lệnh làm một → `ORA-03405`. Đã sửa ở `00`, `08`, `t01`.
- **Số thứ tự bị nhảy** (ví dụ `order_id` hay `order_no` không liên tục): do sequence/identity có
  `CACHE` và do giao dịch bị ROLLBACK (số đã cấp không trả lại). Đây là hành vi bình thường của Oracle.
- **`changedBy` = `ECOM_SCHEMA`** khi tạo đơn qua Duality View: `fn_current_user` lấy
  `g_user` → `CLIENT_IDENTIFIER` → `USER`. Ứng dụng web sẽ đặt `CLIENT_IDENTIFIER` theo người
  thao tác để lịch sử ghi đúng người.
- `JSON_TRANSFORM` là hàm SQL, không gọi trực tiếp như biểu thức PL/SQL được (PLS-00103) → dùng
  `SELECT JSON_TRANSFORM(...) INTO ... FROM dual`, hoặc đặt ngay trong câu `UPDATE`.

## 7. Kết quả kiểm thử mức CSDL (chạy thật)

Log đầy đủ: `docs/test-logs/2026-11-19_db_t01_t02.txt`. Tóm tắt: **12/12 PASS**
(TC-01, 02, 03, 04, 05, 06, 07, 08, 09, 11, 12, 13). TC-10 (đồng thời) và TC-14 (execution plan)
sẽ làm ở bước ứng dụng / tối ưu.
