/* ============================================================
   HokiApp v2.0 — Kasir POS Logic (kasir.js)
   ============================================================ */
'use strict';

// ─── State ────────────────────────────────────────────────────
let cart         = [];    // [{product, qty, note}]
let allProducts  = [];
let allCategories= [];
let activeCategory = 'all';
let activeNoteIndex= null;
let pendingOrders  = [];
let settings       = {};
let taxRate        = 0;
let taxEnabled     = false;
let discountEnabled= false;

// Test mode mock for native confirm
if (window.location.search.includes('test=1')) {
  window.confirm = () => true;
}

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await Promise.all([loadProducts(), loadCategories()]);
  initSearch();
  loadPendingBadge();
});

// ─── Settings ─────────────────────────────────────────────────
async function loadSettings() {
  try {
    settings = await fetchAPI('/api/settings');
    taxEnabled     = settings.tax_enabled !== '0';
    taxRate        = parseFloat(settings.tax_rate) || 0;
    discountEnabled= settings.discount_enabled !== '0';

    // Show/hide UI based on settings
    const taxRow = document.getElementById('taxRow');
    if (taxRow) taxRow.style.display = taxEnabled ? '' : 'none';

    const taxLabel = document.getElementById('taxRateLabel');
    if (taxLabel) taxLabel.textContent = taxRate;

    const discountRow = document.getElementById('discountRow');
    if (discountRow) discountRow.style.display = discountEnabled ? '' : 'none';

    const custInput = document.getElementById('customerName');
    if (custInput && settings.customer_name_enabled === '0') custInput.style.display = 'none';

    const tableInput = document.getElementById('tableNumber');
    if (tableInput && settings.table_number_enabled === '0') tableInput.style.display = 'none';
  } catch (err) {
    console.warn('Gagal load settings:', err.message);
  }
}

// ─── Products ─────────────────────────────────────────────────
async function loadProducts() {
  const grid = document.getElementById('menuGrid');
  if (!grid) return;

  try {
    allProducts = await fetchAPI('/api/products');
    renderMenuGrid(allProducts);
  } catch (err) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--error)">
      Gagal memuat menu: ${err.message}</div>`;
  }
}

// ─── Categories ───────────────────────────────────────────────
async function loadCategories() {
  try {
    allCategories = await fetchAPI('/api/categories');
    const bar = document.getElementById('categoryBar');
    if (!bar) return;

    allCategories.forEach(cat => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.id = `chip-${cat.id}`;
      chip.dataset.category = cat.id;
      chip.onclick = () => filterByCategory(cat.id, chip);
      chip.innerHTML = `<span class="material-symbols-outlined icon-xs">${cat.icon || 'category'}</span> ${cat.name}`;
      bar.appendChild(chip);
    });
  } catch (err) {
    console.warn('Gagal load kategori:', err.message);
  }
}

// ─── Filter ───────────────────────────────────────────────────
function filterByCategory(catId, el) {
  activeCategory = catId;
  document.querySelectorAll('#categoryBar .chip').forEach(c => c.classList.remove('active'));
  el?.classList.add('active');

  const q = document.getElementById('menuSearch')?.value.toLowerCase() || '';
  applyFilters(q);
}

function initSearch() {
  const input = document.getElementById('menuSearch');
  if (!input) return;
  input.addEventListener('input', debounce((e) => {
    applyFilters(e.target.value.toLowerCase());
  }, 200));
}

function applyFilters(query = '') {
  let filtered = allProducts;

  if (activeCategory !== 'all') {
    filtered = filtered.filter(p => String(p.category_id) === String(activeCategory));
  }
  if (query) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(query) ||
      (p.category_name || '').toLowerCase().includes(query)
    );
  }
  renderMenuGrid(filtered);
}

// ─── Render Menu Grid ─────────────────────────────────────────
function renderMenuGrid(products) {
  const grid = document.getElementById('menuGrid');
  if (!grid) return;

  if (!products || products.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1">
      <div class="empty-state">
        <span class="material-symbols-outlined">restaurant_menu</span>
        <h3>Menu tidak ditemukan</h3>
        <p>Coba kata kunci atau kategori lain</p>
      </div>
    </div>`;
    return;
  }

  grid.innerHTML = products.map(p => buildMenuCard(p)).join('');
}

function buildMenuCard(product) {
  const isOutOfStock  = product.stock !== null && product.stock <= 0;
  const cartItem      = cart.find(c => c.product.id === product.id);
  const cartQty       = cartItem ? cartItem.qty : 0;
  const hasImage      = product.has_image;

  // Stock bar
  const maxStock   = Math.max(product.stock_max || 50, product.stock || 1);
  const pct        = product.stock !== null ? Math.min(100, Math.round((product.stock / maxStock) * 100)) : 100;
  const stockClass = product.stock <= 0 ? 'empty' : product.stock <= 5 ? 'critical' : product.stock <= 10 ? 'low' : 'safe';
  const stockText  = product.stock !== null ? `Stok: ${product.stock} ${product.unit || ''}` : 'Stok tidak terbatas';

  return `
    <div class="menu-card ${isOutOfStock ? 'out-of-stock' : ''} ${cartQty > 0 ? 'in-cart' : ''}"
         id="mc-${product.id}"
         onclick="${isOutOfStock ? '' : `addToCart(${product.id})`}">

      <div class="menu-card-image">
        ${hasImage
          ? `<img src="/api/products/${product.id}/image" alt="${product.name}" loading="lazy"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
          : ''
        }
        <span class="material-symbols-outlined icon-fill" ${hasImage ? 'style="display:none"' : ''}>restaurant</span>

        ${isOutOfStock ? '<div class="out-of-stock-badge">HABIS</div>' : ''}
        ${cartQty > 0 ? `<div class="menu-card-qty-badge">${cartQty}</div>` : ''}

        ${!isOutOfStock ? `<div class="menu-card-add-overlay">
          <span class="material-symbols-outlined icon-fill">add_circle</span>
        </div>` : ''}
      </div>

      <div class="menu-card-body">
        <div class="menu-card-name">${product.name}</div>
        <div class="menu-card-price">${formatRupiah(product.price)}</div>
        <div class="menu-card-stock">${stockText}</div>
        ${product.stock !== null ? `
        <div class="menu-card-stock-bar">
          <div class="menu-card-stock-bar-fill ${stockClass}" style="width:${pct}%"></div>
        </div>` : ''}
      </div>
    </div>`;
}

// ─── Cart ──────────────────────────────────────────────────────
function addToCart(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;

  if (product.stock !== null && product.stock <= 0) {
    showToast(`${product.name} sudah habis!`, 'warning');
    return;
  }

  const existing = cart.find(c => c.product.id === productId);
  if (existing) {
    if (product.stock !== null && existing.qty >= product.stock) {
      showToast(`Stok ${product.name} tidak cukup!`, 'warning');
      return;
    }
    existing.qty++;
  } else {
    cart.push({ product, qty: 1, note: '' });
  }

  updateCartUI();
  refreshMenuCard(productId);
}

function updateQty(index, delta) {
  if (index < 0 || index >= cart.length) return;
  const item = cart[index];
  const newQty = item.qty + delta;

  if (newQty <= 0) {
    removeFromCart(index);
    return;
  }

  if (delta > 0 && item.product.stock !== null && newQty > item.product.stock) {
    showToast('Stok tidak cukup!', 'warning');
    return;
  }

  item.qty = newQty;
  updateCartUI();
  refreshMenuCard(item.product.id);
}

function removeFromCart(index) {
  const productId = cart[index]?.product.id;
  cart.splice(index, 1);
  updateCartUI();
  if (productId) refreshMenuCard(productId);
}

function clearCart() {
  if (cart.length === 0) return;
  if (!confirm('Bersihkan semua item di keranjang?')) return;
  const productIds = cart.map(c => c.product.id);
  cart = [];
  updateCartUI();
  productIds.forEach(id => refreshMenuCard(id));
  document.getElementById('customerName').value = '';
  document.getElementById('tableNumber').value  = '';
}

// ─── Cart UI ──────────────────────────────────────────────────
function updateCartUI() {
  const scroll = document.getElementById('cartScroll');
  const footer = document.getElementById('cartFooter');
  const badge  = document.getElementById('cartCountBadge');
  const payBtn = document.getElementById('btnPay');
  if (!scroll) return;

  // Count
  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  if (badge) badge.textContent = totalQty;

  if (cart.length === 0) {
    scroll.innerHTML = `<div class="cart-empty">
      <span class="material-symbols-outlined icon-fill" style="opacity:0.2">shopping_basket</span>
      <p>Pilih menu untuk<br>menambahkan ke keranjang</p>
    </div>`;
    if (footer) footer.style.display = 'none';
    if (payBtn) payBtn.disabled = true;
    return;
  }

  // Items
  scroll.innerHTML = cart.map((item, i) => `
    <div class="cart-item">
      <div class="qty-stepper">
        <button class="qty-btn" onclick="updateQty(${i}, -1)">
          <span class="material-symbols-outlined">remove</span>
        </button>
        <span class="qty-value">${item.qty}</span>
        <button class="qty-btn" onclick="updateQty(${i}, 1)">
          <span class="material-symbols-outlined">add</span>
        </button>
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name truncate">${item.product.name}</div>
        <div class="cart-item-price">${formatRupiah(item.product.price)} × ${item.qty}</div>
        ${item.note ? `<div class="cart-item-note">
          <span class="material-symbols-outlined icon-xs">sticky_note_2</span> ${item.note}
        </div>` : ''}
        <div style="display:flex;gap:4px;margin-top:4px">
          <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 6px;min-height:unset"
            onclick="openNoteModal(${i})">
            <span class="material-symbols-outlined" style="font-size:14px">edit_note</span>
            ${item.note ? 'Ubah' : 'Catatan'}
          </button>
          <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 6px;min-height:unset;color:var(--error)"
            onclick="removeFromCart(${i})">
            <span class="material-symbols-outlined" style="font-size:14px">delete</span>
          </button>
        </div>
      </div>
      <div class="cart-item-subtotal">${formatRupiah(item.product.price * item.qty)}</div>
    </div>
  `).join('');

  // Totals
  const subtotal  = cart.reduce((s, i) => s + (i.product.price * i.qty), 0);
  const discount  = discountEnabled ? (parseFloat(document.getElementById('discountInput')?.value) || 0) : 0;
  const taxAmt    = taxEnabled ? Math.round((subtotal - discount) * taxRate / 100) : 0;
  const total     = Math.max(0, subtotal - discount + taxAmt);

  document.getElementById('cartSubtotal').textContent = formatRupiah(subtotal);
  document.getElementById('cartDiscount').textContent = `- ${formatRupiah(discount)}`;
  document.getElementById('cartTax').textContent       = formatRupiah(taxAmt);
  document.getElementById('cartTotal').textContent     = formatRupiah(total);

  const discTotalRow = document.getElementById('discountTotalRow');
  if (discTotalRow) discTotalRow.style.display = (discount > 0) ? '' : 'none';

  if (footer) footer.style.display = '';
  if (payBtn) payBtn.disabled = false;
}

function refreshMenuCard(productId) {
  const card = document.getElementById(`mc-${productId}`);
  if (!card) return;

  const cartItem = cart.find(c => c.product.id === productId);
  const qty = cartItem ? cartItem.qty : 0;

  // Update qty badge
  const qtyBadge = card.querySelector('.menu-card-qty-badge');
  if (qty > 0) {
    if (qtyBadge) {
      qtyBadge.textContent = qty;
    } else {
      const imgDiv = card.querySelector('.menu-card-image');
      if (imgDiv) {
        const newBadge = document.createElement('div');
        newBadge.className = 'menu-card-qty-badge';
        newBadge.textContent = qty;
        imgDiv.appendChild(newBadge);
      }
    }
    card.classList.add('in-cart');
  } else {
    qtyBadge?.remove();
    card.classList.remove('in-cart');
  }
}

// ─── Note Modal ───────────────────────────────────────────────
function openNoteModal(index) {
  activeNoteIndex = index;
  const item = cart[index];
  if (!item) return;
  document.getElementById('noteModalItemName').textContent = item.product.name;
  document.getElementById('noteInput').value = item.note || '';
  openModal('noteModal');
}

function saveItemNote() {
  if (activeNoteIndex === null) return;
  const note = document.getElementById('noteInput').value.trim();
  cart[activeNoteIndex].note = note;
  closeModal('noteModal');
  updateCartUI();
}

// ─── Save Bill (Pending) ──────────────────────────────────────
async function saveBill() {
  if (cart.length === 0) return;
  const btn = document.getElementById('btnSaveBill');
  btn.disabled = true;
  try {
    const payload = buildPayload('pending');
    const result  = await fetchAPI('/api/transactions', { method: 'POST', body: payload });
    showToast(`Order ${result.order_code} disimpan sebagai pending.`, 'success');
    clearCartSilent();
    loadPendingBadge();
  } catch (err) {
    showToast('Gagal simpan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ─── Payment ──────────────────────────────────────────────────
function proceedToPayment() {
  if (cart.length === 0) return;

  const subtotal = cart.reduce((s, i) => s + (i.product.price * i.qty), 0);
  const discount = discountEnabled ? (parseFloat(document.getElementById('discountInput')?.value) || 0) : 0;
  const taxAmt   = taxEnabled ? Math.round((subtotal - discount) * taxRate / 100) : 0;
  const total    = Math.max(0, subtotal - discount + taxAmt);
  const payload  = buildPayload('pending');

  // Encode payload and redirect to payment page
  localStorage.setItem('hoki_checkout_cart', JSON.stringify({ ...payload, subtotal, discount, taxAmt, total }));
  window.location.href = '/payment';
}

function buildPayload(status = 'pending') {
  const subtotal = cart.reduce((s, i) => s + (i.product.price * i.qty), 0);
  const discount = discountEnabled ? (parseFloat(document.getElementById('discountInput')?.value) || 0) : 0;
  const taxAmt   = taxEnabled ? Math.round((subtotal - discount) * taxRate / 100) : 0;
  const total    = Math.max(0, subtotal - discount + taxAmt);
  return {
    customer_name: document.getElementById('customerName')?.value.trim() || '',
    table_number:  document.getElementById('tableNumber')?.value.trim()  || '',
    items: cart.map(c => ({
      product_id: c.product.id,
      qty: c.qty,
      price: c.product.price,
      note: c.note || '',
    })),
    subtotal,
    discount,
    tax: taxAmt,
    total,
    status,
    payment_method: 'tunai',
  };
}

// ─── Pending Orders ───────────────────────────────────────────
async function openPendingOrders() {
  const list = document.getElementById('pendingList');
  if (!list) return;
  list.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>Memuat...</p></div>';
  openModal('pendingModal');

  try {
    pendingOrders = await fetchAPI('/api/transactions/pending');
    if (pendingOrders.length === 0) {
      list.innerHTML = '<div class="empty-state" style="padding:30px"><span class="material-symbols-outlined">inbox</span><p>Tidak ada pesanan pending</p></div>';
      return;
    }
    list.innerHTML = pendingOrders.map(order => `
      <div class="pending-item" onclick="loadPendingOrder(${order.id})">
        <div>
          <div class="pending-item-code">#${order.order_code}</div>
          <div class="pending-item-time">${formatDateTime(order.created_at)}
            ${order.customer_name ? ` · ${order.customer_name}` : ''}
            ${order.table_number ? ` · Meja ${order.table_number}` : ''}</div>
          <div class="text-xs text-muted mt-xs">${(order.items || []).map(i => `${i.qty}× ${i.product_name}`).join(', ')}</div>
        </div>
        <div class="pending-item-right" style="display:flex;align-items:center;gap:12px">
          <div class="pending-item-total">${formatRupiah(order.total)}</div>
          <button class="btn-delete-pending" onclick="event.stopPropagation(); deletePendingOrder(${order.id}, '${order.order_code}')" title="Hapus Pesanan">
            <span class="material-symbols-outlined icon-sm">delete</span>
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="empty-state"><p style="color:var(--error)">Gagal: ${err.message}</p></div>`;
  }
}

async function loadPendingOrder(orderId) {
  const order = pendingOrders.find(o => o.id === orderId);
  if (!order) return;

  // Replace cart with pending order items
  cart = (order.items || []).map(i => {
    const product = allProducts.find(p => p.id === i.product_id) || {
      id: i.product_id, name: i.product_name, price: i.product_price || i.price, stock: null
    };
    return { product, qty: i.quantity || 1, note: i.notes || '' };
  });

  if (document.getElementById('customerName')) document.getElementById('customerName').value = order.customer_name || '';
  if (document.getElementById('tableNumber'))  document.getElementById('tableNumber').value  = order.table_number || '';

  updateCartUI();
  allProducts.forEach(p => refreshMenuCard(p.id));
  closeModal('pendingModal');
  showToast(`Order #${order.order_code} dimuat ke kasir.`, 'success');
}

async function deletePendingOrder(orderId, orderCode) {
  if (!confirm(`Hapus pesanan pending #${orderCode}? Aksi ini tidak dapat dibatalkan.`)) return;
  try {
    const result = await fetchAPI(`/api/transactions/${orderId}`, {
      method: 'DELETE'
    });
    showToast(result.message || 'Pesanan pending berhasil dihapus.', 'success');
    // Refresh modal list
    await openPendingOrders();
    // Update badge numbers
    await loadPendingBadge();
  } catch (err) {
    showToast('Gagal menghapus pesanan: ' + err.message, 'error');
  }
}

// ─── Clear Cart (Silent) ──────────────────────────────────────
function clearCartSilent() {
  const productIds = cart.map(c => c.product.id);
  cart = [];
  document.getElementById('customerName').value = '';
  document.getElementById('tableNumber').value  = '';
  if (document.getElementById('discountInput')) document.getElementById('discountInput').value = '';
  updateCartUI();
  productIds.forEach(id => refreshMenuCard(id));
}

// Re-expose pending badge update
async function loadPendingBadge() {
  try {
    const data = await fetchAPI('/api/transactions/pending');
    const count = data.length;
    const badge = document.getElementById('pendingCount');
    const navBadge = document.getElementById('pendingNavBadge');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
    if (navBadge) {
      navBadge.textContent = count;
      navBadge.style.display = count > 0 ? 'flex' : 'none';
    }
  } catch (_) {}
}
