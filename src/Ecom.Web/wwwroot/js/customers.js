// =============================================================================
// M7 – Khách hàng (CUSTOMER_DV). Gọi:
//   GET  /api/customers           danh sách
//   GET  /api/customers/{id}      tài liệu hồ sơ + addresses[] + ETag
//   PUT  /api/customers/{id}      ghi đè tài liệu (If-Match)
//   POST /api/customers           tạo khách kèm địa chỉ bằng một tài liệu
// =============================================================================
const $ = id => document.getElementById(id);
let customers = [];
let held = { id: null, doc: null, etag: null };   // null id = đang tạo khách mới

async function loadList(selectId) {
  const { data } = await api('/api/customers');
  customers = data;
  renderList();
  if (selectId) openCustomer(selectId);
}

function renderList() {
  const q = $('search').value.trim().toLowerCase();
  $('custList').innerHTML = customers
    .filter(c => !q || c.fullName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    .map(c => `<button type="button" data-id="${c.id}"
        class="list-group-item list-group-item-action ${held.id === c.id ? 'active' : ''}">
        <div class="d-flex justify-content-between"><b>#${c.id} ${escapeHtml(c.fullName)}</b>
          ${c.status !== 'ACTIVE' ? '<span class="badge text-bg-danger">' + c.status + '</span>' : ''}</div>
        <div>${escapeHtml(c.email)} · ${c.addresses} địa chỉ · ${c.orders} đơn</div></button>`).join('');
}

async function openCustomer(id) {
  $('msg').innerHTML = '';
  try {
    const { data, etag } = await api(`/api/customers/${id}`);
    held = { id: data._id, doc: data, etag };
    fillForm(data);
    $('docTitle').textContent = `Tài liệu CUSTOMER_DV  _id = ${data._id}`;
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
    showOk('msg', `Đã lưu (HTTP ${r.status}). ETag mới: <code>${escapeHtml(r.etag)}</code>`);
    await loadList();
    await openCustomer(r.data._id);
    showOk('msg', `Đã lưu (HTTP ${r.status}). ETag mới: <code>${escapeHtml(r.etag)}</code>`);
  } catch (err) { showError('msg', err); }
}

// ---------- Sự kiện ----------
$('custList').addEventListener('click', e => {
  const b = e.target.closest('[data-id]'); if (b) openCustomer(Number(b.dataset.id));
});
$('search').addEventListener('input', renderList);
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
loadList(role?.kind === 'customer' ? role.id : 1).catch(err => showError('msg', err));
