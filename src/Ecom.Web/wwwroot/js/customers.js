// =============================================================================
// M7 – Khách hàng (CUSTOMER_DV). Gọi:
//   GET  /api/customers?q=&limit=&offset=   tìm khách phía server, mỗi lần một trang (không tải tất cả)
//   GET  /api/customers/{id}      tài liệu hồ sơ + addresses[] + ETag
//   PUT  /api/customers/{id}      ghi đè tài liệu (If-Match)
//   POST /api/customers           tạo khách kèm địa chỉ bằng một tài liệu
// =============================================================================
const $ = id => document.getElementById(id);
let customers = [];         // các khách đã tải (cộng dồn khi bấm "Xem thêm")
let total = 0;              // tổng số khách khớp ô tìm (server trả về)
const PAGE = 20;
let held = { id: null, doc: null, etag: null };   // null id = đang tạo khách mới

// Tải một trang kết quả tìm khách. append = true: nối thêm vào danh sách đang có (nút "Xem thêm")
async function loadList(selectId, append = false) {
  const q = $('search').value.trim();
  const offset = append ? customers.length : 0;
  const { data } = await api(`/api/customers?limit=${PAGE}&offset=${offset}` + (q ? `&q=${encodeURIComponent(q)}` : ''));
  customers = append ? customers.concat(data.items) : data.items;
  total = data.total;
  renderList();
  if (selectId) openCustomer(selectId);
}

function renderList() {
  $('custList').innerHTML = customers
    .map(c => `<button type="button" data-id="${c.id}"
        class="list-group-item list-group-item-action ${held.id === c.id ? 'active' : ''}">
        <div class="d-flex align-items-center gap-2">
          <span class="avatar ${c.status !== 'ACTIVE' ? 'muted' : ''}">${escapeHtml(initials(c.fullName))}</span>
          <div class="flex-grow-1 overflow-hidden">
            <div class="d-flex justify-content-between"><b>#${c.id} ${escapeHtml(c.fullName)}</b>
              ${c.status !== 'ACTIVE' ? '<span class="badge text-bg-danger">' + c.status + '</span>' : ''}</div>
            <div class="text-truncate opacity-75">${escapeHtml(c.email)} · ${c.addresses} địa chỉ · ${c.orders} đơn</div>
          </div>
        </div></button>`).join('') || '<div class="list-group-item text-muted">Không có khách phù hợp</div>';
  $('custMore').innerHTML = `<span>Hiển thị ${customers.length} / ${total} khách</span>` +
    (customers.length < total ? '<button type="button" id="btnMore" class="btn btn-sm btn-link p-0">Xem thêm</button>' : '');
}

async function openCustomer(id) {
  $('msg').innerHTML = '';
  try {
    const { data, etag } = await api(`/api/customers/${id}`);
    held = { id: data._id, doc: data, etag };
    fillForm(data);
    $('docTitle').textContent = roleKind() === 'customer' ? 'Hồ sơ của tôi' : `Tài liệu CUSTOMER_DV  _id = ${data._id}`;
    $('etag').textContent = etag;
    $('lnkOrders').href = `/Orders?customerId=${data._id}`;
    $('lnkOrders').hidden = false;
    renderList();
  } catch (err) { showError('msg', err); }
}

function newCustomer() {
  held = { id: null, doc: null, etag: null };
  fillForm({ fullName: '', email: '', phone: '', status: 'ACTIVE', addresses: [] });
  addAddressRow({ isDefault: 1 });
  $('docTitle').textContent = 'Khách mới: INSERT INTO customer_dv';
  $('etag').textContent = '(chưa có)';
  $('lnkOrders').hidden = true;
  renderList();
}

function fillForm(d) {
  $('fullName').value = d.fullName ?? '';
  $('email').value = d.email ?? '';
  $('phone').value = d.phone ?? '';
  $('status').value = d.status ?? 'ACTIVE';
  $('addrRows').innerHTML = '';
  (d.addresses || []).forEach(addAddressRow);
  renderPreview();
}

const FIELDS = ['receiverName', 'receiverPhone', 'addressLine', 'ward', 'district', 'city'];

function addAddressRow(a = {}) {
  const tr = document.createElement('tr');
  if (a.addressId) tr.dataset.addressId = a.addressId;
  tr.innerHTML = `<td>${a.addressId ?? '<span class="badge text-bg-success">mới</span>'}</td>` +
    FIELDS.map(f => `<td><input class="form-control form-control-sm" data-f="${f}" value="${escapeHtml(a[f] ?? '')}"></td>`).join('') +
    `<td class="text-center"><input type="radio" name="isDefault" class="form-check-input" ${a.isDefault ? 'checked' : ''}></td>
     <td><button class="btn btn-sm btn-link text-danger p-0 del">Xoá</button></td>`;
  $('addrRows').appendChild(tr);
}

// Ghép tài liệu từ form. Giữ nguyên addressId của dòng cũ (Oracle UPDATE dòng đó),
// dòng không có addressId -> INSERT, dòng biến mất khỏi mảng -> DELETE.
function buildDoc() {
  return {
    fullName: $('fullName').value,
    email: $('email').value,
    phone: $('phone').value || null,
    status: $('status').value,
    addresses: [...$('addrRows').querySelectorAll('tr')].map(tr => {
      const a = tr.dataset.addressId ? { addressId: Number(tr.dataset.addressId) } : {};
      tr.querySelectorAll('input[data-f]').forEach(i => a[i.dataset.f] = i.value || null);
      a.isDefault = tr.querySelector('input[type=radio]').checked ? 1 : 0;
      return a;
    }),
  };
}

const renderPreview = () => { $('preview').textContent = JSON.stringify(buildDoc(), null, 2); };

async function save() {
  $('msg').innerHTML = '';
  const doc = buildDoc();
  try {
    const r = held.id == null
      ? await api('/api/customers', { method: 'POST', body: doc })
      : await api(`/api/customers/${held.id}`, { method: 'PUT', body: doc, ifMatch: held.etag });
    showOk('msg', roleKind() === 'customer' ? 'Đã lưu thay đổi.' : `Đã lưu (HTTP ${r.status}). ETag mới: <code>${escapeHtml(r.etag)}</code>`);
    await loadList();
    await openCustomer(r.data._id);
    showOk('msg', roleKind() === 'customer' ? 'Đã lưu thay đổi.' : `Đã lưu (HTTP ${r.status}). ETag mới: <code>${escapeHtml(r.etag)}</code>`);
  } catch (err) { showError('msg', err); }
}

// ---------- Sự kiện ----------
$('custList').addEventListener('click', e => {
  const b = e.target.closest('[data-id]'); if (b) openCustomer(Number(b.dataset.id));
});
let searchTimer;
$('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadList(), 250); });
$('custMore').addEventListener('click', e => { if (e.target.id === 'btnMore') loadList(null, true); });
$('btnNew').addEventListener('click', newCustomer);
$('btnAddAddr').addEventListener('click', () => { addAddressRow({}); renderPreview(); });
$('addrRows').addEventListener('click', e => {
  if (e.target.classList.contains('del')) { e.target.closest('tr').remove(); renderPreview(); }
});
document.querySelector('.card-body').addEventListener('input', renderPreview);
document.querySelector('.card-body').addEventListener('change', renderPreview);
$('btnSave').addEventListener('click', save);
$('btnReload').addEventListener('click', () => held.id && openCustomer(held.id));

// Vai trò khách hàng -> mở hồ sơ của chính mình; quản trị -> mở khách đầu tiên
const role = getRole();
if (role?.kind === 'customer') {
  // Khách hàng: chỉ mở hồ sơ của mình (không gọi API danh sách khách – API đó chỉ dành cho quản trị)
  $('status').disabled = true;
  openCustomer(role.id).catch(err => showError('msg', err));
} else {
  loadList(1).catch(err => showError('msg', err));
}
