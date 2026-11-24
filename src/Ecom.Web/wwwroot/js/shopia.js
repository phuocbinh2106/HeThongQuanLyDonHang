// =============================================================================
// shopia.js: các hàm giao diện dùng chung của Shopia (chỉ hiển thị, KHÔNG gọi CSDL).
//   icon(name)        biểu tượng SVG vẽ sẵn (không cần thư viện ngoài -> chạy offline)
//   productThumb(p)   ảnh sản phẩm (GET /api/products/{id}/image); chưa có ảnh -> biểu tượng danh mục
//   statusPill(s)     nhãn trạng thái đơn (tiếng Việt + mã gốc trong CSDL)
//   orderStepper(...) thanh tiến trình vòng đời đơn PENDING -> ... -> DELIVERED
// =============================================================================
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  bag: '<path d="M5 8h14l-1.2 12H6.2L5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  cart: '<path d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.2"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
  orders: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6V7H9z"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4"/>',
  chart: '<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="7" rx=".8"/><rect x="10.5" y="6" width="3" height="12" rx=".8"/><rect x="15.5" y="13.5" width="3" height="4.5" rx=".8"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.8" cy="9.5" r="2.5"/><path d="M15.8 14.6c2.4-.2 4.3 1.4 4.8 4.4"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/>',
  store: '<path d="M4 9.5 5.5 4.5h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 11.5V20h13v-8.5"/><path d="M10 20v-4.5h4V20"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6l7-2.5Z"/><path d="m8.8 12 2.2 2.2 4.3-4.4"/>',
  box: '<path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9L12 3.5Z"/><path d="M4 7.5 12 11.5l8-4M12 11.5v9"/>',
  phone: '<rect x="7" y="2.8" width="10" height="18.4" rx="2.2"/><path d="M10.5 18h3"/>',
  laptop: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.8 18.5h18.4l-1.2-3.5H4z"/>',
  shirt: '<path d="M9 3.8 4 6.5l1.8 4 2.2-1v10.7h8V9.5l2.2 1 1.8-4-5-2.7c-.4 1.4-1.6 2.3-3 2.3S9.4 5.2 9 3.8Z"/>',
  book: '<path d="M5 4.5h5.5A2.5 2.5 0 0 1 13 7v13a2 2 0 0 0-2-2H5z"/><path d="M19 4.5h-3.5A2.5 2.5 0 0 0 13 7v13a2 2 0 0 1 2-2h4z"/>',
  bottle: '<path d="M10 3h4v3h-4z"/><path d="M9.5 6h5l1 3v10.5a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 8.5 19.5V9z"/><path d="M8.5 12h7"/>',
  headphones: '<path d="M4.5 15v-3a7.5 7.5 0 0 1 15 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/>',
  database: '<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6"/><path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8"/>',
  braces: '<path d="M8.5 4.5c-2 0-2.5 1-2.5 2.5v2.5c0 1.2-.7 2-2 2.5 1.3.5 2 1.3 2 2.5V17c0 1.5.5 2.5 2.5 2.5"/><path d="M15.5 4.5c2 0 2.5 1 2.5 2.5v2.5c0 1.2.7 2 2 2.5-1.3.5-2 1.3-2 2.5V17c0 1.5-.5 2.5-2.5 2.5"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  zap: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  truck: '<path d="M3 6.5h11v9H3z"/><path d="M14 9.5h3.8l3.2 3.3v2.7h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4v5h-5"/>',
  swap: '<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
  sparkle: '<path fill="currentColor" stroke="none" d="M12 2.5c.7 3.9 2.4 6.7 7.5 9.5-5.1 2.8-6.8 5.6-7.5 9.5-.7-3.9-2.4-6.7-7.5-9.5 5.1-2.8 6.8-5.6 7.5-9.5Z"/>',
  github: '<path d="M9 19c-4 1.3-4-2-5.5-2.5M14.5 21v-3.2c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6.2 0C6.1 3.1 5.1 3.4 5.1 3.4A4.3 4.3 0 0 0 5 6.6a4.6 4.6 0 0 0-1.3 3.2c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
};

function icon(name, cls = 'icon') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.box}</svg>`;
}

// ---------- Ảnh sản phẩm ----------
// Ảnh là tệp trên server (không nằm trong CSDL). Nền phía sau là biểu tượng + màu theo danh mục:
// sản phẩm chưa có ảnh (404) thì thẻ <img> tự gỡ, biểu tượng hiện ra.
function categoryLook(name = '') {
  const n = name.toLowerCase();
  if (n.includes('phụ kiện')) return { icon: 'headphones', c: 4 };
  if (n.includes('điện thoại')) return { icon: 'phone', c: 1 };
  if (n.includes('laptop') || n.includes('máy tính')) return { icon: 'laptop', c: 5 };
  if (n.includes('áo') || n.includes('quần') || n.includes('thời trang')) return { icon: 'shirt', c: 0 };
  if (n.includes('mỹ phẩm') || n.includes('làm đẹp')) return { icon: 'bottle', c: 3 };
  if (n.includes('sách')) return { icon: 'book', c: 6 };
  return { icon: 'bag', c: 2 };
}

// Đổi khi vừa tải ảnh mới lên để trình duyệt không dùng ảnh cũ trong bộ nhớ đệm
let imageVersion = '';
function bumpImageVersion() { imageVersion = '?v=' + Date.now(); }
function productImageUrl(id) { return `/api/products/${id}/image${imageVersion}`; }

// Tải ảnh sản phẩm lên: POST /api/products/{id}/image (multipart/form-data, field "file").
// Không dùng api() vì body là FormData, không phải JSON. Lỗi -> ApiError như api().
async function uploadProductImage(id, file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`/api/products/${id}/image`, { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { title: text }; }
  if (!res.ok) throw new ApiError(res.status, data);
  bumpImageVersion();
  return data;
}

function productThumb(p, size = '') {
  const look = categoryLook(p.category?.categoryName || p.categoryName || '');
  const brand = p.attributes?.brand;
  const id = p._id ?? p.productId;
  const img = id ? `<img class="photo" src="${productImageUrl(id)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<div class="thumb c${look.c} ${size}">${icon(look.icon, 'cat')}${img}
    ${brand && size !== 'sm' ? `<span class="brand">${escapeHtml(brand)}</span>` : ''}</div>`;
}

// Nhãn tiếng Việt cho thuộc tính sản phẩm (khách hàng không thấy tên khoá JSON như ramGb, warrantyMonths)
const ATTR_VI = {
  color: v => `Màu ${v}`, ramGb: v => `RAM ${v} GB`, storageGb: v => `${v} GB`, screenInch: v => `Màn hình ${v}"`,
  size: v => `Size ${v}`, material: v => v, warrantyMonths: v => `Bảo hành ${v} tháng`, cpu: v => v,
  batteryHours: v => `Pin ${v} giờ`, capacityMah: v => `${v} mAh`, powerW: v => `${v} W`, volumeMl: v => `${v} ml`,
  spf: v => `SPF ${v}`, skinType: v => v, origin: v => `Xuất xứ ${v}`, author: v => v, pages: v => `${v} trang`,
  language: v => (v === 'vi' ? 'Tiếng Việt' : v === 'en' ? 'Tiếng Anh' : v), coverType: v => v, weightG: v => `${v} g`,
  wireless: v => (v ? 'Không dây' : 'Có dây'), foldable: v => (v ? 'Màn hình gập' : ''), waterproof: v => (v ? 'Chống nước' : ''),
  vegan: v => (v ? 'Thuần chay' : ''), compatibleWith: v => `Dùng cho ${v}`,
};
const isTechRole = () => ['seller', 'admin'].includes(roleKind());

// Thẻ sản phẩm từ một tài liệu PRODUCT_DV. opts.json = hiện nút "JSON" (mở tài liệu để xem / sửa)
function productCard(p, opts = {}) {
  const tech = isTechRole();
  const attrs = Object.entries(p.attributes || {})
    .map(([k, v]) => [k, Array.isArray(v) ? v.join('/') : v])
    .map(([k, v]) => [k, k === 'brand' || tech ? v : (ATTR_VI[k] ? ATTR_VI[k](v) : `${k}: ${v}`)])
    .filter(([, v]) => v !== '' && v !== null && v !== undefined);
  const chips = attrs.slice(0, 4).map(([k, v]) =>
    `<span class="chip ${k === 'brand' ? 'brand' : ''}"${tech ? ` title="$.${escapeHtml(k)}"` : ''}>${k === 'brand' || !tech ? '' : escapeHtml(k) + ': '}${escapeHtml(v)}</span>`).join('')
    + (attrs.length > 4 ? `<span class="chip">+${attrs.length - 4}</span>` : '');
  const inactive = p.status !== 'ACTIVE';
  const stock = p.stockQty === 0 ? '<span class="stock out">Hết hàng</span>'
    : p.stockQty <= 5 ? `<span class="stock low">Còn ${p.stockQty}</span>` : `<span class="stock">Kho: ${p.stockQty}</span>`;
  return `<div class="product-card ${inactive ? 'inactive' : ''}">
    ${inactive ? '<span class="flag badge text-bg-secondary">Ngừng bán</span>' : ''}
    <span class="id-tag">#${p._id}</span>
    ${productThumb(p)}
    <div class="body">
      <div class="name" title="${escapeHtml(p.productName)}">${escapeHtml(p.productName)}</div>
      <div class="meta"><span>${escapeHtml(p.seller?.shopName || '')}</span><span>${escapeHtml(p.category?.categoryName || '')}</span></div>
      <div class="attrs">${chips}</div>
      <div class="d-flex justify-content-between align-items-baseline">
        <span class="price">${fmtMoney(p.price)}</span><small>${stock}</small>
      </div>
      <div class="actions">
        ${opts.json ? `<button class="btn btn-sm btn-outline-primary" data-id="${p._id}" title="Xem / sửa tài liệu PRODUCT_DV">${icon('braces')} JSON</button>` : ''}
        ${opts.buy === false ? '' : `<a class="btn btn-sm btn-primary" href="/Orders/Create?add=${p._id}">${icon('cart')} Mua</a>`}
      </div>
    </div>
  </div>`;
}

// ---------- Trạng thái đơn ----------
const STATUS_VI = {
  PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', PACKING: 'Đang đóng gói', SHIPPING: 'Đang giao',
  DELIVERED: 'Đã giao', CANCELLED: 'Đã huỷ', RETURNED: 'Trả hàng',
};
// Hiện nhãn tiếng Việt và kèm mã gốc (giá trị thật trong cột orders.status) để đối chiếu với CSDL
function statusPill(s) {
  return `<span class="status-pill st-${escapeHtml(s)}" title="orders.status = '${escapeHtml(s)}'">${escapeHtml(STATUS_VI[s] || s)}<small>${escapeHtml(s)}</small></span>`;
}

// Thanh tiến trình: các bước chính; nếu đơn bị huỷ / trả thì thêm bước kết thúc màu đỏ.
// history: mảng history[] của tài liệu ORDER_DV (newStatus, changedAt) để hiện thời điểm từng bước.
function orderStepper(status, history = []) {
  const MAIN = ['PENDING', 'CONFIRMED', 'PACKING', 'SHIPPING', 'DELIVERED'];
  const ICON = { PENDING: 'orders', CONFIRMED: 'check', PACKING: 'box', SHIPPING: 'truck', DELIVERED: 'shield', CANCELLED: 'x', RETURNED: 'swap' };
  const when = {};
  for (const h of history) when[h.newStatus] = h.changedAt;
  const reached = new Set(history.map(h => h.newStatus));
  reached.add(status);
  const stop = status === 'CANCELLED' || status === 'RETURNED';
  // bước cuối cùng đã đạt trên tuyến chính
  const lastMain = Math.max(...MAIN.map((s, i) => reached.has(s) ? i : -1));
  const steps = MAIN.map((s, i) => ({ s, done: i <= lastMain, current: !stop && s === status }));
  if (stop) steps.splice(lastMain + 1, MAIN.length, { s: status, stop: true });
  const t = v => v ? `<time>${escapeHtml(String(v).replace('T', ' ').slice(5, 16))}</time>` : '';
  return `<div class="stepper">${steps.map(x => `
    <div class="st ${x.done ? 'done' : ''} ${x.current ? 'current' : ''} ${x.stop ? 'stop' : ''}">
      <div class="dot">${icon(ICON[x.s])}</div><b>${STATUS_VI[x.s]}</b>${t(when[x.s])}
    </div>`).join('')}</div>`;
}

// Tô màu JSON cho dễ đọc (chỉ hiển thị; nội dung giữ nguyên)
function highlightJson(text) {
  return escapeHtml(text).replace(
    /(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b(true|false|null)\b/g,
    (m, str, colon, num, lit) => str ? (colon ? `<span class="json-key">${str}</span>${colon}` : `<span class="json-str">${str}</span>`)
      : num ? `<span class="json-num">${num}</span>` : `<span class="json-lit">${lit}</span>`);
}

// Chữ cái đầu để làm avatar
const initials = name => String(name || '?').trim().split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase();

// =============================================================================
// Ô "gõ để tìm khách" (autocomplete) – thay cho dropdown chứa TẤT CẢ khách.
// Mỗi lần gõ (chờ 250 ms) gọi GET /api/customers?q=...&limit=8: CSDL lọc và cắt trang, trình duyệt
// chỉ nhận tối đa 8 dòng dù bảng có hàng nghìn khách.
//   el        : phần tử <div class="cust-picker"> chứa <input type="text"> và <input type="hidden">
//   onChange  : gọi khi chọn / xoá khách, tham số (id | null, item | null)
// Trả về { set(id), clear(), get value() }.
// =============================================================================
//   url       : API tìm khách (mặc định /api/customers – chỉ quản trị; màn hình chọn vai trò dùng /api/session/customers)
//   readonly  : true = khoá ô (khách hàng chỉ được chọn chính mình)
function customerPicker(el, { onChange = () => {}, allowClear = true, limit = 8, url = '/api/customers', readonly = false } = {}) {
  if (readonly) allowClear = false;
  const input = el.querySelector('input[type=text]');
  const hidden = el.querySelector('input[type=hidden]');
  const menu = document.createElement('div');
  menu.className = 'cp-menu'; menu.hidden = true;
  el.appendChild(menu);
  let clearBtn = null;
  if (allowClear) {
    clearBtn = document.createElement('button');
    clearBtn.type = 'button'; clearBtn.className = 'cp-clear'; clearBtn.title = 'Bỏ chọn'; clearBtn.innerHTML = '&times;';
    el.appendChild(clearBtn);
  }
  let items = [], active = -1, timer = null, seq = 0;
  let currentLabel = '';   // nhãn của khách đang chọn (để trả lại khi người dùng gõ dở rồi bỏ đi)

  const label = c => `#${c.id} – ${c.fullName}`;
  const sync = () => { if (clearBtn) clearBtn.hidden = !hidden.value; el.classList.toggle('has-value', !!hidden.value); };

  function render(total, q) {
    if (!items.length) {
      menu.innerHTML = `<div class="cp-empty">Không có khách khớp “${escapeHtml(q)}”</div>`;
    } else {
      menu.innerHTML = items.map((c, i) => `
        <div class="cp-item ${i === active ? 'active' : ''}" data-i="${i}">
          <span class="avatar ${c.status !== 'ACTIVE' ? 'muted' : ''}">${escapeHtml(initials(c.fullName))}</span>
          <div class="cp-text"><b>#${c.id} ${escapeHtml(c.fullName)}</b>
            ${c.status !== 'ACTIVE' ? `<span class="badge text-bg-danger ms-1">${escapeHtml(c.status)}</span>` : ''}
            <small>${[c.email, c.phone, c.orders != null ? c.orders + ' đơn' : null].filter(Boolean).map(escapeHtml).join(' · ')}</small></div>
        </div>`).join('') +
        `<div class="cp-foot">Hiển thị ${items.length} / ${total} khách${total > items.length ? ' – gõ thêm để thu hẹp' : ''}</div>`;
    }
    menu.hidden = false;
  }

  async function search() {
    const q = input.value.trim();
    const my = ++seq;   // bỏ kết quả của request cũ nếu người dùng đã gõ tiếp
    try {
      const { data } = await api(`${url}?limit=${limit}` + (q ? `&q=${encodeURIComponent(q)}` : ''));
      if (my !== seq) return;
      items = data.items; active = items.length ? 0 : -1;
      render(data.total, q);
    } catch (err) {
      menu.innerHTML = `<div class="cp-empty text-danger">${escapeHtml(err.message)}</div>`; menu.hidden = false;
    }
  }

  function choose(c) {
    hidden.value = c.id; input.value = currentLabel = label(c); menu.hidden = true; sync();
    onChange(c.id, c);
  }
  function clear(fire = true) {
    hidden.value = ''; input.value = currentLabel = ''; menu.hidden = true; sync();
    if (fire) onChange(null, null);
  }

  if (readonly) { input.readOnly = true; el.classList.add('locked'); }
  input.addEventListener('focus', () => { if (readonly) return; input.select(); search(); });
  input.addEventListener('input', () => { if (readonly) return; clearTimeout(timer); timer = setTimeout(search, 250); });
  input.addEventListener('keydown', e => {
    if (menu.hidden || !items.length) return;
    if (e.key === 'ArrowDown') { active = (active + 1) % items.length; e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = (active - 1 + items.length) % items.length; e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) choose(items[active]); return; }
    else if (e.key === 'Escape') { menu.hidden = true; return; }
    else return;
    menu.querySelectorAll('.cp-item').forEach((n, i) => n.classList.toggle('active', i === active));
  });
  menu.addEventListener('mousedown', e => {   // mousedown để chạy trước sự kiện blur của ô nhập
    const n = e.target.closest('.cp-item'); if (!n) return;
    e.preventDefault(); choose(items[Number(n.dataset.i)]);
  });
  input.addEventListener('blur', () => setTimeout(() => {
    menu.hidden = true;
    input.value = currentLabel;   // gõ dở rồi bỏ đi: trả lại nhãn đang chọn (hoặc trống)
  }, 150));
  clearBtn?.addEventListener('click', () => clear());

  // Chọn sẵn theo mã KH (ví dụ từ cookie vai trò, từ URL): đọc tên qua GET /api/customers/{id}
  async function set(id, fire = false) {
    if (!id) { clear(fire); return; }
    // Đọc tên khách: hồ sơ đầy đủ nếu có quyền; chưa có quyền (đang chọn vai trò) thì dùng API tìm khách của trang
    let c;
    try {
      const { data } = await api(`/api/customers/${id}`);
      c = { id: data._id, fullName: data.fullName, email: data.email, phone: data.phone, status: data.status };
    } catch {
      const { data } = await api(`${url}?limit=8&q=${encodeURIComponent(id)}`);
      c = data.items.find(x => x.id == id);
      if (!c) { clear(fire); return; }
    }
    hidden.value = c.id; input.value = currentLabel = label(c); sync();
    if (fire) onChange(c.id, c);
  }
  sync();
  return {
    set,
    clear: (fire = true) => clear(fire),
    get value() { return hidden.value; },
    get text() { return currentLabel; },
  };
}
