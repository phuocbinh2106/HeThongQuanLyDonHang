// =============================================================================
// M7 – Khách hàng (CUSTOMER_DV). Gọi:
//   GET  /api/customers?q=&limit=&offset=   tìm khách phía server, mỗi lần một trang (không tải tất cả)
//   GET  /api/customers/{id}      tài liệu hồ sơ + addresses[] + ETag
//   PUT  /api/customers/{id}      ghi đè tài liệu (If-Match)
//   POST /api/customers           tạo khách kèm địa chỉ bằng một tài liệu
//   GET  /api/orders?customerId=  số đơn theo trạng thái (ô số liệu ở đầu hồ sơ)
// =============================================================================
const $ = id => document.getElementById(id);
let customers = [];         // các khách đã tải (cộng dồn khi bấm "Xem thêm")
let total = 0;              // tổng số khách khớp ô tìm (server trả về)
const PAGE = 20;
let held = { id: null, doc: null, etag: null };   // null id = đang tạo khách mới
const isCustomer = () => roleKind() === 'customer';

// ---------- Danh sách khách (quản trị) ----------
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

// ---------- Mở hồ sơ ----------
async function openCustomer(id) {
  $('msg').innerHTML = '';
  try {
    const { data, etag } = await api(`/api/customers/${id}`);
    held = { id: data._id, doc: data, etag };
    fillForm(data);
    $('docTitle').textContent = `Tài liệu CUSTOMER_DV _id = ${data._id}`;
    $('etag').textContent = etag;
    $('lnkOrders').href = isCustomer() ? '/Orders' : `/Orders?customerId=${data._id}`;
    $('lnkOrders').textContent = isCustomer() ? 'Đơn hàng của tôi →' : 'Xem đơn của khách →';
    $('lnkOrders').hidden = false;
    renderList();
    loadStats(data._id);
  } catch (err) { showError('msg', err); }
}

function newCustomer() {
  held = { id: null, doc: null, etag: null };
  fillForm({ fullName: '', email: '', phone: '', status: 'ACTIVE', addresses: [] });
  addAddressCard({ isDefault: 1 }, true);
  $('docTitle').textContent = 'Khách mới: INSERT INTO customer_dv';
  $('etag').textContent = '(chưa có)';
  $('lnkOrders').hidden = true;
  $('pfStats').innerHTML = '';
  renderList();
  renderHero();
}

function fillForm(d) {
  $('fullName').value = d.fullName ?? '';
  $('email').value = d.email ?? '';
  $('phone').value = d.phone ?? '';
  $('status').value = d.status ?? 'ACTIVE';
  $('addrRows').innerHTML = '';
  (d.addresses || []).forEach(a => addAddressCard(a));
  renderEmptyAddr();
  renderHero();
  setDirty(false);
}

// ---------- Đầu hồ sơ ----------
function renderHero() {
  const name = $('fullName').value.trim();
  const locked = $('status').value !== 'ACTIVE';
  $('pfAvatar').textContent = name ? initials(name) : '?';
  $('pfAvatar').classList.toggle('muted', locked);
  $('pfName').textContent = name || (held.id == null ? 'Khách hàng mới' : '—');
  $('pfStatus').innerHTML = locked
    ? '<span class="badge rounded-pill text-bg-danger">Đã khoá</span>'
    : '<span class="badge rounded-pill pf-active">Đang hoạt động</span>';
  const email = $('email').value.trim(), phone = $('phone').value.trim();
  $('pfContact').innerHTML = [
    email && `<span>${icon('info')} ${escapeHtml(email)}</span>`,
    phone && `<span>${icon('phone')} ${escapeHtml(phone)}</span>`,
    held.id != null && `<span class="text-muted">Mã khách hàng #${held.id}</span>`,
  ].filter(Boolean).join('');
}

// Số liệu đơn: đọc từ danh sách đơn (bảng ORDERS) – khách hàng chỉ đếm được đơn của chính mình
async function loadStats(id) {
  $('pfStats').innerHTML = '';
  try {
    const { data } = await api(`/api/orders?customerId=${id}`);
    const c = data.statusCounts || {};
    const sum = keys => keys.reduce((s, k) => s + (c[k] || 0), 0);
    const stat = (n, label, cls = '') => `<div class="pf-stat ${cls}"><b>${n}</b><span>${label}</span></div>`;
    $('pfStats').innerHTML =
      stat(sum(Object.keys(c)), 'Đơn hàng') +
      stat(sum(['PENDING', 'CONFIRMED', 'PACKING', 'SHIPPING']), 'Đang xử lý', 'warn') +
      stat(c.DELIVERED || 0, 'Đã giao', 'ok') +
      stat($('addrRows').querySelectorAll('.addr-card').length, 'Địa chỉ');
  } catch { /* không có số liệu thì thôi */ }
}

// ---------- Sổ địa chỉ: mỗi địa chỉ một thẻ (xem / sửa / đặt mặc định / xoá) ----------
const FIELDS = [
  ['receiverName', 'Người nhận', 'col-sm-6'], ['receiverPhone', 'Điện thoại', 'col-sm-6'],
  ['addressLine', 'Số nhà, đường', 'col-12'], ['ward', 'Phường / xã', 'col-sm-4'],
  ['district', 'Quận / huyện', 'col-sm-4'], ['city', 'Tỉnh / thành phố', 'col-sm-4'],
];

function addAddressCard(a = {}, editing = false) {
  const card = document.createElement('div');
  card.className = 'addr-card';
  if (a.addressId) card.dataset.addressId = a.addressId;
  card.innerHTML = `
    <input type="radio" name="isDefault" class="d-none" ${a.isDefault ? 'checked' : ''}>
    <div class="addr-view"></div>
    <div class="addr-edit" hidden>
      <div class="row g-2">
        ${FIELDS.map(([f, label, col]) => `<div class="${col}"><label class="form-label small mb-0">${label}</label>
          <input class="form-control form-control-sm" data-f="${f}" value="${escapeHtml(a[f] ?? '')}"></div>`).join('')}
      </div>
      <div class="d-flex justify-content-end gap-2 mt-2">
        <button type="button" class="btn btn-sm btn-outline-danger act-del">Xoá</button>
        <button type="button" class="btn btn-sm btn-primary act-done">Xong</button>
      </div>
    </div>`;
  $('addrRows').appendChild(card);
  renderAddrView(card);
  if (editing) toggleEdit(card, true);
}

function addrValue(card, f) { return card.querySelector(`[data-f="${f}"]`).value.trim(); }

function renderAddrView(card) {
  const isDef = card.querySelector('input[type=radio]').checked;
  card.classList.toggle('is-default', isDef);
  const place = ['addressLine', 'ward', 'district', 'city'].map(f => addrValue(card, f)).filter(Boolean).join(', ');
  card.querySelector('.addr-view').innerHTML = `
    <div class="d-flex justify-content-between align-items-start gap-2">
      <div class="min-w-0">
        <div class="addr-name">${escapeHtml(addrValue(card, 'receiverName') || '(chưa có người nhận)')}
          ${card.dataset.addressId ? '' : '<span class="badge text-bg-success ms-1">mới</span>'}</div>
        <div class="text-muted small">${escapeHtml(addrValue(card, 'receiverPhone') || '—')}</div>
      </div>
      ${isDef ? '<span class="badge rounded-pill pf-default">Mặc định</span>' : ''}
    </div>
    <div class="addr-line">${escapeHtml(place || '(chưa có địa chỉ)')}</div>
    <div class="addr-actions">
      <button type="button" class="btn btn-sm btn-link p-0 act-edit">Sửa</button>
      ${isDef ? '' : '<button type="button" class="btn btn-sm btn-link p-0 act-default">Đặt làm mặc định</button>'}
      <button type="button" class="btn btn-sm btn-link p-0 text-danger act-del">Xoá</button>
    </div>`;
}

function toggleEdit(card, on) {
  card.querySelector('.addr-view').hidden = on;
  card.querySelector('.addr-edit').hidden = !on;
  card.classList.toggle('editing', on);
  if (on) card.querySelector('[data-f]').focus();
  else renderAddrView(card);
}

function renderEmptyAddr() {
  const has = $('addrRows').querySelector('.addr-card');
  $('addrRows').querySelector('.addr-empty')?.remove();
  if (!has) $('addrRows').insertAdjacentHTML('beforeend',
    '<div class="addr-empty text-muted">Chưa có địa chỉ nào. Bấm "+ Thêm địa chỉ" để thêm.</div>');
}

// ---------- Ghép tài liệu & lưu ----------
// Giữ nguyên addressId của địa chỉ cũ (Oracle UPDATE dòng đó), thẻ không có addressId -> INSERT,
// thẻ bị xoá khỏi mảng -> DELETE. Cả hồ sơ + sổ địa chỉ ghi trong MỘT câu UPDATE customer_dv.
function buildDoc() {
  return {
    fullName: $('fullName').value,
    email: $('email').value,
    phone: $('phone').value || null,
    status: $('status').value,
    addresses: [...$('addrRows').querySelectorAll('.addr-card')].map(card => {
      const a = card.dataset.addressId ? { addressId: Number(card.dataset.addressId) } : {};
      card.querySelectorAll('input[data-f]').forEach(i => a[i.dataset.f] = i.value.trim() || null);
      a.isDefault = card.querySelector('input[type=radio]').checked ? 1 : 0;
      return a;
    }),
  };
}

const renderPreview = () => { $('preview').textContent = JSON.stringify(buildDoc(), null, 2); };

function setDirty(on) {
  document.querySelector('.save-bar').classList.toggle('dirty', on);
  $('dirtyNote').textContent = on ? '● Có thay đổi chưa lưu' : 'Mọi thay đổi được lưu cùng lúc khi bấm "Lưu thay đổi".';
  renderPreview();
}

async function save() {
  $('msg').innerHTML = '';
  // Đóng các thẻ đang sửa để thấy lại nội dung trước khi gửi
  $('addrRows').querySelectorAll('.addr-card.editing').forEach(c => toggleEdit(c, false));
  const doc = buildDoc();
  try {
    const r = held.id == null
      ? await api('/api/customers', { method: 'POST', body: doc })
      : await api(`/api/customers/${held.id}`, { method: 'PUT', body: doc, ifMatch: held.etag });
    if (!isCustomer()) await loadList();
    await openCustomer(r.data._id);
    showOk('msg', isCustomer() ? 'Đã lưu thay đổi hồ sơ.' : `Đã lưu (HTTP ${r.status}). ETag mới: <code>${escapeHtml(r.etag)}</code>`);
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
$('btnAddAddr').addEventListener('click', () => {
  const first = !$('addrRows').querySelector('.addr-card');
  addAddressCard({ isDefault: first ? 1 : 0 }, true);
  renderEmptyAddr(); setDirty(true);
});
$('addrRows').addEventListener('click', e => {
  const card = e.target.closest('.addr-card'); if (!card) return;
  if (e.target.classList.contains('act-edit')) toggleEdit(card, true);
  else if (e.target.classList.contains('act-done')) toggleEdit(card, false);
  else if (e.target.classList.contains('act-default')) {
    card.querySelector('input[type=radio]').checked = true;
    $('addrRows').querySelectorAll('.addr-card').forEach(renderAddrView);
    setDirty(true);
  } else if (e.target.classList.contains('act-del')) {
    const wasDefault = card.querySelector('input[type=radio]').checked;
    card.remove();
    // Xoá địa chỉ mặc định -> địa chỉ đầu tiên còn lại thành mặc định
    const next = $('addrRows').querySelector('.addr-card');
    if (wasDefault && next) { next.querySelector('input[type=radio]').checked = true; renderAddrView(next); }
    renderEmptyAddr(); setDirty(true);
  }
});
const col = document.querySelector('.profile-col');
col.addEventListener('input', e => { if (e.target.matches('input, select')) { setDirty(true); renderHero(); } });
col.addEventListener('change', e => { if (e.target.matches('select')) { setDirty(true); renderHero(); } });
$('btnSave').addEventListener('click', save);
$('btnReload').addEventListener('click', () => held.id ? openCustomer(held.id) : newCustomer());

// Vai trò khách hàng -> mở hồ sơ của chính mình; quản trị -> mở khách đầu tiên
const role = getRole();
if (role?.kind === 'customer') {
  // Khách hàng: chỉ mở hồ sơ của mình (không gọi API danh sách khách – API đó chỉ dành cho quản trị)
  $('status').disabled = true;
  col.className = 'col-12 col-xl-10 mx-auto profile-col';   // không có cột danh sách khách -> hồ sơ chiếm cả hàng
  openCustomer(role.id).catch(err => showError('msg', err));
} else {
  loadList(1).catch(err => showError('msg', err));
}
