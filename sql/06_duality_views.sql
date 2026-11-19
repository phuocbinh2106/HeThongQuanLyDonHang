-- ==============================================================================
-- 06_DUALITY_VIEWS: ORDER_DV, PRODUCT_DV, CUSTOMER_DV
-- Cần Oracle Database 23ai từ 23.4 trở lên.
-- ==============================================================================
CREATE OR REPLACE JSON RELATIONAL DUALITY VIEW order_dv AS
SELECT JSON {
  '_id'          : o.order_id,
  'orderNo'      : o.order_no     WITH NOUPDATE,
  'status'       : o.status,
  'orderDate'    : o.order_date   WITH NOUPDATE,
  'shipReceiver' : o.ship_receiver,
  'shipPhone'    : o.ship_phone,
  'shipAddress'  : o.ship_address,
  'subtotal'     : o.subtotal     WITH NOUPDATE,
  'shippingFee'  : o.shipping_fee,
  'discount'     : o.discount_amount,
  'totalAmount'  : o.total_amount WITH NOUPDATE,
  'customer' : (
    SELECT JSON {'customerId' : c.customer_id,
                 'fullName'   : c.full_name WITH NOCHECK,
                 'email'      : c.email     WITH NOCHECK}
    FROM customers c WITH NOINSERT NOUPDATE NODELETE
    WHERE c.customer_id = o.customer_id),
  'items' : [
    SELECT JSON {'orderItemId' : i.order_item_id,
                 'quantity'    : i.quantity,
                 'unitPrice'   : i.unit_price WITH NOUPDATE,
                 UNNEST (
                   SELECT JSON {'productId'   : p.product_id,
                                'sku'         : p.sku          WITH NOCHECK,
                                'productName' : p.product_name WITH NOCHECK}
                   FROM products p WITH NOINSERT NOUPDATE NODELETE
                   WHERE p.product_id = i.product_id)}
    FROM order_items i WITH INSERT UPDATE DELETE
    WHERE i.order_id = o.order_id ],
  'payments' : [
    SELECT JSON {'paymentId' : pm.payment_id,
                 'method'    : pm.method,
                 'amount'    : pm.amount,
                 'status'    : pm.status}
    FROM payments pm WITH INSERT UPDATE NODELETE
    WHERE pm.order_id = o.order_id ],
  'shipments' : [
    SELECT JSON {'shipmentId' : s.shipment_id,
                 'carrier'    : s.carrier,
                 'trackingNo' : s.tracking_no,
                 'status'     : s.status}
    FROM shipments s WITH INSERT UPDATE NODELETE
    WHERE s.order_id = o.order_id ],
  'history' : [
    SELECT JSON {'historyId' : h.history_id,
                 'oldStatus' : h.old_status,
                 'newStatus' : h.new_status,
                 'changedAt' : h.changed_at,
                 'changedBy' : h.changed_by}
    FROM order_status_history h WITH NOINSERT NOUPDATE NODELETE
    WHERE h.order_id = o.order_id ]
}
FROM orders o WITH INSERT UPDATE NODELETE;

CREATE OR REPLACE JSON RELATIONAL DUALITY VIEW product_dv AS
SELECT JSON {
  '_id'         : p.product_id,
  'sku'         : p.sku,
  'productName' : p.product_name,
  'price'       : p.price,
  'stockQty'    : p.stock_qty,
  'status'      : p.status,
  'attributes'  : p.attributes,
  'seller'   : (SELECT JSON {'sellerId' : s.seller_id,
                             'shopName' : s.shop_name WITH NOCHECK}
                FROM sellers s WITH NOINSERT NOUPDATE NODELETE
                WHERE s.seller_id = p.seller_id),
  'category' : (SELECT JSON {'categoryId'   : c.category_id,
                             'categoryName' : c.category_name WITH NOCHECK}
                FROM categories c WITH NOINSERT NOUPDATE NODELETE
                WHERE c.category_id = p.category_id)
}
FROM products p WITH INSERT UPDATE NODELETE;

CREATE OR REPLACE JSON RELATIONAL DUALITY VIEW customer_dv AS
SELECT JSON {
  '_id'      : c.customer_id,
  'fullName' : c.full_name,
  'email'    : c.email,
  'phone'    : c.phone,
  'status'   : c.status,
  'addresses' : [
    SELECT JSON {'addressId'     : a.address_id,
                 'receiverName'  : a.receiver_name,
                 'receiverPhone' : a.receiver_phone,
                 'addressLine'   : a.address_line,
                 'ward'          : a.ward,
                 'district'      : a.district,
                 'city'          : a.city,
                 'isDefault'     : a.is_default}
    FROM customer_addresses a WITH INSERT UPDATE DELETE
    WHERE a.customer_id = c.customer_id ]
}
FROM customers c WITH INSERT UPDATE NODELETE;
