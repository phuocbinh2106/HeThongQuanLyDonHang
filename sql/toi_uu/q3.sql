-- Q3: đọc MỘT tài liệu ORDER_DV (đúng câu SQL của API GET /api/orders/{id})
SELECT JSON_SERIALIZE(d.data RETURNING CLOB)
  FROM order_dv d
 WHERE d.data."_id" = :oid;
