-- ==============================================================================
-- 07_PKG_ORDER_RPT: package BÁO CÁO, chạy trên BẢNG QUAN HỆ CHUẨN HOÁ (không qua Duality View).
-- Mỗi hàm trả về SYS_REFCURSOR để tầng API (C#) đọc ra thành bảng.
--
-- Quy ước: "doanh thu" chỉ tính đơn ở trạng thái DELIVERED (đã giao thành công).
--   * R1 dùng orders.total_amount  (tiền khách thực trả cho cả đơn, gồm phí ship, trừ giảm giá).
--   * R2, R3, R6 dùng SUM(quantity * unit_price) (tiền hàng theo từng dòng, vì một đơn có thể
--     chứa hàng của nhiều người bán / nhiều danh mục).
-- p_from / p_to: lọc theo ngày đặt; NULL = không giới hạn.
-- ==============================================================================
CREATE OR REPLACE PACKAGE pkg_order_rpt AS
  -- Tham số báo cáo sai (ví dụ top N <= 0, khoảng ngày ngược)
  e_bad_param EXCEPTION; PRAGMA EXCEPTION_INIT(e_bad_param, -20010);

  -- R1: doanh thu theo tháng + luỹ kế + % tăng trưởng so với tháng trước (SUM() OVER, LAG)
  FUNCTION fn_r1_revenue_by_month(p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL)
    RETURN SYS_REFCURSOR;
  -- R2: doanh thu theo người bán x danh mục, có tổng phụ từng người bán và tổng cộng (ROLLUP)
  FUNCTION fn_r2_revenue_seller_category(p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL)
    RETURN SYS_REFCURSOR;
  -- R3: top N sản phẩm bán chạy trong MỖI danh mục (DENSE_RANK ... PARTITION BY)
  FUNCTION fn_r3_top_products(p_top NUMBER DEFAULT 3) RETURN SYS_REFCURSOR;
  -- R4: ma trận số đơn theo tháng x trạng thái (PIVOT), p_months tháng gần nhất
  FUNCTION fn_r4_status_matrix(p_months NUMBER DEFAULT 12) RETURN SYS_REFCURSOR;
  -- R5: tỉ lệ huỷ / trả hàng theo người bán
  FUNCTION fn_r5_cancel_return_rate RETURN SYS_REFCURSOR;
  -- R6 (bổ sung): doanh thu theo thương hiệu, đọc từ cột JSON products.attributes
  FUNCTION fn_r6_revenue_by_brand RETURN SYS_REFCURSOR;
END pkg_order_rpt;
/

CREATE OR REPLACE PACKAGE BODY pkg_order_rpt AS

  -- Thủ tục nội bộ: kiểm tra khoảng ngày hợp lệ
  PROCEDURE check_range(p_from DATE, p_to DATE) IS
  BEGIN
    IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
      RAISE_APPLICATION_ERROR(-20010, 'Khoảng ngày không hợp lệ: từ ngày lớn hơn đến ngày');
    END IF;
  END check_range;

  -- R1 -------------------------------------------------------------------------
  FUNCTION fn_r1_revenue_by_month(p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL)
    RETURN SYS_REFCURSOR IS
    rc SYS_REFCURSOR;
  BEGIN
    check_range(p_from, p_to);
    OPEN rc FOR
      SELECT TO_CHAR(m.thang, 'YYYY-MM')                          AS thang,
             m.so_don,
             m.doanh_thu,
             SUM(m.doanh_thu) OVER (ORDER BY m.thang)             AS luy_ke,
             LAG(m.doanh_thu) OVER (ORDER BY m.thang)             AS thang_truoc,
             ROUND( (m.doanh_thu - LAG(m.doanh_thu) OVER (ORDER BY m.thang)) * 100
                    / NULLIF(LAG(m.doanh_thu) OVER (ORDER BY m.thang), 0), 2) AS tang_truong_pct
        FROM (SELECT TRUNC(o.order_date, 'MM') AS thang,
                     COUNT(*)                  AS so_don,
                     SUM(o.total_amount)       AS doanh_thu
                FROM orders o
               WHERE o.status = 'DELIVERED'
                 AND (p_from IS NULL OR o.order_date >= p_from)
                 AND (p_to   IS NULL OR o.order_date <  p_to + 1)   -- +1: lấy trọn ngày p_to
               GROUP BY TRUNC(o.order_date, 'MM')) m
       ORDER BY m.thang;
    RETURN rc;
  END fn_r1_revenue_by_month;

  -- R2 -------------------------------------------------------------------------
  -- ROLLUP(shop, category) sinh 3 mức: (shop, category), (shop) = tổng phụ, () = tổng cộng.
  -- GROUPING(cột) = 1 khi dòng đó là dòng tổng của cột ấy.
  FUNCTION fn_r2_revenue_seller_category(p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL)
    RETURN SYS_REFCURSOR IS
    rc SYS_REFCURSOR;
  BEGIN
    check_range(p_from, p_to);
    OPEN rc FOR
      SELECT CASE WHEN GROUPING(s.shop_name) = 1 THEN 'TỔNG CỘNG' ELSE s.shop_name END AS nguoi_ban,
             CASE WHEN GROUPING(s.shop_name) = 1 THEN NULL
                  WHEN GROUPING(c.category_name) = 1 THEN 'Tổng phụ'
                  ELSE c.category_name END                                         AS danh_muc,
             SUM(oi.quantity)                                                       AS so_luong,
             SUM(oi.quantity * oi.unit_price)                                       AS doanh_thu,
             GROUPING_ID(s.shop_name, c.category_name)                              AS muc_tong
        FROM orders o
        JOIN order_items oi ON oi.order_id   = o.order_id
        JOIN products    p  ON p.product_id  = oi.product_id
        JOIN sellers     s  ON s.seller_id   = p.seller_id
        JOIN categories  c  ON c.category_id = p.category_id
       WHERE o.status = 'DELIVERED'
         AND (p_from IS NULL OR o.order_date >= p_from)
         AND (p_to   IS NULL OR o.order_date <  p_to + 1)
       GROUP BY ROLLUP (s.shop_name, c.category_name)
       ORDER BY GROUPING(s.shop_name), s.shop_name, GROUPING(c.category_name), c.category_name;
    RETURN rc;
  END fn_r2_revenue_seller_category;

  -- R3 -------------------------------------------------------------------------
  -- DENSE_RANK: hai sản phẩm bán bằng nhau cùng hạng, hạng kế tiếp không bị nhảy số.
  FUNCTION fn_r3_top_products(p_top NUMBER DEFAULT 3) RETURN SYS_REFCURSOR IS
    rc SYS_REFCURSOR;
  BEGIN
    IF p_top IS NULL OR p_top <= 0 THEN
      RAISE_APPLICATION_ERROR(-20010, 'Top N phải lớn hơn 0');
    END IF;
    OPEN rc FOR
      SELECT danh_muc, hang, sku, san_pham, so_luong_ban, doanh_thu
        FROM (SELECT c.category_name                    AS danh_muc,
                     p.sku,
                     p.product_name                     AS san_pham,
                     SUM(oi.quantity)                   AS so_luong_ban,
                     SUM(oi.quantity * oi.unit_price)   AS doanh_thu,
                     DENSE_RANK() OVER (PARTITION BY c.category_id
                                        ORDER BY SUM(oi.quantity) DESC) AS hang
                FROM orders o
                JOIN order_items oi ON oi.order_id   = o.order_id
                JOIN products    p  ON p.product_id  = oi.product_id
                JOIN categories  c  ON c.category_id = p.category_id
               WHERE o.status = 'DELIVERED'
               GROUP BY c.category_id, c.category_name, p.product_id, p.sku, p.product_name)
       WHERE hang <= p_top
       ORDER BY danh_muc, hang, san_pham;
    RETURN rc;
  END fn_r3_top_products;

  -- R4 -------------------------------------------------------------------------
  -- PIVOT xoay giá trị cột status thành 7 cột, mỗi ô = số đơn của tháng đó ở trạng thái đó.
  FUNCTION fn_r4_status_matrix(p_months NUMBER DEFAULT 12) RETURN SYS_REFCURSOR IS
    rc SYS_REFCURSOR;
  BEGIN
    IF p_months IS NULL OR p_months <= 0 THEN
      RAISE_APPLICATION_ERROR(-20010, 'Số tháng phải lớn hơn 0');
    END IF;
    OPEN rc FOR
      SELECT *
        FROM (SELECT TO_CHAR(o.order_date, 'YYYY-MM') AS thang, o.status
                FROM orders o
               WHERE o.order_date >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1 - p_months))
       PIVOT (COUNT(*) FOR status IN ('PENDING'   AS pending,
                                      'CONFIRMED' AS confirmed,
                                      'PACKING'   AS packing,
                                      'SHIPPING'  AS shipping,
                                      'DELIVERED' AS delivered,
                                      'CANCELLED' AS cancelled,
                                      'RETURNED'  AS returned))
       ORDER BY thang;
    RETURN rc;
  END fn_r4_status_matrix;

  -- R5 -------------------------------------------------------------------------
  -- Một đơn có thể chứa hàng của nhiều người bán -> đếm COUNT(DISTINCT order_id) theo người bán.
  FUNCTION fn_r5_cancel_return_rate RETURN SYS_REFCURSOR IS
    rc SYS_REFCURSOR;
  BEGIN
    OPEN rc FOR
      SELECT s.shop_name                                                         AS nguoi_ban,
             COUNT(DISTINCT o.order_id)                                          AS tong_don,
             COUNT(DISTINCT CASE WHEN o.status = 'CANCELLED' THEN o.order_id END) AS so_huy,
             COUNT(DISTINCT CASE WHEN o.status = 'RETURNED'  THEN o.order_id END) AS so_tra,
             ROUND(100 * COUNT(DISTINCT CASE WHEN o.status IN ('CANCELLED','RETURNED')
                                             THEN o.order_id END)
                       / NULLIF(COUNT(DISTINCT o.order_id), 0), 2)               AS ty_le_pct
        FROM sellers s
        LEFT JOIN products    p  ON p.seller_id  = s.seller_id
        LEFT JOIN order_items oi ON oi.product_id = p.product_id
        LEFT JOIN orders      o  ON o.order_id    = oi.order_id
       GROUP BY s.seller_id, s.shop_name
       ORDER BY ty_le_pct DESC NULLS LAST, nguoi_ban;
    RETURN rc;
  END fn_r5_cancel_return_rate;

  -- R6 -------------------------------------------------------------------------
  -- Kết hợp bảng quan hệ với SQL/JSON: JSON_VALUE đọc trường brand trong cột attributes.
  -- Biểu thức viết GIỐNG HỆT chỉ mục hàm IX-6 để optimizer dùng được chỉ mục.
  FUNCTION fn_r6_revenue_by_brand RETURN SYS_REFCURSOR IS
    rc SYS_REFCURSOR;
  BEGIN
    OPEN rc FOR
      SELECT JSON_VALUE(p.attributes, '$.brand' RETURNING VARCHAR2(60)) AS thuong_hieu,
             COUNT(DISTINCT o.order_id)                                 AS so_don,
             SUM(oi.quantity)                                           AS so_luong,
             SUM(oi.quantity * oi.unit_price)                           AS doanh_thu
        FROM orders o
        JOIN order_items oi ON oi.order_id  = o.order_id
        JOIN products    p  ON p.product_id = oi.product_id
       WHERE o.status = 'DELIVERED'
       GROUP BY JSON_VALUE(p.attributes, '$.brand' RETURNING VARCHAR2(60))
       ORDER BY doanh_thu DESC;
    RETURN rc;
  END fn_r6_revenue_by_brand;

END pkg_order_rpt;
/
