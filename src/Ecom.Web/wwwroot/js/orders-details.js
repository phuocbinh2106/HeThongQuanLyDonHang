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
  $('jsonDoc').innerHTML = highlightJson(JSON.stringify(doc, null, 2));
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
load();
