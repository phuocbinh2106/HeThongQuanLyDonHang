// =============================================================================
// Kiểm thử API vòng đời đơn hàng (M2 + M5) — chạy khi web đang chạy ở http://localhost:5148
//   node tests/api_order_lifecycle.mjs
// Tạo đơn mới (khách 2) rồi đi qua: sửa dòng hàng (PUT + ETag), ETag cũ (412), sai trạng thái
// (422), xác nhận, sửa khi đã khoá (409), thanh toán vượt tổng ở 2 kênh (422), thanh toán đủ,
// thêm vận đơn qua shipments[], huỷ đơn SHIPPING (422), huỷ đơn PENDING (hoàn kho),
// đổi status trong tài liệu (422 ORA-40940). Sau khi chạy: .\scripts\db.ps1 reset
// =============================================================================
const B = 'http://localhost:5148/api';
const H = { 'Content-Type': 'application/json', Cookie: 'ecom_user=admin' };
async function call(method, url, body, ifMatch) {
  const h = { ...H }; if (ifMatch) h['If-Match'] = ifMatch;
  const r = await fetch(B + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  return { s: r.status, d, etag: r.headers.get('etag') };
}
const stock = async id => (await call('GET', `/products/${id}`)).d.stockQty;
const log = (k, v) => console.log(k.padEnd(48), v);

// Tạo đơn PENDING: SP2 x1, SP3 x1
let r = await call('POST', '/orders', { customer: { customerId: 2 }, shipReceiver: 'Test M5', shipPhone: '0900000002',
  shipAddress: '45 Lê Lợi', shippingFee: 30000, items: [{ productId: 2, quantity: 1 }, { productId: 3, quantity: 1 }] });
const id = r.d._id; let doc = r.d, etag = r.etag;
log('Tạo đơn', `${r.s} id=${id} total=${doc.totalAmount}`);
log('Tồn SP2/SP3/SP12 trước sửa', `${await stock(2)}/${await stock(3)}/${await stock(12)}`);

// PUT: SP2 qty 1->3, xoá SP3, thêm SP12 x2, đổi địa chỉ
doc.items = doc.items.filter(i => i.productId !== 3).map(i => i.productId === 2 ? { ...i, quantity: 3 } : i);
doc.items.push({ productId: 12, quantity: 2 });
doc.shipAddress = '99 Đường Mới';
r = await call('PUT', `/orders/${id}`, doc, etag);
log('PUT sửa dòng hàng khi PENDING', `${r.s} subtotal=${r.d.subtotal} items=${r.d.items?.map(i => i.productId + 'x' + i.quantity)}`);
log('Tồn SP2/SP3/SP12 sau sửa', `${await stock(2)}/${await stock(3)}/${await stock(12)}`);
const stale = etag; doc = r.d; etag = r.etag;

// TC-09: PUT lại bằng ETag cũ
r = await call('PUT', `/orders/${id}`, { ...doc, shipPhone: '000' }, stale);
log('TC-09 PUT với ETag cũ', `${r.s} ${r.d.oraCode}`);

r = await call('GET', `/orders/${id}/next-statuses`);
log('next-statuses', JSON.stringify(r.d));

// TC-05
r = await call('POST', `/orders/${id}/status`, { status: 'SHIPPING' });
log('TC-05 PENDING->SHIPPING', `${r.s} ${r.d.oraCode} ${r.d.detail}`);
r = await call('POST', `/orders/${id}/status`, { status: 'CONFIRMED', note: 'Admin xác nhận' });
log('PENDING->CONFIRMED', `${r.s} status=${r.d.status} changedBy=${r.d.history?.at(-1).changedBy}`);
doc = r.d; etag = r.etag;

// TC-06 qua JSON
const d6 = structuredClone(doc); d6.items[0].quantity = 9;
r = await call('PUT', `/orders/${id}`, d6, etag);
log('TC-06 PUT sửa dòng hàng khi CONFIRMED', `${r.s} ${r.d.oraCode}`);

// TC-08: thanh toán vượt tổng (procedure và payments[])
r = await call('POST', `/orders/${id}/payments`, { method: 'CARD', amount: doc.totalAmount + 1 });
log('TC-08 procedure vượt tổng', `${r.s} ${r.d.oraCode}`);
const d8 = structuredClone(doc); d8.payments.push({ method: 'CARD', amount: doc.totalAmount + 1, status: 'PAID' });
r = await call('PUT', `/orders/${id}`, d8, etag);
log('TC-08 payments[] vượt tổng', `${r.s} ${r.d.oraCode}`);
r = await call('POST', `/orders/${id}/payments`, { method: 'BANK_TRANSFER', amount: doc.totalAmount, reference: 'TXN-M5' });
log('Thanh toán đủ (procedure)', `${r.s} payments=${r.d.payments?.length}`);
doc = r.d; etag = r.etag;

// Thêm vận đơn qua JSON khi đã CONFIRMED (bảng shipments không bị khoá như order_items)
await call('POST', `/orders/${id}/status`, { status: 'PACKING' });
r = await call('GET', `/orders/${id}`); doc = r.d; etag = r.etag;
doc.shipments.push({ carrier: 'GHN', trackingNo: 'GHN123', status: 'PREPARING' });
r = await call('PUT', `/orders/${id}`, doc, etag);
log('Thêm vận đơn qua shipments[]', `${r.s} shipments=${r.d.shipments?.length} ${r.d.oraCode ?? ''} ${r.d.detail ?? ''}`);

await call('POST', `/orders/${id}/status`, { status: 'SHIPPING' });
r = await call('POST', `/orders/${id}/cancel`, { reason: 'thử' });
log('TC-07 huỷ đơn SHIPPING', `${r.s} ${r.d.oraCode}`);

// Huỷ một đơn PENDING khác -> hoàn kho
r = await call('POST', '/orders', { customer: { customerId: 2 }, shipReceiver: 'Huy', shipPhone: '1', shipAddress: 'x', items: [{ productId: 3, quantity: 4 }] });
const before = await stock(3);
r = await call('POST', `/orders/${r.d._id}/cancel`, { reason: 'Khách đổi ý' });
log('TC-07 huỷ đơn PENDING, tồn SP3 trước->sau', `${r.s} ${r.d.status} ${before}->${await stock(3)}`);

// Đổi trạng thái bằng cách PUT tài liệu -> phải 422 ORA-40940
r = await call('POST', '/orders', { customer: { customerId: 2 }, shipReceiver: 'S', shipPhone: '1', shipAddress: 'x', items: [{ productId: 3, quantity: 1 }] });
r = await call('PUT', `/orders/${r.d._id}`, { ...r.d, status: 'CONFIRMED' }, r.etag);
log('PUT đổi status trong tài liệu', `${r.s} ${r.d.oraCode} ${r.d.title}`);
