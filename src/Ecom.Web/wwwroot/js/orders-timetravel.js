// =============================================================================
// Tab "Theo thời gian" ở trang chi tiết đơn. Gọi:
//   GET /api/orders/{id}/asof?scn=…        tài liệu ORDER_DV tại SCN đó (Flashback Query)
//   GET /api/orders/{id}/asof?minutesAgo=… tài liệu tại n phút trước
//   GET /api/orders/{id}                   tài liệu hiện tại (để so sánh)
// _metadata.asof của tài liệu là SCN dạng hex lúc đọc -> đổi sang số thập phân bằng BigInt.
// =============================================================================
(() => {
  const el = id => document.getElementById(id);
  const hexToScn = hex => BigInt('0x' + hex).toString();

  // Các trường so sánh: [nhãn, cách lấy giá trị từ tài liệu]
  const FIELDS = [
    ['Trạng thái', d => d.status],
    ['Người nhận', d => d.shipReceiver],
    ['Điện thoại', d => d.shipPhone],
    ['Địa chỉ giao', d => d.shipAddress],
    ['Phí ship', d => fmtMoney(d.shippingFee)],
    ['Giảm giá', d => fmtMoney(d.discount)],
    ['Tiền hàng (subtotal)', d => fmtMoney(d.subtotal)],
    ['Tổng tiền', d => fmtMoney(d.totalAmount)],
    ['Dòng hàng', d => (d.items ?? []).map(i => `#${i.productId}×${i.quantity}`).join(', ')],
    ['Thanh toán', d => (d.payments ?? []).map(p => `${p.method} ${fmtMoney(p.amount)} ${p.status}`).join('; ') || '—'],
    ['Vận đơn', d => (d.shipments ?? []).map(s => `${s.carrier} ${s.trackingNo}`).join('; ') || '—'],
    ['Lịch sử trạng thái', d => `${(d.history ?? []).length} dòng`],
    ['ETag', d => d._metadata?.etag],
  ];

  async function show(query, label) {
    el('ttMsg').innerHTML = ''; el('ttResult').innerHTML = '<span class="text-muted small">Đang đọc…</span>';
    try {
      const [{ data: old }, { data: now }] = await Promise.all([
        api(`/api/orders/${ORDER_ID}/asof?${query}`), api(`/api/orders/${ORDER_ID}`)]);
      const rows = FIELDS.map(([name, get]) => {
        const a = String(get(old.doc) ?? ''), b = String(get(now) ?? '');
        const diff = a !== b;
        return `<tr class="${diff ? 'table-warning' : ''}"><th class="small">${escapeHtml(name)}</th>
          <td class="small">${escapeHtml(a)}</td><td class="small">${escapeHtml(b)}</td>
          <td class="small text-center">${diff ? 'đã đổi' : ''}</td></tr>`;
      }).join('');
      const changed = FIELDS.filter(([, get]) => String(get(old.doc) ?? '') !== String(get(now) ?? '')).length;
      // SCN_TO_TIMESTAMP trả giờ của máy chủ CSDL (container Oracle chạy giờ UTC)
      const at = old.asOfTime ? ` (≈ ${escapeHtml(String(old.asOfTime).replace('T', ' ').slice(0, 19))} giờ máy chủ CSDL)` : '';
      el('ttResult').innerHTML = `
        <div class="small mb-2">${escapeHtml(label)}: tài liệu tại <b>SCN ${escapeHtml(old.scn)}</b>${at} –
          ${changed ? `<b>${changed}</b> mục khác bản hiện tại (tô vàng)` : 'giống hệt bản hiện tại'}.</div>
        <table class="table table-sm table-bordered align-middle">
          <thead class="table-light"><tr><th style="width:20%">Trường</th><th>Lúc đó</th><th>Hiện tại</th><th style="width:70px"></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <details class="small"><summary>Hai tài liệu JSON đầy đủ</summary>
          <div class="row g-2 mt-1">
            <div class="col-lg-6"><div class="fw-semibold">Lúc đó (SCN ${escapeHtml(old.scn)})</div>
              <pre class="bg-light mb-0" style="max-height:420px;overflow:auto">${escapeHtml(JSON.stringify(old.doc, null, 2))}</pre></div>
            <div class="col-lg-6"><div class="fw-semibold">Hiện tại</div>
              <pre class="bg-light mb-0" style="max-height:420px;overflow:auto">${escapeHtml(JSON.stringify(now, null, 2))}</pre></div>
          </div>
        </details>`;
    } catch (err) {
      el('ttResult').innerHTML = '';
      showError('ttMsg', err);
    }
  }

  el('ttOpen').addEventListener('click', () => {
    if (!window.openAsof) return;
    const scn = hexToScn(window.openAsof);
    el('ttScn').value = scn;
    show(`scn=${scn}`, 'Lúc mở trang');
  });
  document.querySelectorAll('#tabTime [data-minutes]').forEach(b =>
    b.addEventListener('click', () => show(`minutesAgo=${b.dataset.minutes}`, `${b.dataset.minutes} phút trước`)));
  el('ttForm').addEventListener('submit', e => {
    e.preventDefault();
    show(`scn=${encodeURIComponent(el('ttScn').value.trim())}`, 'SCN nhập tay');
  });
})();
