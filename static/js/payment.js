/* ============================================================
   HokiApp v2.0 — Payment Checkout Logic (payment.js)
   ============================================================ */
'use strict';

let orderData     = null;
let currentMethod = 'tunai';
let settings      = {};
let isProcessing  = false;
let receiptData   = null;

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const jsonStr = localStorage.getItem('hoki_checkout_cart');
  if (!jsonStr) {
    document.getElementById('paymentError').style.display = 'block';
    return;
  }
  
  try {
    orderData = JSON.parse(jsonStr);
    if (!orderData || !orderData.items || orderData.items.length === 0) throw new Error('Empty');
  } catch (e) {
    document.getElementById('paymentError').style.display = 'block';
    return;
  }
  
  document.getElementById('paymentCanvas').style.display = 'grid';
  
  // Load settings & media
  await loadSettings();
  
  renderSummary();
  // Init amount to total
  setCash(orderData.total, true);
});

async function loadSettings() {
  try {
    settings = await fetchAPI('/api/settings');
    
    // Transfer Settings
    document.getElementById('transferBank').textContent = settings.bank_name || 'Bank/e-Wallet belum diatur';
    document.getElementById('transferAcc').textContent  = settings.bank_account || '-';
    document.getElementById('transferName').textContent = settings.bank_holder ? `A.n. ${settings.bank_holder}` : '';
    
    // QRIS Settings (Media)
    try {
      const qris = await fetchAPI('/api/settings/media/qris_data');
      if (qris && qris.data) {
        document.getElementById('qrisImage').src = qris.data;
        document.getElementById('qrisImage').style.display = 'block';
        document.getElementById('qrisEmpty').style.display = 'none';
      }
    } catch (_) {}
    
  } catch (err) {
    console.warn('Gagal load settings:', err);
  }
}

// ─── Render Summary ───────────────────────────────────────────
function renderSummary() {
  document.getElementById('summaryCustomerName').textContent = orderData.customer_name || '—';
  document.getElementById('summaryTableNumber').textContent  = orderData.table_number || '—';
  
  const itemsHtml = orderData.items.map(i => `
    <div class="summary-item">
      <div class="summary-item-qty">${i.qty}x</div>
      <div class="summary-item-name">
        <div style="font-weight:600">${i.product_name || i.product?.name || i.name || 'Produk'}</div>
        ${i.note ? `<div class="text-xs text-muted">Catatan: ${i.note}</div>` : ''}
      </div>
      <div class="summary-item-subtotal">${formatRupiah((i.price || i.product?.price || 0) * i.qty)}</div>
    </div>
  `).join('');
  document.getElementById('summaryItemsList').innerHTML = itemsHtml;
  
  document.getElementById('summarySubtotal').textContent = formatRupiah(orderData.subtotal);
  if (orderData.discount > 0) {
    document.getElementById('summaryDiscountRow').style.display = 'flex';
    document.getElementById('summaryDiscount').textContent = `- ${formatRupiah(orderData.discount)}`;
  }
  if (orderData.tax > 0) {
    document.getElementById('summaryTaxRow').style.display = 'flex';
    document.getElementById('summaryTax').textContent = formatRupiah(orderData.tax);
  }
  document.getElementById('summaryTotal').textContent = formatRupiah(orderData.total);
}

// ─── Methods ──────────────────────────────────────────────────
function selectMethod(method, el) {
  currentMethod = method;
  document.querySelectorAll('.payment-method-item').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  
  document.querySelectorAll('.method-detail-section').forEach(e => e.classList.remove('active'));
  
  if (method === 'tunai')    document.getElementById('sectionTunai').classList.add('active');
  if (method === 'qris')     document.getElementById('sectionQris').classList.add('active');
  if (method === 'transfer') document.getElementById('sectionTransfer').classList.add('active');
  
  // Set amounts for non-cash
  if (method !== 'tunai') {
    setCash(orderData.total, true); 
  }
}

// ─── Cash Handling ────────────────────────────────────────────
function formatCurrencyInput(input) {
  let val = input.value.replace(/[^0-9]/g, '');
  if (val === '') {
    input.value = '';
    return;
  }
  input.value = new Intl.NumberFormat('id-ID').format(parseInt(val, 10));
}

function getPaidAmount() {
  const val = document.getElementById('amountPaid').value.replace(/[^0-9]/g, '');
  return val ? parseInt(val, 10) : 0;
}

function setCash(amount, exact = false) {
  const input = document.getElementById('amountPaid');
  if (exact) {
    input.value = amount > 0 ? new Intl.NumberFormat('id-ID').format(amount) : '';
  } else {
    input.value = '';
  }
  calculateChange();
}

function addCash(amount) {
  const current = getPaidAmount();
  setCash(current + amount, true);
}

function calculateChange() {
  const paid = getPaidAmount();
  const total = orderData.total;
  const change = paid - total;
  
  const row = document.getElementById('changeRow');
  const valEl = document.getElementById('changeAmount');
  
  row.classList.remove('positive', 'negative');
  if (paid === 0) {
    valEl.textContent = 'Rp 0';
  } else if (change < 0) {
    row.classList.add('negative');
    valEl.textContent = `Kurang ${formatRupiah(Math.abs(change))}`;
  } else {
    row.classList.add('positive');
    valEl.textContent = formatRupiah(change);
  }
}

// ─── Process Payment ──────────────────────────────────────────
function cancelPayment() {
  // Go back to kasir, cart is still in localStorage so it will load automatically 
  // (actually wait, we need to make sure kasir reads it? No, kasir has it in its own JS state if we didn't refresh. 
  // But if we refreshed, it's lost unless we persist. For now just redirect back).
  window.location.href = '/kasir';
}

async function processPayment() {
  if (isProcessing) return;
  
  let amountPaid = orderData.total;
  let change = 0;
  
  if (currentMethod === 'tunai') {
    amountPaid = getPaidAmount();
    if (amountPaid < orderData.total) {
      showToast('Uang dibayar kurang dari total belanja.', 'warning');
      return;
    }
    change = amountPaid - orderData.total;
  }
  
  try {
    isProcessing = true;
    const btn = document.getElementById('btnProcessPayment');
    btn.innerHTML = '<div class="spinner spinner-sm" style="border-color:#fff;border-top-color:transparent"></div> Memproses...';
    
    // 1. Create transaction
    orderData.payment_method = currentMethod; // override default
    // Ensure notes are correct
    const itemsPayload = orderData.items.map(i => ({
      product_id: i.product_id || i.product?.id,
      name: i.product_name || i.name || i.product?.name,
      price: i.price || i.product?.price,
      qty: i.qty,
      notes: i.note || ''
    }));
    orderData.items = itemsPayload;
    
    const txnResult = await fetchAPI('/api/transactions', { method: 'POST', body: orderData });
    const txnId = txnResult.id;
    
    // 2. Pay transaction
    const payResult = await fetchAPI(`/api/transactions/${txnId}`, {
      method: 'PUT',
      body: { action: 'pay', payment_method: currentMethod, amount_paid: amountPaid }
    });
    
    // 3. Clear cart
    localStorage.removeItem('hoki_checkout_cart');
    
    // 4. Prepare Receipt Modal
    await prepareReceipt(txnId, amountPaid, change);
    
    if (settings.auto_print_receipt === '1') {
      printReceipt();
    }
    openModal('receiptModal');
    
  } catch (err) {
    showToast('Gagal memproses pembayaran: ' + err.message, 'error');
    const btn = document.getElementById('btnProcessPayment');
    btn.innerHTML = '<span class="material-symbols-outlined icon-sm">check_circle</span> Coba Lagi';
  } finally {
    isProcessing = false;
  }
}

// ─── Receipt ──────────────────────────────────────────────────
async function prepareReceipt(txnId, amountPaid, change) {
  try {
    const txn = await fetchAPI(`/api/transactions/${txnId}`);
    
    // Header
    document.getElementById('receiptStoreName').textContent = settings.nama_usaha || 'HokiApp';
    document.getElementById('receiptStoreAddress').textContent = settings.alamat || '';
    document.getElementById('receiptStorePhone').textContent = settings.telepon ? `Telp: ${settings.telepon}` : '';
    
    document.getElementById('receiptOrderCode').textContent = txn.order_code;
    document.getElementById('receiptDate').textContent = formatDateTime(txn.created_at);
    document.getElementById('receiptCashier').textContent = txn.cashier_display_name || txn.cashier_name || 'Kasir';
    
    // Logo
    if (settings.receipt_logo_enabled === '1') {
      try {
        const logo = await fetchAPI('/api/settings/media/logo_data');
        if (logo && logo.data) {
          const img = document.getElementById('receiptLogo');
          img.src = logo.data;
          img.style.display = 'block';
        }
      } catch (_) {}
    }
    
    // Items
    const tbody = document.getElementById('receiptItems');
    tbody.innerHTML = (txn.items || []).map(i => `
      <tr>
        <td class="col-qty">${i.quantity}x</td>
        <td>${i.product_name}</td>
        <td class="col-price">${formatRupiah(i.subtotal)}</td>
      </tr>
    `).join('');
    
    // Totals
    document.getElementById('receiptSubtotal').textContent = formatRupiah(txn.subtotal);
    
    if (txn.discount_amount > 0) {
      document.getElementById('receiptRowDisc').style.display = '';
      document.getElementById('receiptDiscount').textContent = `- ${formatRupiah(txn.discount_amount)}`;
    }
    if (txn.tax_amount > 0) {
      document.getElementById('receiptRowTax').style.display = '';
      document.getElementById('receiptTax').textContent = formatRupiah(txn.tax_amount);
    }
    
    document.getElementById('receiptTotal').textContent = formatRupiah(txn.total);
    
    // Payment Details
    const methodNames = { 'tunai': 'TUNAI', 'qris': 'QRIS', 'transfer': 'TRANSFER' };
    document.getElementById('receiptMethod').textContent = methodNames[txn.payment_method] || txn.payment_method.toUpperCase();
    document.getElementById('receiptPaid').textContent   = formatRupiah(amountPaid);
    document.getElementById('receiptChange').textContent = formatRupiah(change);
    
    // Footer
    document.getElementById('receiptFooter').textContent = settings.receipt_footer || 'Terima kasih atas kunjungan Anda!';
    
  } catch (err) {
    console.error('Gagal memuat detail struk', err);
  }
}

function printReceipt() {
  window.print();
}

function finishCheckout() {
  window.location.href = '/kasir';
}
