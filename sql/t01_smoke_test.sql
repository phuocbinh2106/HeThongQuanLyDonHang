-- ==============================================================================
-- T01_SMOKE_TEST: kiểm tra nhanh TC-01, TC-03, TC-05 ngay trên CSDL.
-- Chạy SAU 08_seed.sql (dùng khách 1, sản phẩm 1, 2, 3 - xem quy ước trong 08_seed.sql).
-- Mỗi khối tự so sánh kết quả thật với kết quả mong đợi và in PASS / FAIL.
-- DBeaver: bật Output (DBMS_OUTPUT) để xem kết quả; chạy cả file bằng Alt+X.
-- ==============================================================================
SET SERVEROUTPUT ON
SET DEFINE OFF

-- TC-01: tạo đơn hợp lệ 2 dòng QUA DUALITY VIEW bằng MỘT tài liệu JSON.
-- Mong đợi: unit_price lấy từ bảng products, subtotal/total do trigger tính,
--           lịch sử có NULL -> PENDING, tồn kho sản phẩm 1 giảm 1, sản phẩm 3 giảm 2.
DECLARE
  l_stock1_before NUMBER; l_stock3_before NUMBER;
  l_stock1_after  NUMBER; l_stock3_after  NUMBER;
  l_price1 NUMBER; l_price3 NUMBER;
  l_id     NUMBER;
  l_ord    orders%ROWTYPE;
  l_hist   NUMBER;
BEGIN
  SELECT stock_qty, price INTO l_stock1_before, l_price1 FROM products WHERE product_id = 1;
  SELECT stock_qty, price INTO l_stock3_before, l_price3 FROM products WHERE product_id = 3;

  INSERT INTO order_dv VALUES ('{
    "customer"    : {"customerId": 1},
    "shipReceiver": "TC-01 Nguyễn Văn An", "shipPhone": "0900000001",
    "shipAddress" : "12 Nguyễn Huệ, Quận 1, TP.HCM",
    "shippingFee" : 25000, "discount": 0,
    "items": [ {"productId": 1, "quantity": 1}, {"productId": 3, "quantity": 2} ]}')
  RETURNING JSON_VALUE(data, '$._id' RETURNING NUMBER) INTO l_id;
  COMMIT;

  SELECT * INTO l_ord FROM orders WHERE order_id = l_id;
  SELECT COUNT(*) INTO l_hist FROM order_status_history
   WHERE order_id = l_id AND old_status IS NULL AND new_status = 'PENDING';
  SELECT stock_qty INTO l_stock1_after FROM products WHERE product_id = 1;
  SELECT stock_qty INTO l_stock3_after FROM products WHERE product_id = 3;

  DBMS_OUTPUT.PUT_LINE('TC-01 order_id=' || l_id || ' order_no=' || l_ord.order_no
    || ' status=' || l_ord.status || ' subtotal=' || l_ord.subtotal || ' total=' || l_ord.total_amount);
  IF l_ord.status = 'PENDING'
     AND l_ord.subtotal     = l_price1 * 1 + l_price3 * 2
     AND l_ord.total_amount = l_price1 * 1 + l_price3 * 2 + 25000
     AND l_ord.order_no LIKE 'ORD-' || TO_CHAR(SYSDATE, 'YYYYMMDD') || '-______'
     AND l_hist = 1
     AND l_stock1_after = l_stock1_before - 1
     AND l_stock3_after = l_stock3_before - 2 THEN
    DBMS_OUTPUT.PUT_LINE('TC-01 PASS');
  ELSE
    DBMS_OUTPUT.PUT_LINE('TC-01 FAIL');
  END IF;
END;
/

-- TC-03: dòng thứ 2 vượt tồn kho -> ORA-20001 và rollback CẢ ĐƠN
-- (không có đơn mới, tồn kho sản phẩm 1 KHÔNG bị trừ dù dòng 1 hợp lệ).
DECLARE
  l_orders_before NUMBER; l_orders_after NUMBER;
  l_stock1_before NUMBER; l_stock1_after NUMBER;
BEGIN
  SELECT COUNT(*)  INTO l_orders_before FROM orders;
  SELECT stock_qty INTO l_stock1_before FROM products WHERE product_id = 1;
  BEGIN
    INSERT INTO order_dv VALUES ('{
      "customer": {"customerId": 1},
      "shipReceiver": "TC-03", "shipPhone": "0900000001", "shipAddress": "Địa chỉ thử",
      "items": [ {"productId": 1, "quantity": 2}, {"productId": 2, "quantity": 999} ]}');
    DBMS_OUTPUT.PUT_LINE('TC-03 FAIL: không có lỗi');
  EXCEPTION WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('TC-03 lỗi nhận được: ' || SQLERRM);
  END;
  SELECT COUNT(*)  INTO l_orders_after FROM orders;
  SELECT stock_qty INTO l_stock1_after FROM products WHERE product_id = 1;
  IF l_orders_after = l_orders_before AND l_stock1_after = l_stock1_before THEN
    DBMS_OUTPUT.PUT_LINE('TC-03 PASS (không tạo đơn, tồn kho giữ nguyên ' || l_stock1_after || ')');
  ELSE
    DBMS_OUTPUT.PUT_LINE('TC-03 FAIL');
  END IF;
END;
/

-- TC-05: đổi trạng thái SAI (PENDING -> SHIPPING) phải lỗi ORA-20002,
--        rồi đổi ĐÚNG (PENDING -> CONFIRMED) thành công và có thêm dòng lịch sử.
DECLARE
  l_id   NUMBER;
  l_err  NUMBER := 0;
  l_st   orders.status%TYPE;
  l_hist NUMBER;
BEGIN
  SELECT MAX(order_id) INTO l_id FROM orders WHERE ship_receiver LIKE 'TC-01%';
  BEGIN
    pkg_order.sp_change_status(l_id, 'SHIPPING', 'tester');
  EXCEPTION WHEN pkg_order.e_invalid_transition THEN
    l_err := SQLCODE;
    DBMS_OUTPUT.PUT_LINE('TC-05 lỗi nhận được: ' || SQLERRM);
  END;
  pkg_order.sp_change_status(l_id, 'CONFIRMED', 'tester', 'Xác nhận đơn thử');
  COMMIT;
  SELECT status INTO l_st FROM orders WHERE order_id = l_id;
  SELECT COUNT(*) INTO l_hist FROM order_status_history
   WHERE order_id = l_id AND old_status = 'PENDING' AND new_status = 'CONFIRMED';
  IF l_err = -20002 AND l_st = 'CONFIRMED' AND l_hist = 1 THEN
    DBMS_OUTPUT.PUT_LINE('TC-05 PASS');
  ELSE
    DBMS_OUTPUT.PUT_LINE('TC-05 FAIL err=' || l_err || ' status=' || l_st);
  END IF;
END;
/

-- Xem tài liệu JSON của đơn TC-01 (đọc qua Duality View)
SELECT JSON_SERIALIZE(d.data PRETTY) AS order_doc
  FROM order_dv d
 WHERE d.data."_id" = (SELECT MAX(order_id) FROM orders WHERE ship_receiver LIKE 'TC-01%');
