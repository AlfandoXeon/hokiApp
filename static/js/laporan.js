/* ============================================================
   HokiApp v2.0 — Laporan Keuangan (laporan.js)
   ============================================================ */
'use strict';

let laporanData     = null;
let revenueChart    = null;
let currentChartType= 'bar';

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Set default dates = today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('dateFrom').value = today;
  document.getElementById('dateTo').value   = today;
  loadLaporan();
});

// ─── Quick Period ─────────────────────────────────────────────
function setQuickPeriod(period, btn) {
  document.querySelectorAll('.qp-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  let from = today;

  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    from = d.toISOString().split('T')[0];
  } else if (period === 'month') {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    from = d.toISOString().split('T')[0];
  } else if (period === 'year') {
    from = now.getFullYear() + '-01-01';
  }

  document.getElementById('dateFrom').value = from;
  document.getElementById('dateTo').value   = today;
  loadLaporan();
}

// ─── Load Laporan ─────────────────────────────────────────────
async function loadLaporan() {
  const from = document.getElementById('dateFrom').value;
  const to   = document.getElementById('dateTo').value;
  if (!from || !to) return showToast('Pilih tanggal terlebih dahulu.', 'warning');

  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) {
    btnRefresh.disabled = true;
    btnRefresh.innerHTML = '<div class="spinner spinner-sm"></div> Memuat...';
  }

  try {
    laporanData = await fetchAPI(`/api/laporan/summary?date_from=${from}&date_to=${to}`);
    renderKPIs(laporanData);
    renderRevenueChart(laporanData);
    renderTopProducts(laporanData);
    renderPaymentBreakdown(laporanData);
    renderCashierPerformance(laporanData);
    renderFinancialSummary(laporanData);
    renderTransactionsTable(from, to);
  } catch (err) {
    showToast('Gagal memuat laporan: ' + err.message, 'error');
  } finally {
    if (btnRefresh) {
      btnRefresh.disabled = false;
      btnRefresh.innerHTML = '<span class="material-symbols-outlined icon-sm">refresh</span> Refresh';
    }
  }
}

// ─── KPIs ─────────────────────────────────────────────────────
function renderKPIs(data) {
  const s = data.summary || {};
  document.getElementById('lkpiRevenue').textContent = formatRupiah(s.gross_revenue || 0);
  document.getElementById('lkpiTxn').textContent     = (s.paid_count || 0).toLocaleString('id-ID');
  document.getElementById('lkpiTax').textContent     = formatRupiah(s.total_tax || 0);

  const avg = s.paid_count > 0 ? Math.round(s.gross_revenue / s.paid_count) : 0;
  document.getElementById('lkpiAvg').textContent = formatRupiah(avg);

  // Revenue badge
  const revBadge = document.getElementById('totalRevBadge');
  if (revBadge) revBadge.textContent = formatRupiah(s.gross_revenue || 0);
}

// ─── Revenue Chart ─────────────────────────────────────────────
function renderRevenueChart(data) {
  const daily = data.daily || [];
  const labels   = daily.map(d => formatDate(d.tanggal));
  const revenues = daily.map(d => d.revenue);
  const counts   = daily.map(d => d.txn_count);

  const ctx = document.getElementById('laporanRevenueChart');
  if (!ctx) return;

  if (revenueChart) {
    revenueChart.destroy();
    revenueChart = null;
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? 'rgba(208,232,210,0.7)' : 'rgba(64,77,65,0.7)';
  const gridColor = isDark ? 'rgba(46,127,50,0.10)' : 'rgba(193,204,193,0.4)';

  const primaryColor = '#2e7d32';

  revenueChart = new Chart(ctx, {
    type: currentChartType,
    data: {
      labels,
      datasets: [
        {
          label: 'Pendapatan (Rp)',
          data: revenues,
          backgroundColor: currentChartType === 'bar'
            ? revenues.map((_, i) => `rgba(46,125,50,${0.5 + i * 0.05})`)
            : 'rgba(46,125,50,0.1)',
          borderColor: primaryColor,
          borderWidth: currentChartType === 'bar' ? 0 : 2.5,
          borderRadius: 6,
          fill: currentChartType === 'line',
          tension: 0.4,
          pointBackgroundColor: primaryColor,
          pointRadius: 5,
          pointHoverRadius: 7,
          yAxisID: 'y',
        },
        {
          label: 'Jumlah Transaksi',
          data: counts,
          backgroundColor: 'rgba(2,119,189,0.15)',
          borderColor: '#0277BD',
          borderWidth: 2,
          type: 'line',
          fill: false,
          tension: 0.4,
          pointBackgroundColor: '#0277BD',
          pointRadius: 4,
          pointHoverRadius: 6,
          yAxisID: 'y1',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, labels: { color: textColor, boxWidth: 12, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.datasetIndex === 0
              ? ' ' + formatRupiah(ctx.raw)
              : ' ' + ctx.raw + ' transaksi'
          }
        }
      },
      scales: {
        x: { ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor } },
        y: {
          ticks: {
            color: textColor, font: { size: 11 },
            callback: (v) => 'Rp ' + (v / 1000).toFixed(0) + 'k'
          },
          grid: { color: gridColor },
          title: { display: true, text: 'Pendapatan', color: textColor, font: { size: 11 } }
        },
        y1: {
          position: 'right',
          ticks: { color: '#0277BD', font: { size: 11 } },
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'Transaksi', color: '#0277BD', font: { size: 11 } }
        }
      }
    }
  });
}

function switchLaporanChart(type, btn) {
  currentChartType = type;
  document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (laporanData) renderRevenueChart(laporanData);
}

// ─── Top Products ──────────────────────────────────────────────
function renderTopProducts(data) {
  const tbody = document.getElementById('topProductsTbody');
  if (!tbody) return;

  const prods = data.top_products || [];
  if (prods.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state" style="padding:20px">
      <span class="material-symbols-outlined">restaurant_menu</span><p>Belum ada data produk</p></div></td></tr>`;
    return;
  }

  const rankClasses = ['r1', 'r2', 'r3'];
  tbody.innerHTML = prods.map((p, i) => {
    const rc = rankClasses[i] || 'rN';
    return `<tr>
      <td><span class="rank-badge ${rc}">${i + 1}</span></td>
      <td class="td-bold">${p.product_name}</td>
      <td class="td-bold" style="font-family:var(--font-mono)">${p.total_qty.toLocaleString('id-ID')}</td>
      <td class="td-muted">${p.order_count}</td>
      <td class="money" style="color:var(--primary)">${formatRupiah(p.total_revenue)}</td>
    </tr>`;
  }).join('');
}

// ─── Payment Breakdown ────────────────────────────────────────
function renderPaymentBreakdown(data) {
  const container = document.getElementById('paymentBreakdownList');
  if (!container) return;

  const payments = data.payment_breakdown || [];
  const totalRevenue = data.summary?.gross_revenue || 1;

  if (payments.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:20px"><p>Belum ada data</p></div>';
    return;
  }

  const methodColors = { tunai: 'payment-tunai', qris: 'payment-qris', transfer: 'payment-transfer' };
  const methodLabels = { tunai: '💵 Tunai', qris: '📱 QRIS', transfer: '🏦 Transfer' };

  container.innerHTML = payments.map(p => {
    const pct = totalRevenue > 0 ? Math.round((p.revenue / totalRevenue) * 100) : 0;
    const cls = methodColors[p.payment_method] || '';
    const label = methodLabels[p.payment_method] || p.payment_method.toUpperCase();
    return `
      <div class="payment-breakdown-item ${cls}">
        <div class="payment-label">${label}</div>
        <div class="payment-bar-wrap">
          <div class="payment-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="payment-amount">${formatRupiah(p.revenue)}</div>
      </div>
      <div style="font-size:11px;color:var(--on-surface-variant);text-align:right;margin:-6px 0 4px">${p.count} txn • ${pct}%</div>
    `;
  }).join('');
}

// ─── Cashier Performance ──────────────────────────────────────
function renderCashierPerformance(data) {
  const container = document.getElementById('cashierPerformanceList');
  if (!container) return;

  const cashiers = data.by_cashier || [];
  if (cashiers.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:20px"><p>Belum ada data</p></div>';
    return;
  }

  const maxRevenue = Math.max(...cashiers.map(c => c.revenue));

  container.innerHTML = cashiers.map(c => {
    const pct = maxRevenue > 0 ? Math.round((c.revenue / maxRevenue) * 100) : 0;
    return `
      <div class="cashier-bar-item">
        <div class="cashier-name-col">${c.kasir}</div>
        <div class="cashier-bar-wrap"><div class="cashier-bar-fill" style="width:${pct}%"></div></div>
        <div class="cashier-revenue">${formatRupiah(c.revenue)}</div>
      </div>
      <div style="font-size:11px;color:var(--on-surface-variant);text-align:right;margin-bottom:4px">${c.txn_count} transaksi</div>
    `;
  }).join('');
}

// ─── Financial Summary ────────────────────────────────────────
function renderFinancialSummary(data) {
  const card = document.getElementById('financialSummaryCard');
  if (!card) return;

  const s = data.summary || {};
  const rows = [
    ['Gross Revenue', formatRupiah(s.gross_revenue || 0)],
    ['Total Diskon', formatRupiah(s.total_discount || 0)],
    ['Net Revenue', formatRupiah(Math.max(0, (s.gross_revenue || 0) - (s.total_discount || 0)))],
    ['Pajak (PPN)', formatRupiah(s.total_tax || 0)],
    ['Transaksi Selesai', (s.paid_count || 0) + ' transaksi'],
    ['Transaksi Batal',   (s.cancelled_count || 0) + ' transaksi'],
  ];

  card.innerHTML = rows.map(([label, val], i) => {
    const isTotal = i === 2;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;
            border-bottom:1px ${isTotal ? 'solid' : 'dashed'} var(--outline-variant);
            ${isTotal ? 'font-weight:800;font-size:14px' : 'font-size:13px'}">
      <span style="color:var(--on-surface-variant)">${label}</span>
      <span class="${isTotal ? 'money' : ''}" style="${isTotal ? 'color:var(--primary)' : ''}">${val}</span>
    </div>`;
  }).join('');
}

// ─── Transactions Table ───────────────────────────────────────
async function renderTransactionsTable(from, to) {
  const tbody   = document.getElementById('laporanTxnTbody');
  const countEl = document.getElementById('txnCountBadge');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:20px">
    <div class="spinner"></div><p>Memuat...</p></div></td></tr>`;

  try {
    const txns = await fetchAPI(`/api/transactions?date_from=${from}&date_to=${to}&status=all&limit=200`);
    if (countEl) countEl.textContent = `${txns.length} transaksi`;

    if (txns.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:30px">
        <span class="material-symbols-outlined">receipt_long</span><p>Tidak ada transaksi</p></div></td></tr>`;
      return;
    }

    const statusMap = {
      paid:      { class: 'badge-success', label: 'Selesai' },
      cancelled: { class: 'badge-danger',  label: 'Batal' },
      pending:   { class: 'badge-warning', label: 'Pending' },
    };
    const methodMap = { tunai: '💵 Tunai', qris: '📱 QRIS', transfer: '🏦 Transfer' };

    tbody.innerHTML = txns.map(t => {
      const s = statusMap[t.status] || statusMap.pending;
      return `<tr>
        <td class="td-mono">#${t.order_code}</td>
        <td class="td-muted">${formatDateTime(t.created_at)}</td>
        <td class="stock-col-hide">${t.cashier_display_name || t.cashier_name || '—'}</td>
        <td class="stock-col-hide">${t.customer_name || '—'}</td>
        <td class="money" style="color:var(--primary)">${formatRupiah(t.total)}</td>
        <td class="td-muted">${methodMap[t.payment_method] || (t.payment_method || '—')}</td>
        <td><span class="badge ${s.class}">${s.label}</span></td>
      </tr>`;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--error);padding:30px">
      Error: ${err.message}</td></tr>`;
  }
}

// ─── Export Excel ─────────────────────────────────────────────
async function exportExcel() {
  const from = document.getElementById('dateFrom').value;
  const to   = document.getElementById('dateTo').value;
  if (!from || !to) return showToast('Pilih tanggal terlebih dahulu.', 'warning');

  const progress = document.getElementById('exportProgress');
  const btn      = document.getElementById('btnExport');
  if (progress) progress.classList.add('visible');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div> Menyiapkan...'; }

  try {
    const url = `/api/laporan/excel?date_from=${from}&date_to=${to}`;
    const response = await fetch(url, { credentials: 'same-origin' });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Gagal export');
    }

    const blob = await response.blob();
    const link = document.createElement('a');
    link.href  = URL.createObjectURL(blob);
    link.download = `laporan_${from}_sd_${to}.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('File Excel berhasil didownload!', 'success');
  } catch (err) {
    showToast('Gagal export: ' + err.message, 'error');
  } finally {
    if (progress) progress.classList.remove('visible');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined icon-sm">table_view</span> Export Excel';
    }
  }
}
