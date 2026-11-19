-- Q1b: câu SQL CŨ của màn hình M3 (lọc theo khách), đúng như ứng dụng chạy (bind :off, :n).
-- Join + 3 truy vấn con viết ở tầng ngoài -> Oracle "tháo" truy vấn con thành hash join, tính cho
-- CẢ 2.006 đơn của khách (quét toàn bộ payments, shipments) rồi mới cắt 20 dòng.
SELECT o.order_id, o.order_no, o.order_date, o.customer_id, c.full_name, o.status,
       (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.order_id) AS item_count,
       o.total_amount,
       (SELECT NVL(SUM(p.amount), 0) FROM payments p
         WHERE p.order_id = o.order_id AND p.status = 'PAID') AS paid_amount,
       (SELECT MAX(s.carrier) KEEP (DENSE_RANK LAST ORDER BY s.shipment_id)
          FROM shipments s WHERE s.order_id = o.order_id) AS carrier
  FROM orders o
  JOIN customers c ON c.customer_id = o.customer_id
 WHERE o.customer_id = :cust
 ORDER BY o.order_date DESC
 OFFSET :off ROWS FETCH NEXT :n ROWS ONLY;
