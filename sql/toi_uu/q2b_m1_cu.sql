-- Q2b: câu SQL CŨ của màn hình M1. Điều kiện "_id".number() IN (...) KHÔNG được đẩy xuống bảng nền
-- -> Oracle dựng tài liệu PRODUCT_DV cho CẢ 50.036 sản phẩm rồi mới so _id.
SELECT JSON_SERIALIZE(d.data RETURNING CLOB)
  FROM product_dv d
 WHERE d.data."_id".number() IN (SELECT p.product_id FROM products p
                                  WHERE JSON_VALUE(p.attributes, '$.brand' RETURNING VARCHAR2(60)) = :brand)
 ORDER BY d.data."_id".number();
