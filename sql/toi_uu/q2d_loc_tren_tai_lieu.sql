-- Q2d: lọc THẲNG trên tài liệu Duality View. Oracle dịch đường dẫn $.attributes.brand về cột
-- products.attributes và đẩy điều kiện xuống bảng nền; vì biểu thức GIỐNG HỆT IX-6 nên dùng được chỉ mục.
SELECT JSON_SERIALIZE(d.data RETURNING CLOB)
  FROM product_dv d
 WHERE JSON_VALUE(d.data, '$.attributes.brand' RETURNING VARCHAR2(60)) = :brand;
