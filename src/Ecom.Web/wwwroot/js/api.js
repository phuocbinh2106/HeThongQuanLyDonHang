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
