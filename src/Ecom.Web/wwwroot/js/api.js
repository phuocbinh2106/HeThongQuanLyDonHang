// =============================================================================
// api.js: hàm dùng chung để gọi REST API (/api/...) bằng fetch.
// - Gửi/nhận JSON.
// - Nếu server trả lỗi (ProblemDetails: title, detail, oraCode), ném ApiError để trang hiện
//   ĐÚNG nguyên nhân (hết hàng, sai trạng thái, xung đột ETag 412...).
// - Hỗ trợ ETag: trả về header ETag của response; nhận tuỳ chọn ifMatch để gửi If-Match.
// =============================================================================
class ApiError extends Error {
  constructor(status, problem) {
    super(problem?.title || `HTTP ${status}`);
    this.status = status;          // mã HTTP: 404, 409, 412, 422...
    this.problem = problem || {};  // { title, detail, oraCode, oraMessage }
  }
}

async function api(url, { method = 'GET', body, ifMatch } = {}) {
  const headers = { 'Accept': 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (ifMatch) headers['If-Match'] = ifMatch;

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) throw new ApiError(res.status, typeof data === 'object' ? data : { title: text });
  return { data, etag: res.headers.get('ETag'), status: res.status };
}

// Hiện thông báo lỗi (Bootstrap alert) vào phần tử có id cho trước
function showError(elId, err) {
  const el = document.getElementById(elId);
  if (!el) return;
  // ApiError hoặc đối tượng tự tạo dạng { problem: {...} }; còn lại (lỗi mạng...) thì in chuỗi
  const p = err?.problem ?? { title: String(err) };
  el.innerHTML = `
    <div class="alert alert-danger">
      <div><strong>${escapeHtml(p.title || 'Lỗi')}</strong>
        ${err.status ? `<span class="badge bg-secondary ms-2">HTTP ${err.status}</span>` : ''}
        ${p.oraCode ? `<span class="badge bg-dark ms-1">${escapeHtml(p.oraCode)}</span>` : ''}</div>
      ${p.detail ? `<div class="mt-1">${escapeHtml(p.detail)}</div>` : ''}
      ${p.oraMessage ? `<details class="mt-2 small"><summary>Chuỗi lỗi gốc từ Oracle</summary><pre class="mb-0">${escapeHtml(p.oraMessage)}</pre></details>` : ''}
    </div>`;
}

function showOk(elId, html) {
  const el = document.getElementById(elId);
  if (el) el.innerHTML = `<div class="alert alert-success">${html}</div>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Định dạng tiền VNĐ
const fmtMoney = n => n == null ? '' : Number(n).toLocaleString('vi-VN') + ' đ';

// =============================================================================
// VAI TRÒ (M0) – mô phỏng, không đăng nhập thật. Lưu trong cookie "ecom_user":
//   "customer:3" | "seller:2" | "admin". Server đọc cookie này (HttpContext.CurrentUser) và gửi
//   xuống Oracle qua CLIENT_IDENTIFIER -> trigger ghi vào order_status_history.changed_by.
// =============================================================================
function getRole() {
  const m = document.cookie.match(/(?:^|;\s*)ecom_user=([^;]+)/);
  const raw = m ? decodeURIComponent(m[1]) : null;
  if (!raw) return null;
  const [kind, id] = raw.split(':');
  let label = raw;
  try { label = localStorage.getItem('ecom_user_label') || raw; } catch { /* trình duyệt chặn storage */ }
  return { raw, kind, id: id ? Number(id) : null, label };
}

function setRole(raw, label) {
  document.cookie = `ecom_user=${raw}; path=/; max-age=2592000; samesite=lax`;
  try { localStorage.setItem('ecom_user_label', label || raw); } catch { /* bỏ qua */ }
}

function clearRole() {
  document.cookie = 'ecom_user=; path=/; max-age=0';
  try { localStorage.removeItem('ecom_user_label'); } catch { /* bỏ qua */ }
}

// Loại vai trò hiện tại: 'guest' | 'customer' | 'seller' | 'admin'
const roleKind = () => getRole()?.kind || 'guest';

// Phần tử có data-roles="seller,admin" chỉ hiện với các vai trò đó (chỉ là HIỂN THỊ:
// API ở server vẫn kiểm tra quyền và trả 401 / 403 nếu gọi trực tiếp).
document.addEventListener('DOMContentLoaded', () => {
  const k = roleKind();
  document.querySelectorAll('[data-roles]').forEach(el => {
    if (!el.dataset.roles.split(',').map(x => x.trim()).includes(k)) el.classList.add('d-none');
  });
});

// Hiện vai trò hiện tại ở góc phải header (avatar + tên vai trò)
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('roleBadge');
  if (!el) return;
  const r = getRole();
  const kindVi = { customer: 'Khách hàng', seller: 'Người bán', admin: 'Quản trị sàn' };
  const avatarCls = { customer: '', seller: 'gold', admin: 'dark' };
  if (!r) {
    el.innerHTML = '<span class="avatar muted">?</span><span class="who"><b>Khách</b><span>Chọn vai trò</span></span>';
    return;
  }
  // nhãn dạng "#3 – Lê Văn C" -> lấy phần tên để làm chữ cái avatar
  const name = r.label.replace(/^#\d+\s*–\s*/, '').replace(/\s*\(.*$/, '');
  const ini = r.kind === 'admin' ? 'QT' : name.trim().split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase();
  el.innerHTML = `<span class="avatar ${avatarCls[r.kind] || ''}">${escapeHtml(ini)}</span>
    <span class="who"><b>${escapeHtml(kindVi[r.kind] || r.kind)}</b><span>${escapeHtml(r.label)}</span></span>`;
});
