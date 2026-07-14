/* ============================================================
   HokiApp v2.0 — Dashboard Logic (dashboard.js)
   ============================================================ */
'use strict';

let revenueChart = null;
let currentPeriod = 'today';
let currentChartType = 'bar';
let dashData = null;

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Update date string
  const dateEl = document.getElementById('dashDateStr');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('id-ID', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }
  setPeriod('today', document.querySelector('.period-btn[data-period="today"]'));
});

// ─── Period ───────────────────────────────────────────────────
function setPeriod(period, btn) {
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadDashboard(period);
}

// ─── Load Dashboard Data ──────────────────────────────────────
async function loadDashboard(period = 'today') {
  try {
    const data = await fetchAPI(`/api/dashboard/stats?period=${period}`);
    dashData = data;
    renderKPIs(data);
    renderChart(data);
    renderTopProducts(data.top_products || []);
    renderStockAlerts(data.stock_alerts || []);
    renderTransactions(data.recent_transactions || []);
    updateRevBox(data);
  } catch (err) {
    showToast('Gagal memuat data dashboard: ' + err.message, 'error');
  }
}

// ─── KPIs ─────────────────────────────────────────────────────
function renderKPIs(data) {
  const s = data.summary || {};

  const revEl = document.getElementById('kpiRevenue');
  if (revEl) revEl.textContent = formatRupiah(s.gross_revenue || 0);

  const txnEl = document.getElementById('kpiTxn');
  if (txnEl) txnEl.textContent = (s.paid_count || 0).toLocaleString('id-ID');

  const avgEl = document.getElementById('kpiAvg');
  const avg   = s.paid_count > 0 ? Math.round(s.gross_revenue / s.paid_count) : 0;
  if (avgEl) avgEl.textContent = formatRupiah(avg);

  const topProds = data.top_products || [];
  const bestEl   = document.getElementById('kpiBestName');
  const bestQty  = document.getElementById('kpiBestQty');
  if (bestEl && topProds.length > 0) {
    bestEl.textContent = topProds[0].product_name;
    if (bestQty) bestQty.innerHTML = `<span class="material-symbols-outlined icon-xs">bar_chart</span> ${topProds[0].total_qty} terjual`;
  } else if (bestEl) {
    bestEl.textContent = '—';
    if (bestQty) bestQty.innerHTML = `<span class="material-symbols-outlined icon-xs">bar_chart</span> Belum ada data`;
  }

  // Trend indicators
  const revTrend = document.getElementById('kpiRevTrend');
  if (revTrend) {
    revTrend.className = 'kpi-trend flat';
    revTrend.innerHTML = `<span class="material-symbols-outlined icon-xs">trending_flat</span> Periode ${currentPeriod}`;
  }
}

function updateRevBox(data) {
  const s   = data.summary || {};
  const rev = s.gross_revenue || 0;
  const box = document.getElementById('revBoxVal');
  const growEl = document.getElementById('revBoxGrowth');
  if (box) box.textContent = formatRupiah(rev);
  if (growEl) growEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px">info</span> ${(s.paid_count||0)} transaksi selesai`;
}

// ─── Revenue Chart ─────────────────────────────────────────────
function renderChart(data) {
  const chartData = data.chart_data || [];
  const ctx = document.getElementById('revenueChart');
  if (!ctx) return;

  if (revenueChart) { revenueChart.destroy(); revenueChart = null; }

  const labels   = chartData.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('id-ID', { weekday: 'short', month: 'short', day: 'numeric' });
  });
  const revenues = chartData.map(d => d.revenue || 0);
  const counts   = chartData.map(d => d.count || 0);

  const isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? 'rgba(208,232,210,0.7)' : 'rgba(64,77,65,0.7)';
  const gridColor = isDark ? 'rgba(46,127,50,0.10)' : 'rgba(193,204,193,0.4)';

  revenueChart = new Chart(ctx, {
    type: currentChartType,
    data: {
      labels,
      datasets: [
        {
          label: 'Pendapatan',
          data: revenues,
          backgroundColor: currentChartType === 'bar'
            ? 'rgba(46,125,50,0.7)'
            : 'rgba(46,125,50,0.1)',
          borderColor:     '#2e7d32',
          borderWidth: currentChartType === 'bar' ? 0 : 2.5,
          borderRadius: 6,
          fill: currentChartType === 'line',
          tension: 0.4,
          pointBackgroundColor: '#2e7d32',
          pointRadius: 5, pointHoverRadius: 7,
        },
        {
          label: 'Transaksi',
          data: counts,
          borderColor: '#0277BD',
          backgroundColor: 'rgba(2,119,189,0.12)',
          borderWidth: 2,
          type: 'line',
          fill: false,
          tension: 0.4,
          pointBackgroundColor: '#0277BD',
          pointRadius: 4,
          yAxisID: 'y1',
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: textColor, boxWidth: 12, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.datasetIndex === 0
              ? ' ' + formatRupiah(ctx.raw)
              : ' ' + ctx.raw + ' transaksi'
          }
        }
      },
      scales: {
        x: { ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor } },
        y: {
          ticks: { color: textColor, font: { size: 11 }, callback: v => 'Rp' + (v/1000).toFixed(0) + 'k' },
          grid:  { color: gridColor }
        },
        y1: {
          position: 'right',
          ticks: { color: '#0277BD', font: { size: 11 } },
          grid:  { drawOnChartArea: false }
        }
      }
    }
  });
}

function switchChart(type) {
  currentChartType = type;
  document.getElementById('ctBar')?.classList.toggle('active', type === 'bar');
  document.getElementById('ctLine')?.classList.toggle('active', type === 'line');
  if (dashData) renderChart(dashData);
}

// ─── Top Products ─────────────────────────────────────────────
function renderTopProducts(products) {
  const el = document.getElementById('topProductsList');
  if (!el) return;

  if (!products || products.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:20px">
      <span class="material-symbols-outlined">restaurant_menu</span><p>Belum ada transaksi</p></div>`;
    return;
  }

  const rankClasses = ['gold', 'silver', 'bronze'];
  el.innerHTML = products.slice(0, 5).map((p, i) => `
    <div class="top-product-row">
      <div class="top-product-rank ${rankClasses[i] || ''}">${i + 1}</div>
      <div class="top-product-name truncate">${p.product_name}</div>
      <div class="top-product-qty">${p.total_qty}×</div>
      <div class="money text-sm" style="color:var(--primary);font-weight:700">${formatRupiah(p.total_revenue)}</div>
    </div>
  `).join('');
}

// ─── Stock Alerts ──────────────────────────────────────────────
function renderStockAlerts(alerts) {
  const el = document.getElementById('stockAlertsList');
  if (!el) return;

  if (!alerts || alerts.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:20px">
      <span class="material-symbols-outlined icon-fill" style="color:var(--success)">check_circle</span>
      <p style="color:var(--success);font-weight:700">Semua stok aman!</p></div>`;
    return;
  }

  el.innerHTML = alerts.map(a => {
    const level = a.stock <= 0 ? 'empty' : a.stock <= 3 ? 'critical' : 'low';
    const icon  = a.stock <= 0 ? 'remove_shopping_cart' : 'warning';
    const label = a.stock <= 0 ? 'Habis' : `Sisa: ${a.stock}`;
    return `
      <div class="stock-alert-item ${level}">
        <div class="stock-alert-icon">
          <span class="material-symbols-outlined">${icon}</span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name}</div>
          <div style="font-size:11px;opacity:0.8">${label} ${a.unit || ''}</div>
        </div>
        <div class="alert-item-actions">
          <a href="/stock" class="btn-restock" title="Kelola stok">
            <span class="material-symbols-outlined">add</span> Restock
          </a>
        </div>
      </div>`;
  }).join('');

  // Update notif
  const notifDot = document.getElementById('notifDot');
  if (notifDot) notifDot.style.display = alerts.length > 0 ? '' : 'none';
}

// ─── Transactions Table ───────────────────────────────────────
function renderTransactions(transactions) {
  const tbody  = document.getElementById('txnTableBody');
  const badge  = document.getElementById('txnBadge');
  if (!tbody) return;

  if (badge) {
    badge.style.display = transactions.length > 0 ? '' : 'none';
    badge.textContent   = `${transactions.length} transaksi`;
  }

  if (!transactions || transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">
      <div class="empty-state" style="padding:30px">
        <span class="material-symbols-outlined">receipt_long</span>
        <p>Belum ada transaksi hari ini</p>
      </div>
    </td></tr>`;
    return;
  }

  const statusMap = {
    paid:      { badge: 'badge-success', label: 'Selesai' },
    cancelled: { badge: 'badge-danger',  label: 'Batal' },
    pending:   { badge: 'badge-warning', label: 'Pending' },
  };

  tbody.innerHTML = transactions.map(t => {
    const s = statusMap[t.status] || { badge: 'badge-neutral', label: t.status };
    const items = (t.items || []).map(i => `${i.qty}× ${i.product_name}`).join(', ');
    return `<tr>
      <td class="td-mono">#${t.order_code}</td>
      <td class="td-muted">${formatDateTime(t.created_at)}</td>
      <td class="hide-xs">${t.customer_name || '—'}</td>
      <td><span class="items-summary-cell" title="${items}">${items || '—'}</span></td>
      <td class="money" style="color:var(--primary)">${formatRupiah(t.total)}</td>
      <td><span class="badge ${s.badge}">${s.label}</span></td>
    </tr>`;
  }).join('');
}
