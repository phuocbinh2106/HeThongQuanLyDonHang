// =============================================================================
// M3 – Danh sách đơn. Gọi GET /api/orders?customerId=&status=&from=&to=&q=&page=&pageSize=
// Lọc theo khách = "Đơn của tôi" (truy vấn Q1 của phần tối ưu).
// =============================================================================
const $ = id => document.getElementById(id);
const form = $('filterForm');
let page = 1;
const PAGE_SIZE = 20;

const STATUSES = ['PENDING', 'CONFIRMED', 'PACKING', 'SHIPPING', 'DELIVERED', 'CANCELLED', 'RETURNED'];
const STATUS_COLOR = {
  PENDING: 'secondary', CONFIRMED: 'info', PACKING: 'primary', SHIPPING: 'warning',
  DELIVERED: 'success', CANCELLED: 'dark', RETURNED: 'danger',
};
const statusBadge = s => `<span class="badge text-bg-${STATUS_COLOR[s] || 'light'}">${escapeHtml(s)}</span>`;

async function loadCustomers() {
  const { data } = await api('/api/customers');
  form.customerId.insertAdjacentHTML('beforeend', data.map(c =>
    `<option value="${c.id}">#${c.id} – ${escapeHtml(c.fullName)} (${c.orders} đơn)</option>`).join(''));
  // Vai trò khách hàng (cookie ecom_user=customer:N) -> mặc định xem "đơn của tôi"
  const m = decodeURIComponent(document.cookie).match(/ecom_user=customer:(\d+)/);
  if (m) form.customerId.value = m[1];
}

function query() {
  const p = new URLSearchParams();
  for (const [k, v] of new FormData(form)) if (v) p.set(k, v);
  p.set('page', page); p.set('pageSize', PAGE_SIZE);
  return p.toString();
}

async function load() {
  $('msg').innerHTML = '';
  try {
    const { data } = await api('/api/orders?' + query());
    $('myBadge').hidden = !form.customerId.value;
    $('sql').textContent = data.sql;
    renderChips(data.statusCounts);
    $('rows').innerHTML = data.items.map(rowHtml).join('') ||
      '<tr><td colspan="8" class="text-center text-muted">Không có đơn phù hợp</td></tr>';
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    $('pageInfo').textContent = `${data.total} đơn · trang ${data.page}/${pages}`;
    $('btnPrev').disabled = data.page <= 1;
    $('btnNext').disabled = data.page >= pages;
  } catch (err) { showError('msg', err); }
}

function renderChips(counts) {
  const cur = form.status.value;
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const chip = (val, label, n) => `<button type="button" data-status="${val}"
      class="btn btn-sm ${cur === val ? 'btn-dark' : 'btn-outline-secondary'}">${label} <span class="badge text-bg-light">${n}</span></button>`;
  $('statusChips').innerHTML = chip('', 'Tất cả', all) +
    STATUSES.map(s => chip(s, s, counts[s] || 0)).join('');
}

function rowHtml(o) {
  let pay;
  if (o.paidAmount >= o.totalAmount && o.totalAmount > 0) pay = '<span class="text-success">Đã trả đủ</span>';
  else if (o.paidAmount > 0) pay = `<span class="text-warning">Trả ${fmtMoney(o.paidAmount)}</span>`;
  else if (o.status === 'CANCELLED' || o.status === 'RETURNED') pay = '<span class="text-muted">— (hoàn/không thu)</span>';
  else pay = '<span class="text-muted">Chưa trả</span>';
  return `<tr>
    <td><a href="/Orders/Details/${o.orderId}">${escapeHtml(o.orderNo)}</a></td>
    <td>${escapeHtml(o.orderDate.replace('T', ' ').slice(0, 16))}</td>
    <td>${escapeHtml(o.customerName)}</td>
    <td>${statusBadge(o.status)}</td>
    <td class="text-end">${o.itemCount}</td>
    <td class="text-end">${fmtMoney(o.totalAmount)}</td>
    <td>${pay}</td>
    <td>${escapeHtml(o.carrier ?? '')}</td>
  </tr>`;
}

// ---------- Sự kiện ----------
form.addEventListener('submit', e => { e.preventDefault(); page = 1; load(); });
form.addEventListener('reset', () => setTimeout(() => { form.status.value = ''; page = 1; load(); }, 0));
form.customerId.addEventListener('change', () => { page = 1; load(); });
$('statusChips').addEventListener('click', e => {
  const b = e.target.closest('button[data-status]'); if (!b) return;
  form.status.value = b.dataset.status; page = 1; load();
});
$('btnPrev').addEventListener('click', () => { page--; load(); });
$('btnNext').addEventListener('click', () => { page++; load(); });

loadCustomers().then(load).catch(err => showError('msg', err));
