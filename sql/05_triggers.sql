-- ==============================================================================
-- 05_TRIGGERS: 6 trigger (2 compound). Chạy SAU 04_pkg_order.sql
-- ==============================================================================
CREATE OR REPLACE TRIGGER trg_ord_biu_row
BEFORE INSERT OR UPDATE ON orders
FOR EACH ROW
BEGIN
  IF INSERTING THEN
    :NEW.order_no     := 'ORD-' || TO_CHAR(SYSDATE, 'YYYYMMDD') || '-'
                         || LPAD(seq_order_no.NEXTVAL, 6, '0');
    :NEW.status       := 'PENDING';
    :NEW.order_date   := SYSTIMESTAMP;
    :NEW.subtotal     := 0;
    :NEW.total_amount := NVL(:NEW.shipping_fee, 0);
  ELSIF NOT pkg_order_ctx.g_internal THEN
    :NEW.order_no   := :OLD.order_no;
    :NEW.order_date := :OLD.order_date;
    :NEW.subtotal   := :OLD.subtotal;
    IF :NEW.discount_amount > :OLD.subtotal THEN
      RAISE_APPLICATION_ERROR(-20007, 'Giảm giá vượt tổng tiền hàng');
    END IF;
    :NEW.total_amount := :OLD.subtotal + :NEW.shipping_fee - :NEW.discount_amount;
    :NEW.updated_at   := SYSTIMESTAMP;
  END IF;
END trg_ord_biu_row;
/

CREATE OR REPLACE TRIGGER trg_ord_status_bu
BEFORE UPDATE OF status ON orders
FOR EACH ROW
WHEN (NEW.status <> OLD.status)
DECLARE
  l_items NUMBER;
BEGIN
  IF NOT pkg_order.fn_is_valid_transition(:OLD.status, :NEW.status) THEN
    RAISE_APPLICATION_ERROR(-20002,
      'Không thể chuyển trạng thái ' || :OLD.status || ' -> ' || :NEW.status);
  END IF;
  IF :NEW.status = 'CONFIRMED' THEN
    SELECT COUNT(*) INTO l_items FROM order_items WHERE order_id = :NEW.order_id;
    IF l_items = 0 THEN
      RAISE_APPLICATION_ERROR(-20002, 'Đơn chưa có dòng hàng, không thể xác nhận');
    END IF;
  END IF;
  :NEW.updated_at := SYSTIMESTAMP;
END trg_ord_status_bu;
/

CREATE OR REPLACE TRIGGER trg_ord_audit_aiu
AFTER INSERT OR UPDATE OF status ON orders
FOR EACH ROW
BEGIN
  IF INSERTING THEN
    INSERT INTO order_status_history
      (order_id, old_status, new_status, changed_by, note)
    VALUES (:NEW.order_id, NULL, :NEW.status, pkg_order.fn_current_user, 'Tạo đơn');
  ELSIF :NEW.status <> :OLD.status THEN
    INSERT INTO order_status_history
      (order_id, old_status, new_status, changed_by, note)
    VALUES (:NEW.order_id, :OLD.status, :NEW.status,
            pkg_order.fn_current_user, pkg_order_ctx.g_note);
    IF :NEW.status IN ('CANCELLED', 'RETURNED') THEN
      pkg_order.sp_release_order_stock(:NEW.order_id);
    END IF;
  END IF;
END trg_ord_audit_aiu;
/

CREATE OR REPLACE TRIGGER trg_oi_biud_row
BEFORE INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW
DECLARE
  l_status orders.status%TYPE;
  l_price  products.price%TYPE;
BEGIN
  SELECT status INTO l_status FROM orders
   WHERE order_id = COALESCE(:NEW.order_id, :OLD.order_id);
  IF l_status <> 'PENDING' THEN
    RAISE_APPLICATION_ERROR(-20004, 'Đơn đã khoá, không được sửa dòng hàng');
  END IF;

  IF INSERTING THEN
    pkg_order.sp_reserve_stock(:NEW.product_id, :NEW.quantity, l_price);
    :NEW.unit_price := l_price;
  ELSIF UPDATING THEN
    :NEW.unit_price := :OLD.unit_price;
    IF :NEW.product_id = :OLD.product_id THEN
      IF :NEW.quantity > :OLD.quantity THEN
        pkg_order.sp_reserve_stock(:NEW.product_id,
                                   :NEW.quantity - :OLD.quantity, l_price);
      ELSIF :NEW.quantity < :OLD.quantity THEN
        pkg_order.sp_release_stock(:NEW.product_id, :OLD.quantity - :NEW.quantity);
      END IF;
    ELSE
      pkg_order.sp_release_stock(:OLD.product_id, :OLD.quantity);
      pkg_order.sp_reserve_stock(:NEW.product_id, :NEW.quantity, l_price);
      :NEW.unit_price := l_price;
    END IF;
  ELSE
    pkg_order.sp_release_stock(:OLD.product_id, :OLD.quantity);
  END IF;
END trg_oi_biud_row;
/

CREATE OR REPLACE TRIGGER trg_oi_totals
FOR INSERT OR UPDATE OR DELETE ON order_items
COMPOUND TRIGGER
  TYPE t_ids IS TABLE OF NUMBER INDEX BY VARCHAR2(20);
  g_orders t_ids;

  AFTER EACH ROW IS
  BEGIN
    IF INSERTING OR UPDATING THEN
      g_orders(TO_CHAR(:NEW.order_id)) := :NEW.order_id;
    END IF;
    IF DELETING OR UPDATING THEN
      g_orders(TO_CHAR(:OLD.order_id)) := :OLD.order_id;
    END IF;
  END AFTER EACH ROW;

  AFTER STATEMENT IS
    l_key VARCHAR2(20) := g_orders.FIRST;
  BEGIN
    WHILE l_key IS NOT NULL LOOP
      pkg_order.sp_recalc_totals(g_orders(l_key));
      l_key := g_orders.NEXT(l_key);
    END LOOP;
    g_orders.DELETE;
  END AFTER STATEMENT;
END trg_oi_totals;
/

CREATE OR REPLACE TRIGGER trg_pay_check
FOR INSERT OR UPDATE ON payments
COMPOUND TRIGGER
  TYPE t_ids IS TABLE OF NUMBER INDEX BY VARCHAR2(20);
  g_orders t_ids;

  AFTER EACH ROW IS
  BEGIN
    g_orders(TO_CHAR(:NEW.order_id)) := :NEW.order_id;
  END AFTER EACH ROW;

  AFTER STATEMENT IS
    l_key   VARCHAR2(20) := g_orders.FIRST;
    l_total orders.total_amount%TYPE;
    l_paid  NUMBER;
  BEGIN
    WHILE l_key IS NOT NULL LOOP
      SELECT total_amount INTO l_total FROM orders
       WHERE order_id = g_orders(l_key) FOR UPDATE;
      SELECT NVL(SUM(amount), 0) INTO l_paid FROM payments
       WHERE order_id = g_orders(l_key) AND status = 'PAID';
      IF l_paid > l_total THEN
        RAISE_APPLICATION_ERROR(-20005, 'Tổng thanh toán vượt tổng tiền đơn');
      END IF;
      l_key := g_orders.NEXT(l_key);
    END LOOP;
    g_orders.DELETE;
  END AFTER STATEMENT;
END trg_pay_check;
/
