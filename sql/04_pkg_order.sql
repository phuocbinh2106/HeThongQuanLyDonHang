-- ==============================================================================
-- 04_PKG_ORDER: package nghiệp vụ đơn hàng
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PKG_ORDER_CTX: biến trạng thái theo PHIÊN, dùng chung giữa procedure và trigger.
--   g_internal : TRUE khi chính package đang sửa orders (tính lại tổng) -> trigger cho phép
--   g_user     : người thao tác, ghi vào order_status_history.changed_by
--   g_note     : ghi chú đổi trạng thái
-- Vì sao tách riêng, không để trong PKG_ORDER? Package có biến (stateful) mà bị biên dịch lại
-- (ví dụ t00_reset chạy ALTER TABLE làm PKG_ORDER bị INVALID) thì mọi phiên đang mở (connection
-- pool của web) gặp ORA-04068 "existing state of packages has been discarded" ở lần gọi kế tiếp.
-- PKG_ORDER_CTX chỉ có biến, không tham chiếu bảng nào -> không bao giờ bị DDL làm INVALID;
-- PKG_ORDER không còn biến -> biên dịch lại thoải mái, không gây ORA-04068 (kiểm chứng 23.26.3).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE PACKAGE pkg_order_ctx AS
  g_internal BOOLEAN := FALSE;
  g_user     VARCHAR2(60);
  g_note     VARCHAR2(300);
END pkg_order_ctx;
/

CREATE OR REPLACE PACKAGE pkg_order AS
  e_out_of_stock          EXCEPTION; PRAGMA EXCEPTION_INIT(e_out_of_stock, -20001);
  e_invalid_transition    EXCEPTION; PRAGMA EXCEPTION_INIT(e_invalid_transition, -20002);
  e_product_inactive      EXCEPTION; PRAGMA EXCEPTION_INIT(e_product_inactive, -20003);
  e_order_locked          EXCEPTION; PRAGMA EXCEPTION_INIT(e_order_locked, -20004);
  e_payment_exceeds_total EXCEPTION; PRAGMA EXCEPTION_INIT(e_payment_exceeds_total, -20005);
  e_order_not_found       EXCEPTION; PRAGMA EXCEPTION_INIT(e_order_not_found, -20006);
  e_discount_exceeds      EXCEPTION; PRAGMA EXCEPTION_INIT(e_discount_exceeds, -20007);
  -- (biến trạng thái nằm ở pkg_order_ctx, xem phía trên)

  FUNCTION  fn_is_valid_transition(p_old VARCHAR2, p_new VARCHAR2) RETURN BOOLEAN;
  FUNCTION  fn_current_user RETURN VARCHAR2;
  FUNCTION  fn_available_stock(p_product_id NUMBER) RETURN NUMBER;
  FUNCTION  fn_calc_order_total(p_order_id NUMBER) RETURN NUMBER;
  PROCEDURE sp_reserve_stock(p_product_id NUMBER, p_qty NUMBER, p_price OUT NUMBER);
  PROCEDURE sp_release_stock(p_product_id NUMBER, p_qty NUMBER);
  PROCEDURE sp_release_order_stock(p_order_id NUMBER);
  PROCEDURE sp_refund_order_payments(p_order_id NUMBER);
  PROCEDURE sp_recalc_totals(p_order_id NUMBER);
  PROCEDURE sp_change_status(p_order_id NUMBER, p_new_status VARCHAR2,
                             p_user VARCHAR2, p_note VARCHAR2 DEFAULT NULL);
  PROCEDURE sp_cancel_order(p_order_id NUMBER, p_reason VARCHAR2, p_user VARCHAR2);
  PROCEDURE sp_record_payment(p_order_id NUMBER, p_method VARCHAR2,
                              p_amount NUMBER, p_ref VARCHAR2 DEFAULT NULL);
END pkg_order;
/

CREATE OR REPLACE PACKAGE BODY pkg_order AS

  FUNCTION fn_is_valid_transition(p_old VARCHAR2, p_new VARCHAR2) RETURN BOOLEAN IS
  BEGIN
    RETURN CASE
      WHEN p_old = 'PENDING'   AND p_new IN ('CONFIRMED', 'CANCELLED') THEN TRUE
      WHEN p_old = 'CONFIRMED' AND p_new IN ('PACKING',   'CANCELLED') THEN TRUE
      WHEN p_old = 'PACKING'   AND p_new IN ('SHIPPING',  'CANCELLED') THEN TRUE
      WHEN p_old = 'SHIPPING'  AND p_new IN ('DELIVERED', 'RETURNED')  THEN TRUE
      WHEN p_old = 'DELIVERED' AND p_new = 'RETURNED'                  THEN TRUE
      ELSE FALSE
    END;
  END fn_is_valid_transition;

  FUNCTION fn_current_user RETURN VARCHAR2 IS
  BEGIN
    RETURN COALESCE(pkg_order_ctx.g_user, SYS_CONTEXT('USERENV', 'CLIENT_IDENTIFIER'), USER);
  END fn_current_user;

  FUNCTION fn_available_stock(p_product_id NUMBER) RETURN NUMBER IS
    l_qty NUMBER;
  BEGIN
    SELECT stock_qty INTO l_qty FROM products WHERE product_id = p_product_id;
    RETURN l_qty;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    RETURN 0;
  END fn_available_stock;

  FUNCTION fn_calc_order_total(p_order_id NUMBER) RETURN NUMBER IS
    l_sub  NUMBER;
    l_ship NUMBER;
    l_disc NUMBER;
  BEGIN
    SELECT NVL(SUM(quantity * unit_price), 0) INTO l_sub
      FROM order_items WHERE order_id = p_order_id;
    SELECT shipping_fee, discount_amount INTO l_ship, l_disc
      FROM orders WHERE order_id = p_order_id;
    RETURN l_sub + l_ship - l_disc;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    RAISE_APPLICATION_ERROR(-20006, 'Không tìm thấy đơn ' || p_order_id);
  END fn_calc_order_total;

  PROCEDURE sp_reserve_stock(p_product_id IN NUMBER, p_qty IN NUMBER,
                             p_price OUT NUMBER) IS
    l_status products.status%TYPE;
  BEGIN
    UPDATE products
       SET stock_qty = stock_qty - p_qty
     WHERE product_id = p_product_id
       AND status = 'ACTIVE'
       AND stock_qty >= p_qty
    RETURNING price INTO p_price;

    IF SQL%ROWCOUNT = 0 THEN
      BEGIN
        SELECT status INTO l_status FROM products WHERE product_id = p_product_id;
      EXCEPTION WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(-20003, 'Sản phẩm không tồn tại: ' || p_product_id);
      END;
      IF l_status <> 'ACTIVE' THEN
        RAISE_APPLICATION_ERROR(-20003, 'Sản phẩm đã ngừng bán: ' || p_product_id);
      END IF;
      RAISE_APPLICATION_ERROR(-20001, 'Không đủ tồn kho cho sản phẩm ' || p_product_id);
    END IF;
  END sp_reserve_stock;

  PROCEDURE sp_release_stock(p_product_id NUMBER, p_qty NUMBER) IS
  BEGIN
    UPDATE products SET stock_qty = stock_qty + p_qty WHERE product_id = p_product_id;
  END sp_release_stock;

  PROCEDURE sp_release_order_stock(p_order_id NUMBER) IS
  BEGIN
    FOR r IN (SELECT product_id, quantity FROM order_items
               WHERE order_id = p_order_id ORDER BY product_id) LOOP
      sp_release_stock(r.product_id, r.quantity);
    END LOOP;
  END sp_release_order_stock;

  -- BR-12: đơn bị huỷ / trả hàng thì mọi khoản đã thanh toán (PAID) chuyển sang REFUNDED.
  -- Được gọi từ trigger trg_ord_audit_aiu (cùng chỗ với hoàn kho), nên đúng cho mọi kênh đổi
  -- trạng thái. Lưu ý: chạy BÊN TRONG trigger dòng của orders (orders đang "mutating") ->
  -- trigger trg_pay_check phải bỏ qua dòng không còn PAID, nếu không sẽ đọc orders -> ORA-04091.
  PROCEDURE sp_refund_order_payments(p_order_id NUMBER) IS
  BEGIN
    UPDATE payments
       SET status = 'REFUNDED'
     WHERE order_id = p_order_id
       AND status = 'PAID';
  END sp_refund_order_payments;

  PROCEDURE sp_recalc_totals(p_order_id IN NUMBER) IS
    l_sub  orders.subtotal%TYPE;
    l_ship orders.shipping_fee%TYPE;
    l_disc orders.discount_amount%TYPE;
  BEGIN
    SELECT NVL(SUM(quantity * unit_price), 0) INTO l_sub
      FROM order_items WHERE order_id = p_order_id;
    SELECT shipping_fee, discount_amount INTO l_ship, l_disc
      FROM orders WHERE order_id = p_order_id;
    IF l_disc > l_sub THEN
      RAISE_APPLICATION_ERROR(-20007, 'Giảm giá vượt tổng tiền hàng');
    END IF;
    pkg_order_ctx.g_internal := TRUE;
    UPDATE orders
       SET subtotal = l_sub, total_amount = l_sub + l_ship - l_disc,
           updated_at = SYSTIMESTAMP
     WHERE order_id = p_order_id;
    pkg_order_ctx.g_internal := FALSE;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      pkg_order_ctx.g_internal := FALSE;
      RAISE_APPLICATION_ERROR(-20006, 'Không tìm thấy đơn ' || p_order_id);
    WHEN OTHERS THEN
      pkg_order_ctx.g_internal := FALSE;
      RAISE;
  END sp_recalc_totals;

  PROCEDURE sp_change_status(p_order_id NUMBER, p_new_status VARCHAR2,
                             p_user VARCHAR2, p_note VARCHAR2 DEFAULT NULL) IS
  BEGIN
    pkg_order_ctx.g_user := p_user;  pkg_order_ctx.g_note := p_note;
    UPDATE orders SET status = p_new_status WHERE order_id = p_order_id;
    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20006, 'Không tìm thấy đơn ' || p_order_id);
    END IF;
    pkg_order_ctx.g_user := NULL;  pkg_order_ctx.g_note := NULL;
  EXCEPTION WHEN OTHERS THEN
    pkg_order_ctx.g_user := NULL;  pkg_order_ctx.g_note := NULL;
    RAISE;
  END sp_change_status;

  PROCEDURE sp_cancel_order(p_order_id NUMBER, p_reason VARCHAR2, p_user VARCHAR2) IS
  BEGIN
    sp_change_status(p_order_id, 'CANCELLED', p_user, p_reason);
  END sp_cancel_order;

  PROCEDURE sp_record_payment(p_order_id NUMBER, p_method VARCHAR2,
                              p_amount NUMBER, p_ref VARCHAR2 DEFAULT NULL) IS
    l_total orders.total_amount%TYPE;
    l_paid  NUMBER;
  BEGIN
    SELECT total_amount INTO l_total FROM orders WHERE order_id = p_order_id FOR UPDATE;
    SELECT NVL(SUM(amount), 0) INTO l_paid
      FROM payments WHERE order_id = p_order_id AND status = 'PAID';
    IF l_paid + p_amount > l_total THEN
      RAISE_APPLICATION_ERROR(-20005, 'Tổng thanh toán vượt tổng tiền đơn');
    END IF;
    INSERT INTO payments (order_id, method, amount, status, paid_at, transaction_ref)
    VALUES (p_order_id, p_method, p_amount, 'PAID', SYSTIMESTAMP, p_ref);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    RAISE_APPLICATION_ERROR(-20006, 'Không tìm thấy đơn ' || p_order_id);
  END sp_record_payment;

END pkg_order;
/
