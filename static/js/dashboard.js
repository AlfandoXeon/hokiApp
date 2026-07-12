/* ============================================================
   HokiApp — Dashboard Logic (dashboard.js)
   ============================================================ */

'use strict';

let currentPeriod = 'today';

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();

  const periodSelect = document.getElementById('periodSelect');
  if (periodSelect) {
    periodSelect.addEventListener('change', (e) => {
      currentPeriod = e.target.value;
      loadDashboard();
    });
  }
});

// ─── Load all dashboard data ─────────────────────────────────
async function loadDashboard() {
  await Promise.all([
    loadStats(),
    loadTransactions(),
  ]);
}

// ─── KPI Stats ───────────────────────────────────────────────
async function loadStats() {
  try {
    const data = await fetchAPI(`/api/dashboard/stats?period=${currentPeriod}`);
    renderKPI(data);
    renderStockAlerts(data.low_stock || []);
  } catch (err) {
    showToast('Gagal memuat statistik: ' + err.message, 'error');
  }
}

function renderKPI(data) {
  // Revenue
  const revEl = document.getElementById('kpiRevenueValue');
  if (revEl) revEl.textContent = formatRupiah(data.revenue);

  const revGrowthEl = document.getElementById('kpiRevenueGrowth');
  if (revGrowthEl) {
    const g = data.revenue_growth;
    const isPos = g >= 0;
    revGrowthEl.className = `kpi-footer ${isPos ? 'positive' : 'negative'}`;
    revGrowthEl.innerHTML = `
      <span class="material-symbols-outlined" style="font-size:14px">${isPos ? 'trending_up' : 'trending_down'}</span>
      <span>${isPos ? '+' : ''}${g}% dari kemarin</span>
    `;
  }

  // Transactions
  const txnEl = document.getElementById('kpiTxnValue');
  if (txnEl) txnEl.textContent = data.transaction_count;

  const txnGrowthEl = document.getElementById('kpiTxnGrowth');
  if (txnGrowthEl) {
    const g = data.transaction_growth;
    const isPos = g >= 0;
    txnGrowthEl.className = `kpi-footer ${isPos ? 'positive' : 'negative'}`;
    txnGrowthEl.innerHTML = `
      <span class="material-symbols-outlined" style="font-size:14px">${isPos ? 'trending_up' : 'trending_down'}</span>
      <span>${isPos ? '+' : ''}${g}% dari kemarin</span>
    `;
  }

  // Best Seller
  const bestNameEl = document.getElementById('kpiBestName');
  if (bestNameEl) bestNameEl.textContent = data.best_seller?.name || '—';

  const bestQtyEl = document.getElementById('kpiBestQty');
  if (bestQtyEl) {
    const qty = data.best_seller?.qty || 0;
    bestQtyEl.className = 'kpi-footer neutral';
    bestQtyEl.innerHTML = `
      <span class="material-symbols-outlined" style="font-size:14px">bar_chart</span>
      <span>${qty > 0 ? qty + ' porsi terjual' : 'Belum ada data'}</span>
    `;
  }
}

// ─── Stock Alerts ────────────────────────────────────────────
function renderStockAlerts(items) {
  const container = document.getElementById('stockAlertsList');
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:32px">
        <span class="material-symbols-outlined" style="color:var(--primary)">check_circle</span>
        <p>Semua stok dalam kondisi aman!</p>
      </div>`;
    return;
  }

  container.innerHTML = items.map(item => {
    const level = item.alert_level; // 'critical', 'low', 'empty'
    const levelMap = {
      critical: { class: 'critical', icon: 'error',   label: `Sisa ${item.stock_qty} ${item.stock_unit}` },
      low:      { class: 'warning',  icon: 'warning',  label: `Sisa ${item.stock_qty} ${item.stock_unit}` },
      empty:    { class: 'empty',    icon: 'block',    label: 'Stok habis' },
    };
    const m = levelMap[level] || levelMap.low;

    return `
      <div class="alert-item ${m.class}">
        <div class="alert-icon ${m.class}">
          <span class="material-symbols-outlined" style="font-size:18px">${m.icon}</span>
        </div>
        <div class="alert-info">
          <div class="alert-name">${item.name}</div>
          <div class="alert-qty">${m.label}</div>
        </div>
        <a href="/stock" class="btn-restock">
          <span class="material-symbols-outlined" style="font-size:13px">add_circle</span>
          Restock
        </a>
      </div>`;
  }).join('');
}

// ─── Transaction History ──────────────────────────────────────
async function loadTransactions() {
  const tbody = document.getElementById('transactionTableBody');
  if (!tbody) return;

  try {
    const transactions = await fetchAPI(`/api/transactions?period=${currentPeriod}&limit=10`);
    renderTransactionsTable(transactions);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--on-surface-variant)">
      Gagal memuat data: ${err.message}
    </td></tr>`;
  }
}

function renderTransactionsTable(transactions) {
  const tbody = document.getElementById('transactionTableBody');
  if (!tbody) return;

  if (transactions.length === 0) {
    tbody.innerHTML = `
      <tr class="no-data-row">
        <td colspan="5">
          <span class="material-symbols-outlined" style="font-size:36px;display:block;margin:0 auto 8px;opacity:0.3">receipt_long</span>
          Belum ada transaksi pada periode ini
        </td>
      </tr>`;
    return;
  }

  const statusMap = {
    paid:      { class: 'badge-paid',      label: 'Selesai' },
    pending:   { class: 'badge-pending',   label: 'Proses' },
    cancelled: { class: 'badge-cancelled', label: 'Batal' },
  };

  tbody.innerHTML = transactions.map(t => {
    const s = statusMap[t.status] || statusMap.pending;
    const timeStr = formatTime(t.paid_at || t.created_at);
    const summary = t.items_summary || '—';

    return `
      <tr onclick="window.location='/payment/${t.id}'" style="cursor:pointer">
        <td class="td-bold">#${t.order_code}</td>
        <td class="td-muted">${timeStr}</td>
        <td>
          <span class="items-summary-cell" title="${summary}">${summary}</span>
        </td>
        <td class="td-bold">${formatRupiah(t.total)}</td>
        <td><span class="badge ${s.class}">${s.label}</span></td>
      </tr>`;
  }).join('');
}
