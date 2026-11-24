-- ==============================================================================
-- 03B_INDEXES_TOI_UU: các chỉ mục được thêm SAU khi đo tối ưu (Chương 4).
-- Kết quả đo trước / sau: docs/TOI_UU.md (đo bằng sql/10_toi_uu_Q1_Q3.sql).
-- ==============================================================================

-- IX-1 (Q1 "đơn của tôi"): lọc theo khách rồi sắp ngày giảm dần -> chỉ mục ghép đúng thứ tự đó.
-- Oracle đọc khoá theo đúng thứ tự cần trả về, lấy 20 khoá đầu rồi DỪNG (COUNT STOPKEY),
-- không phải đọc hết đơn của khách, không cần bước SORT.
CREATE INDEX ix_orders_cust_date ON orders (customer_id, order_date DESC);

-- IX-5 (Q3 đọc một tài liệu ORDER_DV): khoá ngoại order_id ở 3 bảng con của ORDER_DV.
-- Mỗi lần dựng tài liệu, Oracle tìm thanh toán / vận đơn / lịch sử theo order_id, không có chỉ mục
-- thì mỗi bảng con bị quét toàn bộ. (order_items đã có UNIQUE(order_id, product_id) dùng được.)
CREATE INDEX ix_payments_order  ON payments (order_id);
CREATE INDEX ix_shipments_order ON shipments (order_id);
CREATE INDEX ix_history_order   ON order_status_history (order_id);

-- IX-6 (Q2 lọc theo thương hiệu trong cột JSON): chỉ mục HÀM trên biểu thức JSON_VALUE.
-- Truy vấn phải dùng ĐÚNG biểu thức này (kể cả RETURNING VARCHAR2(60)) thì optimizer mới dùng.
-- Không dùng JSON Search Index: chưa hỗ trợ trên cột của bảng nền Duality View.
CREATE INDEX ix_products_brand ON products (JSON_VALUE(attributes, '$.brand' RETURNING VARCHAR2(60)));
