# Giải thích code SQL: package, trigger, JSON Duality View và nơi web dùng đến

Tài liệu này giải thích **lõi CSDL** của Shopia: phần nào làm gì, vì sao viết như vậy, và **màn hình / API nào của web gọi tới nó**.

Mã nguồn tương ứng:

| Tệp | Nội dung |
|---|---|
| `sql/02_tables.sql` | 10 bảng, sequence, ràng buộc, JSON Schema |
| `sql/03_indexes.sql`, `sql/03b_indexes_toi_uu.sql` | Chỉ mục |
| `sql/04_pkg_order.sql` | `PKG_ORDER_CTX`, `PKG_ORDER` |
| `sql/05_triggers.sql` | 6 trigger |
| `sql/06_duality_views.sql` | 3 Duality View |
| `sql/07_pkg_order_rpt.sql` | Báo cáo |

Phía C#, mọi câu SQL nằm trong thư mục `src/Ecom.Web/Data/`.

---

## 1. Bức tranh tổng thể

```
Trình duyệt (Razor View + JavaScript fetch)
        │  JSON qua HTTP
ASP.NET Core API (/api/...)  ── OracleErrorMapper: ORA-xxxxx → HTTP 404/409/412/422
        │  ODP.NET, luôn dùng bind variable, gắn CLIENT_IDENTIFIER = người thao tác
Oracle 23ai ─┬─ ĐƯỜNG JSON: SELECT / INSERT / UPDATE trên ORDER_DV, PRODUCT_DV, CUSTOMER_DV
             │
             └─ ĐƯỜNG QUAN HỆ: gọi PKG_ORDER (đổi trạng thái, huỷ, thanh toán),
                               PKG_ORDER_RPT (báo cáo), truy vấn bảng (danh sách đơn...)
                     ▼
        10 BẢNG NỀN + 6 TRIGGER  ← mọi quy tắc nghiệp vụ nằm ở đây
```

**Ý quan trọng nhất:** Duality View **không lưu dữ liệu**. Nó chỉ là "cách nhìn" dạng JSON của các bảng nền.

- Khi web ghi một tài liệu JSON, Oracle tách tài liệu thành các câu INSERT / UPDATE / DELETE trên bảng nền.
- Các câu đó kích hoạt trigger y như khi ghi bằng SQL thường.
- Vì vậy, **ghi qua JSON hay qua SQL đều bị cùng một bộ quy tắc kiểm tra.**

---

## 2. Bảng và ràng buộc (`02_tables.sql`)

| Bảng | Vai trò | Điểm cần nhớ |
|---|---|---|
| `customers`, `customer_addresses` | Khách và sổ địa chỉ (1–N) | Nguồn của `CUSTOMER_DV` |
| `sellers`, `categories` | Người bán, danh mục | Danh mục là cây cha–con qua `parent_id` |
| `products` | Sản phẩm | Cột **`attributes JSON`** có JSON Schema (xem dưới) |
| `orders` | Đơn hàng | `order_no`, `status`, `subtotal`, `total_amount` do trigger quản lý |
| `order_items` | Dòng hàng | `UNIQUE (order_id, product_id)`; `unit_price` là **giá chốt lúc mua** |
| `payments`, `shipments` | Thanh toán, vận đơn | Mảng `payments[]`, `shipments[]` của `ORDER_DV` |
| `order_status_history` | Nhật ký trạng thái | **Chỉ trigger được ghi** |

**JSON Schema trên cột `products.attributes`:**

```sql
attributes JSON CONSTRAINT products_attr_chk VALIDATE '{
  "type": "object",
  "properties": { "brand": {"type":"string"}, "warrantyMonths": {"type":"number","minimum":0} },
  "required": ["brand"] }'
```

- Thuộc tính khác nhau theo ngành hàng: điện thoại có `ramGb`, `storageGb`; áo có `size`, `material`.
- Nhưng **bắt buộc có `brand`**. Thiếu thì báo **ORA-40875**.
- Schema được khai báo **trên kiểu cột**, không dùng `CHECK (... IS JSON VALIDATE)` rời. Lý do: chạy thật trên 23.26.3, cách `CHECK` rời bị bỏ qua khi ghi qua `PRODUCT_DV`.
- **Trên web:** người bán xoá `brand` trong hộp thoại JSON rồi Lưu → báo 422 (TC-11, Hình 4.15).

**Ba điểm phi chuẩn hoá có chủ đích:**
1. `order_items.unit_price`: giá lúc mua. Sau này shop đổi giá thì đơn cũ không bị đổi theo.
2. `orders.ship_receiver`, `ship_phone`, `ship_address`: chụp lại địa chỉ lúc đặt.
3. `orders.subtotal`, `total_amount`: dữ liệu dẫn xuất, do trigger tính lại.

---

## 3. Gói `PKG_ORDER_CTX` – biến dùng chung trong phiên

```sql
CREATE OR REPLACE PACKAGE pkg_order_ctx AS
  g_internal BOOLEAN := FALSE;   -- TRUE khi chính package đang sửa orders (tính lại tổng)
  g_user     VARCHAR2(60);       -- người thao tác, ghi vào lịch sử
  g_note     VARCHAR2(300);      -- ghi chú đổi trạng thái
END pkg_order_ctx;
```

- Biến của package sống **theo phiên** (session). Procedure gán giá trị, trigger chạy trong cùng phiên thì đọc được.
- Đây là cách truyền "ai đổi, ghi chú gì" từ procedure sang trigger.
- **Vì sao tách khỏi `PKG_ORDER`:** package có biến mà bị biên dịch lại thì các phiên đang mở (connection pool của web) gặp **ORA-04068** ở lần gọi sau. `PKG_ORDER_CTX` chỉ có biến, không tham chiếu bảng, nên không bao giờ bị INVALID.

---

## 4. Gói `PKG_ORDER` – nghiệp vụ đơn hàng (`04_pkg_order.sql`)

### 4.1. Mã lỗi tự định nghĩa

Khai báo bằng `PRAGMA EXCEPTION_INIT`. API (`Services/OracleErrorMapper.cs`) đổi sang mã HTTP:

| Mã | Ý nghĩa | HTTP | Thấy trên web ở đâu |
|---|---|---|---|
| -20001 | Hết hàng | 409 | Tạo đơn vượt tồn (TC-03); trang Mua đồng thời |
| -20002 | Chuyển trạng thái sai | 422 | Chi tiết đơn → "Thử chuyển tới" (TC-05); huỷ đơn đang giao (TC-07) |
| -20003 | Sản phẩm ngừng bán / không tồn tại | 422 | Đặt sản phẩm INACTIVE (TC-04) |
| -20004 | Đơn đã khoá, không sửa dòng hàng | 409 | Sửa dòng hàng khi đơn đã xác nhận (TC-06) |
| -20005 | Thanh toán vượt tổng | 422 | Ghi thanh toán quá số tiền (TC-08) |
| -20006 | Không tìm thấy đơn | 404 | Mở / thao tác đơn không tồn tại |
| -20007 | Giảm giá vượt tiền hàng | 422 | Tạo đơn với giảm giá lớn (TC-13) |
| ORA-42699 | ETag không khớp (Duality View) | 412 | Hai người cùng sửa một đơn (TC-09) |

Khi ghi qua Duality View, lỗi của trigger bị **bọc** trong ORA-42692 ("Cannot insert into JSON Relational Duality View…").

- Vì vậy `OracleErrorMapper` không chỉ đọc mã ngoài cùng, mà quét cả chuỗi lỗi để tìm ORA-200xx bên trong.
- Trên web, mục **"Chuỗi lỗi gốc từ Oracle"** hiện nguyên chuỗi này.

### 4.2. Từng hàm / thủ tục

| Thành phần | Làm gì | Ai gọi | Nơi web dùng |
|---|---|---|---|
| `fn_is_valid_transition(old, new)` | Trả TRUE nếu cặp trạng thái nằm trong sơ đồ vòng đời | Trigger `trg_ord_status_bu`; câu SQL `next-statuses` của API | Các nút **"→ CONFIRMED", "→ PACKING"…** ở khu Xử lý đơn: web hỏi CSDL trạng thái kế tiếp hợp lệ chứ không tự viết sơ đồ ở JavaScript |
| `fn_current_user` | Trả người thao tác: `g_user` → `CLIENT_IDENTIFIER` → `USER` | Trigger `trg_ord_audit_aiu` | Cột "bởi admin / seller:1…" trong lịch sử đơn |
| `fn_available_stock(product)` | Tồn kho hiện tại | Hàm tiện ích (web chưa gọi) | Dùng khi kiểm tra bằng SQL |
| `fn_calc_order_total(order)` | Tính tổng đơn từ dòng hàng | Hàm tiện ích (web chưa gọi) | Dùng khi kiểm tra bằng SQL |
| `sp_reserve_stock(product, qty, OUT price)` | **Trừ kho nguyên tử và lấy giá** | Trigger `trg_oi_biud_row` | Mọi lần tạo đơn / thêm dòng hàng |
| `sp_release_stock(product, qty)` | Cộng lại kho | Trigger `trg_oi_biud_row` | Giảm số lượng / xoá dòng hàng |
| `sp_release_order_stock(order)` | Hoàn kho cả đơn | Trigger `trg_ord_audit_aiu` | Huỷ đơn, trả hàng |
| `sp_refund_order_payments(order)` | PAID → REFUNDED (BR-12) | Trigger `trg_ord_audit_aiu` | Huỷ đơn đã thanh toán (TC-16, Hình 4.12) |
| `sp_recalc_totals(order)` | Tính lại `subtotal`, `total_amount`; chặn giảm giá > tiền hàng | Compound trigger `trg_oi_totals` | Tổng tiền đúng sau mỗi lần sửa dòng hàng |
| `sp_change_status(order, status, user, note)` | Đổi trạng thái | API `POST /api/orders/{id}/status` (người bán, quản trị) | Nút chuyển trạng thái, ô "Thử chuyển tới" |
| `sp_cancel_order(order, reason, user)` | Huỷ đơn (gọi `sp_change_status` với CANCELLED) | API `POST /api/orders/{id}/cancel` | Nút **"Huỷ đơn"** (cả khách hàng) |
| `sp_record_payment(order, method, amount, ref)` | Ghi thanh toán, không cho vượt tổng | API `POST /api/orders/{id}/payments` | Nút **"Ghi thanh toán"** (kênh "Qua procedure") |

### 4.3. Các đoạn code cần giải thích được

**Trừ kho nguyên tử** (`sp_reserve_stock`), trả lời câu "hai khách mua sản phẩm cuối cùng thì sao?":

```sql
UPDATE products
   SET stock_qty = stock_qty - p_qty
 WHERE product_id = p_product_id
   AND status = 'ACTIVE'
   AND stock_qty >= p_qty          -- điều kiện nằm NGAY trong câu UPDATE
RETURNING price INTO p_price;      -- lấy luôn giá thật (BR-03: không tin giá client)
IF SQL%ROWCOUNT = 0 THEN ... phân biệt: không tồn tại / ngừng bán (-20003) / hết hàng (-20001)
```

- Không có bước "đọc tồn kho rồi mới quyết định", nên không có khe hở giữa hai bước.
- Hai phiên cùng UPDATE một dòng: phiên sau **chờ khoá** của phiên trước. Khi được chạy, Oracle **đánh giá lại** điều kiện `stock_qty >= p_qty` trên giá trị mới.
- Vì vậy mức cô lập mặc định **READ COMMITTED là đủ**.
- **Trên web:** trang "Mua đồng thời", 20 khách mua sản phẩm còn 5 thì đúng 5 thành công (Hình 3.11).

**Ghi thanh toán** (`sp_record_payment`):

```sql
SELECT total_amount INTO l_total FROM orders WHERE order_id = p_order_id FOR UPDATE;
```

- `FOR UPDATE` khoá dòng đơn, để hai lần ghi thanh toán đồng thời không cùng "thấy còn thiếu tiền" rồi cùng ghi vượt.

**Đổi trạng thái** (`sp_change_status`):

```sql
pkg_order_ctx.g_user := p_user;  pkg_order_ctx.g_note := p_note;   -- truyền cho trigger
UPDATE orders SET status = p_new_status WHERE order_id = p_order_id; -- kích hoạt 2 trigger
IF SQL%ROWCOUNT = 0 THEN RAISE_APPLICATION_ERROR(-20006, ...);
pkg_order_ctx.g_user := NULL; ...                                   -- dọn biến, kể cả khi lỗi
```

- Procedure **không tự kiểm tra sơ đồ**: việc đó do trigger làm. Nhờ vậy, ai UPDATE `status` bằng SQL trực tiếp cũng bị chặn y hệt.

---

## 5. Sáu trigger (`05_triggers.sql`)

| Trigger | Loại | Bảng / thời điểm | Việc làm | Quy tắc |
|---|---|---|---|---|
| `trg_ord_biu_row` | Dòng | `BEFORE INSERT OR UPDATE ON orders` | Khi thêm: sinh `order_no` = `ORD-yyyymmdd-` + `seq_order_no`, đặt `status = PENDING`, `order_date`, tổng = phí ship. Khi sửa (không phải do package): giữ nguyên số đơn, ngày, subtotal; kiểm giảm giá; tính lại `total_amount` | BR-11, BR-05, TH-4 |
| `trg_ord_status_bu` | Dòng | `BEFORE UPDATE OF status ON orders WHEN (NEW.status <> OLD.status)` | Gọi `fn_is_valid_transition`; sai thì -20002. Sang CONFIRMED mà đơn chưa có dòng hàng cũng -20002 | BR-06, BR-01 |
| `trg_ord_audit_aiu` | Dòng | `AFTER INSERT OR UPDATE OF status ON orders` | Ghi `order_status_history` (NULL → PENDING khi tạo; cũ → mới khi đổi). Nếu sang CANCELLED / RETURNED thì hoàn kho và hoàn tiền | BR-07, BR-10, BR-12 |
| `trg_oi_biud_row` | Dòng | `BEFORE INSERT OR UPDATE OR DELETE ON order_items` | Đơn không còn PENDING thì -20004. Thêm dòng: `sp_reserve_stock` rồi gán `unit_price` = giá thật. Sửa: giữ giá cũ, trừ / trả kho phần chênh lệch. Xoá: trả kho | BR-02, BR-03, BR-04, BR-08 |
| `trg_oi_totals` | **Compound** | `FOR INSERT OR UPDATE OR DELETE ON order_items` | AFTER EACH ROW: ghi nhớ `order_id` bị ảnh hưởng. AFTER STATEMENT: gọi `sp_recalc_totals` cho từng đơn | BR-05 |
| `trg_pay_check` | **Compound** | `FOR INSERT OR UPDATE ON payments` | AFTER EACH ROW: ghi nhớ đơn có dòng PAID. AFTER STATEMENT: tổng PAID > `total_amount` thì -20005 | BR-09 |

### 5.1. Vì sao cần compound trigger (mutating table)

Trigger **mức dòng** trên `order_items` không được đọc / ghi lại chính bảng `order_items`. Khi câu lệnh còn đang chạy, bảng ở trạng thái "mutating", làm vậy sẽ gặp **ORA-04091**.

Muốn tính tổng tiền thì lại phải `SUM` trên `order_items`. Compound trigger giải quyết bằng hai pha:
1. **AFTER EACH ROW:** chỉ ghi nhớ `order_id` vào một mảng (`g_orders`), không đọc bảng.
2. **AFTER STATEMENT:** câu lệnh đã xong, bảng hết "mutating", lúc này mới `SUM` và `UPDATE orders`.

Ví dụ: một câu UPDATE `ORDER_DV` sửa 3 dòng hàng của cùng một đơn chỉ tính lại tổng **một lần** (mảng dùng `order_id` làm khoá nên không trùng).

`trg_pay_check` cũng làm theo cách đó, thêm một chi tiết:
- Nó chỉ ghi nhớ dòng có `status = 'PAID'`.
- Khi huỷ đơn, `trg_ord_audit_aiu` (đang chạy trên `orders`) gọi `sp_refund_order_payments` để UPDATE payments sang REFUNDED.
- Nếu lúc đó `trg_pay_check` lại SELECT `orders` thì sẽ gặp ORA-04091. Dòng REFUNDED chỉ làm số đã trả giảm đi nên không cần kiểm tra.

### 5.2. Cờ `g_internal`

`sp_recalc_totals` cần UPDATE `orders.subtotal`, nhưng `trg_ord_biu_row` được viết để **giữ nguyên** `subtotal` khi người ngoài sửa đơn. Cách xử lý:
- Trước khi UPDATE, package bật `pkg_order_ctx.g_internal := TRUE`.
- Trigger thấy cờ này thì để package ghi.
- Xong việc (kể cả khi lỗi), package tắt cờ.

### 5.3. Thứ tự kích hoạt khi **tạo một đơn** (nút "Đặt hàng" trên web)

```
POST /api/orders  →  INSERT INTO order_dv (data) VALUES (JSON(:doc))
  Oracle tách tài liệu:
  1. INSERT orders       → trg_ord_biu_row   (số đơn, PENDING, ngày, tổng = phí ship)
                         → trg_ord_audit_aiu (lịch sử NULL → PENDING, bởi CLIENT_IDENTIFIER)
  2. INSERT order_items  → (mỗi dòng) trg_oi_biud_row: kiểm PENDING, trừ kho, chốt giá
                         → trg_oi_totals: nhớ order_id …
                           AFTER STATEMENT → sp_recalc_totals → UPDATE orders (subtotal, total)
  Một bước bất kỳ lỗi (hết hàng, giảm giá quá…) → CẢ câu INSERT bị huỷ → không có đơn, kho nguyên vẹn
```

### 5.4. Khi **đổi trạng thái** / **huỷ đơn**

```
Nút "→ PACKING"  → POST /api/orders/{id}/status → pkg_order.sp_change_status
                 → UPDATE orders SET status
                   → trg_ord_status_bu  (kiểm sơ đồ)
                   → trg_ord_biu_row    (giữ số đơn, ngày, tổng)
                   → trg_ord_audit_aiu  (ghi lịch sử; nếu CANCELLED/RETURNED: hoàn kho + REFUNDED)
Nút "Huỷ đơn"    → POST /api/orders/{id}/cancel → pkg_order.sp_cancel_order → như trên với CANCELLED
```

**Ai được bấm:**
- Khách hàng chỉ có nút "Huỷ đơn". Trang chi tiết đơn của khách có khung "Ai chuyển trạng thái đơn?" kèm nút vào vai người bán của shop.
- **Người bán** có sản phẩm trong đơn và **quản trị** thấy các nút chuyển trạng thái.

---

## 6. Ba JSON Relational Duality View (`06_duality_views.sql`)

### 6.1. Annotation dùng trong view

| Annotation | Nghĩa | Ví dụ trong đồ án |
|---|---|---|
| `WITH INSERT UPDATE DELETE` (sau tên bảng) | Bảng đó được thêm / sửa / xoá qua tài liệu | `order_items` (thêm, sửa, xoá dòng hàng) |
| `WITH INSERT UPDATE NODELETE` | Được thêm, sửa nhưng không xoá | `orders`: đơn không xoá, chỉ huỷ để giữ lịch sử |
| `WITH NOINSERT NOUPDATE NODELETE` | Chỉ đọc | `customers`, `products` trong `ORDER_DV`; `order_status_history` |
| `WITH NOUPDATE` (sau một trường) | Client không sửa được trường đó | `orderNo`, `orderDate`, `status`, `unitPrice` |
| `WITH NOCHECK` | Trường **không tham gia ETag** | `fullName`, `email`, `sku`, `productName`, `subtotal`, `totalAmount` |
| `UNNEST` | "Làm phẳng" object con vào object cha | `productId`, `sku`, `productName` nằm thẳng trong mỗi `items[]` |
| `_id` | Khoá của tài liệu = khoá chính bảng gốc | `order_id`, `product_id`, `customer_id` |
| `_metadata.etag` | Oracle tự sinh, đổi khi dữ liệu đổi | Web gửi lại qua header `If-Match` |

### 6.2. `ORDER_DV` – một đơn = một tài liệu (gốc `orders`)

```
{ _id, orderNo, status, orderDate, shipReceiver, shipPhone, shipAddress,
  subtotal, shippingFee, discount, totalAmount,
  customer : { customerId, fullName, email }                    ← customers, chỉ đọc
  items    : [ { orderItemId, quantity, unitPrice,
                 productId, sku, productName } ]                 ← order_items (+ products, UNNEST)
  payments : [ { paymentId, method, amount, status } ]           ← payments, thêm/sửa
  shipments: [ { shipmentId, carrier, trackingNo, status } ]     ← shipments, thêm/sửa
  history  : [ { historyId, oldStatus, newStatus, changedAt, changedBy } ]  ← chỉ đọc
}
```

Các quyết định quan trọng (đều kiểm chứng trên Oracle 23.26.3):

- **`status WITH NOUPDATE`:** đổi trạng thái bằng cách ghi tài liệu sẽ bị từ chối (ORA-40940). Lý do: `trg_ord_audit_aiu` chèn dòng vào `order_status_history`, tức là `history[]` của **chính tài liệu đang ghi**. Oracle coi đó là sửa đồng thời và báo ORA-40896. Vì thế đổi trạng thái phải đi đường quan hệ (`sp_change_status`).
- **`subtotal`, `totalAmount` WITH NOUPDATE NOCHECK:** trigger tính lại tổng ngay trong câu UPDATE tài liệu. Nếu hai trường này tham gia ETag thì cũng gặp ORA-40896. An toàn vẫn giữ được: tổng chỉ đổi khi `items`, `shippingFee`, `discount` đổi, mà các trường đó vẫn tham gia ETag.
- **`customer.fullName`, `email`, `items[].sku`, `productName` NOCHECK:** client chỉ cần gửi khoá (`customerId`, `productId`). Đổi tên sản phẩm cũng không làm hỏng ETag của các đơn cũ.
- **Đổi khoá của object con** (ví dụ gửi `customerId` khác) thì Oracle sẽ **trỏ đơn sang khách khác** (sửa khoá ngoại ở bảng gốc). Vì vậy API C# kiểm tra quyền: khách hàng không được đổi `customer`.

**Web dùng ở đâu:**

| Thao tác web | API | Câu lệnh trên Duality View |
|---|---|---|
| Nút "Đặt hàng" (trang Tạo đơn) | `POST /api/orders` | `INSERT INTO order_dv (data) VALUES (JSON(:doc)) RETURNING ... INTO :new_id` |
| Mở chi tiết đơn, tab "Dạng JSON", tab "Thông tin đơn hàng" | `GET /api/orders/{id}` | `SELECT JSON_SERIALIZE(d.data) FROM order_dv d WHERE d.data."_id" = :id` |
| "Lưu thay đổi" (sửa địa chỉ, dòng hàng), thanh toán "Qua tài liệu", "Thêm vận đơn" | `PUT /api/orders/{id}` + `If-Match` | `UPDATE order_dv d SET d.data = JSON(:doc) WHERE d.data."_id" = :id`; ETag cũ thì ORA-42699, HTTP 412 |
| Tab "Theo thời gian" | `GET /api/orders/{id}/asof` | `SELECT ... FROM order_dv AS OF SCN n` (Flashback Query) |
| Trang "C# và ORDS" | `/ords/ecom/order_dv/...` | ORDS AutoREST tự sinh REST trên cùng view |

### 6.3. `PRODUCT_DV` – sản phẩm (gốc `products`)

`{ _id, sku, productName, price, stockQty, status, attributes (JSON gốc), seller{sellerId, shopName}, category{categoryId, categoryName} }`

- `seller`, `category` chỉ đọc. `shopName`, `categoryName` NOCHECK, nên client chỉ gửi `sellerId`, `categoryId`.
- `stockQty` **có** tham gia ETag. Một đơn vừa trừ kho thì ETag sản phẩm đổi, người bán đang sửa trên bản cũ sẽ bị chặn (412), không ghi đè mất số tồn mới.

| Thao tác web | API | Câu lệnh |
|---|---|---|
| Trang Sản phẩm, thẻ sản phẩm, trang chủ | `GET /api/products?...` | Lọc trên bảng `products` bằng `JSON_VALUE` / `JSON_EXISTS`, rồi `CROSS APPLY (SELECT x.data FROM product_dv x WHERE x.data."_id" = ...)` |
| Trang chi tiết sản phẩm, hộp thoại JSON | `GET /api/products/{id}` | `SELECT ... FROM product_dv` |
| Đăng bán (biểu mẫu) | `POST /api/products` | `INSERT INTO product_dv` |
| Thêm nhiều sản phẩm | `POST /api/products/bulk` | Nhiều `INSERT INTO product_dv` trong **một giao dịch** |
| Lưu trong hộp thoại JSON | `PUT /api/products/{id}` + `If-Match` | `UPDATE product_dv` |
| Khu "Thuộc tính JSON có trong danh mục" | `GET /api/products/facets` | `JSON_DATAGUIDE(p.attributes)` trên bảng |

### 6.4. `CUSTOMER_DV` – khách hàng kèm sổ địa chỉ

`{ _id, fullName, email, phone, status, addresses: [ {addressId, receiverName, receiverPhone, addressLine, ward, district, city, isDefault} ] }`

- `customer_addresses` cho phép thêm / sửa / xoá.
- Một lần "Lưu thay đổi" có thể vừa sửa hồ sơ, vừa thêm một địa chỉ, vừa xoá một địa chỉ, tất cả trong **một câu UPDATE**.
- **Web:** trang "Khách hàng" (quản trị), "Hồ sơ của tôi" (khách hàng) → `GET` / `PUT /api/customers/{id}`; "+ Khách mới" → `POST /api/customers` (`INSERT INTO customer_dv`).

---

## 7. Gói `PKG_ORDER_RPT` – báo cáo trên bảng chuẩn hoá (`07_pkg_order_rpt.sql`)

Mỗi hàm trả về `SYS_REFCURSOR`. C# gọi `BEGIN :rc := pkg_order_rpt.fn_...(...); END;` (`Data/ReportRepository.cs`).

Báo cáo **không đi qua Duality View**, vì cần quét và gom nhiều dữ liệu. Doanh thu chỉ tính đơn **DELIVERED**.

| Hàm | Nội dung | Kỹ thuật SQL | Màn hình |
|---|---|---|---|
| `fn_r1_revenue_by_month(from, to)` | Doanh thu theo tháng, luỹ kế, tăng trưởng | `SUM() OVER (ORDER BY ...)`, `LAG` | Báo cáo → R1 (có biểu đồ) |
| `fn_r2_revenue_seller_category(from, to)` | Doanh thu người bán × danh mục, tổng phụ | `ROLLUP`, `GROUPING` | Báo cáo → R2 |
| `fn_r3_top_products(top)` | Top N bán chạy mỗi danh mục | `DENSE_RANK() OVER (PARTITION BY ...)` | Báo cáo → R3 |
| `fn_r4_status_matrix(months)` | Số đơn theo tháng × trạng thái | `PIVOT` | Báo cáo → R4 |
| `fn_r5_cancel_return_rate` | Tỉ lệ huỷ / trả theo người bán | `COUNT(DISTINCT CASE ...)` | Báo cáo → R5 |
| `fn_r6_revenue_by_brand` | Doanh thu theo thương hiệu | `JSON_VALUE(attributes,'$.brand' ...)`, đúng biểu thức chỉ mục IX-6 | Báo cáo → R6 |
| `fn_s1_seller_summary(seller)` | Tổng quan một shop: doanh thu, số đơn theo nhóm trạng thái, số sản phẩm | Truy vấn con vô hướng, `WITH` | Thống kê shop (người bán) |
| `fn_s2_seller_revenue_by_month(seller)` | Doanh thu shop theo tháng, luỹ kế | `SUM() OVER` | Thống kê shop |
| `fn_s3_seller_products(seller)` | Từng sản phẩm của shop: đã bán, doanh thu, hạng, cờ sắp hết hàng | `DENSE_RANK`, `SUM(CASE ...)` | Thống kê shop |

- Tham số ngày sai (từ ngày > đến ngày) sẽ ném `-20010` (thủ tục `check_range`).
- Nút "Lời gọi & mã PL/SQL" trên trang Báo cáo đọc mã nguồn hàm từ `USER_SOURCE`.

---

## 8. Chỉ mục

| Mã | Chỉ mục | Phục vụ | Màn hình |
|---|---|---|---|
| IX-1 | `orders (customer_id, order_date DESC)` | "Đơn của tôi", 20 đơn mới nhất | Danh sách đơn của khách |
| IX-2 | `orders (status, order_date)` | Lọc đơn theo trạng thái, ngày | Tab trạng thái ở danh sách đơn |
| IX-3 | `order_items (product_id)` | Tìm dòng hàng theo sản phẩm | Số đã bán ở trang chi tiết sản phẩm, R3 |
| IX-4 | `products (category_id, status)` | Lọc sản phẩm theo danh mục | Trang Sản phẩm |
| IX-5 | `order_id` trên `payments`, `shipments`, `order_status_history` | Dựng một tài liệu `ORDER_DV` | Mọi lần mở chi tiết đơn |
| IX-6 | `JSON_VALUE(attributes,'$.brand' RETURNING VARCHAR2(60))` | Lọc theo thương hiệu trong cột JSON | Bộ lọc "Thương hiệu" |

Số đo trước / sau (Buffers 3.021 → 20, 1.452 → 271, 5.388 → 28) ở `docs/TOI_UU.md` và Mục 4.4 của báo cáo.

**Lưu ý IX-6:** truy vấn phải dùng **đúng** biểu thức đã lập chỉ mục, kể cả `RETURNING VARCHAR2(60)`, thì Oracle mới dùng chỉ mục. Không dùng JSON Search Index vì chưa hỗ trợ trên cột của bảng nền Duality View.

---

## 9. Tra ngược: màn hình web → API → CSDL

| Màn hình | Thao tác | API | CSDL |
|---|---|---|---|
| Trang chủ | Số liệu đầu trang | `GET /api/system/stats` | `COUNT(*)` trên bảng |
| Sản phẩm | Lọc | `GET /api/products` | `JSON_VALUE`, `JSON_EXISTS`, `CONNECT BY`, rồi `PRODUCT_DV` |
| Chi tiết sản phẩm | Xem | `GET /api/products/{id}`, `/sales` | `PRODUCT_DV`; `SUM` trên `order_items JOIN orders` |
| Đăng bán | Đăng 1 / nhiều | `POST /api/products`, `/bulk` | `INSERT INTO product_dv`; JSON Schema |
| Tạo đơn | Đặt hàng | `POST /api/orders` | `INSERT INTO order_dv` → 5 trigger (Mục 5.3) |
| Danh sách đơn | Lọc, phân trang | `GET /api/orders` | Truy vấn bảng `orders` (IX-1, IX-2) |
| Chi tiết đơn | Tab JSON / bảng quan hệ | `GET /api/orders/{id}`, `/relational` | `ORDER_DV`; SELECT 5 bảng nền kèm ROWID |
| Chi tiết đơn | Nút trạng thái | `GET .../next-statuses`, `POST .../status` | `fn_is_valid_transition`; `sp_change_status` |
| Chi tiết đơn | Huỷ đơn | `POST .../cancel` | `sp_cancel_order` → hoàn kho, REFUNDED |
| Chi tiết đơn | Ghi thanh toán | `POST .../payments` hoặc `PUT` | `sp_record_payment` hoặc `payments[]` → `trg_pay_check` |
| Chi tiết đơn | Sửa đơn, thêm vận đơn | `PUT /api/orders/{id}` + `If-Match` | `UPDATE order_dv`; `trg_oi_biud_row`, `trg_oi_totals`; ETag |
| Chi tiết đơn | Theo thời gian | `GET .../asof` | `ORDER_DV AS OF SCN` |
| Khách hàng | Hồ sơ, sổ địa chỉ | `GET` / `PUT /api/customers/{id}` | `CUSTOMER_DV` |
| Báo cáo | R1–R6 | `GET /api/reports/{r1..r6}` | `PKG_ORDER_RPT` |
| Thống kê shop | S1–S3 | `GET /api/seller-stats` | `PKG_ORDER_RPT.fn_s1..s3` |
| Mua đồng thời | 20 khách cùng mua | `POST /api/demo/concurrency` | 20 × `INSERT INTO order_dv` song song → `sp_reserve_stock` |
| C# và ORDS | So sánh | `/api/ords/...` | ORDS AutoREST trên 3 Duality View |

---

## 10. Năm câu tóm tắt để tự kiểm tra

1. **Quy tắc ở đâu?** Ở bảng nền (trigger + package), nên ghi qua JSON hay SQL đều bị kiểm tra như nhau.
2. **Duality View giúp REST API thế nào?** API chỉ chạy một câu SELECT / INSERT / UPDATE trên view. Không phải tự ráp / tách JSON từ nhiều bảng. Ghi nhiều bảng trong một giao dịch. Có sẵn ETag chống ghi đè.
3. **Mutating table xử lý ra sao?** Bằng compound trigger: ghi nhớ ở AFTER EACH ROW, tính toán ở AFTER STATEMENT (`trg_oi_totals`, `trg_pay_check`).
4. **Hai khách mua sản phẩm cuối cùng?** Một câu UPDATE có điều kiện `stock_qty >= :qty`, ở READ COMMITTED: phiên sau chờ khoá rồi đánh giá lại, nên không bán vượt.
5. **Vì sao không đổi trạng thái bằng cách ghi tài liệu?** Vì trigger ghi lịch sử chèn vào `history[]` của chính tài liệu, gây ORA-40896. Nên `status` là NOUPDATE và đổi trạng thái qua `sp_change_status`.
