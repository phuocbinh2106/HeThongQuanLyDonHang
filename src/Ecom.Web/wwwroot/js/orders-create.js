// =============================================================================
// M2 – Tạo đơn. Gọi:
//   GET  /api/customers            danh sách khách
//   GET  /api/customers/{id}       tài liệu CUSTOMER_DV (lấy sổ địa chỉ)
//   GET  /api/products?q=          tài liệu PRODUCT_DV để chọn hàng
//   POST /api/orders               gửi CẢ ĐƠN bằng một tài liệu JSON -> INSERT INTO order_dv
// =============================================================================
const $ = id => document.getElementById(id);
let products = [];        // tài liệu sản phẩm đang hiển thị
const cart = new Map();   // productId -> { product, quantity }

// ---------- Khách hàng & địa chỉ ----------
async function loadCustomers() {
  const { data } = await api('/api/customers');
  $('customer').innerHTML = data.map(c =>
    `<option value="${c.id}">#${c.id} – ${escapeHtml(c.fullName)} (${escapeHtml(c.email)})${c.status !== 'ACTIVE' ? ' [' + c.status + ']' : ''}</option>`).join('');
  // Nếu đã chọn vai trò khách hàng ở trang chủ (cookie ecom_user=customer:N) thì chọn sẵn
  const m = document.cookie.match(/ecom_user=customer%3A(\d+)|ecom_user=customer:(\d+)/);
  if (m) $('customer').value = m[1] || m[2];
  await loadAddresses();
}

async function loadAddresses() {
  const { data: doc } = await api(`/api/customers/${$('customer').value}`);
  const addrs = doc.addresses || [];
  $('addresses').innerHTML = addrs.map((a, i) => `
    <div class="form-check">
      <input class="form-check-input" type="radio" name="addr" id="addr${i}" value="${i}" ${a.isDefault ? 'checked' : ''}>
      <label class="form-check-label" for="addr${i}">
        ${escapeHtml(a.receiverName)} · ${escapeHtml(a.receiverPhone)} · ${escapeHtml(fullAddress(a))}
        ${a.isDefault ? '<span class="badge text-bg-secondary">mặc định</span>' : ''}
      </label>
    </div>`).join('') || '<div class="text-muted">Khách chưa có địa chỉ – nhập tay bên dưới.</div>';
  document.querySelectorAll('input[name=addr]').forEach(r =>
    r.addEventListener('change', () => fillShip(addrs[r.value])));
  fillShip(addrs.find(a => a.isDefault) || addrs[0]);
}

const fullAddress = a => [a.addressLine, a.ward, a.district, a.city].filter(Boolean).join(', ');

function fillShip(a) {
  $('shipReceiver').value = a?.receiverName || '';
  $('shipPhone').value = a?.receiverPhone || '';
  $('shipAddress').value = a ? fullAddress(a) : '';
  renderPreview();
}

// ---------- Sản phẩm ----------
async function loadProducts() {
  const q = $('search').value.trim();
  const { data } = await api('/api/products' + (q ? '?q=' + encodeURIComponent(q) : ''));
  products = data.items;
  $('productRows').innerHTML = products.map(p => `
    <tr class="${p.status !== 'ACTIVE' ? 'table-secondary' : ''}">
      <td>${p._id}</td>
      <td>${escapeHtml(p.productName)}
          ${p.status !== 'ACTIVE' ? '<span class="badge text-bg-secondary">Ngừng bán</span>' : ''}
          ${p.stockQty === 0 ? '<span class="badge text-bg-danger">Hết hàng</span>' : ''}</td>
      <td class="text-end">${fmtMoney(p.price)}</td>
      <td class="text-end">${p.stockQty}</td>
      <td><div class="input-group input-group-sm">
            <input type="number" min="1" value="1" class="form-control" id="qty${p._id}">
            <button class="btn btn-outline-primary" data-add="${p._id}">Thêm</button>
          </div></td>
    </tr>`).join('');
}

// Cố ý KHÔNG chặn số lượng > tồn kho hay sản phẩm ngừng bán ở giao diện:
// để demo được CSDL tự chặn (TC-03, TC-04). Chỉ cảnh báo.
function addToCart(id) {
  const p = products.find(x => x._id == id);
  const qty = parseInt($('qty' + id).value, 10) || 1;
  const cur = cart.get(p._id);
  cart.set(p._id, { product: p, quantity: (cur?.quantity || 0) + qty });
  renderCart();
}

function renderCart() {
  let sub = 0;
  $('cartRows').innerHTML = [...cart.values()].map(({ product: p, quantity }) => {
    sub += p.price * quantity;
    const warn = quantity > p.stockQty ? '<div class="text-danger">vượt tồn kho!</div>'
               : p.status !== 'ACTIVE' ? '<div class="text-danger">ngừng bán!</div>' : '';
    return `<tr>
      <td>${escapeHtml(p.productName)}${warn}</td>
      <td class="text-end">${fmtMoney(p.price)}</td>
      <td><input type="number" min="1" value="${quantity}" data-qty="${p._id}" class="form-control form-control-sm"></td>
      <td class="text-end">${fmtMoney(p.price * quantity)}</td>
      <td><button class="btn btn-sm btn-link text-danger" data-del="${p._id}">Xoá</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="text-muted text-center">Chưa có sản phẩm</td></tr>';
  const total = sub + Number($('shippingFee').value) - Number($('discount').value || 0);
  $('estSubtotal').textContent = fmtMoney(sub);
  $('estTotal').textContent = fmtMoney(total);
  renderPreview();
}

// ---------- Tài liệu JSON gửi đi ----------
function buildDoc() {
  const fake = $('fakeMode').checked;
  const doc = {
    customer: { customerId: Number($('customer').value) },   // chỉ cần khoá; tên/email là NOCHECK, chỉ đọc
    shipReceiver: $('shipReceiver').value,
    shipPhone: $('shipPhone').value,
    shipAddress: $('shipAddress').value,
    shippingFee: Number($('shippingFee').value),
    discount: Number($('discount').value || 0),
    items: [...cart.values()].map(({ product, quantity }) =>
      fake ? { productId: product._id, quantity, unitPrice: 1 } : { productId: product._id, quantity }),
  };
  if (fake) Object.assign(doc, { status: 'DELIVERED', subtotal: 1, totalAmount: 1, orderNo: 'HACK-001' });
  return doc;
}

const renderPreview = () => { $('preview').textContent = JSON.stringify(buildDoc(), null, 2); };

async function submitOrder() {
  $('resultBox').innerHTML = '';
  const sent = buildDoc();
  $('btnSubmit').disabled = true;
  try {
    const { data: doc, etag, status } = await api('/api/orders', { method: 'POST', body: sent });
    const est = sent.items.reduce((s, it) => s + cart.get(it.productId).product.price * it.quantity, 0);
    $('resultBox').innerHTML = `
      <div class="card border-success mb-3">
        <div class="card-header bg-success text-white">Đã tạo đơn – HTTP ${status}</div>
        <div class="card-body small">
          <div>Số đơn: <b>${escapeHtml(doc.orderNo)}</b> (_id ${doc._id}) · Trạng thái: <b>${escapeHtml(doc.status)}</b></div>
          <div>Tiền hàng do server tính: <b>${fmtMoney(doc.subtotal)}</b>
               <span class="text-muted">(client ước lượng ${fmtMoney(est)})</span>
               · Phí ship ${fmtMoney(doc.shippingFee)} · Giảm ${fmtMoney(doc.discount)}
               · Tổng: <b>${fmtMoney(doc.totalAmount)}</b></div>
          ${sent.status ? `<div class="text-success">Client gửi status="${sent.status}", subtotal=${sent.subtotal}, unitPrice=1 → CSDL đã bỏ qua.</div>` : ''}
          <div>Lịch sử: ${doc.history.map(h => `${h.oldStatus ?? 'NULL'} → ${h.newStatus} (bởi ${escapeHtml(h.changedBy)})`).join('; ')}</div>
          <div>ETag: <code>${escapeHtml(etag)}</code></div>
          <a class="btn btn-sm btn-success mt-2" href="/Orders/Details/${doc._id}">Xem chi tiết đơn (JSON ↔ bảng quan hệ)</a>
          <details class="mt-2"><summary>Tài liệu server trả về</summary>
            <pre class="mb-0">${escapeHtml(JSON.stringify(doc, null, 2))}</pre></details>
        </div>
      </div>`;
    cart.clear(); renderCart(); loadProducts();
  } catch (err) {
    showError('resultBox', err);
    loadProducts();   // tồn kho không đổi vì cả đơn đã rollback
  } finally {
    $('btnSubmit').disabled = false;
  }
}

// ---------- Sự kiện ----------
$('customer').addEventListener('change', loadAddresses);
let timer;
$('search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(loadProducts, 300); });
$('productRows').addEventListener('click', e => { const id = e.target.dataset.add; if (id) addToCart(id); });
$('cartRows').addEventListener('click', e => {
  const id = e.target.dataset.del; if (id) { cart.delete(Number(id)); renderCart(); }
});
$('cartRows').addEventListener('change', e => {
  const id = e.target.dataset.qty;
  if (id) { cart.get(Number(id)).quantity = Math.max(1, parseInt(e.target.value, 10) || 1); renderCart(); }
});
['shippingFee', 'discount', 'fakeMode'].forEach(id => $(id).addEventListener('change', renderCart));
['shipReceiver', 'shipPhone', 'shipAddress'].forEach(id => $(id).addEventListener('input', renderPreview));
$('btnSubmit').addEventListener('click', submitOrder);

Promise.all([loadCustomers(), loadProducts()]).then(renderCart)
  .catch(err => showError('resultBox', err));
