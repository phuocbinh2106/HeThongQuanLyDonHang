# Tối ưu hoá truy vấn — số liệu đo thật (Chương 4)

Mọi số liệu dưới đây đo thật trên Oracle AI Database 26ai Free **23.26.3** (Docker), ngày 2026-11-20.
Log gốc: `docs/toi-uu/2026-11-20_toi_uu_lan1.txt`, `..._lan2.txt` (đo 2 lần toàn bộ quy trình).

## 1. Dữ liệu và cách đo

**Dữ liệu lớn** (`sql/09_bulk_data.sql`, nạp ~42 giây, tắt trigger khi nạp rồi tính lại tiền bằng `MERGE`):

| Bảng | Số dòng |
|---|---|
| orders | 200.060 |
| order_items | 400.120 |
| order_status_history | 390.260 |
| payments | 180.053 |
| shipments | 170.044 |
| products | 50.036 (200 thương hiệu, Apple: 253) |
| customers | 20.010 (khách #1: 2.006 đơn) |

**Cách đo** (`sql/10_toi_uu_Q1_Q3.sql` + `sql/toi_uu/*.sql`):
- Xoá IX-1, IX-5, IX-6 → đo **TRƯỚC** → tạo chỉ mục bằng `sql/03b_indexes_toi_uu.sql` → đo **SAU**.
- Mỗi truy vấn chạy 2 lần, đo **lần 2** (lần 1 nạp bộ đệm, phân tích câu lệnh). Bind variable giống ứng dụng.
- `ALTER SESSION SET statistics_level = ALL` + `DBMS_XPLAN.DISPLAY_CURSOR(sql_id, child, 'ALLSTATS LAST +COST')`.
- **Cost**: chi phí optimizer *ước lượng* (dòng Id 0). **Buffers**: tổng block đọc từ bộ đệm của lần chạy,
  lấy từ chênh lệch `V$SQL.BUFFER_GETS` — **chỉ số so sánh chính**, ổn định tuyệt đối giữa 2 lần đo.
  **ms**: thời gian thực (`V$SQL.ELAPSED_TIME`), dao động giữa các lần nên ghi cả 2 lần.
- Vì sao không đọc cột Buffers ở dòng Id 0 của plan? Với truy vấn trên Duality View và truy vấn con trong
  SELECT, các nhánh con được in thành cây riêng, **dòng Id 0 không cộng dồn chúng** (ví dụ Q3 TRƯỚC:
  dòng Id 0 ghi 3 block nhưng tổng thật là 5.388).

## 2. Bảng tổng hợp

| Truy vấn | Chỉ mục / cách sửa | Cost trước → sau | **Buffers trước → sau** | ms trước (lần 1 / 2) | ms sau (lần 1 / 2) |
|---|---|---|---|---|---|
| **Q1** 20 đơn mới nhất của khách #1 | IX-1 `orders(customer_id, order_date DESC)` | 820 → 5 | **3.021 → 20** (÷151) | 6,36 / 8,57 | 0,12 / 0,09 |
| **Q2** lọc `brand` trong cột JSON | IX-6 chỉ mục hàm `JSON_VALUE` | 438 → 254 | **1.452 → 271** (÷5,4) | 14,56 / 10,97 | 0,73 / 0,61 |
| **Q3** đọc 1 tài liệu `ORDER_DV` | IX-5 `order_id` ở payments, shipments, history | 1.515 → 20 | **5.388 → 28** (÷192) | 26,52 / 22,65 | 0,45 / 0,44 |
| Q1b M3 – câu SQL **cũ** | chỉ thêm chỉ mục | 7.822 → 7.213 | 5.852 → 4.167 | 316 / 315 | 317 / 286 |
| Q1c M3 – câu SQL **mới** | viết lại + chỉ mục | 1.150.815 → 10.481 | 58.801 → **142** | 230 / 282 | 6,1 / 5,4 |
| Q2b M1 – câu SQL **cũ** | chỉ thêm chỉ mục | 19.727 → 18.560 | 102.738 → 101.414 | 1.398 / 1.424 | 1.377 / 1.373 |
| Q2c M1 – câu SQL **mới** | viết lại + chỉ mục | 928 → 586 | 3.075 → **1.751** | 59,9 / 60,1 | 62,2 / 54,7 |
| Q2d lọc thẳng trên tài liệu DV | viết lại + chỉ mục | 620 → 353 | 1.997 → **815** | 26,0 / 22,7 | 9,1 / 10,9 |

**Đo ở tầng ứng dụng** (thời gian phản hồi HTTP bằng `curl`, dữ liệu lớn, 3 lần mỗi endpoint):

| Endpoint | Bản cũ (câu SQL cũ, chưa có IX-1/5/6) | Bản mới (câu SQL mới + chỉ mục) |
|---|---|---|
| `GET /api/orders?customerId=1` (M3) | 0,34 – 0,41 s | **0,008 – 0,019 s** |
| `GET /api/products?brand=Apple` (M1) | 1,55 – 1,68 s | **0,10 – 0,26 s** |
| `GET /api/orders/71` (đọc 1 tài liệu) | — | 0,004 – 0,006 s |

## 3. Execution plan trước / sau khác nhau ở bước nào (Q1, Q2, Q3)

### Q1 — "Đơn của tôi" (IX-1)
```sql
SELECT ... FROM orders o WHERE o.customer_id = :cust ORDER BY o.order_date DESC FETCH FIRST 20 ROWS ONLY;
```
| | TRƯỚC | SAU |
|---|---|---|
| Truy cập | `TABLE ACCESS FULL ORDERS` (đọc cả bảng, A-Rows 2.006 đơn của khách) | `INDEX RANGE SCAN IX_ORDERS_CUST_DATE` (A-Rows **20**) |
| Sắp xếp | `SORT ORDER BY STOPKEY` (sắp 2.006 dòng) | **không còn bước SORT** — khoá trong chỉ mục đã theo `order_date DESC` |
| Dừng sớm | — | `COUNT STOPKEY`: đọc đủ 20 khoá thì dừng |

Chỉ mục ghép `(customer_id, order_date DESC)` khớp **cả điều kiện lọc lẫn thứ tự sắp xếp**. Chỉ có
`customer_id` thì vẫn phải đọc 2.006 dòng rồi sắp; chỉ có `order_date` thì phải duyệt cả bảng theo ngày.

### Q2 — lọc theo thuộc tính JSON (IX-6)
```sql
SELECT ... FROM products p WHERE JSON_VALUE(p.attributes, '$.brand' RETURNING VARCHAR2(60)) = :brand;
```
| | TRƯỚC | SAU |
|---|---|---|
| Truy cập | `TABLE ACCESS FULL PRODUCTS`, `filter(JSON_VALUE(...) = :BRAND)` — giải mã JSON của **50.036** dòng | `INDEX RANGE SCAN IX_PRODUCTS_BRAND`, `access("P"."SYS_NC00011$" = :BRAND)` → 253 dòng |

`SYS_NC00011$` là **cột ảo ẩn** Oracle tạo cho chỉ mục hàm, lưu sẵn giá trị `JSON_VALUE(...)`.
Truy vấn phải viết **đúng biểu thức** của chỉ mục. Ví dụ thật quan sát được: lọc bằng dấu chấm
`d.data.attributes.brand.string()` (trả `VARCHAR2(4000)`) **không** dùng được IX-6 và vẫn quét toàn bảng.

### Q3 — đọc một tài liệu ORDER_DV (IX-5)
```sql
SELECT JSON_SERIALIZE(d.data RETURNING CLOB) FROM order_dv d WHERE d.data."_id" = :oid;
```
Oracle dựng tài liệu bằng cách đọc dòng `orders` theo khoá chính rồi tìm các dòng con theo `order_id`:

| Nhánh con | TRƯỚC | SAU |
|---|---|---|
| payments | `TABLE ACCESS FULL` – 1.277 block | `INDEX RANGE SCAN IX_PAYMENTS_ORDER` – 3 block |
| shipments | `TABLE ACCESS FULL` – 1.508 block | `INDEX RANGE SCAN IX_SHIPMENTS_ORDER` – 3 block |
| order_status_history | `TABLE ACCESS FULL` – 2.586 block | `INDEX RANGE SCAN IX_HISTORY_ORDER` – 5 block |
| order_items | `INDEX RANGE SCAN ORDER_ITEMS_UQ` (đã có sẵn nhờ UNIQUE(order_id, product_id)) | như cũ |

Oracle **không tự tạo chỉ mục cho khoá ngoại**. Mỗi lần API đọc một đơn (màn hình M4, mỗi lần
PUT/POST trả tài liệu mới) đều dựng tài liệu này → thiếu IX-5 thì mỗi request quét toàn bộ 3 bảng con.

## 4. Phát hiện khi đo đúng câu SQL của ứng dụng (quan trọng)

### 4.1. M3 – danh sách đơn: thêm chỉ mục gần như **không** giúp câu SQL cũ (Q1b)
Câu cũ đặt `JOIN customers` + 3 truy vấn con (đếm dòng hàng, tiền đã trả, hãng vận chuyển) ở tầng ngoài
rồi `OFFSET/FETCH`. Oracle "tháo" truy vấn con thành join (**scalar subquery unnesting**, các bước
`VW_SSQ_1`, `VW_SSQ_2`) → `TABLE ACCESS FULL PAYMENTS` và `SHIPMENTS` (170.000 dòng mỗi bảng), tính cho
**cả 2.006 đơn** rồi mới cắt 20 → 4.167 block / ~300 ms dù đã có chỉ mục.

**Sửa (Q1c, đã áp vào `OrderRepository.ListAsync`):**
1. Cắt 1 trang đơn **trước** trong inline view (dùng IX-1, dừng sớm), rồi mới join và tính cột phụ.
2. Gợi ý `/*+ NO_UNNEST */` trong 3 truy vấn con. Lý do: `OFFSET :off`/`FETCH NEXT :n` là bind variable
   nên optimizer **không biết** inline view chỉ ra 20 dòng (ước lượng E-Rows = 2.116) và vẫn chọn tháo
   truy vấn con thành hash join quét toàn bảng — quan sát thật trong `V$SQL` của ứng dụng: 2.885 block /
   ~250 ms/lần. Với `NO_UNNEST`, truy vấn con chạy 20 lần qua IX-5 → **142 block, ~6 ms**.

**Bài học:** Q1c **khi chưa có IX-5** tệ hơn hẳn câu cũ (**58.801 block**): truy vấn con buộc chạy theo
từng dòng mà không có chỉ mục thì mỗi dòng quét toàn bảng payments/shipments. **Viết lại câu SQL và chỉ
mục phải đi cùng nhau.** Cũng vì E-Rows sai, Cost của Q1c (10.481) còn cao hơn Q1b (7.213) dù thực tế đọc
ít hơn 29 lần → **Cost chỉ là ước lượng; so sánh tối ưu phải dựa trên A-Rows / Buffers thực tế.**

### 4.2. M1 – danh sách sản phẩm: chỉ mục **không** giúp câu SQL cũ (Q2b)
Câu cũ: `SELECT ... FROM product_dv d WHERE d.data."_id".number() IN (SELECT product_id FROM products WHERE ...)`.
Điều kiện `IN (truy vấn con)` trên `_id` **không được đẩy xuống** bảng nền → `VIEW PRODUCT_DV` dựng tài liệu
cho **cả 50.036 sản phẩm** (49.889 lần tra `SELLERS`, 49.971 lần tra `CATEGORIES`) rồi mới so `_id`:
~101.000 block, ~1,4 giây, có hay không có IX-6 như nhau.

**Sửa (Q2c, đã áp vào `ProductRepository.ListAsync`):** lọc trên bảng nền trước (giữ nguyên mọi bộ lọc
của M1, dùng IX-6), giới hạn 200 dòng, rồi `CROSS APPLY (SELECT ... FROM product_dv x WHERE x.data."_id" =
f.product_id)` → chỉ dựng tài liệu cho 200 sản phẩm: **1.751 block, ~60 ms** (÷58 số block).
Còn tồn tại: bên trong Duality View vẫn có một bước `TABLE ACCESS FULL PRODUCTS` (1.435 block).

**Cách khác (Q2d):** lọc **thẳng trên tài liệu**
`WHERE JSON_VALUE(d.data, '$.attributes.brand' RETURNING VARCHAR2(60)) = :brand` → Oracle dịch đường dẫn
`$.attributes.brand` về cột `products.attributes`, đẩy điều kiện xuống bảng nền và dùng được IX-6:
**815 block, ~10 ms**. Đây là cách "thuần Duality View" nhất (truy vấn tài liệu, Oracle tự tối ưu trên bảng),
nhưng M1 còn các bộ lọc cây danh mục / `size[*]` / RAM viết trên bảng nền nên chọn Q2c cho tổng quát.

## 5. Chỉ mục được giữ lại trong hệ thống

`sql/03b_indexes_toi_uu.sql` (đã đưa vào `sql/install_all.sql`, chạy sau `03_indexes.sql`):
```sql
CREATE INDEX ix_orders_cust_date ON orders (customer_id, order_date DESC);                      -- IX-1
CREATE INDEX ix_payments_order  ON payments (order_id);                                          -- IX-5
CREATE INDEX ix_shipments_order ON shipments (order_id);                                         -- IX-5
CREATE INDEX ix_history_order   ON order_status_history (order_id);                              -- IX-5
CREATE INDEX ix_products_brand  ON products (JSON_VALUE(attributes, '$.brand' RETURNING VARCHAR2(60))); -- IX-6
```
Sau khi thêm chỉ mục và sửa câu SQL, toàn bộ kiểm thử chạy lại vẫn PASS (CSDL 14/14, web/API 16/16 —
`docs/test-logs/2026-11-20_*.txt`). TC-14 hoàn tất: plan của Q2 dùng `INDEX RANGE SCAN IX_PRODUCTS_BRAND`.

## 6. Chạy lại

```powershell
.\scripts\db.ps1 reset
.\scripts\db.ps1 file 09_bulk_data.sql
.\scripts\db.ps1 file 10_toi_uu_Q1_Q3.sql
.\scripts\db.ps1 reset
```
`09_bulk_data.sql` thêm ~1,4 triệu dòng; `t00_reset.sql` xoá sạch rồi nạp lại dữ liệu demo và thu thập lại
thống kê (TRUNCATE không xoá thống kê cũ của 200.000 đơn).

## 7. Gợi ý trả lời vấn đáp

- **"Execution plan trước/sau khác nhau ở bước nào?"** Q1: `TABLE ACCESS FULL` + `SORT ORDER BY STOPKEY` →
  `INDEX RANGE SCAN` + `COUNT STOPKEY`, mất bước SORT. Q2: `TABLE ACCESS FULL` có `filter(JSON_VALUE...)` →
  `INDEX RANGE SCAN` có `access(SYS_NC00011$ = :BRAND)`. Q3: ba nhánh `TABLE ACCESS FULL` → `INDEX RANGE SCAN`.
- **"Nếu bỏ chỉ mục IX-5 thì sao?"** Mỗi lần đọc một tài liệu đơn quét toàn bộ 3 bảng con (5.388 thay vì
  28 block); riêng câu M3 mới còn tệ hơn câu cũ (58.801 block) vì truy vấn con chạy theo từng dòng.
- **"Vì sao không dùng JSON Search Index?"** Chưa hỗ trợ trên cột của bảng nền Duality View; chỉ mục hàm
  `JSON_VALUE` đủ cho lọc theo một trường cụ thể và đã kiểm chứng được dùng trong plan.
- **"Vì sao không đo theo Cost?"** Cost là ước lượng từ thống kê và E-Rows; khi E-Rows sai (bind variable cho
  FETCH) Cost có thể ngược với thực tế (Q1c vs Q1b). Đo theo A-Rows, Buffers, A-Time của lần chạy thật.
