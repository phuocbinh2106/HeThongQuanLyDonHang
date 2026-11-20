// =============================================================================
// M3 – Danh sách đơn. Gọi GET /api/orders?customerId=&status=&from=&to=&q=&page=&pageSize=
// Lọc theo khách = "Đơn của tôi" (truy vấn Q1 của phần tối ưu).
// =============================================================================
const $ = id => document.getElementById(id);
const form = $('filterForm');
let page = 1;
const PAGE_SIZE = 20;

const STATUSES = ['PENDING', 'CONFIRMED', 'PACKING', 'SHIPPING', 'DELIVERED', 'CANCELLED', 'RETURNED'];
const statusBadge = s => statusPill(s);   // nhãn trạng thái dùng chung (shopia.js)

// Ô tìm khách (shopia.js): gõ để tìm phía server, không tải danh sách tất cả khách.
// Chọn / bỏ chọn khách thì lọc lại ngay.
const picker = customerPicker($('custPicker'), { onChange: () => { page = 1; load(); } });

async function loadCustomers() {
  // Vai trò khách hàng (cookie ecom_user=customer:N) -> mặc định xem "đơn của tôi"
  const m = decodeURIComponent(document.cookie).match(/ecom_user=customer:(\d+)/);
  // Link từ trang khách hàng: /Orders?customerId=N (ưu tiên hơn cookie)
  const id = new URLSearchParams(location.search).get('customerId') || m?.[1];
  if (id && roleKind() === 'admin') await picker.set(id);
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
    // Nhãn phạm vi dữ liệu: khách hàng luôn là "đơn của tôi" (truy vấn Q1), người bán là đơn có sản phẩm của shop
    const k = roleKind();
    $('myBadge').hidden = !(form.customerId.value || k === 'customer' || k === 'seller');
    $('myBadge').textContent = k === 'seller' ? 'Đơn có sản phẩm của shop' : 'Đơn của tôi · truy vấn Q1';
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
  // tab trạng thái: nhãn tiếng Việt, title là mã gốc trong cột orders.status
  const chip = (val, label, n) => `<button type="button" data-status="${val}" title="${val || 'tất cả'}"
      class="${cur === val ? 'active' : ''}">${label}<span class="count">${n}</span></button>`;
  $('statusChips').innerHTML = chip('', 'Tất cả', all) +
    STATUSES.map(s => chip(s, STATUS_VI[s], counts[s] || 0)).join('');
}

function rowHtml(o) {
  let pay;
  if (o.paidAmount >= o.totalAmount && o.totalAmount > 0) pay = '<span class="text-success">Đã trả đủ</span>';
  else if (o.paidAmount > 0) pay = `<span class="text-warning">Trả ${fmtMoney(o.paidAmount)}</span>`;
  else if (o.status === 'CANCELLED' || o.status === 'RETURNED') pay = '<span class="text-muted">— (hoàn/không thu)</span>';
  else pay = '<span class="text-muted">Chưa trả</span>';
  return `<tr>
    <td><a class="fw-semibold mono" href="/Orders/Details/${o.orderId}">${escapeHtml(o.orderNo)}</a></td>
    <td>${escapeHtml(o.orderDate.replace('T', ' ').slice(0, 16))}</td>
    <td><span class="d-inline-flex align-items-center gap-2"><span class="avatar" style="width:28px;height:28px;font-size:.68rem">${escapeHtml(initials(o.customerName))}</span>${escapeHtml(o.customerName)}</span></td>
    <td>${statusBadge(o.status)}</td>
    <td class="text-end">${o.itemCount}</td>
    <td class="text-end fw-semibold">${fmtMoney(o.totalAmount)}</td>
    <td>${pay}</td>
    <td>${escapeHtml(o.carrier ?? '')}</td>
  </tr>`;
}

// ---------- Sự kiện ----------
form.addEventListener('submit', e => { e.preventDefault(); page = 1; load(); });
form.addEventListener('reset', () => setTimeout(() => { picker.clear(false); form.status.value = ''; page = 1; load(); }, 0));
$('statusChips').addEventListener('click', e => {
  const b = e.target.closest('button[data-status]'); if (!b) return;
  form.status.value = b.dataset.status; page = 1; load();
});
$('btnPrev').addEventListener('click', () => { page--; load(); });
$('btnNext').addEventListener('click', () => { page++; load(); });

loadCustomers().then(load).catch(err => showError('msg', err));
