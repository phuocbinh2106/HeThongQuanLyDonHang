// =============================================================================
// Đăng bán sản phẩm (người bán / quản trị). Gọi:
//   GET  /api/sellers                       (tên shop)
//   GET  /api/products/facets?categoryId=   (cây danh mục + thuộc tính JSON đã có trong danh mục)
//   POST /api/products                      (MỘT tài liệu PRODUCT_DV -> INSERT INTO product_dv)
//   POST /api/products/{id}/image           (ảnh, sau khi đã có _id)
// Biểu mẫu chỉ là cách nhập tiện hơn: thứ gửi lên server vẫn là tài liệu JSON hiện ở khung bên phải.
// =============================================================================
const $ = id => document.getElementById(id);
const role = getRole();
const TYPES = { string: 'chữ', number: 'số', array: 'danh sách', boolean: 'đúng/sai' };
let sellers = [], categories = [];

// ---------- Nạp dữ liệu chọn ----------
async function init() {
  const [{ data: ss }, { data: f }] = await Promise.all([api('/api/sellers'), api('/api/products/facets')]);
  sellers = ss; categories = f.categories;
  // Người bán: chỉ shop của mình (server cũng ép seller.sellerId = chính mình). Quản trị: chọn shop bất kỳ.
  const list = role?.kind === 'seller' ? ss.filter(s => s.id === role.id) : ss;
  $('seller').innerHTML = list.map(s => `<option value="${s.id}">#${s.id} – ${escapeHtml(s.shopName)}</option>`).join('');
  $('seller').disabled = role?.kind === 'seller';
  $('category').innerHTML = '<option value="">— chọn danh mục —</option>' + categories.map(c =>
    `<option value="${c.id}">${'&nbsp;&nbsp;&nbsp;'.repeat(c.level - 1)}${escapeHtml(c.name)}</option>`).join('');
  render();
}

// ---------- Thuộc tính JSON ----------
// Một dòng thuộc tính: tên (khoá JSON), kiểu, giá trị. suggested = gợi ý từ dataguide của danh mục.
function attrRow(key = '', type = 'string', suggested = false) {
  const tr = document.createElement('tr');
  if (suggested) tr.dataset.suggested = '1';
  tr.innerHTML = `
    <td><input class="form-control form-control-sm k" value="${escapeHtml(key)}" placeholder="ví dụ: color" /></td>
    <td><select class="form-select form-select-sm t">${Object.entries(TYPES).map(([v, l]) =>
      `<option value="${v}" ${v === type ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
    <td class="vcell"></td>
    <td><button type="button" class="btn btn-sm btn-link text-danger p-0 del" title="Bỏ thuộc tính">✕</button></td>`;
  setValueInput(tr);
  return tr;
}

// Ô giá trị đổi theo kiểu: đúng/sai -> chọn true/false; còn lại -> ô nhập
function setValueInput(tr, keep = '') {
  const type = tr.querySelector('.t').value;
  tr.querySelector('.vcell').innerHTML = type === 'boolean'
    ? `<select class="form-select form-select-sm v"><option value="">(bỏ trống)</option><option value="true">true</option><option value="false">false</option></select>`
    : `<input class="form-control form-control-sm v" ${type === 'number' ? 'type="number" step="any"' : ''}
         placeholder="${type === 'array' ? 'S, M, L' : ''}" />`;
  tr.querySelector('.v').value = keep;
}

// Đổi danh mục -> gợi ý các khoá JSON đã có trong danh mục đó (giữ giá trị đã nhập nếu trùng khoá)
async function loadSuggestions() {
  const cat = $('category').value;
  const typed = Object.fromEntries([...$('attrRows').rows].map(r => [r.querySelector('.k').value, r.querySelector('.v').value]));
  [...$('attrRows').rows].filter(r => r.dataset.suggested && !r.querySelector('.v').value).forEach(r => r.remove());
  if (!cat) return render();
  const { data } = await api(`/api/products/facets?categoryId=${cat}`);
  const have = new Set([...$('attrRows').rows].map(r => r.querySelector('.k').value));
  for (const k of data.attributeKeys) {
    const key = k.path.replace(/^\$\./, '');
    if (key.includes('[') || key.includes('.') || key === 'brand' || key === 'warrantyMonths' || have.has(key)) continue;
    const tr = attrRow(key, TYPES[k.type] ? k.type : 'string', true);
    if (typed[key]) tr.querySelector('.v').value = typed[key];
    $('attrRows').append(tr);
  }
  render();
}

// Đọc giá trị một dòng theo kiểu; trả undefined nếu bỏ trống
function readValue(type, raw) {
  raw = raw.trim();
  if (raw === '') return undefined;
  if (type === 'number') return Number(raw);
  if (type === 'boolean') return raw === 'true';
  // "S, M, L" -> ["S","M","L"]. Giữ dạng chuỗi: size "30", "32" trong dữ liệu mẫu là chuỗi và bộ lọc so sánh chuỗi
  if (type === 'array') return raw.split(',').map(x => x.trim()).filter(Boolean);
  return raw;
}

// ---------- Ráp tài liệu JSON ----------
function buildDoc() {
  const attributes = {};
  const brand = $('brand').value.trim();
  if (brand) attributes.brand = brand;                       // bỏ trống -> JSON Schema của CSDL từ chối (demo TC-11)
  const w = $('warrantyMonths').value.trim();
  if (w !== '') attributes.warrantyMonths = Number(w);
  for (const r of $('attrRows').rows) {
    const k = r.querySelector('.k').value.trim();
    const v = readValue(r.querySelector('.t').value, r.querySelector('.v').value);
    if (k && v !== undefined) attributes[k] = v;
  }
  const num = id => $(id).value.trim() === '' ? null : Number($(id).value);
  return {
    sku: $('sku').value.trim(),
    productName: $('productName').value.trim(),
    price: num('price'),
    stockQty: num('stockQty'),
    status: $('status').value,
    attributes,
    seller: { sellerId: Number($('seller').value) },
    category: { categoryId: $('category').value ? Number($('category').value) : null },
  };
}

// Xem trước: khung JSON + thẻ sản phẩm (dùng chung hàm productCard của trang Sản phẩm)
let previewUrl = null;
function render() {
  const doc = buildDoc();
  $('preview').textContent = JSON.stringify(doc, null, 2);
  const shop = sellers.find(s => s.id === doc.seller.sellerId)?.shopName;
  const cat = categories.find(c => c.id === doc.category.categoryId)?.name;
  $('cardPreview').innerHTML = productCard({
    ...doc, _id: 'mới', productName: doc.productName || 'Tên sản phẩm', price: doc.price ?? 0, stockQty: doc.stockQty ?? 0,
    seller: { shopName: shop }, category: { categoryName: cat },
  }, { buy: false });
  const thumb = $('cardPreview').querySelector('.thumb');
  thumb.querySelector('img.photo')?.remove();               // chưa có mã sản phẩm -> chưa có ảnh trên server
  if (previewUrl) thumb.insertAdjacentHTML('beforeend', `<img class="photo" src="${previewUrl}" alt="">`);
}

// Kiểm tra phía trình duyệt cho các ô cơ bản (CSDL vẫn kiểm tra lại: UNIQUE sku, CHECK giá/tồn ≥ 0, JSON Schema)
function validate(doc) {
  if (!doc.productName) return 'Nhập tên sản phẩm.';
  if (!doc.sku) return 'Nhập mã SKU (hoặc bấm Tự sinh).';
  if (!doc.category.categoryId) return 'Chọn danh mục.';
  if (doc.price == null || Number.isNaN(doc.price)) return 'Nhập giá bán.';
  if (doc.stockQty == null || !Number.isInteger(doc.stockQty)) return 'Tồn kho phải là số nguyên.';
  for (const [k, v] of Object.entries(doc.attributes)) if (typeof v === 'number' && Number.isNaN(v)) return `Thuộc tính "${k}" phải là số.`;
  const f = $('image').files[0];
  if (f && f.size > 2 * 1024 * 1024) return 'Ảnh tối đa 2 MB.';
  return null;
}

// ---------- Gửi ----------
async function submit(e) {
  e.preventDefault();
  $('formMsg').innerHTML = ''; $('resultBox').innerHTML = '';
  const doc = buildDoc();
  const err = validate(doc);
  if (err) { showError('formMsg', { problem: { title: err } }); return; }

  $('btnSubmit').disabled = true;
  try {
    // 1) Tài liệu JSON -> INSERT INTO product_dv
    const { data: created, status } = await api('/api/products', { method: 'POST', body: doc });
    const id = created._id;
    // 2) Ảnh (nếu có) -> tệp trên server
    let imgNote = '';
    const file = $('image').files[0];
    if (file) {
      try { await uploadProductImage(id, file); imgNote = ' Ảnh đã tải lên.'; }
      catch (ie) { imgNote = ` <b>Nhưng tải ảnh lỗi:</b> ${escapeHtml(ie.problem?.detail || ie.message)}`; }
    }
    $('resultBox').innerHTML = `
      <div class="alert alert-success">
        <div><b>Đã đăng bán sản phẩm #${id}</b> <span class="badge bg-secondary ms-1">HTTP ${status}</span>${imgNote}</div>
        <div class="mt-1 small">Tài liệu trả về đã có <code>_id</code>, tên shop, tên danh mục (Oracle đọc lại từ bảng)
          và <code>_metadata.etag</code>.</div>
        <div class="d-flex gap-2 mt-2">
          <a class="btn btn-sm btn-primary" href="/Products?q=${encodeURIComponent(created.productName)}">Xem trong danh sách</a>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="btnAgain">Đăng tiếp</button>
        </div>
      </div>`;
    $('preview').textContent = JSON.stringify(created, null, 2);
    $('btnAgain').addEventListener('click', clearForm);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (ex) {
    showError('formMsg', ex);
  } finally {
    $('btnSubmit').disabled = false;
  }
}

function clearForm() {
  const seller = $('seller').value;
  $('productForm').reset();
  $('seller').value = seller;
  $('attrRows').innerHTML = '';
  $('formMsg').innerHTML = ''; $('resultBox').innerHTML = '';
  setPreviewImage(null);
  render();
}

// Sinh SKU từ tên: bỏ dấu, viết hoa, nối bằng "-", thêm 4 số ngẫu nhiên cho khỏi trùng
function makeSku() {
  const base = $('productName').value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'D')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').slice(0, 4).map(w => w.slice(0, 6)).join('-');
  $('sku').value = `${base || 'SP'}-${Math.floor(1000 + Math.random() * 9000)}`.slice(0, 40);
  render();
}

function setPreviewImage(file) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = file ? URL.createObjectURL(file) : null;
  $('imgPreview').innerHTML = previewUrl ? `<img src="${previewUrl}" alt="">` : '<span class="text-muted">Chưa chọn ảnh</span>';
  render();
}

// ---------- Sự kiện ----------
$('productForm').addEventListener('input', render);
$('productForm').addEventListener('change', e => {
  if (e.target.id === 'category') loadSuggestions().catch(err => showError('formMsg', err));
  if (e.target.classList.contains('t')) setValueInput(e.target.closest('tr'));
  if (e.target.id === 'image') setPreviewImage(e.target.files[0]);
  render();
});
$('attrRows').addEventListener('click', e => {
  if (e.target.closest('.del')) { e.target.closest('tr').remove(); render(); }
});
$('btnAddAttr').addEventListener('click', () => { $('attrRows').append(attrRow()); render(); });
$('btnSku').addEventListener('click', makeSku);
$('btnClear').addEventListener('click', clearForm);
$('productForm').addEventListener('submit', submit);

init().catch(err => showError('formMsg', err));
