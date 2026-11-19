// =============================================================================
// KIỂM THỬ QUA KÊNH WEB: giao diện/HTTP -> API C# -> Oracle. Mỗi kịch bản tự kiểm tra và in PASS/FAIL.
// (Song song với sql/t01_smoke_test.sql + sql/t02_test_cases.sql kiểm thử ở mức CSDL.)
//
// Yêu cầu: web đang chạy ở http://localhost:5148, dữ liệu ở trạng thái ban đầu (.\scripts\db.ps1 reset).
//   node tests/api_test_cases.mjs
// Xong thì chạy lại .\scripts\db.ps1 reset để đưa dữ liệu demo về như cũ.
// TC-12 cần sửa bảng bằng SQL thuần -> gọi sqlplus trong container (biến ORACLE_CONTAINER,
// ECOM_DB_PASSWORD; mặc định oracle23ai / oracle).
// =============================================================================
import { spawnSync } from 'node:child_process';

const BASE = process.env.ECOM_BASE_URL ?? 'http://localhost:5148/api';
const CONTAINER = process.env.ORACLE_CONTAINER ?? 'oracle23ai';
const DB_PASS = process.env.ECOM_DB_PASSWORD ?? 'oracle';

// ---------- tiện ích ----------
async function call(method, url, body, { ifMatch, user = 'tester' } = {}) {
  const headers = { 'Content-Type': 'application/json', Cookie: `ecom_user=${user}` };
  if (ifMatch) headers['If-Match'] = ifMatch;
  const r = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, etag: r.headers.get('etag') };
}
const stock = async id => (await call('GET', `/products/${id}`)).data.stockQty;
const price = async id => (await call('GET', `/products/${id}`)).data.price;
const orderCount = async () => (await call('GET', '/orders?pageSize=1')).data.total;
const newOrder = (items, extra = {}) => call('POST', '/orders', {
  customer: { customerId: 2 }, shipReceiver: 'Kiểm thử', shipPhone: '0900000002',
  shipAddress: '45 Lê Lợi, Quận 1, TP.HCM', shippingFee: 30000, discount: 0, items, ...extra });

const results = [];
async function tc(code, title, fn) {
  try {
    const { ok, detail } = await fn();
    results.push({ code, ok });
    console.log(`${code} ${ok ? 'PASS' : 'FAIL'}  ${title}\n       ${detail}`);
  } catch (e) {
    results.push({ code, ok: false });
    console.log(`${code} FAIL  ${title}\n       lỗi kịch bản: ${e.message}`);
  }
}

// ---------- các kịch bản ----------
await tc('TC-10', '20 request đồng thời mua sản phẩm #5 (còn 5) -> đúng 5 thành công, tồn = 0', async () => {
  const before = await stock(5);
  const t0 = Date.now();
  // Bắn 20 request CÙNG LÚC (không await từng cái), mỗi request mua 1 cái
  const all = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    call('POST', '/orders', { customer: { customerId: (i % 9) + 1 }, shipReceiver: `Khách ${i + 1}`,
      shipPhone: '0900000000', shipAddress: 'TC-10', items: [{ productId: 5, quantity: 1 }] },
      { user: `customer:${(i % 9) + 1}` })));
  const ms = Date.now() - t0;
  const ok = all.filter(r => r.status === 201).length;
  const conflict = all.filter(r => r.status === 409 && r.data.oraCode === 'ORA-20001').length;
  const other = all.length - ok - conflict;
  const after = await stock(5);
  return { ok: before === 5 && ok === 5 && conflict === 15 && other === 0 && after === 0,
    detail: `tồn trước=${before}; 201=${ok}, 409 ORA-20001=${conflict}, khác=${other}; tồn sau=${after}; ${ms} ms` };
});

await tc('TC-01', 'Tạo đơn hợp lệ 2 dòng bằng một tài liệu JSON', async () => {
  const [p1, p3, s1, s3] = [await price(1), await price(3), await stock(1), await stock(3)];
  const r = await call('POST', '/orders', { customer: { customerId: 1 }, shipReceiver: 'Nguyễn Văn An',
    shipPhone: '0900000001', shipAddress: '12 Nguyễn Huệ', shippingFee: 25000,
    items: [{ productId: 1, quantity: 1 }, { productId: 3, quantity: 2 }] }, { user: 'customer:1' });
  const d = r.data;
  const sub = p1 + 2 * p3;
  const okH = d.history?.length === 1 && d.history[0].oldStatus === null && d.history[0].newStatus === 'PENDING'
              && d.history[0].changedBy === 'customer:1';
  const ok = r.status === 201 && d.status === 'PENDING' && /^ORD-\d{8}-\d{6}$/.test(d.orderNo)
    && d.subtotal === sub && d.totalAmount === sub + 25000 && okH
    && await stock(1) === s1 - 1 && await stock(3) === s3 - 2 && !!r.etag;
  return { ok, detail: `HTTP ${r.status}, ${d.orderNo}, subtotal=${d.subtotal} (mong đợi ${sub}), total=${d.totalAmount}, lịch sử ${d.history?.[0]?.oldStatus}->${d.history?.[0]?.newStatus} bởi ${d.history?.[0]?.changedBy}` };
});

await tc('TC-02', 'Client gửi giá / tổng / trạng thái / số đơn giả -> bị bỏ qua', async () => {
  const p2 = await price(2);
  const r = await newOrder([{ productId: 2, quantity: 1, unitPrice: 1 }],
    { status: 'DELIVERED', subtotal: 1, totalAmount: 1, orderNo: 'HACK-001' });
  const d = r.data;
  const ok = r.status === 201 && d.status === 'PENDING' && d.orderNo !== 'HACK-001'
    && d.items[0].unitPrice === p2 && d.subtotal === p2 && d.totalAmount === p2 + 30000;
  return { ok, detail: `HTTP ${r.status}, status=${d.status}, orderNo=${d.orderNo}, unitPrice=${d.items?.[0]?.unitPrice}, total=${d.totalAmount}` };
});

await tc('TC-03', 'Một dòng vượt tồn kho -> 409 ORA-20001, rollback CẢ đơn', async () => {
  const [n0, s1] = [await orderCount(), await stock(1)];
  const r = await newOrder([{ productId: 1, quantity: 1 }, { productId: 2, quantity: 999 }]);
  const ok = r.status === 409 && r.data.oraCode === 'ORA-20001' && await orderCount() === n0 && await stock(1) === s1;
  return { ok, detail: `HTTP ${r.status} ${r.data.oraCode} "${r.data.detail}"; số đơn ${n0}->${await orderCount()}, tồn SP1 ${s1}->${await stock(1)}` };
});

await tc('TC-04', 'Đặt sản phẩm INACTIVE -> 422 ORA-20003', async () => {
  const r = await newOrder([{ productId: 4, quantity: 1 }]);
  return { ok: r.status === 422 && r.data.oraCode === 'ORA-20003', detail: `HTTP ${r.status} ${r.data.oraCode} "${r.data.detail}"` };
});

await tc('TC-05', 'Đổi trạng thái sai (PENDING->SHIPPING) rồi đúng (->CONFIRMED)', async () => {
  const id = (await newOrder([{ productId: 3, quantity: 1 }])).data._id;
  const bad = await call('POST', `/orders/${id}/status`, { status: 'SHIPPING' });
  const good = await call('POST', `/orders/${id}/status`, { status: 'CONFIRMED', note: 'TC-05' });
  const last = good.data.history?.at(-1);
  const ok = bad.status === 422 && bad.data.oraCode === 'ORA-20002' && good.status === 200
    && good.data.status === 'CONFIRMED' && last?.oldStatus === 'PENDING' && last?.newStatus === 'CONFIRMED';
  return { ok, detail: `sai: HTTP ${bad.status} ${bad.data.oraCode}; đúng: HTTP ${good.status} status=${good.data.status}, lịch sử ${last?.oldStatus}->${last?.newStatus}` };
});

await tc('TC-06', 'Sửa dòng hàng khi đơn đã CONFIRMED qua JSON -> 409 ORA-20004', async () => {
  const id = (await newOrder([{ productId: 3, quantity: 1 }])).data._id;
  const c = await call('POST', `/orders/${id}/status`, { status: 'CONFIRMED' });
  const doc = structuredClone(c.data); doc.items[0].quantity = 5;
  const r = await call('PUT', `/orders/${id}`, doc, { ifMatch: c.etag });
  return { ok: r.status === 409 && r.data.oraCode === 'ORA-20004', detail: `HTTP ${r.status} ${r.data.oraCode} (kênh SQL kiểm ở t02)` };
});

await tc('TC-07', 'Huỷ đơn PENDING -> hoàn kho; huỷ đơn SHIPPING -> 422', async () => {
  const s3 = await stock(3);
  const a = (await newOrder([{ productId: 3, quantity: 4 }])).data._id;
  const mid = await stock(3);
  const ca = await call('POST', `/orders/${a}/cancel`, { reason: 'TC-07' });
  const after = await stock(3);
  const b = (await newOrder([{ productId: 3, quantity: 1 }])).data._id;
  for (const s of ['CONFIRMED', 'PACKING', 'SHIPPING']) await call('POST', `/orders/${b}/status`, { status: s });
  const cb = await call('POST', `/orders/${b}/cancel`, { reason: 'TC-07' });
  const ok = mid === s3 - 4 && ca.status === 200 && ca.data.status === 'CANCELLED' && after === s3
    && cb.status === 422 && cb.data.oraCode === 'ORA-20002';
  return { ok, detail: `tồn SP3 ${s3}->${mid}->huỷ->${after}; huỷ đơn SHIPPING: HTTP ${cb.status} ${cb.data.oraCode}` };
});

await tc('TC-08', 'Thanh toán vượt tổng -> 422 ORA-20005 ở cả procedure và payments[]', async () => {
  const o = (await newOrder([{ productId: 3, quantity: 1 }])).data;
  const p = await call('POST', `/orders/${o._id}/payments`, { method: 'CARD', amount: o.totalAmount + 1 });
  const g = await call('GET', `/orders/${o._id}`);
  const doc = structuredClone(g.data); doc.payments.push({ method: 'CARD', amount: o.totalAmount + 1, status: 'PAID' });
  const j = await call('PUT', `/orders/${o._id}`, doc, { ifMatch: g.etag });
  const okPay = await call('POST', `/orders/${o._id}/payments`, { method: 'CARD', amount: o.totalAmount });
  const ok = p.status === 422 && p.data.oraCode === 'ORA-20005' && j.status === 422 && j.data.oraCode === 'ORA-20005'
    && okPay.status === 200;
  return { ok, detail: `procedure: HTTP ${p.status} ${p.data.oraCode}; payments[]: HTTP ${j.status} ${j.data.oraCode}; trả đúng tổng: HTTP ${okPay.status}` };
});

await tc('TC-09', 'Hai người cùng sửa một đơn -> người lưu sau nhận 412', async () => {
  const c = await newOrder([{ productId: 3, quantity: 1 }]);
  const a = structuredClone(c.data), b = structuredClone(c.data);   // cả hai cùng đọc một phiên bản
  b.shipPhone = '0911111111';
  const rb = await call('PUT', `/orders/${c.data._id}`, b, { ifMatch: c.etag });
  a.shipAddress = 'Ghi đè';
  const ra = await call('PUT', `/orders/${c.data._id}`, a, { ifMatch: c.etag });
  const now = (await call('GET', `/orders/${c.data._id}`)).data;
  const ok = rb.status === 200 && ra.status === 412 && ra.data.oraCode === 'ORA-42699'
    && now.shipPhone === '0911111111' && now.shipAddress !== 'Ghi đè';
  return { ok, detail: `người B: HTTP ${rb.status}; người A (ETag cũ): HTTP ${ra.status} ${ra.data.oraCode}; dữ liệu của B còn nguyên=${now.shipPhone === '0911111111'}` };
});

await tc('TC-11', 'attributes thiếu "brand" -> 422 (JSON Schema) khi thêm và khi sửa', async () => {
  const post = await call('POST', '/products', { sku: 'TC11-NOBRAND', productName: 'x', price: 1000, stockQty: 1,
    status: 'ACTIVE', attributes: { color: 'Red' }, seller: { sellerId: 1 }, category: { categoryId: 1 } });
  const g = await call('GET', '/products/15');
  const doc = structuredClone(g.data); delete doc.attributes.brand;
  const put = await call('PUT', '/products/15', doc, { ifMatch: g.etag });
  const ok = post.status === 422 && put.status === 422;
  return { ok, detail: `POST: HTTP ${post.status} ${post.data.oraCode}; PUT: HTTP ${put.status} ${put.data.oraCode}` };
});

await tc('TC-12', 'UPDATE bảng bằng SQL thuần rồi GET tài liệu JSON -> phản ánh ngay', async () => {
  const id = (await newOrder([{ productId: 3, quantity: 1 }])).data._id;
  const sql = `UPDATE orders SET ship_phone = '0999888777' WHERE order_id = ${Number(id)};\nCOMMIT;\nEXIT;\n`;
  const p = spawnSync('docker', ['exec', '-i', CONTAINER, 'sqlplus', '-s', `ecom_schema/${DB_PASS}@localhost:1521/ecom`],
                      { input: sql, encoding: 'utf8' });
  const d = (await call('GET', `/orders/${id}`)).data;
  return { ok: p.status === 0 && d.shipPhone === '0999888777',
    detail: `sqlplus thoát mã ${p.status} (${(p.stdout || '').trim().split('\n')[0]}); JSON shipPhone=${d.shipPhone}` };
});

await tc('TC-13', 'Giảm giá > tiền hàng -> 422 ORA-20007', async () => {
  const r = await newOrder([{ productId: 3, quantity: 1 }], { discount: 999999999 });
  return { ok: r.status === 422 && r.data.oraCode === 'ORA-20007', detail: `HTTP ${r.status} ${r.data.oraCode} "${r.data.detail}"` };
});

await tc('TC-14', 'Lọc sản phẩm theo thuộc tính JSON -> kết quả đúng (plan đo ở bước tối ưu Q2)', async () => {
  const all = (await call('GET', '/products')).data.items;
  const cases = [
    ['brand=Apple&minStorageGb=256', p => p.attributes.brand === 'Apple' && (p.attributes.storageGb ?? -1) >= 256],
    ['brand=Samsung', p => p.attributes.brand === 'Samsung'],
    ['size=XL', p => Array.isArray(p.attributes.size) && p.attributes.size.includes('XL')],
    ['categoryId=3&minRamGb=16', p => p.category.categoryId === 3 && (p.attributes.ramGb ?? -1) >= 16],
  ];
  const lines = []; let ok = true;
  for (const [q, pred] of cases) {
    const got = (await call('GET', '/products?' + q)).data.items.map(p => p._id).sort((x, y) => x - y);
    const exp = all.filter(pred).map(p => p._id).sort((x, y) => x - y);
    const same = got.length > 0 && JSON.stringify(got) === JSON.stringify(exp);
    ok &&= same;
    lines.push(`${q}: [${got}] ${same ? '=' : '≠'} [${exp}]`);
  }
  return { ok, detail: lines.join('; ') };
});

await tc('TC-15', 'Sửa / xoá / thêm dòng hàng qua JSON khi PENDING -> tổng và tồn kho đúng', async () => {
  const c = await newOrder([{ productId: 2, quantity: 1 }, { productId: 3, quantity: 1 }]);
  const [s2, s3, s12, p2, p12] = [await stock(2), await stock(3), await stock(12), await price(2), await price(12)];
  const doc = structuredClone(c.data);
  doc.items = doc.items.filter(i => i.productId !== 3).map(i => ({ ...i, quantity: 3 }));
  doc.items.push({ productId: 12, quantity: 2 });
  const r = await call('PUT', `/orders/${c.data._id}`, doc, { ifMatch: c.etag });
  const ok = r.status === 200 && r.data.subtotal === 3 * p2 + 2 * p12
    && await stock(2) === s2 - 2 && await stock(3) === s3 + 1 && await stock(12) === s12 - 2;
  return { ok, detail: `HTTP ${r.status}, subtotal=${r.data.subtotal} (mong đợi ${3 * p2 + 2 * p12}); tồn SP2 ${s2}->${await stock(2)}, SP3 ${s3}->${await stock(3)}, SP12 ${s12}->${await stock(12)}` };
});

await tc('TC-16', 'Huỷ đơn đã thanh toán -> PAID chuyển REFUNDED (BR-12)', async () => {
  const o = (await newOrder([{ productId: 3, quantity: 1 }])).data;
  await call('POST', `/orders/${o._id}/status`, { status: 'CONFIRMED' });
  await call('POST', `/orders/${o._id}/payments`, { method: 'CARD', amount: o.totalAmount });
  const r = await call('POST', `/orders/${o._id}/cancel`, { reason: 'TC-16' });
  const pays = r.data.payments?.map(p => p.status).join(',');
  return { ok: r.status === 200 && r.data.status === 'CANCELLED' && pays === 'REFUNDED',
    detail: `HTTP ${r.status}, status=${r.data.status}, payments=[${pays}]` };
});

// ---------- tổng kết ----------
const pass = results.filter(r => r.ok).length;
console.log(`\nTỔNG: ${pass}/${results.length} PASS` + (pass === results.length ? '' : `  (FAIL: ${results.filter(r => !r.ok).map(r => r.code).join(', ')})`));
process.exitCode = pass === results.length ? 0 : 1;
