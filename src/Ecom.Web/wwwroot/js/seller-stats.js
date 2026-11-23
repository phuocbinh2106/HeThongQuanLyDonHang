// =============================================================================
// Thống kê shop. Gọi GET /api/seller-stats?sellerId= (người bán: server tự dùng shop của mình)
// Trả 3 kết quả báo cáo dạng { columns, rows }: summary (S1), byMonth (S2), products (S3).
// =============================================================================
const $ = id => document.getElementById(id);
const num = v => Number(v ?? 0).toLocaleString('vi-VN');

// Biểu đồ cột ngang bằng HTML/CSS (giống trang Báo cáo)
function bars(rows, label, value) {
  const max = Math.max(...rows.map(r => Number(r[value]) || 0), 1);
  return rows.map(r => `
    <div class="d-flex align-items-center gap-2 mb-1">
      <div style="width:70px">${escapeHtml(r[label])}</div>
      <div class="flex-grow-1 bg-light" style="height:14px"><div class="bg-success" style="height:14px;width:${(Number(r[value]) || 0) / max * 100}%"></div></div>
      <div style="width:120px" class="text-end">${fmtMoney(r[value])}</div>
    </div>`).join('') || '<div class="text-muted">Chưa có đơn đã giao</div>';
}

function render(d) {
  const s = d.summary.rows[0];
  $('shopName').textContent = `– ${s.SHOP_NAME} (#${d.sellerId})`;
  $('kpis').innerHTML = `
    <div><b>${fmtMoney(s.DOANH_THU)}</b><span>doanh thu (đơn đã giao)</span></div>
    <div><b>${num(s.SO_DON)}</b><span>đơn có hàng của shop</span></div>
    <div><b>${num(s.DON_CHO_XU_LY)}</b><span>chờ xử lý (PENDING / CONFIRMED / PACKING)</span></div>
    <div><b>${num(s.DON_DANG_GIAO)}</b><span>đang giao</span></div>
    <div><b>${num(s.DON_DA_GIAO)}</b><span>đã giao</span></div>
    <div><b>${num(s.DON_HUY_TRA)}</b><span>huỷ / trả hàng</span></div>
    <div><b>${num(s.DANG_BAN)} / ${num(s.SO_SAN_PHAM)}</b><span>sản phẩm đang bán / tổng</span></div>
    <div><b class="${s.SAP_HET ? 'text-danger' : ''}">${num(s.SAP_HET)}</b><span>sắp hết hàng</span></div>`;

  $('monthChart').innerHTML = bars(d.byMonth.rows, 'THANG', 'DOANH_THU');
  $('monthTable').innerHTML = d.byMonth.rows.length ? `
    <table class="table table-sm table-bordered mt-2 mb-0">
      <thead class="table-light"><tr><th>Tháng</th><th class="text-end">Số đơn</th><th class="text-end">Doanh thu</th><th class="text-end">Luỹ kế</th></tr></thead>
      <tbody>${d.byMonth.rows.map(r => `<tr><td>${escapeHtml(r.THANG)}</td><td class="text-end">${num(r.SO_DON)}</td>
        <td class="text-end">${fmtMoney(r.DOANH_THU)}</td><td class="text-end">${fmtMoney(r.LUY_KE)}</td></tr>`).join('')}</tbody>
    </table>` : '';

  const low = d.products.rows.filter(r => r.SAP_HET === 1);
  $('lowStock').innerHTML = low.length ? `<ul class="list-unstyled mb-0">${low.map(r => `
      <li class="d-flex justify-content-between border-bottom py-1">
        <span>#${r.PRODUCT_ID} ${escapeHtml(r.PRODUCT_NAME)}</span>
        <span><b class="${r.STOCK_QTY === 0 ? 'text-danger' : 'text-warning'}">còn ${num(r.STOCK_QTY)}</b>
          <a class="ms-2" href="/Products?q=${encodeURIComponent(r.PRODUCT_NAME)}">sửa</a></span></li>`).join('')}</ul>`
    : '<div class="text-muted">Không có sản phẩm nào sắp hết.</div>';

  $('productTable').innerHTML = `<div class="table-responsive"><table class="table table-sm table-bordered mb-0">
    <thead class="table-light"><tr><th>Hạng</th><th>Mã</th><th>Sản phẩm</th><th>SKU</th><th class="text-end">Giá</th>
      <th class="text-end">Tồn</th><th>Trạng thái</th><th class="text-end">Đã bán</th><th class="text-end">Doanh thu</th></tr></thead>
    <tbody>${d.products.rows.map(r => `<tr class="${r.SAP_HET ? 'table-warning' : ''}">
      <td>${r.DA_BAN ? r.HANG : '—'}</td><td>#${r.PRODUCT_ID}</td><td>${escapeHtml(r.PRODUCT_NAME)}</td><td class="mono">${escapeHtml(r.SKU)}</td>
      <td class="text-end">${fmtMoney(r.PRICE)}</td><td class="text-end">${num(r.STOCK_QTY)}</td><td>${escapeHtml(r.STATUS)}</td>
      <td class="text-end">${num(r.DA_BAN)}</td><td class="text-end">${fmtMoney(r.DOANH_THU)}</td></tr>`).join('')
      || '<tr><td colspan="9" class="text-center text-muted">Shop chưa có sản phẩm</td></tr>'}</tbody></table></div>`;
}

async function load() {
  $('statsMsg').innerHTML = '';
  const pick = $('sellerPick').value;
  try {
    const { data } = await api('/api/seller-stats' + (roleKind() === 'admin' && pick ? `?sellerId=${pick}` : ''));
    render(data);
  } catch (err) { showError('statsMsg', err); }
}

(async () => {
  if (roleKind() === 'admin') {
    const { data: ss } = await api('/api/sellers');
    $('sellerPick').innerHTML = ss.map(s => `<option value="${s.id}">#${s.id} – ${escapeHtml(s.shopName)}</option>`).join('');
    $('sellerPick').addEventListener('change', load);
  }
  await load();
})().catch(err => showError('statsMsg', err));
