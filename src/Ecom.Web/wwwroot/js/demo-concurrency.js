// =============================================================================
// Demo "nhiều khách cùng mua" (TC-10, BR-04). Gọi:
//   GET  /api/products?activeOnly=true       chọn sản phẩm
//   POST /api/demo/concurrency               server đặt lại tồn kho rồi tạo N đơn song song
//   POST /api/demo/concurrency/cancel        huỷ các đơn vừa tạo (trigger hoàn kho)
// =============================================================================
const $ = id => document.getElementById(id);
let lastOrders = [];

async function loadProducts() {
  const { data } = await api('/api/products?activeOnly=true');
  $('product').innerHTML = data.items.map(p =>
    `<option value="${p._id}" ${p._id === 5 ? 'selected' : ''}>#${p._id} – ${escapeHtml(p.productName)} (còn ${p.stockQty})</option>`).join('');
}

function render(d) {
  const oversold = Math.max(0, d.success - d.stockBefore);
  $('summary').innerHTML = `
    <div><b>${d.success}</b><span>đơn thành công</span></div>
    <div><b>${d.outOfStock}</b><span>báo hết hàng (ORA-20001)</span></div>
    <div><b>${d.other}</b><span>lỗi khác</span></div>
    <div><b>${d.stockBefore} → ${d.stockAfter}</b><span>tồn kho trước → sau</span></div>
    <div><b class="${oversold ? 'text-danger' : ''}">${oversold}</b><span>bán vượt</span></div>
    <div><b>${d.elapsedMs} ms</b><span>${d.results.length} giao dịch song song</span></div>`;
  $('grid').innerHTML = d.results.map(r => r.ok
    ? `<a class="buy-tile ok" href="/Orders/Details/${r.orderId}" target="_blank"><b>Khách ${r.buyer} ✓</b>${escapeHtml(r.orderNo)}<br><span class="ms">KH #${r.customerId} · ${r.ms} ms</span></a>`
    : `<div class="buy-tile fail" title="${escapeHtml(r.message ?? '')}"><b>Khách ${r.buyer} ✗</b>${escapeHtml(r.code ?? 'lỗi')}<br><span class="ms">KH #${r.customerId} · ${r.ms} ms</span></div>`).join('');
}

async function run(e) {
  e.preventDefault();
  $('demoMsg').innerHTML = ''; $('btnRun').disabled = true;
  $('grid').innerHTML = '<div class="text-muted">Đang chạy các giao dịch song song...</div>';
  try {
    const { data } = await api('/api/demo/concurrency', { method: 'POST',
      body: { productId: Number($('product').value), stock: Number($('stock').value), buyers: Number($('buyers').value) } });
    render(data);
    lastOrders = data.results.filter(r => r.ok).map(r => r.orderId);
    $('btnCancel').disabled = lastOrders.length === 0;
    loadProducts();
  } catch (err) {
    $('grid').innerHTML = '';
    showError('demoMsg', err);
  } finally {
    $('btnRun').disabled = false;
  }
}

async function cancelAll() {
  try {
    const { data } = await api('/api/demo/concurrency/cancel', { method: 'POST', body: { orderIds: lastOrders } });
    showOk('demoMsg', `Đã huỷ ${data.cancelled} đơn; trigger hoàn kho, tồn kho hiện tại: <b>${data.stockAfter}</b>.`);
    lastOrders = []; $('btnCancel').disabled = true;
    loadProducts();
  } catch (err) { showError('demoMsg', err); }
}

$('demoForm').addEventListener('submit', run);
$('btnCancel').addEventListener('click', cancelAll);
loadProducts().catch(err => showError('demoMsg', err));
