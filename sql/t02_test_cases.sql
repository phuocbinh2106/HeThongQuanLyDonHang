-- ==============================================================================
-- T02_TEST_CASES: các kịch bản kiểm thử nghiệp vụ lõi ở mức CSDL (TC-02 .. TC-13, TC-15).
-- (TC-01, 03, 05 nằm trong t01; TC-10 cần nhiều kết nối đồng thời -> làm ở ứng dụng;
--  TC-14 đo bằng execution plan -> toi_uu_Q1_Q3.sql.)
-- Chạy SAU 08_seed.sql. Mỗi khối tự kiểm tra, in PASS/FAIL rồi ROLLBACK
-- -> chạy lại bao nhiêu lần cũng được, không làm bẩn dữ liệu demo.
--
-- Lưu ý: khi ghi qua Duality View, lỗi nghiệp vụ (ORA-200xx) bị "bọc" trong ORA-42692,
-- nên ở đây kiểm tra bằng INSTR(SQLERRM, 'ORA-200xx') thay vì so SQLCODE.
-- ==============================================================================
SET SERVEROUTPUT ON
SET DEFINE OFF

-- TC-02: client gửi giá / tổng tiền / trạng thái / số đơn GIẢ -> server bỏ qua, tự tính.
DECLARE
  l_id NUMBER; l_ord orders%ROWTYPE; l_unit NUMBER; l_price NUMBER;
BEGIN
  SELECT price INTO l_price FROM products WHERE product_id = 2;
  INSERT INTO order_dv VALUES ('{
    "orderNo": "HACK-001", "status": "DELIVERED", "subtotal": 1, "totalAmount": 1,
    "customer": {"customerId": 2},
    "shipReceiver": "TC-02", "shipPhone": "0900000002", "shipAddress": "45 Lê Lợi",
    "shippingFee": 30000,
    "items": [ {"productId": 2, "quantity": 1, "unitPrice": 1} ]}')
  RETURNING JSON_VALUE(data, '$._id' RETURNING NUMBER) INTO l_id;
  SELECT * INTO l_ord FROM orders WHERE order_id = l_id;
  SELECT unit_price INTO l_unit FROM order_items WHERE order_id = l_id;
  IF l_ord.status = 'PENDING' AND l_ord.order_no LIKE 'ORD-%' AND l_unit = l_price
     AND l_ord.subtotal = l_price AND l_ord.total_amount = l_price + 30000 THEN
    DBMS_OUTPUT.PUT_LINE('TC-02 PASS (status=' || l_ord.status || ', unit_price=' || l_unit
                         || ', total=' || l_ord.total_amount || ')');
  ELSE
    DBMS_OUTPUT.PUT_LINE('TC-02 FAIL status=' || l_ord.status || ' no=' || l_ord.order_no
                         || ' unit=' || l_unit || ' total=' || l_ord.total_amount);
  END IF;
  ROLLBACK;
END;
/

-- TC-04: đặt sản phẩm INACTIVE (id 4) -> ORA-20003
BEGIN
  INSERT INTO order_dv VALUES ('{
    "customer": {"customerId": 2}, "shipReceiver": "TC-04", "shipPhone": "0900000002",
    "shipAddress": "45 Lê Lợi", "items": [ {"productId": 4, "quantity": 1} ]}');
  DBMS_OUTPUT.PUT_LINE('TC-04 FAIL: không có lỗi');
  ROLLBACK;
EXCEPTION WHEN OTHERS THEN
  DBMS_OUTPUT.PUT_LINE(CASE WHEN INSTR(SQLERRM, 'ORA-20003') > 0 THEN 'TC-04 PASS' ELSE 'TC-04 FAIL' END
                       || ' -> ' || SUBSTR(SQLERRM, INSTR(SQLERRM, 'ORA-200'), 60));
  ROLLBACK;
END;
/

-- TC-06: sửa dòng hàng khi đơn đã CONFIRMED -> ORA-20004 ở CẢ HAI kênh (JSON và SQL).
-- Đồng thời kiểm tra: sửa trường KHÔNG thuộc dòng hàng (ghi chú địa chỉ) qua JSON vẫn được.
DECLARE
  l_id  NUMBER; l_doc JSON; l_new JSON; l_cnt NUMBER;
  l_json_ok BOOLEAN := FALSE; l_sql_ok BOOLEAN := FALSE; l_addr_ok BOOLEAN := FALSE;
BEGIN
  INSERT INTO order_dv VALUES ('{
    "customer": {"customerId": 2}, "shipReceiver": "TC-06", "shipPhone": "0900000002",
    "shipAddress": "45 Lê Lợi", "items": [ {"productId": 2, "quantity": 1} ]}')
  RETURNING JSON_VALUE(data, '$._id' RETURNING NUMBER) INTO l_id;
  pkg_order.sp_change_status(l_id, 'CONFIRMED', 'tester');

  -- (a) kênh JSON: đổi quantity của dòng hàng trong tài liệu rồi ghi đè cả tài liệu
  SELECT d.data INTO l_doc FROM order_dv d WHERE d.data."_id" = l_id;
  -- (JSON_TRANSFORM là hàm SQL, không gọi trực tiếp trong PL/SQL được -> dùng SELECT ... FROM dual)
  SELECT JSON_TRANSFORM(l_doc, SET '$.items[0].quantity' = 5) INTO l_new FROM dual;
  BEGIN
    UPDATE order_dv d SET d.data = l_new WHERE d.data."_id" = l_id;
  EXCEPTION WHEN OTHERS THEN
    l_json_ok := INSTR(SQLERRM, 'ORA-20004') > 0;
  END;

  -- (b) kênh SQL trực tiếp trên bảng nền
  BEGIN
    UPDATE order_items SET quantity = 5 WHERE order_id = l_id;
  EXCEPTION WHEN OTHERS THEN
    l_sql_ok := INSTR(SQLERRM, 'ORA-20004') > 0;
  END;

  -- (c) chỉ đổi địa chỉ giao (không đụng dòng hàng) qua JSON -> phải thành công
  SELECT d.data INTO l_doc FROM order_dv d WHERE d.data."_id" = l_id;
  SELECT JSON_TRANSFORM(l_doc, SET '$.shipAddress' = '99 Đường Mới') INTO l_new FROM dual;
  BEGIN
    UPDATE order_dv d SET d.data = l_new WHERE d.data."_id" = l_id;
    SELECT COUNT(*) INTO l_cnt FROM orders WHERE order_id = l_id AND ship_address = '99 Đường Mới';
    l_addr_ok := l_cnt = 1;
  EXCEPTION WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('TC-06 (c) lỗi: ' || SQLERRM);
  END;

  DBMS_OUTPUT.PUT_LINE(CASE WHEN l_json_ok AND l_sql_ok THEN 'TC-06 PASS' ELSE 'TC-06 FAIL' END
    || ' (JSON chặn=' || CASE WHEN l_json_ok THEN 'có' ELSE 'không' END
    || ', SQL chặn=' || CASE WHEN l_sql_ok THEN 'có' ELSE 'không' END
    || ', sửa địa chỉ qua JSON=' || CASE WHEN l_addr_ok THEN 'được' ELSE 'KHÔNG được' END || ')');
  ROLLBACK;
END;
/

-- TC-07: huỷ đơn PENDING -> hoàn kho; đơn đang SHIPPING thì không huỷ được (ORA-20002)
DECLARE
  l_id NUMBER; l_id2 NUMBER; l_before NUMBER; l_mid NUMBER; l_after NUMBER; l_err BOOLEAN := FALSE;
BEGIN
  SELECT stock_qty INTO l_before FROM products WHERE product_id = 2;
  INSERT INTO order_dv VALUES ('{
    "customer": {"customerId": 2}, "shipReceiver": "TC-07", "shipPhone": "0900000002",
    "shipAddress": "45 Lê Lợi", "items": [ {"productId": 2, "quantity": 3} ]}')
  RETURNING JSON_VALUE(data, '$._id' RETURNING NUMBER) INTO l_id;
  SELECT stock_qty INTO l_mid FROM products WHERE product_id = 2;
  pkg_order.sp_cancel_order(l_id, 'Khách đổi ý', 'tester');
  SELECT stock_qty INTO l_after FROM products WHERE product_id = 2;

  INSERT INTO order_dv VALUES ('{
    "customer": {"customerId": 2}, "shipReceiver": "TC-07b", "shipPhone": "0900000002",
    "shipAddress": "45 Lê Lợi", "items": [ {"productId": 2, "quantity": 1} ]}')
  RETURNING JSON_VALUE(data, '$._id' RETURNING NUMBER) INTO l_id2;
  pkg_order.sp_change_status(l_id2, 'CONFIRMED', 'tester');
  pkg_order.sp_change_status(l_id2, 'PACKING',   'tester');
  pkg_order.sp_change_status(l_id2, 'SHIPPING',  'tester');
  BEGIN
    pkg_order.sp_cancel_order(l_id2, 'Thử huỷ khi đang giao', 'tester');
  EXCEPTION WHEN pkg_order.e_invalid_transition THEN l_err := TRUE;
  END;

  IF l_mid = l_before - 3 AND l_after = l_before AND l_err THEN
    DBMS_OUTPUT.PUT_LINE('TC-07 PASS (tồn ' || l_before || ' -> ' || l_mid || ' -> huỷ -> '
                         || l_after || '; huỷ đơn SHIPPING bị chặn)');
  ELSE
    DBMS_OUTPUT.PUT_LINE('TC-07 FAIL ' || l_before || '/' || l_mid || '/' || l_after);
  END IF;
  ROLLBACK;
END;
/

-- TC-08: thanh toán vượt tổng -> ORA-20005 qua procedure VÀ qua payments[] của tài liệu JSON
DECLARE
  l_id NUMBER; l_total NUMBER; l_doc JSON; l_new JSON;
  l_proc_ok BOOLEAN := FALSE; l_json_ok BOOLEAN := FALSE;
BEGIN
  INSERT INTO order_dv VALUES ('{
    "customer": {"customerId": 2}, "shipReceiver": "TC-08", "shipPhone": "0900000002",
    "shipAddress": "45 Lê Lợi", "shippingFee": 30000, "items": [ {"productId": 2, "quantity": 1} ]}')
  RETURNING JSON_VALUE(data, '$._id' RETURNING NUMBER) INTO l_id;
  SELECT total_amount INTO l_total FROM orders WHERE order_id = l_id;

  BEGIN
    pkg_order.sp_record_payment(l_id, 'CARD', l_total + 1);
  EXCEPTION WHEN pkg_order.e_payment_exceeds_total THEN l_proc_ok := TRUE;
  END;

  SELECT d.data INTO l_doc FROM order_dv d WHERE d.data."_id" = l_id;
  SELECT JSON_TRANSFORM(l_doc, APPEND '$.payments' =
           JSON('{"method":"CARD","amount":' || (l_total + 1) || ',"status":"PAID"}'))
    INTO l_new FROM dual;
  BEGIN
    UPDATE order_dv d SET d.data = l_new WHERE d.data."_id" = l_id;
  EXCEPTION WHEN OTHERS THEN
    l_json_ok := INSTR(SQLERRM, 'ORA-20005') > 0;
    IF NOT l_json_ok THEN DBMS_OUTPUT.PUT_LINE('TC-08 (JSON) lỗi khác: ' || SQLERRM); END IF;
  END;

  DBMS_OUTPUT.PUT_LINE(CASE WHEN l_proc_ok AND l_json_ok THEN 'TC-08 PASS' ELSE 'TC-08 FAIL' END
    || ' (procedure chặn=' || CASE WHEN l_proc_ok THEN 'có' ELSE 'không' END
    || ', payments[] chặn=' || CASE WHEN l_json_ok THEN 'có' ELSE 'không' END || ')');
  ROLLBACK;
END;
/

-- TC-09: ETag. Lấy tài liệu (kèm etag) -> người khác sửa trước -> ghi bằng etag cũ -> ORA-42699
DECLARE
  l_id NUMBER; l_doc_a JSON; l_doc_b JSON; l_ok BOOLEAN := FALSE;
BEGIN
  INSERT INTO order_dv VALUES ('{
    "customer": {"customerId": 2}, "shipReceiver": "TC-09", "shipPhone": "0900000002",
    "shipAddress": "45 Lê Lợi", "items": [ {"productId": 2, "quantity": 1} ]}')
  RETURNING JSON_VALUE(data, '$._id' RETURNING NUMBER) INTO l_id;

  -- Người A và người B cùng đọc tài liệu (cùng etag)
  SELECT d.data INTO l_doc_a FROM order_dv d WHERE d.data."_id" = l_id;
  l_doc_b := l_doc_a;

  -- B ghi trước: thành công, etag trong CSDL đổi
  UPDATE order_dv d SET d.data = JSON_TRANSFORM(l_doc_b, SET '$.shipPhone' = '0911111111')
   WHERE d.data."_id" = l_id;

  -- A ghi sau với etag cũ -> phải bị từ chối, không ghi đè thay đổi của B
  BEGIN
    UPDATE order_dv d SET d.data = JSON_TRANSFORM(l_doc_a, SET '$.shipAddress' = 'Ghi đè')
     WHERE d.data."_id" = l_id;
  EXCEPTION WHEN OTHERS THEN
    l_ok := SQLCODE = -42699;
    DBMS_OUTPUT.PUT_LINE('TC-09 lỗi nhận được: ' || SUBSTR(SQLERRM, 1, 150));
  END;
  DBMS_OUTPUT.PUT_LINE(CASE WHEN l_ok THEN 'TC-09 PASS' ELSE 'TC-09 FAIL' END);
  ROLLBACK;
END;
/

-- TC-11: attributes thiếu "brand" -> bị ràng buộc IS JSON VALIDATE từ chối (qua SQL và qua PRODUCT_DV)
DECLARE
  l_sql_ok BOOLEAN := FALSE; l_dv_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO products (seller_id, category_id, sku, product_name, price, stock_qty, attributes)
    VALUES (1, 1, 'TC11-SQL', 'Thiếu brand', 1000, 1, JSON('{"color":"Red"}'));
  EXCEPTION WHEN OTHERS THEN
    l_sql_ok := TRUE;
    DBMS_OUTPUT.PUT_LINE('TC-11 (SQL) lỗi: ' || SUBSTR(SQLERRM, 1, 160));
  END;
  BEGIN
    INSERT INTO product_dv VALUES ('{"sku":"TC11-DV","productName":"Thiếu brand","price":1000,
      "stockQty":1,"status":"ACTIVE","attributes":{"color":"Red"},
      "seller":{"sellerId":1},"category":{"categoryId":1}}');
  EXCEPTION WHEN OTHERS THEN
    l_dv_ok := TRUE;
    DBMS_OUTPUT.PUT_LINE('TC-11 (DV) lỗi: ' || SUBSTR(REPLACE(SQLERRM, CHR(10), ' | '), 1, 220));
  END;
  DBMS_OUTPUT.PUT_LINE(CASE WHEN l_sql_ok AND l_dv_ok THEN 'TC-11 PASS' ELSE 'TC-11 FAIL' END);
  ROLLBACK;
END;
/

-- TC-12: UPDATE bảng bằng SQL rồi đọc tài liệu JSON -> JSON phản ánh NGAY (không có bản sao)
DECLARE
  l_id NUMBER; l_name VARCHAR2(200); l_etag1 VARCHAR2(64); l_etag2 VARCHAR2(64);
BEGIN
  SELECT MIN(order_id) INTO l_id FROM order_items WHERE product_id = 6;
  SELECT JSON_VALUE(d.data, '$._metadata.etag') INTO l_etag1 FROM order_dv d WHERE d.data."_id" = l_id;
  UPDATE products SET product_name = 'TÊN ĐÃ ĐỔI BẰNG SQL' WHERE product_id = 6;
  SELECT JSON_VALUE(d.data, '$.items[*]?(@.productId == 6).productName'),
         JSON_VALUE(d.data, '$._metadata.etag')
    INTO l_name, l_etag2 FROM order_dv d WHERE d.data."_id" = l_id;
  DBMS_OUTPUT.PUT_LINE(CASE WHEN l_name = 'TÊN ĐÃ ĐỔI BẰNG SQL' THEN 'TC-12 PASS' ELSE 'TC-12 FAIL' END
    || ' (productName trong JSON = "' || l_name || '"; etag '
    || CASE WHEN l_etag1 = l_etag2 THEN 'KHÔNG đổi vì trường NOCHECK' ELSE 'đổi' END || ')');
  ROLLBACK;
END;
/

-- TC-13: giảm giá > tiền hàng -> ORA-20007 (qua SQL và qua JSON)
DECLARE
  l_id NUMBER; l_doc JSON; l_sql_ok BOOLEAN := FALSE; l_json_ok BOOLEAN := FALSE;
BEGIN
  INSERT INTO order_dv VALUES ('{
    "customer": {"customerId": 2}, "shipReceiver": "TC-13", "shipPhone": "0900000002",
    "shipAddress": "45 Lê Lợi", "items": [ {"productId": 3, "quantity": 1} ]}')
  RETURNING JSON_VALUE(data, '$._id' RETURNING NUMBER) INTO l_id;
  BEGIN
    UPDATE orders SET discount_amount = 999999999 WHERE order_id = l_id;
  EXCEPTION WHEN pkg_order.e_discount_exceeds THEN l_sql_ok := TRUE;
  END;
  SELECT d.data INTO l_doc FROM order_dv d WHERE d.data."_id" = l_id;
  BEGIN
    UPDATE order_dv d SET d.data = JSON_TRANSFORM(l_doc, SET '$.discount' = 999999999)
     WHERE d.data."_id" = l_id;
  EXCEPTION WHEN OTHERS THEN l_json_ok := INSTR(SQLERRM, 'ORA-20007') > 0;
  END;
  DBMS_OUTPUT.PUT_LINE(CASE WHEN l_sql_ok AND l_json_ok THEN 'TC-13 PASS' ELSE 'TC-13 FAIL' END
    || ' (SQL chặn=' || CASE WHEN l_sql_ok THEN 'có' ELSE 'không' END
    || ', JSON chặn=' || CASE WHEN l_json_ok THEN 'có' ELSE 'không' END || ')');
  ROLLBACK;
END;
/

-- TC-15: sửa / xoá / thêm dòng hàng qua JSON khi đơn còn PENDING -> thành công trong MỘT câu
-- UPDATE order_dv; tổng tiền do trigger tính lại; tồn kho trả / trừ đúng.
-- (Hồi quy cho lỗi ORA-40896: xem docs/THAY_DOI_THIET_KE.md mục "ORA-40896".)
-- Kèm: đổi trạng thái bằng cách ghi tài liệu phải bị TỪ CHỐI (status là NOUPDATE -> ORA-40940);
-- trạng thái chỉ đổi qua pkg_order.sp_change_status.
DECLARE
  l_id NUMBER; l_doc JSON; l_sub NUMBER; l_st VARCHAR2(12);
  s2a NUMBER; s3a NUMBER; s12a NUMBER; s2b NUMBER; s3b NUMBER; s12b NUMBER;
  p2 NUMBER; p12 NUMBER; l_status_ok BOOLEAN := FALSE;
BEGIN
  SELECT price INTO p2  FROM products WHERE product_id = 2;
  SELECT price INTO p12 FROM products WHERE product_id = 12;
  INSERT INTO order_dv VALUES ('{
    "customer": {"customerId": 2}, "shipReceiver": "TC-15", "shipPhone": "0900000002",
    "shipAddress": "45 Lê Lợi", "items": [ {"productId": 2, "quantity": 1}, {"productId": 3, "quantity": 1} ]}')
  RETURNING JSON_VALUE(data, '$._id' RETURNING NUMBER) INTO l_id;
  SELECT stock_qty INTO s2a  FROM products WHERE product_id = 2;
  SELECT stock_qty INTO s3a  FROM products WHERE product_id = 3;
  SELECT stock_qty INTO s12a FROM products WHERE product_id = 12;

  -- SP2: 1 -> 3, xoá SP3, thêm SP12 x 2 (tất cả trong một tài liệu, một câu lệnh)
  SELECT d.data INTO l_doc FROM order_dv d WHERE d.data."_id" = l_id;
  UPDATE order_dv d
     SET d.data = JSON_TRANSFORM(l_doc,
                    SET    '$.items[*]?(@.productId == 2).quantity' = 3,
                    REMOVE '$.items[*]?(@.productId == 3)',
                    APPEND '$.items' = JSON('{"productId": 12, "quantity": 2}'))
   WHERE d.data."_id" = l_id;

  SELECT subtotal INTO l_sub FROM orders WHERE order_id = l_id;
  SELECT stock_qty INTO s2b  FROM products WHERE product_id = 2;
  SELECT stock_qty INTO s3b  FROM products WHERE product_id = 3;
  SELECT stock_qty INTO s12b FROM products WHERE product_id = 12;

  -- Thử đổi trạng thái qua tài liệu JSON: phải bị chặn bằng ORA-40940
  SELECT d.data INTO l_doc FROM order_dv d WHERE d.data."_id" = l_id;
  BEGIN
    UPDATE order_dv d SET d.data = JSON_TRANSFORM(l_doc, SET '$.status' = 'CONFIRMED')
     WHERE d.data."_id" = l_id;
    DBMS_OUTPUT.PUT_LINE('TC-15: đổi trạng thái qua JSON KHÔNG bị chặn');
  EXCEPTION WHEN OTHERS THEN
    l_status_ok := SQLCODE = -40940;
  END;

  IF l_status_ok AND l_sub = p2 * 3 + p12 * 2 AND s2b = s2a - 2 AND s3b = s3a + 1 AND s12b = s12a - 2 THEN
    DBMS_OUTPUT.PUT_LINE('TC-15 PASS (subtotal=' || l_sub || '; tồn SP2 ' || s2a || '->' || s2b
      || ', SP3 ' || s3a || '->' || s3b || ', SP12 ' || s12a || '->' || s12b
      || '; đổi trạng thái qua JSON bị chặn ORA-40940' || ')');
  ELSE
    DBMS_OUTPUT.PUT_LINE('TC-15 FAIL subtotal=' || l_sub);
  END IF;
  ROLLBACK;
EXCEPTION WHEN OTHERS THEN
  DBMS_OUTPUT.PUT_LINE('TC-15 FAIL: ' || SUBSTR(SQLERRM, 1, 200));
  ROLLBACK;
END;
/
