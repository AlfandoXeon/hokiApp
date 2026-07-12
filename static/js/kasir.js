/* ============================================================
   HokiApp — Kasir Logic (kasir.js)
   ============================================================ */

'use strict';

// ─── State ───────────────────────────────────────────────────
let allProducts    = [];
let allCategories  = [];
let cart           = [];  // { product_id, name, price, qty, notes }
let currentTxnId   = null;
let taxEnabled     = true;
let taxRate        = 0.10;
let editNoteIndex  = null;

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadSettings(), loadCategories(), loadProducts()]);
  setupSearch();
  loadPendingCount();

  // Pending orders button
  document.getElementById('btnPendingOrders')?.addEventListener('click', openPendingOrders);
  document.getElementById('btnClearCart')?.addEventListener('click', clearCart);
});

// ─── Load Settings (tax) ─────────────────────────────────────
async function loadSettings() {
  try {
    const s = await fetchAPI('/api/settings');
    taxEnabled = s.tax_enabled === '1';
    taxRate    = parseFloat(s.tax_rate || '10') / 100;
    document.getElementById('taxRateLabel').textContent = s.tax_rate || '10';
    document.getElementById('taxRow').style.display = taxEnabled ? '' : 'none';
  } catch (_) {}
}

// ─── Categories ──────────────────────────────────────────────
async function loadCategories() {
  try {
    allCategories = await fetchAPI('/api/categories');
    renderCategoryChips();
  } catch (err) {
    showToast('Gagal memuat kategori', 'error');
  }
}

function renderCategoryChips() {
  const bar = document.getElementById('categoryBar');
  if (!bar) return;

  // Keep the "Semua Menu" chip
  const allChip = bar.querySelector('[data-category="all"]');
  bar.innerHTML = '';
  if (allChip) bar.appendChild(allChip);

  allCategories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.category = cat.id;
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px">${cat.icon || 'category'}</span> ${cat.name}`;
    btn.addEventListener('click', () => filterByCategory(cat.id, btn));
    bar.appendChild(btn);
  });

  // Activate 'all' by default
  document.getElementById('chip-all')?.addEventListener('click', () => filterByCategory('all', document.getElementById('chip-all')));
}

function filterByCategory(categoryId, activeBtn) {
  document.querySelectorAll('#categoryBar .chip').forEach(c => c.classList.remove('active'));
  activeBtn.classList.add('active');
  renderMenuGrid(categoryId === 'all' ? null : categoryId);
}

// ─── Products / Menu ─────────────────────────────────────────
async function loadProducts() {
  try {
    allProducts = await fetchAPI('/api/products');
    renderMenuGrid();
  } catch (err) {
    document.getElementById('menuGrid').innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--on-surface-variant)">
        Gagal memuat menu: ${err.message}
      </div>`;
  }
}

function renderMenuGrid(categoryId = null, searchTerm = '') {
  const grid = document.getElementById('menuGrid');
  if (!grid) return;

  let filtered = allProducts;
  if (categoryId) filtered = filtered.filter(p => p.category_id == categoryId);
  if (searchTerm) filtered = filtered.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1" class="empty-state">
        <span class="material-symbols-outlined">search_off</span>
        <p>Tidak ada menu yang cocok</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const isOutOfStock = p.stock_qty <= 0 || !p.is_available;
    const cartItem = cart.find(c => c.product_id === p.id);
    const inCart   = cartItem ? cartItem.qty : 0;

    const imageHtml = p.image_path
      ? `<img src="${p.image_path}" alt="${p.name}" loading="lazy">`
      : `<span class="material-symbols-outlined menu-placeholder-icon">restaurant</span>`;

    return `
      <div class="menu-card ${isOutOfStock ? 'out-of-stock' : ''}"
           data-id="${p.id}"
           onclick="${isOutOfStock ? '' : `addToCart(${p.id})`}">
        <div class="menu-card-image">
          ${imageHtml}
          ${isOutOfStock ? `<div class="out-of-stock-badge">HABIS</div>` : ''}
          ${inCart > 0 ? `<div class="menu-card-qty-badge" id="qbadge-${p.id}">${inCart}</div>` : ''}
          ${!isOutOfStock ? `<div class="menu-card-overlay"><div class="menu-card-add-hint"><span class="material-symbols-outlined" style="font-size:18px;margin-right:4px">add_circle</span>Tambah</div></div>` : ''}
        </div>
        <div class="menu-card-body">
          <div class="menu-card-name">${p.name}</div>
          <div class="menu-card-price">${formatRupiah(p.price)}</div>
          <div class="menu-card-stock text-muted">${p.stock_qty} ${p.stock_unit}</div>
        </div>
      </div>`;
  }).join('');
}

// ─── Search ─────────────────────────────────────────────────
function setupSearch() {
  // Search is in the top bar for kasir page
  const searchContainer = document.querySelector('.search-input-wrapper');
  if (!searchContainer) return;

  const input = searchContainer.querySelector('.search-input');
  if (input) {
    input.addEventListener('input', debounce((e) => {
      const activeCat = document.querySelector('#categoryBar .chip.active');
      const catId = activeCat?.dataset.category === 'all' ? null : activeCat?.dataset.category;
      renderMenuGrid(catId, e.target.value);
    }, 200));
  }
}

// ─── Cart Management ─────────────────────────────────────────
function addToCart(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;

  const existing = cart.find(c => c.product_id === productId);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({
      product_id: productId,
      name:  product.name,
      price: product.price,
      qty:   1,
      notes: '',
    });
  }

  updateCartUI();
  // Update quantity badge on menu card
  updateMenuCardBadge(productId);
}

function updateQty(index, delta) {
  if (!cart[index]) return;
  cart[index].qty += delta;
  if (cart[index].qty <= 0) {
    const prodId = cart[index].product_id;
    cart.splice(index, 1);
    updateMenuCardBadge(prodId, true);
  } else {
    updateMenuCardBadge(cart[index].product_id);
  }
  updateCartUI();
}

function removeFromCart(index) {
  const prodId = cart[index]?.product_id;
  cart.splice(index, 1);
  if (prodId) updateMenuCardBadge(prodId, true);
  updateCartUI();
}

function clearCart() {
  if (cart.length === 0) return;
  if (!confirm('Bersihkan semua item di keranjang?')) return;
  cart = [];
  currentTxnId = null;
  updateCartUI();
  // Remove all badges
  document.querySelectorAll('[id^="qbadge-"]').forEach(el => el.remove());
}

function updateMenuCardBadge(productId, remove = false) {
  const badgeId = `qbadge-${productId}`;
  let badge = document.getElementById(badgeId);
  const cartItem = cart.find(c => c.product_id === productId);
  const qty = cartItem?.qty || 0;

  if (remove || qty === 0) {
    badge?.remove();
    return;
  }

  const imgDiv = document.querySelector(`.menu-card[data-id="${productId}"] .menu-card-image`);
  if (!imgDiv) return;

  if (!badge) {
    badge = document.createElement('div');
    badge.id = badgeId;
    badge.className = 'menu-card-qty-badge';
    imgDiv.appendChild(badge);
  }
  badge.textContent = qty;
}

// ─── Note Modal ──────────────────────────────────────────────
function openNoteModal(index) {
  editNoteIndex = index;
  const item = cart[index];
  if (!item) return;
  document.getElementById('noteModalItemName').textContent = item.name;
  document.getElementById('noteInput').value = item.notes || '';
  openModal('noteModal');
}

function saveItemNote() {
  if (editNoteIndex === null) return;
  cart[editNoteIndex].notes = document.getElementById('noteInput').value.trim();
  updateCartUI();
  closeModal('noteModal');
}

// ─── Render Cart UI ──────────────────────────────────────────
function updateCartUI() {
  const emptyState = document.getElementById('cartEmptyState');
  const cartList   = document.getElementById('cartItemsList');
  const footer     = document.getElementById('cartFooter');
  if (!cartList) return;

  if (cart.length === 0) {
    // Show empty state inside list
    cartList.innerHTML = `
      <div class="cart-empty" id="cartEmptyState">
        <span class="material-symbols-outlined">shopping_cart</span>
        <p>Keranjang kosong<br>Pilih menu untuk menambahkan</p>
      </div>`;
    if (footer) footer.style.display = 'none';
    return;
  }

  if (footer) footer.style.display = '';

  cartList.innerHTML = cart.map((item, i) => `
    <div class="cart-item" id="cartItem-${i}">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price-sub">${formatRupiah(item.price)} × ${item.qty} = <strong>${formatRupiah(item.price * item.qty)}</strong></div>
        ${item.notes ? `<div class="cart-item-note">📝 ${item.notes}</div>` : ''}
        <button class="btn btn-ghost btn-sm" style="padding:2px 8px;height:auto;font-size:11px;margin-top:4px;color:var(--on-surface-variant)" onclick="openNoteModal(${i})">
          <span class="material-symbols-outlined" style="font-size:14px">edit_note</span>
          ${item.notes ? 'Edit catatan' : 'Tambah catatan'}
        </button>
      </div>
      <div class="qty-stepper">
        <button class="qty-btn" onclick="updateQty(${i}, -1)">
          <span class="material-symbols-outlined">remove</span>
        </button>
        <span class="qty-value">${item.qty}</span>
        <button class="qty-btn" onclick="updateQty(${i}, 1)">
          <span class="material-symbols-outlined">add</span>
        </button>
      </div>
    </div>
    ${i < cart.length - 1 ? '<hr class="cart-divider">' : ''}
  `).join('');

  // Update totals
  const subtotal = cart.reduce((sum, c) => sum + c.price * c.qty, 0);
  const tax      = taxEnabled ? Math.round(subtotal * taxRate) : 0;
  const total    = subtotal + tax;

  document.getElementById('cartSubtotal').textContent = formatRupiah(subtotal);
  document.getElementById('cartTax').textContent = formatRupiah(tax);
  document.getElementById('cartTotal').textContent = formatRupiah(total);

  // Enable/disable pay button
  const btnPay = document.getElementById('btnPay');
  if (btnPay) btnPay.disabled = cart.length === 0;
}

// ─── Save Bill (Pending) ─────────────────────────────────────
async function saveBill() {
  if (cart.length === 0) return showToast('Keranjang masih kosong.', 'warning');

  try {
    let data;
    if (currentTxnId) {
      // Update existing pending transaction
      data = await fetchAPI(`/api/transactions/${currentTxnId}`, {
        method: 'PUT',
        body: { action: 'update_items', items: cart.map(c => ({...c, qty: c.qty})) }
      });
      showToast('Bill diperbarui.', 'success');
    } else {
      data = await fetchAPI('/api/transactions', {
        method: 'POST',
        body: { items: cart.map(c => ({ product_id: c.product_id, name: c.name, price: c.price, qty: c.qty, notes: c.notes })) }
      });
      currentTxnId = data.id;
      showToast(`Bill disimpan — ${data.order_code}`, 'success');
    }
    loadPendingCount();
  } catch (err) {
    showToast('Gagal menyimpan bill: ' + err.message, 'error');
  }
}

// ─── Proceed to Payment ──────────────────────────────────────
async function proceedToPayment() {
  if (cart.length === 0) return showToast('Keranjang masih kosong.', 'warning');

  try {
    let txnId = currentTxnId;

    if (!txnId) {
      // Create new transaction
      const data = await fetchAPI('/api/transactions', {
        method: 'POST',
        body: { items: cart.map(c => ({ product_id: c.product_id, name: c.name, price: c.price, qty: c.qty, notes: c.notes })) }
      });
      txnId = data.id;
    } else {
      // Update existing
      await fetchAPI(`/api/transactions/${txnId}`, {
        method: 'PUT',
        body: { action: 'update_items', items: cart.map(c => ({...c, qty: c.qty})) }
      });
    }

    window.location.href = `/payment/${txnId}`;
  } catch (err) {
    showToast('Gagal memproses: ' + err.message, 'error');
  }
}

// ─── Cancel Current Order ─────────────────────────────────────
async function cancelCurrentOrder() {
  if (cart.length === 0) return;
  if (!confirm('Batalkan pesanan ini?')) return;

  if (currentTxnId) {
    try {
      await fetchAPI(`/api/transactions/${currentTxnId}`, {
        method: 'PUT',
        body: { action: 'cancel' }
      });
    } catch (_) {}
  }

  cart = [];
  currentTxnId = null;
  updateCartUI();
  document.querySelectorAll('[id^="qbadge-"]').forEach(el => el.remove());
  showToast('Pesanan dibatalkan.', 'info');
  loadPendingCount();
}

// ─── Pending Orders ─────────────────────────────────────────
async function loadPendingCount() {
  try {
    const data = await fetchAPI('/api/transactions/pending');
    const countEl = document.getElementById('pendingCount');
    if (countEl) {
      if (data.length > 0) {
        countEl.textContent = data.length;
        countEl.style.display = 'flex';
      } else {
        countEl.style.display = 'none';
      }
    }
  } catch (_) {}
}

async function openPendingOrders() {
  openModal('pendingModal');
  const list = document.getElementById('pendingList');
  if (!list) return;

  list.innerHTML = '<div class="spinner" style="margin:20px auto"></div>';

  try {
    const txns = await fetchAPI('/api/transactions/pending');

    if (txns.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>Tidak ada pesanan pending</p></div>';
      return;
    }

    list.innerHTML = txns.map(t => `
      <div class="pending-item ${currentTxnId === t.id ? 'selected' : ''}"
           onclick="loadPendingOrder(${t.id})">
        <div>
          <div style="font-weight:700">#${t.order_code}</div>
          <div style="font-size:12px;color:var(--on-surface-variant)">${formatDateTime(t.created_at)}</div>
        </div>
        <div style="font-weight:700;color:var(--primary)">${formatRupiah(t.total)}</div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<p style="text-align:center;padding:20px;color:var(--error)">Error: ${err.message}</p>`;
  }
}

async function loadPendingOrder(txnId) {
  try {
    const data = await fetchAPI(`/api/transactions/${txnId}`);
    cart = data.items.map(item => ({
      product_id: item.product_id,
      name:  item.product_name,
      price: item.product_price,
      qty:   item.quantity,
      notes: item.notes || '',
    }));
    currentTxnId = txnId;
    updateCartUI();
    // Update menu badges
    document.querySelectorAll('[id^="qbadge-"]').forEach(el => el.remove());
    cart.forEach(c => updateMenuCardBadge(c.product_id));
    closeModal('pendingModal');
    showToast(`Pesanan #${data.order_code} dimuat ke keranjang.`, 'success');
  } catch (err) {
    showToast('Gagal memuat pesanan: ' + err.message, 'error');
  }
}
