-- Q2: lọc sản phẩm theo thương hiệu trong cột JSON (đúng biểu thức của IX-6)
SELECT p.product_id, p.product_name, p.price
  FROM products p
 WHERE JSON_VALUE(p.attributes, '$.brand' RETURNING VARCHAR2(60)) = :brand;
