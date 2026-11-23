// =============================================================================
// KIỂM THỬ TRANG DEMO "NHIỀU KHÁCH CÙNG MUA" (CD-01 … CD-03): API /api/demo/concurrency (chỉ quản trị)
// Server đặt lại tồn kho rồi tạo N đơn SONG SONG (mỗi đơn một kết nối, một giao dịch Oracle).
// Chạy: node tests/concurrency_demo.mjs  (ECOM_BASE_URL mặc định http://localhost:5148/api); sau đó db.ps1 reset.
// =============================================================================
const BASE = process.env.ECOM_BASE_URL ?? 'http://localhost:5148/api';

async function call(method, url, body, user = 'admin') {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Cookie = `ecom_user=${user}`;
  const r = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}
const stock = async id => (await call('GET', `/products/${id}`)).data.stockQty;

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

let created = [];
await t('CD-01', '20 khách cùng mua sản phẩm #5 còn 5 -> đúng 5 đơn, 15 báo ORA-20001, tồn 0, không bán vượt', async () => {
  const r = await call('POST', '/demo/concurrency', { productId: 5, stock: 5, buyers: 20 });
  const d = r.data;
  created = (d.results ?? []).filter(x => x.ok).map(x => x.orderId);
  const ora = (d.results ?? []).filter(x => !x.ok && x.code === 'ORA-20001').length;
  const ok = r.status === 200 && d.results.length === 20 && d.success === 5 && ora === 15 && d.other === 0
    && d.stockBefore === 5 && d.stockAfter === 0 && (await stock(5)) === 0 && new Set(created).size === 5;
  return { ok, detail: `HTTP ${r.status}; thành công ${d.success}, ORA-20001 ${ora}, khác ${d.other}; tồn ${d.stockBefore} -> ${d.stockAfter}; ${d.elapsedMs} ms` };
});

await t('CD-02', 'Huỷ các đơn vừa tạo -> trigger hoàn kho, tồn về lại 5', async () => {
  const r = await call('POST', '/demo/concurrency/cancel', { orderIds: created });
  return { ok: r.status === 200 && r.data.cancelled === created.length && (await stock(5)) === 5 && r.data.stockAfter === 5,
    detail: `HTTP ${r.status}; huỷ ${r.data.cancelled}/${created.length} đơn; tồn sau ${r.data.stockAfter}` };
});

await t('CD-03', 'Chỉ quản trị; tham số ngoài giới hạn -> 400; sản phẩm ngừng bán -> 422', async () => {
  const c = await call('POST', '/demo/concurrency', { productId: 5, stock: 5, buyers: 20 }, 'customer:1');
  const s = await call('POST', '/demo/concurrency', { productId: 5, stock: 5, buyers: 20 }, 'seller:1');
  const big = await call('POST', '/demo/concurrency', { productId: 5, stock: 5, buyers: 51 });
  const neg = await call('POST', '/demo/concurrency', { productId: 5, stock: -1, buyers: 5 });
  const inactive = await call('POST', '/demo/concurrency', { productId: 4, stock: 5, buyers: 5 });
  return { ok: c.status === 403 && s.status === 403 && big.status === 400 && neg.status === 400 && inactive.status === 422,
    detail: `khách ${c.status}, người bán ${s.status}, 51 khách ${big.status}, tồn -1 ${neg.status}, SP ngừng bán ${inactive.status}` };
});

const pass = results.filter(Boolean).length;
console.log(`\nTỔNG: ${pass}/${results.length} PASS`);
process.exitCode = pass === results.length ? 0 : 1;
