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
    renderActions(json.data, json.etag);
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

// =============================================================================
// M5 – XỬ LÝ ĐƠN
//   Đường quan hệ : POST /api/orders/{id}/status | /cancel | /payments  -> PKG_ORDER
//   Đường JSON    : PUT  /api/orders/{id} + If-Match                    -> UPDATE order_dv
// "held" = tài liệu + ETag đọc được lần gần nhất. Mọi lần PUT đều gửi ETag này: nếu ai đó
// (tab khác, người bán, procedure) đã sửa đơn sau lần đọc đó -> 412, không ghi đè mất dữ liệu.
// =============================================================================
let held = { doc: null, etag: null };

async function renderActions(doc, etag) {
  held = { doc, etag };
  $('etagHeld').textContent = etag;

  // Trạng thái kế tiếp hợp lệ: hỏi CSDL
  const { data } = await api(`/api/orders/${ORDER_ID}/next-statuses`);
  $('nextButtons').innerHTML = data.next.length
    ? data.next.map(s => `<button class="btn btn-sm ${s === 'CANCELLED' ? 'btn-outline-dark' : 'btn-outline-primary'}"
          data-status="${s}">${s === 'CANCELLED' ? 'Huỷ đơn' : '→ ' + s}</button>`).join('')
    : '<span class="text-muted">Trạng thái cuối, không chuyển tiếp được.</span>';

  // Thanh toán: gợi ý số tiền còn lại
  const paid = doc.payments.filter(p => p.status === 'PAID').reduce((s, p) => s + p.amount, 0);
  $('paidSoFar').textContent = fmtMoney(paid);
  $('totalAmt').textContent = fmtMoney(doc.totalAmount);
  $('payAmount').value = Math.max(doc.totalAmount - paid, 0) || '';

  // Form sửa tài liệu
  $('edReceiver').value = doc.shipReceiver;
  $('edPhone').value = doc.shipPhone;
  $('edAddress').value = doc.shipAddress;
  $('edFee').value = doc.shippingFee;
  $('edDiscount').value = doc.discount;
  renderEditItems(doc.items);
}

function renderEditItems(items) {
  $('edItems').innerHTML = items.map((it, i) => `
    <tr data-i="${i}">
      <td>#${it.productId} ${escapeHtml(it.productName ?? '(sản phẩm mới)')}</td>
      <td><input type="number" min="1" value="${it.quantity}" class="form-control form-control-sm ed-qty"></td>
      <td><button class="btn btn-sm btn-link text-danger ed-del">Xoá</button></td>
    </tr>`).join('');
}

// Ghép tài liệu mới từ tài liệu đang giữ + giá trị trên form (giữ nguyên các mảng khác)
function docFromForm() {
  const d = structuredClone(held.doc);
  d.shipReceiver = $('edReceiver').value;
  d.shipPhone = $('edPhone').value;
  d.shipAddress = $('edAddress').value;
  d.shippingFee = Number($('edFee').value || 0);
  d.discount = Number($('edDiscount').value || 0);
  d.items = [...$('edItems').querySelectorAll('tr')].map(tr => ({
    ...held.doc.items[tr.dataset.i] ?? editExtra[tr.dataset.i - held.doc.items.length],
    quantity: Number(tr.querySelector('.ed-qty').value),
  }));
  return d;
}
let editExtra = [];   // dòng hàng mới thêm trên form (chưa có orderItemId)

async function putDoc(doc, okText) {
  $('actionMsg').innerHTML = '';
  try {
    const r = await api(`/api/orders/${ORDER_ID}`, { method: 'PUT', body: doc, ifMatch: held.etag });
    showOk('actionMsg', `${okText} (HTTP ${r.status}). ETag mới: <code>${escapeHtml(r.etag)}</code>`);
    editExtra = [];
    await load();
  } catch (err) { showError('actionMsg', err); }
}

async function postAction(path, body, okText) {
  $('actionMsg').innerHTML = '';
  try {
    const r = await api(`/api/orders/${ORDER_ID}/${path}`, { method: 'POST', body });
    showOk('actionMsg', `${okText} (HTTP ${r.status}). Trạng thái hiện tại: ${statusBadge(r.data.status)}`);
    await load();
  } catch (err) { showError('actionMsg', err); }
}

// ---- 1. Trạng thái ----
$('nextButtons').addEventListener('click', e => {
  const s = e.target.dataset.status; if (!s) return;
  const note = $('statusNote').value || null;
  if (s === 'CANCELLED') postAction('cancel', { reason: note }, 'Đã huỷ đơn (hoàn tồn kho)');
  else postAction('status', { status: s, note }, `Đã chuyển sang ${s}`);
});
$('btnAnyStatus').addEventListener('click', () =>
  postAction('status', { status: $('anyStatus').value, note: $('statusNote').value || null },
             `Đã chuyển sang ${$('anyStatus').value}`));

// ---- 2. Thanh toán: hai kênh, cùng một quy tắc ở bảng nền ----
$('btnPay').addEventListener('click', () => {
  const method = $('payMethod').value, amount = Number($('payAmount').value), reference = $('payRef').value || null;
  if (document.querySelector('input[name=payChannel]:checked').value === 'proc') {
    postAction('payments', { method, amount, reference }, 'Đã ghi thanh toán qua procedure');
  } else {
    const d = structuredClone(held.doc);
    d.payments.push({ method, amount, status: 'PAID' });
    putDoc(d, 'Đã ghi thanh toán qua payments[] của tài liệu');
  }
});

// ---- 3. Sửa tài liệu ----
$('edItems').addEventListener('click', e => {
  if (!e.target.classList.contains('ed-del')) return;
  e.target.closest('tr').remove();
});
$('btnEdAdd').addEventListener('click', () => {
  const pid = Number($('edNewPid').value), qty = Number($('edNewQty').value || 1);
  if (!pid) return;
  const i = held.doc.items.length + editExtra.length;
  editExtra.push({ productId: pid, quantity: qty });
  $('edItems').insertAdjacentHTML('beforeend', `
    <tr data-i="${i}"><td>#${pid} (sản phẩm mới)</td>
      <td><input type="number" min="1" value="${qty}" class="form-control form-control-sm ed-qty"></td>
      <td><button class="btn btn-sm btn-link text-danger ed-del">Xoá</button></td></tr>`);
});
$('btnSaveDoc').addEventListener('click', () => putDoc(docFromForm(), 'Đã lưu tài liệu đơn'));

// ---- 4. Vận đơn ----
$('btnShip').addEventListener('click', () => {
  const d = structuredClone(held.doc);
  d.shipments.push({ carrier: $('shipCarrier').value, trackingNo: $('shipTracking').value || null, status: 'PREPARING' });
  putDoc(d, 'Đã thêm vận đơn qua shipments[]');
});

$('btnRefresh').addEventListener('click', load);
load();
