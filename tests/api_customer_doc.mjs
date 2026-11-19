// =============================================================================
// Kiểm thử API khách hàng (M7) qua CUSTOMER_DV — chạy khi web đang chạy ở http://localhost:5148
//   node tests/api_customer_doc.mjs
// Sửa sổ địa chỉ (sửa 1, xoá 1, thêm 1) trong MỘT tài liệu; ETag cũ -> 412; email trùng -> 409;
// tạo khách mới kèm 2 địa chỉ bằng một tài liệu; đơn cũ giữ nguyên địa chỉ chụp lại (snapshot).
// Sau khi chạy: .\scripts\db.ps1 reset
// =============================================================================
const B = 'http://localhost:5148/api';
async function call(method, url, body, ifMatch) {
  const h = { 'Content-Type': 'application/json', Cookie: 'ecom_user=admin' };
  if (ifMatch) h['If-Match'] = ifMatch;
  const r = await fetch(B + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  return { s: r.status, d, etag: r.headers.get('etag') };
}
const log = (k, v) => console.log(k.padEnd(46), v);

// Khách 1 có 2 địa chỉ (id 1 mặc định, id 2 công ty). Lấy địa chỉ giao của một đơn cũ để so sánh sau.
let r = await call('GET', '/customers/1');
let doc = r.d, etag = r.etag;
log('Khách 1: số địa chỉ', `${doc.addresses.length} (${doc.addresses.map(a => a.addressId).join(',')})`);
const oldOrder = (await call('GET', '/orders?customerId=1&pageSize=1')).d.items[0];
const oldShip = (await call('GET', `/orders/${oldOrder.orderId}`)).d.shipAddress;

// Sửa địa chỉ 1, xoá địa chỉ 2, thêm địa chỉ mới (mặc định chuyển sang địa chỉ mới)
doc.addresses = doc.addresses.filter(a => a.addressId !== 2).map(a => ({ ...a, addressLine: '15 Nguyễn Huệ (đã sửa)', isDefault: 0 }));
doc.addresses.push({ receiverName: 'Nguyễn Văn An', receiverPhone: '0900000001', addressLine: '1 Võ Văn Ngân',
  ward: 'Linh Chiểu', district: 'TP Thủ Đức', city: 'TP.HCM', isDefault: 1 });
doc.phone = '0909999999';
r = await call('PUT', '/customers/1', doc, etag);
log('PUT sửa + xoá + thêm địa chỉ', `${r.s} địa chỉ=${r.d.addresses?.map(a => a.addressId + (a.isDefault ? '*' : '')).join(',')} phone=${r.d.phone}`);
const stale = etag; etag = r.etag;

r = await call('PUT', '/customers/1', { ...doc, phone: '000' }, stale);
log('PUT bằng ETag cũ', `${r.s} ${r.d.oraCode}`);

r = await call('GET', '/customers/1');
r = await call('PUT', '/customers/1', { ...r.d, email: 'binh.tran@mail.vn' }, r.etag);
log('Đổi email trùng khách 2', `${r.s} ${r.d.oraCode} ${r.d.title}`);

const after = (await call('GET', `/orders/${oldOrder.orderId}`)).d.shipAddress;
log('Đơn cũ vẫn giữ địa chỉ chụp lại', `${after === oldShip ? 'ĐÚNG' : 'SAI'} (${after})`);

r = await call('POST', '/customers', { fullName: 'Khách Mới Test', email: 'moi.test@mail.vn', phone: '0911000111', status: 'ACTIVE',
  addresses: [
    { receiverName: 'Khách Mới', receiverPhone: '0911000111', addressLine: '10 Lê Duẩn', city: 'Hà Nội', isDefault: 1 },
    { receiverName: 'Khách Mới (VP)', receiverPhone: '0911000111', addressLine: '20 Hai Bà Trưng', city: 'Hà Nội', isDefault: 0 } ] });
log('POST khách mới kèm 2 địa chỉ', `${r.s} _id=${r.d._id} địa chỉ=${r.d.addresses?.length}`);

r = await call('GET', '/products?sellerId=2');
log('Lọc sản phẩm theo người bán 2', `${r.d.count} sản phẩm, seller=${[...new Set(r.d.items.map(p => p.seller.shopName))]}`);
r = await call('GET', '/sellers');
log('Danh sách người bán', r.d.map(s => `${s.id}:${s.shopName}(${s.products})`).join(', '));
