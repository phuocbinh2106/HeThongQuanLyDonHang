-- Q1 "Đơn của tôi": 20 đơn mới nhất của một khách (chỉ bảng orders)
SELECT o.order_id, o.order_no, o.order_date, o.status, o.total_amount
  FROM orders o
 WHERE o.customer_id = :cust
 ORDER BY o.order_date DESC
 FETCH FIRST 20 ROWS ONLY;
