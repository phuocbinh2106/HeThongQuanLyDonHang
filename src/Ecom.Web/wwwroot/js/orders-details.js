// =============================================================================
// M4 – Chi tiết đơn, hai cách nhìn trên CÙNG dữ liệu:
//   GET /api/orders/{id}             -> tài liệu ORDER_DV (đường JSON) + ETag
//   GET /api/orders/{id}/relational  -> dòng thật trong 5 bảng nền (đường quan hệ)
// =============================================================================
const $ = id => document.getElementById(id);

const statusBadge = s => statusPill(s);   // nhãn trạng thái dùng chung (shopia.js)

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
    renderActions(json.data, json.etag);
  } catch (err) { showError('msg', err); }
}

function renderJson(doc, etag) {
  $('hdrOrderNo').textContent = doc.orderNo;
  $('hdrStatus').innerHTML = statusBadge(doc.status);
  // thanh tiến trình vẽ từ status + history[] của chính tài liệu ORDER_DV
  $('orderStepper').innerHTML = orderStepper(doc.status, doc.history);
  $('hdrMeta').innerHTML = `${icon('user')} ${escapeHtml(doc.customer?.fullName || '')}
    <span class="mx-2 opacity-50">|</span>${icon('orders')} ${escapeHtml(String(doc.orderDate).replace('T', ' ').slice(0, 16))}
    <span class="mx-2 opacity-50">|</span>Tổng: <b class="text-success">${fmtMoney(doc.totalAmount)}</b>`;
  $('etag').textContent = etag;
  $('asof').textContent = doc._metadata?.asof ?? '—';
  window.openAsof ??= doc._metadata?.asof;   // SCN lúc mở trang (tab "Theo thời gian" dùng để xem lại bản này)
  $('jsonDoc').innerHTML = highlightJson(JSON.stringify(doc, null, 2));
  renderSummary(doc);
}

// Tab "Thông tin đơn hàng" cho khách hàng: trình bày tài liệu đơn bằng giao diện, không hiện code JSON
const METHOD_VI = { COD: 'Thanh toán khi nhận hàng', BANK_TRANSFER: 'Chuyển khoản', E_WALLET: 'Ví điện tử', CARD: 'Thẻ' };
const PAY_VI = { PENDING: 'Chờ thanh toán', PAID: 'Đã thanh toán', REFUNDED: 'Đã hoàn tiền', FAILED: 'Thất bại' };
const fmtTime = v => v ? escapeHtml(String(v).replace('T', ' ').slice(0, 16)) : '';
function renderSummary(doc) {
  const items = (doc.items ?? []).map(i => `<tr>
      <td><div class="picker-row">${productThumb({ productId: i.productId }, 'sm')}<span>${escapeHtml(i.productName ?? '')}</span></div></td>
      <td class="text-end">${fmtMoney(i.unitPrice)}</td><td class="text-center">${i.quantity}</td>
      <td class="text-end">${fmtMoney(i.unitPrice * i.quantity)}</td></tr>`).join('');
  const pays = (doc.payments ?? []).map(x => `<li>${escapeHtml(METHOD_VI[x.method] ?? x.method)}: <b>${fmtMoney(x.amount)}</b>
      - ${escapeHtml(PAY_VI[x.status] ?? x.status)}</li>`).join('') || '<li class="text-muted">Chưa có thanh toán</li>';
  const ships = (doc.shipments ?? []).map(x => `<li>${escapeHtml(x.carrier)}${x.trackingNo ? ' - mã vận đơn ' + escapeHtml(x.trackingNo) : ''}</li>`).join('')
    || '<li class="text-muted">Chưa giao cho đơn vị vận chuyển</li>';
  const hist = (doc.history ?? []).map(h => `<li>${fmtTime(h.changedAt)}: ${h.oldStatus ? escapeHtml(STATUS_VI[h.oldStatus] ?? h.oldStatus) + ' → ' : ''}<b>${escapeHtml(STATUS_VI[h.newStatus] ?? h.newStatus)}</b>${h.note ? ' (' + escapeHtml(h.note) + ')' : ''}</li>`).join('');
  $('orderSummary').innerHTML = `
    <div class="row g-3 small">
      <div class="col-lg-8">
        <table class="table table-sm align-middle mb-2">
          <thead class="table-light"><tr><th>Sản phẩm</th><th class="text-end">Đơn giá</th><th class="text-center">SL</th><th class="text-end">Thành tiền</th></tr></thead>
          <tbody>${items}</tbody>
        </table>
        <div class="d-flex flex-column align-items-end gap-1">
          <div>Tiền hàng: <b>${fmtMoney(doc.subtotal)}</b></div>
          <div>Phí vận chuyển: <b>${fmtMoney(doc.shippingFee)}</b></div>
          <div>Giảm giá: <b>- ${fmtMoney(doc.discount)}</b></div>
          <div class="fs-6">Tổng thanh toán: <b class="text-success">${fmtMoney(doc.totalAmount)}</b></div>
        </div>
      </div>
      <div class="col-lg-4">
        <div class="fw-semibold">Giao đến</div>
        <div class="mb-2">${escapeHtml(doc.shipReceiver ?? '')} - ${escapeHtml(doc.shipPhone ?? '')}<br>${escapeHtml(doc.shipAddress ?? '')}</div>
        <div class="fw-semibold">Thanh toán</div><ul class="mb-2 ps-3">${pays}</ul>
        <div class="fw-semibold">Vận chuyển</div><ul class="mb-2 ps-3">${ships}</ul>
        <div class="fw-semibold">Lịch sử đơn hàng</div><ul class="mb-0 ps-3">${hist}</ul>
      </div>
    </div>`;
}

function renderRelational(tables) {
  $('relTables').innerHTML = Object.entries(tables).map(([name, t]) => `
    <div class="mb-3">
      <div class="d-flex justify-content-between align-items-baseline">
        <h6 class="mb-1"><code>${escapeHtml(name)}</code> <span class="text-muted small">(${t.rows.length} dòng)</span></h6>
        <details class="small"><summary>SQL</summary><pre class="bg-light mb-0">${escapeHtml(t.sql)}</pre></details>
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
  // Khách hàng không tự đổi trạng thái, chỉ được huỷ đơn của mình (server: POST /status chỉ người bán / quản trị)
  if (roleKind() === 'customer') data.next = data.next.filter(s => s === 'CANCELLED');
  $('nextButtons').innerHTML = data.next.length
    ? data.next.map(s => `<button class="btn btn-sm ${s === 'CANCELLED' ? 'btn-outline-danger' : 'btn-primary'}"
          data-status="${s}" title="${STATUS_VI[s]}">${s === 'CANCELLED' ? 'Huỷ đơn' : '→ ' + s}</button>`).join('')
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
    showOk('actionMsg', roleKind() === 'customer' ? `${okText}.` : `${okText} (HTTP ${r.status}). ETag mới: <code>${escapeHtml(r.etag)}</code>`);
    editExtra = [];
    await load();
  } catch (err) { showError('actionMsg', err); }
}

async function postAction(path, body, okText) {
  $('actionMsg').innerHTML = '';
  try {
    const r = await api(`/api/orders/${ORDER_ID}/${path}`, { method: 'POST', body });
    showOk('actionMsg', roleKind() === 'customer' ? `${okText}. Trạng thái hiện tại: ${statusBadge(r.data.status)}` : `${okText} (HTTP ${r.status}). Trạng thái hiện tại: ${statusBadge(r.data.status)}`);
    await load();
  } catch (err) { showError('actionMsg', err); }
}

// ---- 1. Trạng thái ----
$('nextButtons').addEventListener('click', e => {
  const s = e.target.dataset.status; if (!s) return;
  const note = $('statusNote').value || null;
  if (s === 'CANCELLED') postAction('cancel', { reason: note }, 'Đã huỷ đơn (hoàn tồn kho; khoản đã trả chuyển REFUNDED)');
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
// Khách hàng, người bán: mở sẵn tab "Thông tin đơn hàng" (tab JSON / bảng quan hệ chỉ dành cho quản trị)
if (['customer', 'seller'].includes(roleKind())) bootstrap.Tab.getOrCreateInstance($('tabSummaryBtn')).show();
load();
