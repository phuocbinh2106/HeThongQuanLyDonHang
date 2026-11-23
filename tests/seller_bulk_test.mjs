// =============================================================================
// KIỂM THỬ THỐNG KÊ NGƯỜI BÁN (SS-01 … SS-04) VÀ THÊM NHIỀU SẢN PHẨM (BK-01 … BK-04)
//   GET  /api/seller-stats?sellerId=    3 báo cáo PL/SQL (pkg_order_rpt.fn_s1/s2/s3) cho MỘT shop
//   POST /api/products/bulk             mảng tài liệu PRODUCT_DV, ghi trong MỘT giao dịch
// Chạy: node tests/seller_bulk_test.mjs  (ECOM_BASE_URL mặc định http://localhost:5148/api); sau đó db.ps1 reset.
// =============================================================================
const BASE = process.env.ECOM_BASE_URL ?? 'http://localhost:5148/api';
const WEB = BASE.replace(/\/api$/, '');

async function call(method, url, body, user = 'admin', raw = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Cookie = `ecom_user=${user}`;
  const r = await fetch((raw ? WEB : BASE) + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}
const productCount = async () => (await call('GET', '/products?pageSize=500')).data.count;

const results = [];
async function t(code, title, fn) {
  try {
    const { ok, detail } = await fn();
    results.push(ok);
    console.log(`${code} ${ok ? 'PASS' : 'FAIL'}  ${title}\n       ${detail}`);
  } catch (e) {
    results.push(false);
    console.log(`${code} FAIL  ${title}\n       lỗi: ${e.message}`);
  }
}

// ---------------------------------------------------------------- thống kê người bán
await t('SS-01', 'Người bán #3 xem thống kê shop mình; doanh thu khớp báo cáo R2 (tổng phụ của shop)', async () => {
  const s = await call('GET', '/seller-stats', undefined, 'seller:3');
  const sum = s.data.summary?.rows?.[0] ?? {};
  const r2 = (await call('GET', '/reports/r2')).data.rows
    .find(r => r.NGUOI_BAN === sum.SHOP_NAME && r.DANH_MUC === 'Tổng phụ');
  return { ok: s.status === 200 && s.data.sellerId === 3 && sum.SHOP_NAME === 'Laptop Pro Shop' && sum.DOANH_THU === r2?.DOANH_THU,
    detail: `HTTP ${s.status}; shop ${sum.SHOP_NAME}; doanh thu ${sum.DOANH_THU} (R2: ${r2?.DOANH_THU}); đơn ${sum.SO_DON}, SP ${sum.SO_SAN_PHAM}, sắp hết ${sum.SAP_HET}` };
});

await t('SS-02', 'Người bán gửi sellerId shop khác -> bị bỏ qua (vẫn shop mình); quản trị chọn shop được, thiếu sellerId -> 400', async () => {
  const s = await call('GET', '/seller-stats?sellerId=1', undefined, 'seller:3');
  const a = await call('GET', '/seller-stats?sellerId=1');
  const none = await call('GET', '/seller-stats');
  return { ok: s.data.sellerId === 3 && a.status === 200 && a.data.sellerId === 1
      && a.data.summary.rows[0].SHOP_NAME === 'Samsung Store' && none.status === 400,
    detail: `seller:3 hỏi shop 1 -> shop ${s.data.sellerId}; admin shop 1 -> ${a.data.summary?.rows?.[0]?.SHOP_NAME}; admin thiếu sellerId -> ${none.status}` };
});

await t('SS-03', 'Khách hàng / vãng lai không xem được (API 403 / 401, trang 403); người bán mở trang được', async () => {
  const c = await call('GET', '/seller-stats', undefined, 'customer:1');
  const g = await call('GET', '/seller-stats', undefined, null);
  const pc = await call('GET', '/Seller/Stats', undefined, 'customer:1', true);
  const ps = await call('GET', '/Seller/Stats', undefined, 'seller:3', true);
  return { ok: c.status === 403 && g.status === 401 && pc.status === 403 && ps.status === 200,
    detail: `API khách ${c.status}, vãng lai ${g.status}; trang: khách ${pc.status}, người bán ${ps.status}` };
});

await t('SS-04', 'Số liệu nhất quán: tổng doanh thu theo tháng = doanh thu tổng; danh sách sản phẩm đúng số sản phẩm của shop', async () => {
  const s = (await call('GET', '/seller-stats', undefined, 'seller:3')).data;
  const total = s.byMonth.rows.reduce((a, r) => a + r.DOANH_THU, 0);
  const shopProducts = (await call('GET', '/products?sellerId=3&pageSize=500')).data.count;
  return { ok: total === s.summary.rows[0].DOANH_THU && s.products.rows.length === shopProducts
      && s.products.rows.length === s.summary.rows[0].SO_SAN_PHAM,
    detail: `tổng theo tháng ${total} / tổng ${s.summary.rows[0].DOANH_THU}; dòng sản phẩm ${s.products.rows.length}, sản phẩm của shop ${shopProducts}` };
});

// ---------------------------------------------------------------- thêm nhiều sản phẩm
const stamp = Date.now();
const doc = (i, attrs = { brand: 'Coolmate', size: ['M', 'L'] }) => ({
  sku: `BK-${stamp}-${i}`, productName: `Áo kiểm thử hàng loạt ${i}`, price: 150000 + i, stockQty: 10, status: 'ACTIVE',
  attributes: attrs, category: { categoryId: 7 },
});

await t('BK-01', 'Người bán #2 đăng 3 sản phẩm trong một request -> 201, đủ 3 sản phẩm, đều thuộc shop #2', async () => {
  const n0 = await productCount();
  const r = await call('POST', '/products/bulk', [doc(1), doc(2), doc(3)], 'seller:2');
  const n1 = await productCount();
  return { ok: r.status === 201 && r.data.count === 3 && r.data.items.every(p => p.seller.sellerId === 2) && n1 === n0 + 3,
    detail: `HTTP ${r.status}; tạo ${r.data.count} (mã ${r.data.items?.map(p => p._id).join(', ')}); số sản phẩm ${n0} -> ${n1}` };
});

await t('BK-02', 'Sản phẩm thứ 2 thiếu brand -> lỗi chỉ rõ "#2", KHÔNG sản phẩm nào được thêm (rollback cả lô)', async () => {
  const n0 = await productCount();
  const r = await call('POST', '/products/bulk', [doc(11), doc(12, { size: ['M'] }), doc(13)], 'seller:2');
  const n1 = await productCount();
  return { ok: r.status === 422 && String(r.data.detail).includes('#2') && n1 === n0,
    detail: `HTTP ${r.status} "${r.data.title}: ${r.data.detail}"; số sản phẩm ${n0} -> ${n1}` };
});

await t('BK-03', 'Trùng SKU trong cùng lô (sản phẩm #3 trùng #1) -> 409 chỉ rõ "#3", không thêm gì', async () => {
  const n0 = await productCount();
  const dup = { ...doc(21), productName: 'Trùng SKU' };
  const r = await call('POST', '/products/bulk', [doc(21), doc(22), dup], 'seller:2');
  const n1 = await productCount();
  return { ok: r.status === 409 && String(r.data.detail).includes('#3') && n1 === n0,
    detail: `HTTP ${r.status} "${r.data.detail}"; số sản phẩm ${n0} -> ${n1}` };
});

await t('BK-04', 'Giới hạn và quyền: 51 sản phẩm / mảng rỗng / không phải mảng -> 400; đăng cho shop khác -> 403; khách hàng -> 403', async () => {
  const big = await call('POST', '/products/bulk', Array.from({ length: 51 }, (_, i) => doc(100 + i)), 'seller:2');
  const empty = await call('POST', '/products/bulk', [], 'seller:2');
  const obj = await call('POST', '/products/bulk', doc(200), 'seller:2');
  const other = await call('POST', '/products/bulk', [{ ...doc(201), seller: { sellerId: 1 } }], 'seller:2');
  const cust = await call('POST', '/products/bulk', [doc(202)], 'customer:1');
  return { ok: big.status === 400 && empty.status === 400 && obj.status === 400 && other.status === 403 && cust.status === 403,
    detail: `51 SP ${big.status}, rỗng ${empty.status}, object ${obj.status}, shop khác ${other.status}, khách ${cust.status}` };
});

const pass = results.filter(Boolean).length;
console.log(`\nTỔNG: ${pass}/${results.length} PASS`);
process.exitCode = pass === results.length ? 0 : 1;
