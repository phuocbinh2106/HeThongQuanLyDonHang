-- Q2c: câu SQL MỚI của màn hình M1 (bind :max_rows = 200): lọc trên bảng nền (dùng IX-6),
-- rồi với TỪNG product_id lấy tài liệu bằng điều kiện bằng "_id" = ... (được đẩy xuống khoá chính).
SELECT JSON_SERIALIZE(d.data RETURNING CLOB)
  FROM (SELECT p.product_id FROM products p
         WHERE JSON_VALUE(p.attributes, '$.brand' RETURNING VARCHAR2(60)) = :brand
         ORDER BY p.product_id
         FETCH FIRST :max_rows ROWS ONLY) f
 CROSS APPLY (SELECT x.data FROM product_dv x WHERE x.data."_id" = f.product_id) d
 ORDER BY f.product_id;
