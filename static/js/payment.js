/* ============================================================
   HokiApp — Payment Logic (payment.js)
   ============================================================ */

'use strict';

// ─── State ───────────────────────────────────────────────────
let transaction   = null;
let settings      = {};
let paymentMethod = 'tunai';
let cashInputValue = 0;

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof TRANSACTION_ID === 'undefined') return;

  await Promise.all([loadTransaction(), loadSettings()]);

  // Cash input event
  const cashInput = document.getElementById('cashInput');
  if (cashInput) {
    cashInput.addEventListener('input', onCashInput);
    cashInput.addEventListener('focus', () => {
      cashInput.select();
    });
  }
});

// ─── Load Transaction ────────────────────────────────────────
async function loadTransaction() {
  try {
    transaction = await fetchAPI(`/api/transactions/${TRANSACTION_ID}`);
    renderOrderSummary();
    setupDenominations();
    
    if (transaction.status === 'paid') {
      document.getElementById('btnComplete').disabled = true;
      document.getElementById('btnComplete').textContent = 'Sudah Dibayar';
      showToast('Transaksi ini sudah selesai.', 'info');
    }
  } catch (err) {
    showToast('Gagal memuat transaksi: ' + err.message, 'error');
  }
}

// ─── Load Settings ───────────────────────────────────────────
async function loadSettings() {
  try {
    settings = await fetchAPI('/api/settings');
    // Update bank info
    document.getElementById('bankName').textContent    = settings.bank_name    || '—';
    document.getElementById('bankAccount').textContent = settings.bank_account || '—';
    document.getElementById('bankHolder').textContent  = settings.bank_holder  || '—';
  } catch (_) {}
}

// ─── Render Order Summary ─────────────────────────────────────
function renderOrderSummary() {
  if (!transaction) return;

  document.getElementById('paymentTitle').textContent = `Pembayaran — #${transaction.order_code}`;

  const itemsList = document.getElementById('orderItemsList');
  if (itemsList) {
    if (!transaction.items || transaction.items.length === 0) {
      itemsList.innerHTML = '<p class="text-muted">Tidak ada item.</p>';
    } else {
      itemsList.innerHTML = transaction.items.map(item => `
        <div class="order-item-row">
          <div>
            <div class="order-item-name">${item.product_name}</div>
            <div class="order-item-qty">${item.quantity}× @ ${formatRupiah(item.product_price)}
              ${item.notes ? `<br><em style="font-size:11px;opacity:0.7">${item.notes}</em>` : ''}
            </div>
          </div>
          <div class="order-item-price">${formatRupiah(item.subtotal)}</div>
        </div>
      `).join('<hr class="divider">');
    }
  }

  const taxRate = parseFloat(settings.tax_rate || '10');
  document.getElementById('summaryTaxRate').textContent = taxRate;

  const taxRow = document.getElementById('summaryTaxRow');
  if (taxRow) taxRow.style.display = settings.tax_enabled === '0' ? 'none' : '';

  document.getElementById('summarySubtotal').textContent = formatRupiah(transaction.subtotal);
  document.getElementById('summaryTax').textContent      = formatRupiah(transaction.tax_amount);
  document.getElementById('summaryTotal').textContent    = formatRupiah(transaction.total);

  // Bank amount
  document.getElementById('bankAmount').textContent = formatRupiah(transaction.total);

  // Default cash input to total
  const cashInput = document.getElementById('cashInput');
  if (cashInput) {
    cashInput.value = formatNumberLocal(transaction.total);
    cashInputValue  = transaction.total;
    updateChange();
  }
}

function formatNumberLocal(num) {
  return Math.round(num).toLocaleString('id-ID');
}

// ─── Denomination Quick-select ───────────────────────────────
function setupDenominations() {
  if (!transaction) return;

  const total = transaction.total;
  const denomGrid = document.getElementById('denomGrid');
  if (!denomGrid) return;

  // Generate smart denominations
  const denominations = [
    { label: 'Uang Pas', value: total },
  ];

  const standards = [5000, 10000, 20000, 50000, 100000, 150000, 200000];
  standards.forEach(d => {
    if (d > total && denominations.length < 8) {
      // Round up to next denomination
      denominations.push({ label: formatDenomLabel(d), value: d });
    }
  });

  // Round up to nearest 5k, 10k, 50k
  const roundUps = [
    Math.ceil(total / 5000)  * 5000,
    Math.ceil(total / 10000) * 10000,
    Math.ceil(total / 50000) * 50000,
  ];
  roundUps.forEach(d => {
    if (d > total && !denominations.find(x => x.value === d) && denominations.length < 8) {
      denominations.push({ label: formatDenomLabel(d), value: d });
    }
  });

  // Sort & deduplicate
  const unique = [...new Map(denominations.map(d => [d.value, d])).values()]
    .sort((a, b) => a.value - b.value)
    .slice(0, 5);

  denomGrid.innerHTML = unique.map(d => `
    <button class="denom-btn ${d.value === total ? 'active' : ''}"
            onclick="selectDenom(${d.value}, this)">
      ${d.label}
    </button>
  `).join('');
}

function formatDenomLabel(n) {
  if (n >= 1000000) return (n / 1000000) + 'jt';
  if (n >= 1000)    return (n / 1000) + 'rb';
  return n.toString();
}

function selectDenom(value, btn) {
  document.querySelectorAll('.denom-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const cashInput = document.getElementById('cashInput');
  cashInputValue = value;
  cashInput.value = formatNumberLocal(value);
  updateChange();
}

// ─── Cash Input ──────────────────────────────────────────────
function onCashInput(e) {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  cashInputValue = parseInt(raw, 10) || 0;
  e.target.value = cashInputValue > 0 ? formatNumberLocal(cashInputValue) : '';
  
  // Deactivate denom buttons
  document.querySelectorAll('.denom-btn').forEach(b => b.classList.remove('active'));
  updateChange();
}

function updateChange() {
  if (!transaction) return;
  const change = Math.max(0, cashInputValue - transaction.total);
  const changeEl = document.getElementById('changeAmount');
  if (changeEl) changeEl.textContent = formatRupiah(change);

  // Enable complete button only when cash >= total (for cash method)
  const btnComplete = document.getElementById('btnComplete');
  if (btnComplete) {
    if (paymentMethod === 'tunai') {
      btnComplete.disabled = cashInputValue < transaction.total;
    } else {
      btnComplete.disabled = false;
    }
  }
}

// ─── Payment Method Switcher ─────────────────────────────────
function selectPaymentMethod(method) {
  paymentMethod = method;

  // Update tab buttons
  document.querySelectorAll('.payment-method-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.method === method);
  });

  // Show/hide sections
  document.getElementById('sectionTunai').style.display   = method === 'tunai'    ? '' : 'none';
  document.getElementById('sectionQris').style.display    = method === 'qris'     ? '' : 'none';
  document.getElementById('sectionTransfer').style.display= method === 'transfer' ? '' : 'none';

  // Re-check complete button
  const btnComplete = document.getElementById('btnComplete');
  if (btnComplete) {
    btnComplete.disabled = method === 'tunai' && (!transaction || cashInputValue < transaction.total);
  }
}

// ─── Complete Payment ─────────────────────────────────────────
async function completePayment() {
  if (!transaction) return;

  const btnComplete = document.getElementById('btnComplete');
  btnComplete.disabled = true;
  btnComplete.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;border-color:rgba(255,255,255,0.3);border-top-color:#fff"></div> Memproses...';

  try {
    const payload = {
      action:         'pay',
      payment_method: paymentMethod,
      amount_paid:    paymentMethod === 'tunai' ? cashInputValue : transaction.total,
    };

    const result = await fetchAPI(`/api/transactions/${TRANSACTION_ID}`, {
      method: 'PUT',
      body:   payload,
    });

    showToast('Pembayaran berhasil! Mencetak struk...', 'success');
    buildReceipt();

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        window.location.href = '/kasir';
      }, 1000);
    }, 400);

  } catch (err) {
    showToast('Gagal memproses pembayaran: ' + err.message, 'error');
    btnComplete.disabled = false;
    btnComplete.innerHTML = '<span class="material-symbols-outlined icon-sm">check_circle</span> Selesaikan & Cetak Struk';
  }
}

// ─── Build Receipt for Print ─────────────────────────────────
function buildReceipt() {
  if (!transaction) return;

  const store = settings;
  document.getElementById('receiptAddress').textContent = store.alamat || '';
  document.getElementById('receiptPhone').textContent   = store.telepon || '';
  document.getElementById('receiptDate').textContent    = new Date().toLocaleString('id-ID');
  document.getElementById('receiptOrderCode').textContent = '#' + transaction.order_code;
  document.getElementById('receiptFooter').textContent  = store.receipt_footer || 'Terima kasih!';

  const itemsEl = document.getElementById('receiptItems');
  if (itemsEl && transaction.items) {
    itemsEl.innerHTML = transaction.items.map(item => `
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
        <span>${item.product_name} x${item.quantity}</span>
        <span>${formatRupiah(item.subtotal)}</span>
      </div>
    `).join('');
  }

  const totalsEl = document.getElementById('receiptTotals');
  if (totalsEl) {
    const taxEnabled = store.tax_enabled !== '0';
    const change = Math.max(0, cashInputValue - transaction.total);
    totalsEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:2px">
        <span>Subtotal</span><span>${formatRupiah(transaction.subtotal)}</span>
      </div>
      ${taxEnabled ? `<div style="display:flex;justify-content:space-between;margin-bottom:2px">
        <span>Pajak (${store.tax_rate || 10}%)</span><span>${formatRupiah(transaction.tax_amount)}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;margin-top:4px">
        <span>TOTAL</span><span>${formatRupiah(transaction.total)}</span>
      </div>
      ${paymentMethod === 'tunai' ? `
      <div style="display:flex;justify-content:space-between;margin-top:2px">
        <span>Bayar</span><span>${formatRupiah(cashInputValue)}</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span>Kembali</span><span>${formatRupiah(change)}</span>
      </div>` : `
      <div style="display:flex;justify-content:space-between;margin-top:2px">
        <span>Metode</span><span>${paymentMethod.toUpperCase()}</span>
      </div>`}
    `;
  }
}
