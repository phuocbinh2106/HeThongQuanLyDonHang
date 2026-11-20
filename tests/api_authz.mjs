// =============================================================================
// KIỂM THỬ PHÂN QUYỀN (AZ-01 … AZ-14): mỗi vai trò chỉ làm được đúng phần việc của mình.
// Vai trò mô phỏng bằng cookie ecom_user (customer:N | seller:N | admin); không cookie = khách vãng lai.
// Server phải chặn ở API (401 / 403) VÀ ở trang MVC, không chỉ ẩn nút trên giao diện.
//
// Yêu cầu: web đang chạy, dữ liệu ở trạng thái ban đầu (.\scripts\db.ps1 reset).
//   node tests/api_authz.mjs            (biến ECOM_BASE_URL, mặc định http://localhost:5148/api)
// Các đơn tạo thử đều được huỷ lại ở cuối (hoàn kho); vẫn nên chạy db.ps1 reset sau khi kiểm thử.
// =============================================================================
const BASE = process.env.ECOM_BASE_URL ?? 'http://localhost:5148/api';
const WEB = BASE.replace(/\/api$/, '');

async function call(method, url, body, { user, ifMatch, raw = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Cookie = `ecom_user=${user}`;
  if (ifMatch) headers['If-Match'] = ifMatch;
  const r = await fetch((raw ? WEB : BASE) + url, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, etag: r.headers.get('etag') };
}
const A = { user: 'admin' };

const results = [];
async function az(code, title, fn) {
  try {
    const { ok, detail } = await fn();
    results.push({ code, ok });
    console.log(`${code} ${ok ? 'PASS' : 'FAIL'}  ${title}\n       ${detail}`);
  } catch (e) {
    results.push({ code, ok: false });
    console.log(`${code} FAIL  ${title}\n       lỗi: ${e.message}`);
  }
}

// ---------- dữ liệu dùng chung (đọc bằng quyền quản trị) ----------
const all = (await call('GET', '/orders?pageSize=100', null, A)).data.items;
const orderOf = cid => all.find(o => o.customerId === cid).orderId;
const ownOrder = orderOf(1), otherOrder = orderOf(2);
const s2 = (await call('GET', '/orders?pageSize=100', null, { user: 'seller:2' })).data.items.map(o => o.orderId);
const notS2 = all.find(o => !s2.includes(o.orderId)).orderId;
const created = [];   // đơn tạo thử -> huỷ ở cuối

await az('AZ-01', 'Chưa chọn vai trò: xem đơn -> 401; xem sản phẩm vẫn được (công khai)', async () => {
  const o = await call('GET', '/orders');
  const p = await call('GET', '/products?q=iPhone');
  return { ok: o.status === 401 && p.status === 200, detail: `GET /orders: ${o.status}; GET /products: ${p.status}` };
});

await az('AZ-02', 'Cookie giả mạo (customer:abc) bị coi là chưa chọn vai trò -> 401', async () => {
  const r = await call('GET', '/orders', null, { user: 'customer:abc' });
  return { ok: r.status === 401, detail: `HTTP ${r.status}` };
});

await az('AZ-03', 'Báo cáo: khách hàng / người bán -> 403, quản trị -> 200', async () => {
  const c = await call('GET', '/reports/r1', null, { user: 'customer:1' });
  const s = await call('GET', '/reports/r1', null, { user: 'seller:1' });
  const a = await call('GET', '/reports/r1', null, A);
  return { ok: c.status === 403 && s.status === 403 && a.status === 200,
    detail: `khách ${c.status}, người bán ${s.status}, quản trị ${a.status}; thông báo: "${c.data.detail}"` };
});

await az('AZ-04', 'Khách hàng xem danh sách đơn: luôn chỉ đơn của mình, kể cả khi gửi customerId của người khác', async () => {
  const r = await call('GET', '/orders?customerId=2&pageSize=100', null, { user: 'customer:1' });
  const mine = all.filter(o => o.customerId === 1).length;
  const ok = r.status === 200 && r.data.items.every(o => o.customerId === 1) && r.data.total === mine;
  return { ok, detail: `HTTP ${r.status}, ${r.data.total} đơn, tất cả của khách #1 = ${r.data.items.every(o => o.customerId === 1)} (mong đợi ${mine})` };
});

await az('AZ-05', 'Khách hàng xem chi tiết đơn: đơn của mình -> 200, đơn người khác -> 403 (cả tài liệu JSON và tab bảng)', async () => {
  const own = await call('GET', `/orders/${ownOrder}`, null, { user: 'customer:1' });
  const other = await call('GET', `/orders/${otherOrder}`, null, { user: 'customer:1' });
  const rel = await call('GET', `/orders/${otherOrder}/relational`, null, { user: 'customer:1' });
  return { ok: own.status === 200 && other.status === 403 && rel.status === 403,
    detail: `đơn #${ownOrder} (của mình): ${own.status}; đơn #${otherOrder}: ${other.status}; /relational: ${rel.status}` };
});

await az('AZ-06', 'Người bán chỉ thấy đơn có sản phẩm của shop mình', async () => {
  // Kiểm tra 3 đơn đầu trong danh sách của người bán #2: mỗi đơn phải có ít nhất một sản phẩm của người bán #2
  let ok = s2.length > 0 && s2.length < all.length;
  const checked = [];
  for (const id of s2.slice(0, 3)) {
    const d = (await call('GET', `/orders/${id}`, null, A)).data;
    const sellers = await Promise.all(d.items.map(async i => (await call('GET', `/products/${i.productId}`)).data.seller.sellerId));
    ok &&= sellers.includes(2);
    checked.push(`#${id}:[${sellers}]`);
  }
  const deny = await call('GET', `/orders/${notS2}`, null, { user: 'seller:2' });
  ok &&= deny.status === 403;
  return { ok, detail: `${s2.length}/${all.length} đơn; ${checked.join(' ')}; đơn #${notS2} (không có SP của shop): ${deny.status}` };
});

await az('AZ-07', 'Tạo đơn: khách đặt hộ người khác -> 403; khách đặt cho mình -> 201; người bán / vãng lai không tạo được', async () => {
  const doc = cid => ({ customer: { customerId: cid }, shipReceiver: 'AZ', shipPhone: '0900000001', shipAddress: 'AZ-07',
    items: [{ productId: 2, quantity: 1 }] });
  const forOther = await call('POST', '/orders', doc(2), { user: 'customer:1' });
  const noId = { ...doc(1) }; delete noId.customer;
  const self = await call('POST', '/orders', noId, { user: 'customer:1' });
  if (self.status === 201) created.push(self.data._id);
  const seller = await call('POST', '/orders', doc(1), { user: 'seller:1' });
  const guest = await call('POST', '/orders', doc(1));
  return { ok: forOther.status === 403 && self.status === 201 && self.data.customer?.customerId === 1
             && seller.status === 403 && guest.status === 401,
    detail: `đặt hộ: ${forOther.status}; đặt cho mình (không gửi customerId): ${self.status}, customerId=${self.data.customer?.customerId}; người bán: ${seller.status}; vãng lai: ${guest.status}` };
});

await az('AZ-08', 'Khách sửa đơn của mình theo từng trường: đổi SĐT -> 200, tự đặt giảm giá -> 403', async () => {
  const id = created[0];
  const g = await call('GET', `/orders/${id}`, null, { user: 'customer:1' });
  const phone = await call('PUT', `/orders/${id}`, { ...g.data, shipPhone: '0911111111' }, { user: 'customer:1', ifMatch: g.etag });
  const disc = await call('PUT', `/orders/${id}`, { ...phone.data, discount: 50000 }, { user: 'customer:1', ifMatch: phone.etag });
  return { ok: phone.status === 200 && phone.data.shipPhone === '0911111111' && disc.status === 403,
    detail: `đổi SĐT: ${phone.status}; đổi discount: ${disc.status} "${disc.data.detail}"` };
});

await az('AZ-09', 'Đổi trạng thái: khách hàng -> 403; người bán không liên quan -> 403; khách tự huỷ đơn của mình -> 200', async () => {
  const id = created[0];
  const cust = await call('POST', `/orders/${id}/status`, { status: 'CONFIRMED' }, { user: 'customer:1' });
  const other = await call('POST', `/orders/${notS2}/status`, { status: 'CANCELLED' }, { user: 'seller:2' });
  const cancelOther = await call('POST', `/orders/${otherOrder}/cancel`, { reason: 'AZ' }, { user: 'customer:1' });
  const cancel = await call('POST', `/orders/${id}/cancel`, { reason: 'AZ-09' }, { user: 'customer:1' });
  if (cancel.status === 200) created.length = 0;
  return { ok: cust.status === 403 && other.status === 403 && cancelOther.status === 403
             && cancel.status === 200 && cancel.data.status === 'CANCELLED',
    detail: `khách đổi trạng thái: ${cust.status}; người bán #2 với đơn #${notS2}: ${other.status}; khách huỷ đơn người khác: ${cancelOther.status}; khách huỷ đơn mình: ${cancel.status} -> ${cancel.data.status}` };
});

await az('AZ-10', 'Người bán sửa đơn: chỉ được thêm vận đơn (shipments[]), đổi địa chỉ -> 403', async () => {
  const id = s2.find(x => all.find(o => o.orderId === x)?.status === 'PACKING') ?? s2[0];
  const g = await call('GET', `/orders/${id}`, null, { user: 'seller:2' });
  const addr = await call('PUT', `/orders/${id}`, { ...g.data, shipAddress: 'Đổi trái phép' }, { user: 'seller:2', ifMatch: g.etag });
  return { ok: g.status === 200 && addr.status === 403, detail: `đơn #${id}: đọc ${g.status}; đổi địa chỉ: ${addr.status} "${addr.data.detail}"` };
});

await az('AZ-11', 'Sản phẩm: người bán sửa sản phẩm của shop khác -> 403, của shop mình -> 200; khách hàng -> 403', async () => {
  const g = await call('GET', '/products/1');   // sản phẩm #1 thuộc người bán #1
  const otherShop = await call('PUT', '/products/1', g.data, { user: 'seller:2', ifMatch: g.etag });
  const cust = await call('PUT', '/products/1', g.data, { user: 'customer:1', ifMatch: g.etag });
  const own = await call('PUT', '/products/1', g.data, { user: `seller:${g.data.seller.sellerId}`, ifMatch: g.etag });
  return { ok: otherShop.status === 403 && cust.status === 403 && own.status === 200,
    detail: `người bán #2: ${otherShop.status}; khách hàng: ${cust.status}; người bán #${g.data.seller.sellerId} (chủ): ${own.status}` };
});

await az('AZ-12', 'Khách hàng: danh sách khách -> 403; hồ sơ người khác -> 403; hồ sơ mình -> 200; tự khoá tài khoản -> 403', async () => {
  const list = await call('GET', '/customers', null, { user: 'customer:1' });
  const other = await call('GET', '/customers/2', null, { user: 'customer:1' });
  const own = await call('GET', '/customers/1', null, { user: 'customer:1' });
  const lock = await call('PUT', '/customers/1', { ...own.data, status: 'LOCKED' }, { user: 'customer:1', ifMatch: own.etag });
  return { ok: list.status === 403 && other.status === 403 && own.status === 200 && lock.status === 403,
    detail: `danh sách: ${list.status}; hồ sơ #2: ${other.status}; hồ sơ #1: ${own.status}; tự đổi status: ${lock.status}` };
});

await az('AZ-13', 'Màn hình chọn vai trò: /api/session/customers chỉ trả mã + họ tên (không lộ email, SĐT)', async () => {
  const r = await call('GET', '/session/customers?q=nguyen');
  const keys = Object.keys(r.data.items?.[0] ?? {});
  return { ok: r.status === 200 && keys.includes('fullName') && !keys.includes('email') && !keys.includes('phone'),
    detail: `HTTP ${r.status}, các trường: ${keys.join(', ')}` };
});

await az('AZ-14', 'Trang MVC cũng bị chặn: vãng lai mở Báo cáo -> 401, khách hàng -> 403, quản trị -> 200; khách mở đơn người khác -> 403', async () => {
  const g = await call('GET', '/Reports', null, { raw: true });
  const c = await call('GET', '/Reports', null, { raw: true, user: 'customer:1' });
  const a = await call('GET', '/Reports', null, { raw: true, ...A });
  const d = await call('GET', `/Orders/Details/${otherOrder}`, null, { raw: true, user: 'customer:1' });
  return { ok: g.status === 401 && c.status === 403 && a.status === 200 && d.status === 403,
    detail: `/Reports: vãng lai ${g.status}, khách ${c.status}, quản trị ${a.status}; /Orders/Details/${otherOrder} (khách #1): ${d.status}` };
});

// dọn dẹp: huỷ các đơn tạo thử còn lại (hoàn kho)
for (const id of created) await call('POST', `/orders/${id}/cancel`, { reason: 'dọn kiểm thử' }, A);

const pass = results.filter(r => r.ok).length;
console.log(`\nTỔNG: ${pass}/${results.length} PASS`);
process.exitCode = pass === results.length ? 0 : 1;
