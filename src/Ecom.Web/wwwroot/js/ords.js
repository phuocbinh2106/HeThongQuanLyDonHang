// =============================================================================
// Trang "API C# và ORDS". Gọi:
//   GET  /api/orders/{id}           API C# tự viết (đọc ORDER_DV)
//   GET  /api/ords/order_dv/{id}    ORDS AutoREST (chuyển tiếp qua web vì khác cổng -> CORS)
//   POST /api/ords/order_dv/        ghi một tài liệu qua ORDS
// =============================================================================
const $ = id => document.getElementById(id);

// Gọi API và luôn trả kết quả (kể cả lỗi) để hiện nguyên mã HTTP + nội dung
async function raw(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* không phải JSON */ }
  return { status: res.status, ok: res.ok, data, text, etag: res.headers.get('ETag'), ordsUrl: res.headers.get('X-Ords-Url') };
}

const meta = r => `HTTP <b>${r.status}</b>${r.etag ? ` · ETag <code>${escapeHtml(r.etag)}</code>` : ''}`;
const pretty = r => r.data ? JSON.stringify(r.data, null, 2) : r.text;

async function read(e) {
  e?.preventDefault();
  $('ordsMsg').innerHTML = ''; $('sameBox').innerHTML = '';
  const id = Number($('orderId').value);
  const [cs, ords] = await Promise.all([raw(`/api/orders/${id}`), raw(`/api/ords/order_dv/${id}`)]);

  $('csUrl').textContent = `GET ${location.origin}/api/orders/${id}`;
  $('csMeta').innerHTML = meta(cs);
  $('csDoc').textContent = pretty(cs);
  $('ordsUrl').textContent = `GET ${ords.ordsUrl ?? '(ORDS)'}`;
  if (ords.ordsUrl) $('ordsUrl').href = ords.ordsUrl;
  $('ordsMeta').innerHTML = meta(ords);
  $('ordsDoc').textContent = pretty(ords);

  if (ords.status === 503 || ords.status === 504) { showError('ordsMsg', { status: ords.status, problem: ords.data }); return; }
  if (cs.ok && ords.ok) {
    // So các trường chính và ETag của hai tài liệu
    const keys = ['_id', 'orderNo', 'status', 'subtotal', 'totalAmount'];
    const diff = keys.filter(k => JSON.stringify(cs.data[k]) !== JSON.stringify(ords.data[k]));
    if (cs.data.items?.length !== ords.data.items?.length) diff.push('items');
    if (cs.data._metadata?.etag !== ords.data._metadata?.etag) diff.push('_metadata.etag');
    $('sameBox').innerHTML = diff.length === 0
      ? `<div class="alert alert-success py-2 mb-0">Hai API trả <b>cùng một tài liệu</b>: ${keys.join(', ')}, ${cs.data.items.length} dòng hàng và cùng ETag.</div>`
      : `<div class="alert alert-warning py-2 mb-0">Khác nhau ở: ${escapeHtml(diff.join(', '))}</div>`;
  }
}

// Tài liệu đơn đặt quá tồn kho (client chỉ gửi khoá + số lượng; giá, tổng tiền, trạng thái do CSDL quyết định)
const overStock = {
  customer: { customerId: 1 },
  shipReceiver: 'Demo ORDS', shipPhone: '0900000000', shipAddress: '1 Đường Demo, TP.HCM',
  items: [{ productId: 1, quantity: 99999 }],
};
$('writeDoc').textContent = JSON.stringify(overStock, null, 2);

async function write() {
  $('writeRes').innerHTML = '<span class="text-muted">Đang gửi...</span>';
  const r = await raw('/api/ords/order_dv/', { method: 'POST', body: JSON.stringify(overStock) });
  if (r.status === 503 || r.status === 504) { showError('writeRes', { status: r.status, problem: r.data }); return; }
  // Nguyên nhân thật là lỗi tự định nghĩa ORA-20xxx của trigger / package (ORA-42692 chỉ là lỗi bọc ngoài của Duality View)
  const ora = (r.text.match(/ORA-20\d{3}[^"\\\n]*/) || r.text.match(/ORA-\d{5}[^"\\\n]*/) || [])[0];
  $('writeRes').innerHTML = `
    <div class="alert ${r.ok ? 'alert-warning' : 'alert-success'} mb-1">
      <b>${r.ok ? 'ORDS đã ghi đơn (không mong đợi)' : 'CSDL từ chối ghi qua ORDS'}</b> · HTTP ${r.status}
      ${ora ? `<div class="mt-1"><code>${escapeHtml(ora)}</code></div>` : ''}
    </div>
    <details class="small"><summary>Nội dung ORDS trả về</summary><pre class="mb-0">${escapeHtml(pretty(r))}</pre></details>`;
}

$('readForm').addEventListener('submit', read);
$('btnWrite').addEventListener('click', write);
read();
