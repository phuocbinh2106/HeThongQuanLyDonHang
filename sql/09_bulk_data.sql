-- ==============================================================================
-- 09_BULK_DATA: dữ liệu LỚN để đo tối ưu (Chương 4). Chạy SAU 08_seed.sql, bằng ecom_schema.
--   + 20.000 khách, 50.000 sản phẩm (200 thương hiệu), 200.000 đơn, 400.000 dòng hàng,
--     thanh toán, vận đơn, ~390.000 dòng lịch sử.
--   + Khách #1 (khách demo) được gán thêm 2.000 đơn để đo Q1 "20 đơn mới nhất của tôi".
-- Mọi dòng dữ liệu lớn được đánh dấu: orders.note = 'BULK', products.sku LIKE 'BULK-%',
-- customers.email LIKE 'bulk%' -> phân biệt với dữ liệu demo.
-- Xoá dữ liệu lớn, quay về dữ liệu demo: chạy t00_reset.sql.
--
-- VÌ SAO TẮT TRIGGER KHI NẠP?
--   Trigger của order_items gọi sp_reserve_stock + tính lại tổng cho TỪNG dòng -> 400.000 lần
--   UPDATE products / orders: rất chậm. Dữ liệu lớn chỉ dùng để đo truy vấn ĐỌC, nên ta nạp
--   thẳng bằng INSERT ... SELECT (một câu cho cả bảng), rồi TỰ TÍNH LẠI tiền bằng một câu MERGE,
--   cuối cùng BẬT LẠI trigger. Đơn giá lấy đúng giá sản phẩm; tồn kho sản phẩm lớn đặt sẵn đủ.
-- Dữ liệu sinh theo công thức MOD (không ngẫu nhiên) -> chạy lại ra cùng kết quả.
-- ==============================================================================
SET SERVEROUTPUT ON
SET TIMING ON

PROMPT === 1. Tắt trigger của các bảng sẽ nạp
ALTER TABLE orders      DISABLE ALL TRIGGERS;
ALTER TABLE order_items DISABLE ALL TRIGGERS;
ALTER TABLE payments    DISABLE ALL TRIGGERS;

PROMPT === 2. 20.000 khách hàng
INSERT INTO customers (full_name, email, phone)
SELECT 'Khách bulk ' || n, 'bulk' || n || '@mail.vn', '09' || LPAD(n, 8, '0')
  FROM (SELECT LEVEL AS n FROM dual CONNECT BY LEVEL <= 20000);

PROMPT === 3. 50.000 sản phẩm, 200 thương hiệu (mỗi thương hiệu ~250 sản phẩm = 0,5%)
INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
SELECT MOD(n, 5) + 1,
       MOD(n, 7) + 1,
       'BULK-' || LPAD(n, 6, '0'),
       'Sản phẩm bulk ' || n,
       10000 * (MOD(n * 37, 500) + 1),
       100000,
       JSON_OBJECT(
         'brand'     VALUE CASE MOD(n, 200) WHEN 0 THEN 'Apple'  WHEN 1 THEN 'Samsung'
                                            WHEN 2 THEN 'Xiaomi' WHEN 3 THEN 'Coolmate'
                                            ELSE 'Brand' || LPAD(MOD(n, 200), 3, '0') END,
         'ramGb'     VALUE 4 * (MOD(n, 4) + 1),
         'storageGb' VALUE 64 * POWER(2, MOD(n, 4)),
         'color'     VALUE CASE MOD(n, 3) WHEN 0 THEN 'Black' WHEN 1 THEN 'White' ELSE 'Blue' END
         RETURNING JSON)
  FROM (SELECT LEVEL AS n FROM dual CONNECT BY LEVEL <= 50000);

PROMPT === 4. 200.000 đơn hàng (2.000 đơn của khách #1, còn lại chia đều 20.000 khách bulk)
INSERT INTO orders (order_no, customer_id, status, order_date, ship_receiver, ship_phone,
                    ship_address, subtotal, shipping_fee, discount_amount, total_amount, note)
WITH b AS (SELECT n,
                  CAST(TIMESTAMP '2025-01-01 00:00:00' AS TIMESTAMP)
                    + NUMTODSINTERVAL(MOD(n * 7919, 690 * 24 * 60), 'MINUTE') AS d
             FROM (SELECT LEVEL AS n FROM dual CONNECT BY LEVEL <= 200000)),
     c AS (SELECT customer_id, ROW_NUMBER() OVER (ORDER BY customer_id) AS rn
             FROM customers WHERE email LIKE 'bulk%')
SELECT 'ORD-' || TO_CHAR(b.d, 'YYYYMMDD') || '-B' || LPAD(b.n, 6, '0'),
       CASE WHEN MOD(b.n, 100) = 0 THEN 1 ELSE c.customer_id END,
       CASE MOD(b.n, 20) WHEN 0 THEN 'CANCELLED' WHEN 1 THEN 'RETURNED' WHEN 2 THEN 'PENDING'
                         WHEN 3 THEN 'CONFIRMED' WHEN 4 THEN 'SHIPPING' ELSE 'DELIVERED' END,
       b.d, 'Khách bulk', '0900000000', 'Địa chỉ bulk', 0, 30000, 0, 0, 'BULK'
  FROM b JOIN c ON c.rn = MOD(b.n * 13, 20000) + 1;

PROMPT === 5. 400.000 dòng hàng (2 dòng / đơn, 2 sản phẩm khác nhau, đơn giá = giá sản phẩm)
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
WITH o AS (SELECT order_id, TO_NUMBER(SUBSTR(order_no, 15)) AS n FROM orders WHERE note = 'BULK'),
     p AS (SELECT product_id, price, ROW_NUMBER() OVER (ORDER BY product_id) AS rn
             FROM products WHERE sku LIKE 'BULK-%'),
     k AS (SELECT LEVEL AS k FROM dual CONNECT BY LEVEL <= 2)
SELECT o.order_id, p.product_id, MOD(o.n + k.k, 3) + 1, p.price
  FROM o CROSS JOIN k
  JOIN p ON p.rn = MOD(o.n * 31 + k.k * 7919, 50000) + 1;

PROMPT === 6. Tính lại tiền hàng / tổng tiền (thay cho trigger đã tắt)
MERGE INTO orders o
USING (SELECT i.order_id, SUM(i.quantity * i.unit_price) AS s
         FROM order_items i JOIN orders x ON x.order_id = i.order_id AND x.note = 'BULK'
        GROUP BY i.order_id) t
   ON (o.order_id = t.order_id)
 WHEN MATCHED THEN UPDATE SET o.subtotal = t.s,
                              o.total_amount = t.s + o.shipping_fee - o.discount_amount;

PROMPT === 7. Thanh toán (đơn đã xác nhận trở đi; trả hàng -> REFUNDED)
INSERT INTO payments (order_id, method, amount, status, paid_at, transaction_ref)
SELECT order_id,
       CASE MOD(order_id, 4) WHEN 0 THEN 'COD' WHEN 1 THEN 'BANK_TRANSFER'
                             WHEN 2 THEN 'E_WALLET' ELSE 'CARD' END,
       total_amount,
       CASE status WHEN 'RETURNED' THEN 'REFUNDED' ELSE 'PAID' END,
       order_date + INTERVAL '2' HOUR, 'BULK' || order_id
  FROM orders
 WHERE note = 'BULK' AND status IN ('CONFIRMED', 'SHIPPING', 'DELIVERED', 'RETURNED');

PROMPT === 8. Vận đơn (đơn đang giao / đã giao / trả hàng)
INSERT INTO shipments (order_id, carrier, tracking_no, status, shipped_at, delivered_at)
SELECT order_id,
       CASE MOD(order_id, 4) WHEN 0 THEN 'GHN' WHEN 1 THEN 'GHTK'
                             WHEN 2 THEN 'Viettel Post' ELSE 'Ninja Van' END,
       'BULK' || LPAD(order_id, 9, '0'),
       CASE status WHEN 'SHIPPING' THEN 'IN_TRANSIT' ELSE status END,
       order_date + INTERVAL '1' DAY,
       CASE WHEN status <> 'SHIPPING' THEN order_date + INTERVAL '3' DAY END
  FROM orders
 WHERE note = 'BULK' AND status IN ('SHIPPING', 'DELIVERED', 'RETURNED');

PROMPT === 9. Lịch sử trạng thái: tạo đơn (NULL -> PENDING) + lần đổi sang trạng thái cuối
INSERT INTO order_status_history (order_id, old_status, new_status, changed_at, changed_by, note)
SELECT order_id, NULL, 'PENDING', order_date, 'bulk', 'Tạo đơn'
  FROM orders WHERE note = 'BULK';
INSERT INTO order_status_history (order_id, old_status, new_status, changed_at, changed_by, note)
SELECT order_id, 'PENDING', status, order_date + INTERVAL '1' DAY, 'bulk', NULL
  FROM orders WHERE note = 'BULK' AND status <> 'PENDING';
COMMIT;

PROMPT === 10. Bật lại trigger
ALTER TABLE orders      ENABLE ALL TRIGGERS;
ALTER TABLE order_items ENABLE ALL TRIGGERS;
ALTER TABLE payments    ENABLE ALL TRIGGERS;

PROMPT === 11. Thu thập thống kê để optimizer ước lượng đúng
BEGIN
  DBMS_STATS.GATHER_SCHEMA_STATS(ownname => USER, cascade => TRUE);
END;
/
-- ALTER TABLE ... TRIGGERS làm Duality View / package phụ thuộc bị đánh dấu INVALID -> biên dịch lại
BEGIN
  DBMS_UTILITY.COMPILE_SCHEMA(schema => USER, compile_all => FALSE);
END;
/

PROMPT === Số dòng sau khi nạp
SELECT 'customers' AS bang, COUNT(*) AS so_dong FROM customers
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'shipments', COUNT(*) FROM shipments
UNION ALL SELECT 'order_status_history', COUNT(*) FROM order_status_history;
SELECT object_name, object_type FROM user_objects WHERE status <> 'VALID';
SET TIMING OFF
