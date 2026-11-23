// =============================================================================
// KIỂM THỬ "XEM ĐƠN THEO THỜI GIAN" (AS-01 … AS-04): GET /api/orders/{id}/asof?scn= | ?minutesAgo=
// Đọc tài liệu ORDER_DV tại một SCN cũ bằng Flashback Query (… FROM order_dv AS OF SCN n …).
// Chạy: node tests/asof_test.mjs  (ECOM_BASE_URL mặc định http://localhost:5148/api); sau đó db.ps1 reset.
// =============================================================================
const BASE = process.env.ECOM_BASE_URL ?? 'http://localhost:5148/api';

async function call(method, url, body, { user = 'admin', ifMatch } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Cookie = `ecom_user=${user}`;
  if (ifMatch) headers['If-Match'] = ifMatch;
  const r = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, etag: r.headers.get('etag') };
}
const scnOf = doc => BigInt('0x' + doc._metadata.asof).toString();   // asof là SCN dạng hex

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

// đơn đầu tiên của khách #1 (để kiểm tra quyền ở AS-03)
const mine = (await call('GET', '/orders?pageSize=100', null, { user: 'customer:1' })).data.items[0].orderId;

await t('AS-01', 'Sửa địa chỉ rồi đọc tại SCN "lúc mở trang" -> ra địa chỉ CŨ; đọc hiện tại -> địa chỉ mới', async () => {
  const before = await call('GET', `/orders/${mine}`);
  const scn = scnOf(before.data);
  const newAddr = `${before.data.shipAddress} (sửa lúc ${Date.now()})`;
  const put = await call('PUT', `/orders/${mine}`, { ...before.data, shipAddress: newAddr }, { ifMatch: before.etag });
  const old = await call('GET', `/orders/${mine}/asof?scn=${scn}`);
  const now = await call('GET', `/orders/${mine}`);
  const ok = put.status === 200 && old.status === 200 && old.data.doc.shipAddress === before.data.shipAddress
    && now.data.shipAddress === newAddr && old.data.scn === scn;
  return { ok, detail: `PUT ${put.status}; asof ${scn}: HTTP ${old.status} địa chỉ "${old.data?.doc?.shipAddress}"; hiện tại "${now.data.shipAddress}"` };
});

await t('AS-02', 'Thời điểm không đọc được (SCN không hợp lệ / quá xa, trước lần reset) -> 410 kèm lời giải thích', async () => {
  const a = await call('GET', `/orders/${mine}/asof?scn=1000`);
  const b = await call('GET', `/orders/${mine}/asof?minutesAgo=100000`);
  return { ok: a.status === 410 && b.status === 410 && !!a.data.detail,
    detail: `scn=1000: ${a.status} "${a.data?.title}"; 100000 phút trước: ${b.status}` };
});

await t('AS-03', 'Quyền giống xem đơn: khách khác 403, vãng lai 401, chủ đơn 200', async () => {
  const scn = scnOf((await call('GET', `/orders/${mine}`)).data);
  const other = await call('GET', `/orders/${mine}/asof?scn=${scn}`, null, { user: 'customer:2' });
  const guest = await call('GET', `/orders/${mine}/asof?scn=${scn}`, null, { user: null });
  const owner = await call('GET', `/orders/${mine}/asof?scn=${scn}`, null, { user: 'customer:1' });
  return { ok: other.status === 403 && guest.status === 401 && owner.status === 200,
    detail: `khách #2 ${other.status}, vãng lai ${guest.status}, khách #1 ${owner.status}` };
});

await t('AS-04', 'Tham số sai -> 400 (scn không phải số, thiếu tham số, số phút âm)', async () => {
  const a = await call('GET', `/orders/${mine}/asof?scn=abc`);
  const b = await call('GET', `/orders/${mine}/asof`);
  const c = await call('GET', `/orders/${mine}/asof?minutesAgo=-5`);
  const d = await call('GET', `/orders/${mine}/asof?scn=1%20OR%201=1`);
  return { ok: [a, b, c, d].every(r => r.status === 400),
    detail: `scn=abc ${a.status}, thiếu ${b.status}, -5 phút ${c.status}, "1 OR 1=1" ${d.status}` };
});

const pass = results.filter(Boolean).length;
console.log(`\nTỔNG: ${pass}/${results.length} PASS`);
process.exitCode = pass === results.length ? 0 : 1;
