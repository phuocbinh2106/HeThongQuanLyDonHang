// =============================================================================
// M6 – Báo cáo. Mỗi thẻ data-report="rN" gọi GET /api/reports/rN?... và vẽ bảng (+ biểu đồ).
// Biểu đồ vẽ bằng HTML/CSS thuần (không thư viện ngoài) để demo chạy được cả khi không có mạng.
// =============================================================================
const rangeForm = document.getElementById('rangeForm');

// Cột tiền / phần trăm để định dạng
const MONEY = /DOANH_THU|LUY_KE|THANG_TRUOC/;
const PCT = /_PCT$/;
const fmtVal = (col, v) => {
  if (v === null || v === undefined) return '<span class="text-muted">—</span>';
  if (MONEY.test(col)) return fmtMoney(v);
  if (PCT.test(col)) return `${Number(v).toLocaleString('vi-VN')} %`;
  if (typeof v === 'number') return v.toLocaleString('vi-VN');
  return escapeHtml(v);
};

// Biểu đồ cột ngang: mỗi dòng một thanh, độ dài tỉ lệ với giá trị lớn nhất
function barChart(rows, labelCol, valueCol, fmt = fmtMoney, color = 'bg-primary') {
  const max = Math.max(...rows.map(r => Number(r[valueCol]) || 0), 1);
  return `<div class="mb-2">${rows.map(r => `
    <div class="d-flex align-items-center gap-2 mb-1">
      <div class="text-truncate text-end" style="width:130px" title="${escapeHtml(r[labelCol])}">${escapeHtml(r[labelCol])}</div>
      <div class="flex-grow-1 bg-light" style="height:14px">
        <div class="${color}" style="height:14px; width:${(Number(r[valueCol]) || 0) / max * 100}%"></div>
      </div>
      <div style="width:110px" class="text-end">${fmt(r[valueCol])}</div>
    </div>`).join('')}</div>`;
}

function table(data, rowClass = () => '', cellStyle = () => '') {
  return `<div class="table-responsive"><table class="table table-sm table-bordered mb-1">
    <thead class="table-light"><tr>${data.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
    <tbody>${data.rows.map(r => `<tr class="${rowClass(r)}">${data.columns.map(c =>
      `<td class="${typeof r[c] === 'number' ? 'text-end' : ''}" style="${cellStyle(c, r[c])}">${fmtVal(c, r[c])}</td>`).join('')}</tr>`).join('')
    || `<tr><td colspan="${data.columns.length}" class="text-center text-muted">Không có dữ liệu</td></tr>`}</tbody>
  </table></div>`;
}

// Cách hiển thị riêng từng báo cáo
const RENDER = {
  r1: d => ({
    chart: barChart(d.rows, 'THANG', 'DOANH_THU'),
    tbl: table(d, () => '', (c, v) => c === 'TANG_TRUONG_PCT' && v != null ? `color:${v >= 0 ? 'green' : 'crimson'}` : ''),
  }),
  r2: d => ({   // MUC_TONG: 0 = chi tiết, 1 = tổng phụ người bán, 3 = tổng cộng (GROUPING_ID)
    tbl: table(d, r => r.MUC_TONG === 3 ? 'table-dark fw-bold' : r.MUC_TONG === 1 ? 'table-secondary fw-semibold' : ''),
  }),
  r3: d => ({ tbl: table(d, r => r.HANG === 1 ? 'table-warning' : '') }),
  r4: d => {    // tô đậm theo số đơn trong ô (bản đồ nhiệt đơn giản)
    const max = Math.max(1, ...d.rows.flatMap(r => d.columns.slice(1).map(c => r[c] || 0)));
    return { tbl: table(d, () => '', (c, v) => c !== 'THANG' && v ? `background: rgba(31,122,95,${0.08 + 0.55 * v / max})` : '') };
  },
  r5: d => ({ chart: barChart(d.rows, 'NGUOI_BAN', 'TY_LE_PCT', v => `${v ?? 0} %`, 'bg-danger'), tbl: table(d) }),
  r6: d => ({ chart: barChart(d.rows.slice(0, 10), 'THUONG_HIEU', 'DOANH_THU', fmtMoney, 'bg-success'), tbl: table(d) }),
};

async function runReport(card) {
  const code = card.dataset.report;
  const body = card.querySelector('.card-body');
  const p = new URLSearchParams();
  if (code === 'r1' || code === 'r2') for (const [k, v] of new FormData(rangeForm)) if (v) p.set(k, v);
  card.querySelectorAll('.param').forEach(i => i.value !== '' && p.set(i.dataset.name, i.value));

  body.querySelector('.tbl').innerHTML = '<span class="text-muted">Đang chạy...</span>';
  const chart = body.querySelector('.chart');
  try {
    const { data } = await api(`/api/reports/${code}?${p}`);
    const out = RENDER[code](data);
    if (chart) chart.innerHTML = out.chart || '';
    body.querySelector('.tbl').innerHTML = out.tbl + `
      <details class="mt-1"><summary>Lời gọi &amp; mã PL/SQL</summary>
        <pre class="bg-light p-2 mb-1">${escapeHtml(data.call)}</pre>
        <pre class="bg-light p-2 mb-0 src" data-code="${code}">(bấm để tải mã nguồn)</pre>
      </details>`;
  } catch (err) {
    if (chart) chart.innerHTML = '';
    body.querySelector('.tbl').innerHTML = `<div id="err-${code}"></div>`;
    showError(`err-${code}`, err);
  }
}

// Tải mã nguồn hàm (USER_SOURCE) khi mở phần "Lời gọi & mã PL/SQL"
document.addEventListener('toggle', async e => {
  const pre = e.target.querySelector?.('pre.src');
  if (!pre || !e.target.open || pre.dataset.loaded) return;
  const res = await fetch(`/api/reports/${pre.dataset.code}/source`);
  pre.textContent = await res.text();
  pre.dataset.loaded = '1';
}, true);

const cards = [...document.querySelectorAll('[data-report]')];
const runAll = () => cards.forEach(runReport);
rangeForm.addEventListener('submit', e => { e.preventDefault(); runAll(); });
cards.forEach(c => c.querySelectorAll('.param').forEach(i => i.addEventListener('change', () => runReport(c))));
runAll();
