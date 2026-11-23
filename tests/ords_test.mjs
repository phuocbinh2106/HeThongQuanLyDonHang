// =============================================================================
// KIỂM THỬ ORDS AutoREST (ORDS-01 … ORDS-03): REST do Oracle TỰ SINH cho Duality View, gọi qua
// API chuyển tiếp /api/ords/... của web (chỉ quản trị).
// Chạy:  node tests/ords_test.mjs   (cần web + container ORDS đang chạy; ECOM_BASE_URL mặc định http://localhost:5148/api)
// Sau khi chạy nên .\scripts\db.ps1 reset (ORDS-02 không tạo đơn, nhưng để chắc dữ liệu như ban đầu).
// =============================================================================
const BASE = process.env.ECOM_BASE_URL ?? 'http://localhost:5148/api';

async function call(method, url, body, user = 'admin') {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Cookie = `ecom_user=${user}`;
  const r = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, text, etag: r.headers.get('etag'), ordsUrl: r.headers.get('x-ords-url') };
}

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

await t('ORDS-01', 'Cùng một đơn đọc qua API C# và qua ORDS AutoREST -> cùng dữ liệu, cùng ETag', async () => {
  const c = await call('GET', '/orders/3');
  const o = await call('GET', '/ords/order_dv/3');
  const same = o.status === 200 && o.data._id === c.data._id && o.data.orderNo === c.data.orderNo
    && o.data.totalAmount === c.data.totalAmount && o.data.items?.length === c.data.items.length
    && o.data._metadata?.etag === c.data._metadata.etag;
  return { ok: c.status === 200 && same,
    detail: `C#: HTTP ${c.status} etag ${c.data._metadata?.etag}; ORDS (${o.ordsUrl}): HTTP ${o.status} etag ${o.data?._metadata?.etag}` };
});

await t('ORDS-02', 'Ghi qua ORDS vẫn bị trigger chặn: đặt quá tồn kho -> lỗi ORA-20001, không tạo đơn', async () => {
  const before = (await call('GET', '/orders?pageSize=1')).data.total;
  const doc = { customer: { customerId: 1 }, shipReceiver: 'ORDS test', shipPhone: '0900000000', shipAddress: 'HCM',
    items: [{ productId: 1, quantity: 99999 }] };
  const r = await call('POST', '/ords/order_dv/', doc);
  const after = (await call('GET', '/orders?pageSize=1')).data.total;
  return { ok: r.status >= 400 && r.text.includes('20001') && after === before,
    detail: `HTTP ${r.status}; có ORA-20001: ${r.text.includes('20001')}; số đơn ${before} -> ${after}` };
});

await t('ORDS-03', 'API chuyển tiếp chỉ cho quản trị và chỉ 3 Duality View: vãng lai 401, khách 403, view lạ / đường dẫn lạ 400', async () => {
  const g = await call('GET', '/ords/order_dv/3', null, null);
  const c = await call('GET', '/ords/order_dv/3', null, 'customer:1');
  const v = await call('GET', '/ords/orders/1');
  const p = await call('GET', '/ords/order_dv/3%2F..%2F..%2Fx');
  return { ok: g.status === 401 && c.status === 403 && v.status === 400 && p.status === 400,
    detail: `vãng lai ${g.status}, khách ${c.status}, view "orders" ${v.status}, đường dẫn "3/../../x" ${p.status}` };
});

const pass = results.filter(Boolean).length;
console.log(`\nTỔNG: ${pass}/${results.length} PASS`);
process.exitCode = pass === results.length ? 0 : 1;
