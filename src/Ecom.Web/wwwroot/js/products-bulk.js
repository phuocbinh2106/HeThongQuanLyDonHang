// =============================================================================
// Tab "Nhiều sản phẩm": dán / tải tệp một MẢNG tài liệu PRODUCT_DV -> POST /api/products/bulk
// (server ghi tất cả trong MỘT giao dịch; một tài liệu lỗi thì rollback cả lô).
// =============================================================================
(() => {
  const el = id => document.getElementById(id);
  const stamp = () => Date.now().toString().slice(-5);

  // Mẫu: 3 sản phẩm thuộc 3 ngành hàng khác nhau -> attributes khác nhau (TH-6)
  const sample = () => {
    const s = stamp();
    return [
      { sku: `BULK-PHONE-${s}`, productName: 'Điện thoại mẫu hàng loạt 128GB', price: 5990000, stockQty: 20, status: 'ACTIVE',
        attributes: { brand: 'Xiaomi', ramGb: 8, storageGb: 128, color: 'Black', warrantyMonths: 18 }, category: { categoryId: 1 } },
      { sku: `BULK-SHIRT-${s}`, productName: 'Áo thun mẫu hàng loạt', price: 199000, stockQty: 50, status: 'ACTIVE',
        attributes: { brand: 'Coolmate', size: ['S', 'M', 'L'], material: 'Cotton' }, category: { categoryId: 7 } },
      { sku: `BULK-BOOK-${s}`, productName: 'Sách mẫu hàng loạt', price: 89000, stockQty: 30, status: 'ACTIVE',
        attributes: { brand: 'NXB Trẻ', author: 'Nhiều tác giả', pages: 200, language: 'vi' }, category: { categoryId: 5 } },
    ];
  };
  // Mẫu lỗi: sản phẩm thứ 2 thiếu brand -> JSON Schema của cột attributes chặn -> cả lô rollback
  const broken = () => { const a = sample(); delete a[1].attributes.brand; return a; };

  const setText = arr => { el('bulkText').value = JSON.stringify(arr, null, 2); el('bulkMsg').innerHTML = ''; el('bulkResult').innerHTML = ''; };

  async function submit() {
    el('bulkMsg').innerHTML = ''; el('bulkResult').innerHTML = '';
    let body;
    try { body = JSON.parse(el('bulkText').value); }
    catch (e) { showError('bulkMsg', { problem: { title: 'JSON không hợp lệ', detail: e.message } }); return; }
    el('btnBulk').disabled = true;
    try {
      const { data, status } = await api('/api/products/bulk', { method: 'POST', body });
      showOk('bulkMsg', `Đã thêm <b>${data.count}</b> sản phẩm trong một giao dịch (HTTP ${status}).`);
      el('bulkResult').innerHTML = `<div class="fw-semibold mb-1">Sản phẩm vừa tạo</div><ul class="mb-0">${data.items.map(p =>
        `<li>#${p._id} – ${escapeHtml(p.productName)} <span class="text-muted">(${escapeHtml(p.category?.categoryName ?? '')}, ${escapeHtml(p.seller?.shopName ?? '')})</span></li>`).join('')}</ul>`;
    } catch (err) {
      showError('bulkMsg', err);   // lỗi ghi rõ "Sản phẩm #n: …", không sản phẩm nào được thêm
    } finally {
      el('btnBulk').disabled = false;
    }
  }

  el('btnBulk').addEventListener('click', submit);
  el('btnBulkSample').addEventListener('click', () => setText(sample()));
  el('btnBulkBroken').addEventListener('click', () => setText(broken()));
  el('bulkFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (f) el('bulkText').value = await f.text();
  });
  setText(sample());
})();
