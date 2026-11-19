// =============================================================================
// M4 – Chi tiết đơn, hai cách nhìn trên CÙNG dữ liệu:
//   GET /api/orders/{id}             -> tài liệu ORDER_DV (đường JSON) + ETag
//   GET /api/orders/{id}/relational  -> dòng thật trong 5 bảng nền (đường quan hệ)
// Sau khi đọc, so sánh tự động vài giá trị để thấy hai cách nhìn luôn khớp.
// =============================================================================
const $ = id => document.getElementById(id);

const STATUS_COLOR = {
  PENDING: 'secondary', CONFIRMED: 'info', PACKING: 'primary', SHIPPING: 'warning',
  DELIVERED: 'success', CANCELLED: 'dark', RETURNED: 'danger',
};
const statusBadge = s => `<span class="badge text-bg-${STATUS_COLOR[s] || 'light'}">${escapeHtml(s)}</span>`;

// Giá trị ngày giờ từ API có dạng 2026-11-19T13:01:56.27 -> hiển thị gọn
const fmtCell = v => {
  if (v === null || v === undefined) return '<span class="text-muted">NULL</span>';
  if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v)) return escapeHtml(v.replace('T', ' ').slice(0, 19));
  return escapeHtml(v);
};

async function load() {
  $('msg').innerHTML = '';
  try {
    // Hai request độc lập, chạy song song
    const [json, rel] = await Promise.all([
      api(`/api/orders/${ORDER_ID}`),
      api(`/api/orders/${ORDER_ID}/relational`),
    ]);
    renderJson(json.data, json.etag);
    renderRelational(rel.data);
    renderCompare(json.data, rel.data);
  } catch (err) { showError('msg', err); }
}

function renderJson(doc, etag) {
  $('hdrOrderNo').textContent = doc.orderNo;
  $('hdrStatus').innerHTML = statusBadge(doc.status);
  $('etag').textContent = etag;
  $('asof').textContent = doc._metadata?.asof ?? '—';
  $('jsonDoc').textContent = JSON.stringify(doc, null, 2);
}

function renderRelational(tables) {
  $('relTables').innerHTML = Object.entries(tables).map(([name, t]) => `
    <div class="mb-3">
      <div class="d-flex justify-content-between align-items-baseline">
        <h6 class="mb-1"><code>${escapeHtml(name)}</code> <span class="text-muted small">(${t.rows.length} dòng)</span></h6>
        <details class="small"><summary>SQL</summary><pre class="mb-0">${escapeHtml(t.sql)}</pre></details>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-bordered small mb-0">
          <thead class="table-light"><tr>${t.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
          <tbody>${t.rows.map(r => `<tr>${t.columns.map(c =>
              `<td class="${c === 'ROW_ID' ? 'text-muted font-monospace' : ''}">${fmtCell(r[c])}</td>`).join('')}</tr>`).join('')
            || `<tr><td colspan="${t.columns.length}" class="text-muted text-center">không có dòng nào</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`).join('');
}

// Đối chiếu: giá trị trong tài liệu JSON phải bằng giá trị trong bảng nền
function renderCompare(doc, t) {
  const o = t.orders.rows[0];
  const sumItems = t.order_items.rows.reduce((s, r) => s + r.QUANTITY * r.UNIT_PRICE, 0);
  const checks = [
    ['orderNo = orders.order_no', doc.orderNo === o.ORDER_NO],
    ['status = orders.status', doc.status === o.STATUS],
    ['totalAmount = orders.total_amount', doc.totalAmount === o.TOTAL_AMOUNT],
    [`items[] (${doc.items.length}) = số dòng order_items (${t.order_items.rows.length})`, doc.items.length === t.order_items.rows.length],
    ['subtotal = Σ quantity × unit_price', doc.subtotal === sumItems],
    ['totalAmount = subtotal + shipping_fee − discount_amount', o.TOTAL_AMOUNT === o.SUBTOTAL + o.SHIPPING_FEE - o.DISCOUNT_AMOUNT],
    [`payments[] (${doc.payments.length}) = số dòng payments`, doc.payments.length === t.payments.rows.length],
    [`shipments[] (${doc.shipments.length}) = số dòng shipments`, doc.shipments.length === t.shipments.rows.length],
    [`history[] (${doc.history.length}) = số dòng order_status_history`, doc.history.length === t.order_status_history.rows.length],
  ];
  const allOk = checks.every(c => c[1]);
  $('compare').innerHTML = `
    <div class="alert ${allOk ? 'alert-success' : 'alert-warning'} small mb-0 py-2">
      <b>${allOk ? 'Hai cách nhìn khớp nhau' : 'Có điểm lệch (có thể dữ liệu vừa đổi giữa hai lần đọc – bấm Đọc lại)'}</b>
      <div class="d-flex flex-wrap gap-3 mt-1">
        ${checks.map(([label, ok]) => `<span>${ok ? '✔' : '✘'} ${escapeHtml(label)}</span>`).join('')}
      </div>
    </div>`;
}

$('btnRefresh').addEventListener('click', load);
load();
