// =============================================================================
// Trang chi tiết sản phẩm (/Products/Details/{id}). Gọi:
//   GET /api/products/{id}                      (một tài liệu PRODUCT_DV + header ETag)
//   GET /api/products/{id}/sales                (đã bán – SQL trên bảng order_items + orders)
//   GET /api/products?categoryId=&activeOnly=   (sản phẩm cùng danh mục)
//   GET /api/products?sellerId=&activeOnly=     (số sản phẩm đang bán của shop)
// Cùng MỘT nguồn dữ liệu: tài liệu JSON (Duality View) và số liệu bán (bảng quan hệ) không nhân bản dữ liệu.
// =============================================================================
const $ = id => document.getElementById(id);
const main = $('pdMain');
const productId = Number(main.dataset.id);
let product = null;

// Tên thông số bằng tiếng Việt + cách hiển thị giá trị (khoá JSON như ramGb chỉ hiện cho người bán / quản trị)
const SPEC = {
  brand: ['Thương hiệu'], color: ['Màu sắc'], ramGb: ['RAM', v => `${v} GB`], storageGb: ['Bộ nhớ trong', v => `${v} GB`],
  screenInch: ['Màn hình', v => `${v} inch`], cpu: ['Bộ xử lý'], batteryHours: ['Thời lượng pin', v => `${v} giờ`],
  capacityMah: ['Dung lượng pin', v => `${v} mAh`], powerW: ['Công suất', v => `${v} W`], size: ['Kích cỡ'],
  material: ['Chất liệu'], volumeMl: ['Dung tích', v => `${v} ml`], spf: ['Chỉ số chống nắng', v => `SPF ${v}`],
  skinType: ['Loại da'], origin: ['Xuất xứ'], author: ['Tác giả'], pages: ['Số trang', v => `${v} trang`],
  language: ['Ngôn ngữ', v => (v === 'vi' ? 'Tiếng Việt' : v === 'en' ? 'Tiếng Anh' : v)], coverType: ['Loại bìa'],
  weightG: ['Khối lượng', v => `${v} g`], warrantyMonths: ['Bảo hành', v => `${v} tháng`],
  wireless: ['Kết nối', v => (v ? 'Không dây' : 'Có dây')], foldable: ['Màn hình gập', v => (v ? 'Có' : 'Không')],
  waterproof: ['Chống nước', v => (v ? 'Có' : 'Không')], vegan: ['Thuần chay', v => (v ? 'Có' : 'Không')],
  compatibleWith: ['Tương thích'],
};
function specRow(key, value) {
  const [label, fmt] = SPEC[key] || [key];
  const shown = Array.isArray(value) ? value.map(x => (fmt ? fmt(x) : x)).join(', ')
    : value !== null && typeof value === 'object' ? JSON.stringify(value)
    : fmt ? fmt(value) : String(value);
  const keyTag = isTechRole() ? ` <code class="small text-muted">$.${escapeHtml(key)}</code>` : '';
  return `<tr><th>${escapeHtml(label)}${keyTag}</th><td>${escapeHtml(shown)}</td></tr>`;
}

// ---------- Hiển thị ----------
function render(p, etag) {
  const inactive = p.status !== 'ACTIVE';
  const cat = p.category?.categoryName || '';
  document.title = `${p.productName} - Shopia`;

  $('pdCrumbs').innerHTML = `<a href="/">Trang chủ</a> / <a href="/Products">Sản phẩm</a>`
    + (cat ? ` / <a href="/Products?categoryId=${p.category.categoryId}">${escapeHtml(cat)}</a>` : '')
    + ` / <span>${escapeHtml(p.productName)}</span>`;

  $('pdGallery').innerHTML = productThumb(p);
  $('pdTags').innerHTML = (p.attributes?.brand ? `<span class="chip brand">${escapeHtml(p.attributes.brand)}</span>` : '')
    + (cat ? `<span class="chip">${escapeHtml(cat)}</span>` : '')
    + (inactive ? '<span class="badge text-bg-secondary">Ngừng bán</span>' : '');
  $('pdName').textContent = p.productName;
  $('pdMeta').innerHTML = `<span>Shop: <b>${escapeHtml(p.seller?.shopName || '')}</b></span>
    <span>Mã SKU: <b>${escapeHtml(p.sku || '')}</b></span><span id="pdSold" class="text-muted">Đang tải số đã bán…</span>`;
  $('pdPrice').textContent = fmtMoney(p.price);
  $('pdStock').innerHTML = inactive ? '<span class="stock out">Sản phẩm đã ngừng bán</span>'
    : p.stockQty === 0 ? '<span class="stock out">Hết hàng</span>'
    : p.stockQty <= 5 ? `<span class="stock low">Chỉ còn ${p.stockQty} sản phẩm</span>`
    : `<span class="stock">Còn ${p.stockQty} sản phẩm trong kho</span>`;

  // Mua: người bán không mua hàng; hết hàng / ngừng bán thì khoá nút (server vẫn chặn: ORA-20001 / ORA-20003)
  const canBuy = !inactive && p.stockQty > 0;
  const seller = roleKind() === 'seller';
  $('pdBuy').hidden = seller;
  $('pdQty').max = Math.max(p.stockQty, 1);
  $('pdBtnBuy').classList.toggle('disabled', !canBuy);
  $('pdBtnBuy').setAttribute('aria-disabled', String(!canBuy));
  $('pdBuyNote').textContent = canBuy ? 'Số lượng được kiểm tra lại với tồn kho khi đặt hàng.'
    : 'Không thể đặt sản phẩm này lúc này.';
  updateBuyLink();

  // Thông số: mọi cặp khoá – giá trị trong cột JSON attributes (mỗi ngành hàng một bộ khoá khác nhau)
  const attrs = Object.entries(p.attributes || {});
  $('pdSpecs').innerHTML = attrs.map(([k, v]) => specRow(k, v)).join('')
    || '<tr><td class="text-muted">Chưa có thông số</td></tr>';

  $('pdShop').innerHTML = `<div class="d-flex align-items-center gap-2">
      <span class="avatar gold">${escapeHtml((p.seller?.shopName || '?').charAt(0))}</span>
      <div><b>${escapeHtml(p.seller?.shopName || '')}</b><div class="small text-muted" id="pdShopCount">&nbsp;</div></div>
    </div>`;

  $('pdIdLabel').textContent = p._id;
  $('pdEtag').textContent = etag || '';
  $('pdJson').textContent = JSON.stringify(p, null, 2);

  main.hidden = false;
  $('pdMore').hidden = false;
}

// Số lượng đã bán – đọc bảng chuẩn hoá (đường quan hệ), không nằm trong tài liệu PRODUCT_DV
async function loadSales() {
  try {
    const { data } = await api(`/api/products/${productId}/sales`);
    $('pdSold').textContent = data.soldQty > 0 ? `Đã bán ${data.soldQty} (trong ${data.orderCount} đơn)` : 'Chưa có lượt mua';
  } catch { $('pdSold').textContent = ''; }
}

async function loadShopCount(sellerId) {
  try {
    const { data } = await api(`/api/products?sellerId=${sellerId}&activeOnly=true`);
    $('pdShopCount').textContent = `${data.count} sản phẩm đang bán`;
  } catch { /* không quan trọng */ }
}

async function loadRelated(p) {
  const catId = p.category?.categoryId;
  if (!catId) return;
  const { data } = await api(`/api/products?categoryId=${catId}&activeOnly=true`);
  // API lọc cả danh mục con (CONNECT BY); sản phẩm cùng đúng danh mục được xếp trước
  const items = data.items.filter(x => x._id !== p._id && x.stockQty > 0)
    .sort((a, b) => (b.category?.categoryId === catId) - (a.category?.categoryId === catId))
    .slice(0, 5);
  if (!items.length) return;
  $('pdRelated').innerHTML = items.map(x => productCard(x, { buy: roleKind() !== 'seller' })).join('');
  $('pdRelatedAll').href = `/Products?categoryId=${catId}`;
  $('pdRelatedBox').hidden = false;
}

// ---------- Số lượng & nút Mua ngay -> trang Tạo đơn (?add=id&qty=n) ----------
function clampQty() {
  const max = Math.max(product?.stockQty || 1, 1);
  let q = parseInt($('pdQty').value, 10);
  if (!Number.isFinite(q) || q < 1) q = 1;
  if (q > max) q = max;
  $('pdQty').value = q;
  return q;
}
function updateBuyLink() { $('pdBtnBuy').href = `/Orders/Create?add=${productId}&qty=${clampQty()}`; }

$('pdMinus').addEventListener('click', () => { $('pdQty').value = clampQty() - 1; updateBuyLink(); });
$('pdPlus').addEventListener('click', () => { $('pdQty').value = clampQty() + 1; updateBuyLink(); });
$('pdQty').addEventListener('change', updateBuyLink);
$('pdBtnBuy').addEventListener('click', e => { if ($('pdBtnBuy').classList.contains('disabled')) e.preventDefault(); });

// ---------- Nạp trang ----------
(async () => {
  try {
    const { data, etag } = await api(`/api/products/${productId}`);
    product = data;
    render(data, etag);
    loadSales();
    loadShopCount(data.seller?.sellerId);
    loadRelated(data).catch(() => {});
  } catch (err) {
    if (err.status === 404) {
      $('pdMsg').innerHTML = `<div class="empty-state">${icon('search')}<div>Không tìm thấy sản phẩm #${productId}</div>
        <a class="btn btn-sm btn-primary mt-2" href="/Products">Về danh sách sản phẩm</a></div>`;
    } else showError('pdMsg', err);
  }
})();
