/* ============================================================
   HokiApp — Stock Management Logic (stock.js)
   ============================================================ */

'use strict';

// ─── State ────────────────────────────────────────────────────
let allProducts   = [];
let allCategories = [];
let deleteTarget  = null;
let restockTarget = null;
let editMode      = false;

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadCategories(), loadProducts()]);
  setupFilters();
});

// ─── Load Categories ─────────────────────────────────────────
async function loadCategories() {
  try {
    allCategories = await fetchAPI('/api/categories');

    // Populate filter dropdown
    const filterSelect = document.getElementById('stockCategoryFilter');
    if (filterSelect) {
      allCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        filterSelect.appendChild(opt);
      });
    }

    // Populate modal select
    const modalSelect = document.getElementById('productCategory');
    if (modalSelect) {
      allCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        modalSelect.appendChild(opt);
      });
    }
  } catch (err) {
    showToast('Gagal memuat kategori: ' + err.message, 'error');
  }
}

// ─── Load Products ────────────────────────────────────────────
async function loadProducts() {
  try {
    allProducts = await fetchAPI('/api/products');
    renderTable();
  } catch (err) {
    document.getElementById('stockTableBody').innerHTML = `
      <tr><td colspan="7" style="text-align:center;padding:48px;color:var(--error)">
        Gagal memuat: ${err.message}
      </td></tr>`;
  }
}

// ─── Render Table ─────────────────────────────────────────────
function renderTable() {
  const search     = document.getElementById('stockSearch')?.value.toLowerCase() || '';
  const catFilter  = document.getElementById('stockCategoryFilter')?.value || 'all';
  const statFilter = document.getElementById('stockStatusFilter')?.value || 'all';

  let filtered = allProducts;
  if (search)                    filtered = filtered.filter(p => p.name.toLowerCase().includes(search));
  if (catFilter !== 'all')       filtered = filtered.filter(p => p.category_id == catFilter);
  if (statFilter !== 'all')      filtered = filtered.filter(p => getStockStatus(p) === statFilter);

  const tbody = document.getElementById('stockTableBody');
  const countEl = document.getElementById('productCount');
  if (countEl) countEl.textContent = `${filtered.length} produk`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="empty-state">
          <span class="material-symbols-outlined">search_off</span>
          <p>Tidak ada produk yang sesuai filter</p>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((p, i) => {
    const status      = getStockStatus(p);
    const statusBadge = getStatusBadge(status, p);
    const stockBar    = getStockBar(p, status);
    const imgHtml     = p.image_path
      ? `<img src="${p.image_path}" alt="${p.name}">`
      : `<span class="material-symbols-outlined">restaurant</span>`;

    return `
      <tr>
        <td class="td-muted">${i + 1}</td>
        <td>
          <div class="product-name-cell">
            <div class="product-thumb">${imgHtml}</div>
            <div>
              <div class="product-name-text">${p.name}</div>
              <div class="product-category-text">${p.category_name || 'Tanpa kategori'}</div>
            </div>
          </div>
        </td>
        <td class="td-bold">${formatRupiah(p.price)}</td>
        <td>
          <div class="stock-level-cell">
            <div class="stock-qty ${status === 'empty' ? 'text-error' : status === 'low' ? '' : ''}">${p.stock_qty}</div>
            <div class="stock-unit-text">${p.stock_unit}</div>
            ${stockBar}
          </div>
        </td>
        <td>${statusBadge}</td>
        <td>
          <div style="display:flex;align-items:center;justify-content:center">
            <label class="toggle" title="${p.is_available ? 'Tersedia' : 'Tidak tersedia'}">
              <input type="checkbox" ${p.is_available ? 'checked' : ''} onchange="toggleAvailability(${p.id}, this.checked)">
              <div class="toggle-track"></div>
            </label>
          </div>
        </td>
        <td>
          <div class="table-actions">
            <button class="action-btn" title="Restock" onclick="openRestockModal(${p.id})">
              <span class="material-symbols-outlined">add_circle</span>
            </button>
            <button class="action-btn edit" title="Edit" onclick="openProductModal(${p.id})">
              <span class="material-symbols-outlined">edit</span>
            </button>
            <button class="action-btn delete" title="Hapus" onclick="openDeleteModal(${p.id})">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function getStockStatus(p) {
  if (p.stock_qty <= 0) return 'empty';
  if (p.stock_qty <= p.low_stock_threshold / 2) return 'critical';
  if (p.stock_qty <= p.low_stock_threshold) return 'low';
  return 'safe';
}

function getStatusBadge(status, p) {
  const map = {
    safe:     '<span class="badge badge-success">Aman</span>',
    low:      '<span class="badge badge-warning">Menipis</span>',
    critical: '<span class="badge badge-danger">Kritis</span>',
    empty:    '<span class="badge badge-neutral">Habis</span>',
  };
  return map[status] || map.safe;
}

function getStockBar(p, status) {
  if (p.stock_qty <= 0) {
    return `<div class="stock-bar-wrapper"><div class="stock-bar empty" style="width:0%"></div></div>`;
  }
  const maxVisual = Math.max(p.stock_qty, p.low_stock_threshold * 2);
  const pct = Math.min(100, (p.stock_qty / maxVisual) * 100);
  return `<div class="stock-bar-wrapper"><div class="stock-bar ${status}" style="width:${pct}%"></div></div>`;
}

// ─── Filters Setup ────────────────────────────────────────────
function setupFilters() {
  const search  = document.getElementById('stockSearch');
  const catSel  = document.getElementById('stockCategoryFilter');
  const statSel = document.getElementById('stockStatusFilter');

  if (search)  search.addEventListener('input',  debounce(renderTable, 200));
  if (catSel)  catSel.addEventListener('change', renderTable);
  if (statSel) statSel.addEventListener('change', renderTable);
}

// ─── Toggle Availability ──────────────────────────────────────
async function toggleAvailability(productId, isAvailable) {
  try {
    await fetchAPI(`/api/products/${productId}`, {
      method: 'PUT',
      body: { is_available: isAvailable ? 1 : 0 }
    });
    const p = allProducts.find(x => x.id === productId);
    if (p) p.is_available = isAvailable ? 1 : 0;
    showToast(`${isAvailable ? 'Produk diaktifkan' : 'Produk dinonaktifkan'}.`, 'info');
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
    renderTable(); // Revert UI
  }
}

// ─── Product Modal ────────────────────────────────────────────
function openProductModal(productId = null) {
  editMode = !!productId;
  document.getElementById('productModalTitle').textContent = editMode ? 'Edit Produk' : 'Tambah Produk Baru';
  document.getElementById('editProductId').value = productId || '';

  // Reset form
  document.getElementById('productName').value      = '';
  document.getElementById('productCategory').value  = '';
  document.getElementById('productPrice').value     = '';
  document.getElementById('productStock').value     = '0';
  document.getElementById('productUnit').value      = 'porsi';
  document.getElementById('productThreshold').value = '5';
  document.getElementById('productAvailable').checked = true;
  removeImage();

  if (editMode) {
    const p = allProducts.find(x => x.id === productId);
    if (p) {
      document.getElementById('productName').value      = p.name;
      document.getElementById('productCategory').value  = p.category_id || '';
      document.getElementById('productPrice').value     = p.price;
      document.getElementById('productStock').value     = p.stock_qty;
      document.getElementById('productUnit').value      = p.stock_unit;
      document.getElementById('productThreshold').value = p.low_stock_threshold;
      document.getElementById('productAvailable').checked = !!p.is_available;

      if (p.image_path) {
        const preview = document.getElementById('imagePreview');
        const zone    = document.getElementById('imageUploadZone');
        const btnRemove = document.getElementById('btnRemoveImage');
        if (preview) { preview.src = p.image_path; preview.style.display = 'block'; }
        if (zone)    zone.classList.add('has-image');
        if (btnRemove) btnRemove.style.display = '';
      }
    }
  }

  openModal('productModal');
}

function previewImage(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const preview  = document.getElementById('imagePreview');
    const zone     = document.getElementById('imageUploadZone');
    const btnRemove= document.getElementById('btnRemoveImage');
    if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
    if (zone)    zone.classList.add('has-image');
    if (btnRemove) btnRemove.style.display = '';
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  const preview  = document.getElementById('imagePreview');
  const zone     = document.getElementById('imageUploadZone');
  const input    = document.getElementById('productImageInput');
  const btnRemove= document.getElementById('btnRemoveImage');
  if (preview)  { preview.src = ''; preview.style.display = 'none'; }
  if (zone)     zone.classList.remove('has-image');
  if (input)    input.value = '';
  if (btnRemove) btnRemove.style.display = 'none';
}

async function saveProduct() {
  const name      = document.getElementById('productName').value.trim();
  const price     = parseFloat(document.getElementById('productPrice').value);
  const stock     = parseInt(document.getElementById('productStock').value, 10);
  const threshold = parseInt(document.getElementById('productThreshold').value, 10);

  if (!name) return showToast('Nama produk wajib diisi.', 'warning');
  if (isNaN(price) || price < 0) return showToast('Harga tidak valid.', 'warning');

  const formData = new FormData();
  formData.append('name', name);
  formData.append('category_id', document.getElementById('productCategory').value || '');
  formData.append('price', price);
  formData.append('stock_qty', isNaN(stock) ? 0 : stock);
  formData.append('stock_unit', document.getElementById('productUnit').value);
  formData.append('low_stock_threshold', isNaN(threshold) ? 5 : threshold);
  formData.append('is_available', document.getElementById('productAvailable').checked ? '1' : '0');

  const fileInput = document.getElementById('productImageInput');
  if (fileInput?.files[0]) {
    formData.append('image', fileInput.files[0]);
  }

  const btnSave = document.getElementById('btnSaveProduct');
  btnSave.disabled = true;
  btnSave.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> Menyimpan...';

  try {
    const productId = document.getElementById('editProductId').value;
    const method = editMode ? 'PUT' : 'POST';
    const url    = editMode ? `/api/products/${productId}` : '/api/products';

    const updated = await fetchAPI(url, { method, body: formData });

    if (editMode) {
      const idx = allProducts.findIndex(p => p.id === parseInt(productId));
      if (idx >= 0) allProducts[idx] = { ...allProducts[idx], ...updated };
    } else {
      allProducts.push(updated);
    }

    renderTable();
    closeModal('productModal');
    showToast(editMode ? 'Produk diperbarui.' : 'Produk baru ditambahkan.', 'success');
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = '<span class="material-symbols-outlined icon-sm">save</span> Simpan';
  }
}

// ─── Delete ───────────────────────────────────────────────────
function openDeleteModal(productId) {
  deleteTarget = productId;
  const p = allProducts.find(x => x.id === productId);
  document.getElementById('deleteProductName').textContent =
    p ? `"${p.name}" akan dihapus secara permanen dan tidak bisa dikembalikan.` : 'Produk ini akan dihapus.';
  openModal('deleteModal');
}

async function confirmDelete() {
  if (!deleteTarget) return;
  const btn = document.getElementById('btnConfirmDelete');
  btn.disabled = true;

  try {
    await fetchAPI(`/api/products/${deleteTarget}`, { method: 'DELETE' });
    allProducts = allProducts.filter(p => p.id !== deleteTarget);
    renderTable();
    closeModal('deleteModal');
    showToast('Produk berhasil dihapus.', 'success');
  } catch (err) {
    showToast('Gagal menghapus: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    deleteTarget = null;
  }
}

// ─── Restock ──────────────────────────────────────────────────
function openRestockModal(productId) {
  restockTarget = productId;
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  document.getElementById('restockProductName').textContent = p.name;
  document.getElementById('restockCurrentQty').textContent  = p.stock_qty;
  document.getElementById('restockUnit').textContent        = p.stock_unit;
  document.getElementById('restockQty').value = '10';
  openModal('restockModal');
}

async function confirmRestock() {
  if (!restockTarget) return;
  const qty = parseInt(document.getElementById('restockQty').value, 10);
  if (!qty || qty <= 0) return showToast('Jumlah harus lebih dari 0.', 'warning');

  try {
    const result = await fetchAPI(`/api/products/${restockTarget}/restock`, {
      method: 'POST',
      body: { qty }
    });
    const p = allProducts.find(x => x.id === restockTarget);
    if (p) p.stock_qty = result.new_qty;
    renderTable();
    closeModal('restockModal');
    showToast(`Stok berhasil ditambah. Stok baru: ${result.new_qty}.`, 'success');
  } catch (err) {
    showToast('Gagal restock: ' + err.message, 'error');
  }
}
