-- ==============================================================================
-- 03_INDEXES: chỉ mục IX-2, IX-3, IX-4
-- (IX-1, IX-5, IX-6 cố ý tạo ở bước tối ưu hoá - Chương 4 - để có số liệu trước/sau)
-- ==============================================================================
CREATE INDEX ix_orders_status_date ON orders (status, order_date);
CREATE INDEX ix_order_items_product ON order_items (product_id);
CREATE INDEX ix_products_cat_status ON products (category_id, status);
