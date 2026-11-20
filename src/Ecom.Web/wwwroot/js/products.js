// =============================================================================
// M1 – Sản phẩm. Gọi:
//   GET  /api/products/facets?categoryId=   (cây danh mục, thương hiệu, thuộc tính JSON)
//   GET  /api/products?...bộ lọc...         (danh sách tài liệu PRODUCT_DV)
//   GET  /api/products/{id}                 (một tài liệu + ETag)
//   PUT  /api/products/{id}  If-Match       (ghi đè tài liệu, kiểm tra ETag)
//   POST /api/products                      (thêm sản phẩm bằng tài liệu JSON)
// =============================================================================
const form = document.getElementById('filterForm');
const modal = new bootstrap.Modal(document.getElementById('docModal'));
let current = { id: null, etag: null };   // tài liệu đang mở trong hộp thoại

// Mẫu tài liệu khi thêm sản phẩm mới (client chỉ cần gửi khoá sellerId / categoryId)
const NEW_TEMPLATE = {
  sku: 'NEW-SKU-001',
  productName: 'Sản phẩm mới',
  price: 100000,
  stockQty: 10,
  status: 'ACTIVE',
  attributes: { brand: 'Thương hiệu', color: 'Đen', warrantyMonths: 12 },
  seller: { sellerId: 1 },
  category: { categoryId: 1 },
};

// ---------- Bộ lọc ----------
function queryString() {
  const p = new URLSearchParams();
  for (const [k, v] of new FormData(form)) if (v !== '') p.set(k, v);
  return p.toString();
}

async function loadFacets() {
  const cat = form.categoryId.value;
  const { data } = await api('/api/products/facets' + (cat ? `?categoryId=${cat}` : ''));

  // Danh mục chỉ nạp lần đầu (giữ lựa chọn hiện tại)
  if (form.categoryId.options.length === 0) {
    form.categoryId.innerHTML = '<option value="">— tất cả —</option>' + data.categories.map(c =>
      `<option value="${c.id}">${'&nbsp;&nbsp;&nbsp;'.repeat(c.level - 1)}${escapeHtml(c.name)}</option>`).join('');
  }
  const keepBrand = form.brand.value;
  form.brand.innerHTML = '<option value="">— tất cả —</option>' +
    data.brands.map(b => `<option ${b === keepBrand ? 'selected' : ''}>${escapeHtml(b)}</option>`).join('');

  // Hiện tên thuộc tính (bỏ tiền tố "$."), kiểu dữ liệu bằng tiếng Việt; đường dẫn JSON gốc để trong tooltip
  const TYPE_VI = { string: 'chữ', number: 'số', array: 'danh sách', boolean: 'đúng/sai', object: 'đối tượng' };
  document.getElementById('attrKeys').innerHTML = data.attributeKeys.map(k =>
    `<span class="badge text-bg-light border me-1 mb-1" title="${escapeHtml(k.path)} (kiểu ${escapeHtml(k.type)})">
       ${escapeHtml(k.path.replace(/^\$\./, ''))} <span class="text-muted">${escapeHtml(TYPE_VI[k.type] || k.type)}</span></span>`).join('');
}

async function loadProducts() {
  document.getElementById('listMsg').innerHTML = '';
  try {
    const { data } = await api('/api/products?' + queryString());
    document.getElementById('count').textContent = data.count;
    document.getElementById('filterSql').textContent = data.filterSql;
    // mỗi thẻ là một tài liệu PRODUCT_DV (hàm productCard ở shopia.js)
    document.getElementById('productRows').innerHTML = data.items.map(p => productCard(p, { json: true, buy: roleKind() !== 'seller' })).join('') ||
      `<div class="empty-state" style="grid-column:1/-1">${icon('search')}<div>Không có sản phẩm phù hợp</div></div>`;
  } catch (err) { showError('listMsg', err); }
}

// ---------- Hộp thoại tài liệu ----------
async function openDoc(id) {
  current = { id, etag: null };
  document.getElementById('docMsg').innerHTML = '';
  document.getElementById('docTitle').textContent = `Tài liệu PRODUCT_DV  _id = ${id}`;
  try {
    const { data, etag } = await api(`/api/products/${id}`);
    current.etag = etag;
    document.getElementById('docEtag').textContent = etag;
    document.getElementById('docText').value = JSON.stringify(data, null, 2);
    // Quyền sửa: quản trị mọi sản phẩm; người bán chỉ sản phẩm của shop mình; vai trò khác chỉ xem
    const r = getRole();
    const canEdit = r?.kind === 'admin' || (r?.kind === 'seller' && data.seller?.sellerId === r.id);
    setEditable(canEdit, r?.kind === 'seller' ? `Sản phẩm của người bán #${data.seller?.sellerId} – bạn chỉ xem được`
                                              : 'Chỉ người bán sở hữu sản phẩm hoặc quản trị mới sửa được');
    modal.show();
  } catch (err) { showError('listMsg', err); }
}

// Bật / tắt chế độ sửa trong hộp thoại tài liệu (server vẫn kiểm tra lại: sửa trái quyền -> 403)
function setEditable(canEdit, note) {
  document.getElementById('btnSave').hidden = !canEdit;
  document.getElementById('docText').readOnly = !canEdit;
  const n = document.getElementById('readOnlyNote');
  n.hidden = canEdit; n.textContent = canEdit ? '' : note;
}

function openNew() {
  current = { id: null, etag: null };
  document.getElementById('docMsg').innerHTML = '';
  document.getElementById('docTitle').textContent = 'Thêm sản phẩm: INSERT INTO product_dv';
  document.getElementById('docEtag').textContent = '(chưa có – tài liệu mới)';
  document.getElementById('docText').value = JSON.stringify(NEW_TEMPLATE, null, 2);
  setEditable(true, '');
  modal.show();
}

async function saveDoc() {
  let body;
  try { body = JSON.parse(document.getElementById('docText').value); }
  catch (e) { showError('docMsg', { problem: { title: 'JSON không hợp lệ', detail: e.message } }); return; }

  try {
    const res = current.id == null
      ? await api('/api/products', { method: 'POST', body })
      : await api(`/api/products/${current.id}`, { method: 'PUT', body, ifMatch: current.etag });
    current = { id: res.data._id, etag: res.etag };
    document.getElementById('docEtag').textContent = res.etag;
    document.getElementById('docText').value = JSON.stringify(res.data, null, 2);
    document.getElementById('docTitle').textContent = `Tài liệu PRODUCT_DV  _id = ${current.id}`;
    showOk('docMsg', `Đã lưu (HTTP ${res.status}). ETag mới: <code>${escapeHtml(res.etag)}</code>`);
    loadProducts();
  } catch (err) { showError('docMsg', err); }
}

// ---------- Vai trò người bán: mặc định chỉ xem / thêm sản phẩm của shop mình ----------
const role = getRole();
if (role?.kind === 'seller') {
  document.getElementById('sellerFilter').innerHTML = `
    <div class="form-check mb-2">
      <input class="form-check-input" type="checkbox" name="sellerId" value="${role.id}" id="mine" checked>
      <label class="form-check-label" for="mine">Chỉ sản phẩm của shop tôi (seller ${role.id})</label>
    </div>`;
  NEW_TEMPLATE.seller.sellerId = role.id;
  document.getElementById('mine').addEventListener('change', loadProducts);
}

// ---------- Sự kiện ----------
form.addEventListener('submit', e => { e.preventDefault(); loadProducts(); });
form.addEventListener('reset', () => setTimeout(() => { loadFacets(); loadProducts(); }, 0));
form.categoryId.addEventListener('change', async () => { await loadFacets(); loadProducts(); });
document.getElementById('productRows').addEventListener('click', e => {
  const id = e.target.closest('button[data-id]')?.dataset.id;
  if (id) openDoc(id);
});
document.getElementById('btnNew').addEventListener('click', openNew);
document.getElementById('btnSave').addEventListener('click', saveDoc);
document.getElementById('btnReload').addEventListener('click', () => current.id && openDoc(current.id));

// Nút "Câu SQL lọc vừa chạy": mở / đóng khối SQL
document.querySelector('.toolbar details').addEventListener('toggle', e => {
  document.getElementById('filterSql').hidden = !e.target.open;
});

// Tham số trên URL: ?q= (ô tìm kiếm ở header), ?categoryId= (ô danh mục ở trang chủ), ?activeOnly=true
const urlParams = new URLSearchParams(location.search);
if (urlParams.get('q')) form.q.value = urlParams.get('q');
if (urlParams.get('activeOnly') === 'true') form.activeOnly.checked = true;

loadFacets().then(async () => {
  if (urlParams.get('categoryId')) { form.categoryId.value = urlParams.get('categoryId'); await loadFacets(); }
  await loadProducts();
});
