-- Q1c: câu SQL MỚI của màn hình M3, đúng như ứng dụng chạy (bind :off, :n):
--   (1) cắt 1 trang đơn TRƯỚC trong inline view -> dùng IX-1, dừng sớm;
--   (2) NO_UNNEST: giữ 3 truy vấn con chạy theo từng dòng (20 lần, qua IX-5) thay vì bị "tháo" thành
--       hash join quét toàn bảng (optimizer không biết :n = 20 nên ước lượng inline view ra 2.116 dòng).
SELECT o.order_id, o.order_no, o.order_date, o.customer_id, c.full_name, o.status,
       (SELECT /*+ NO_UNNEST */ COUNT(*) FROM order_items i
         WHERE i.order_id = o.order_id) AS item_count,
       o.total_amount,
       (SELECT /*+ NO_UNNEST */ NVL(SUM(p.amount), 0) FROM payments p
         WHERE p.order_id = o.order_id AND p.status = 'PAID') AS paid_amount,
       (SELECT /*+ NO_UNNEST */ MAX(s.carrier) KEEP (DENSE_RANK LAST ORDER BY s.shipment_id)
          FROM shipments s WHERE s.order_id = o.order_id) AS carrier
  FROM (SELECT o.* FROM orders o
         WHERE o.customer_id = :cust
         ORDER BY o.order_date DESC
         OFFSET :off ROWS FETCH NEXT :n ROWS ONLY) o
  JOIN customers c ON c.customer_id = o.customer_id
 ORDER BY o.order_date DESC;
