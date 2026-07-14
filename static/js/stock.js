/* ============================================================
   HokiApp v2.0 — Stock Logic (stock.js)
   ============================================================ */
'use strict';

let allProducts   = [];
let allCategories = [];

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadCategories(), loadProducts()]);
  
  // Search listener
  const searchEl = document.getElementById('productSearch');
  if (searchEl) {
    searchEl.addEventListener('input', debounce((e) => {
      applyLocalFilters();
    }, 200));
  }
});

// ─── Load Categories ──────────────────────────────────────────
async function loadCategories() {
  try {
    allCategories = await fetchAPI('/api/categories');
    
    // Populate filter
    const filterCat = document.getElementById('filterCategory');
    if (filterCat) {
      filterCat.innerHTML = '<option value="all">Semua Kategori</option>' + 
        allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
    
    // Populate form select
    const formCat = document.getElementById('prodCategory');
    if (formCat) {
      formCat.innerHTML = '<option value="">Pilih Kategori</option>' + 
        allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
  } catch (err) {
    console.warn('Gagal memuat kategori:', err.message);
  }
}

// ─── Load Products ────────────────────────────────────────────
async function loadProducts() {
  const tbody = document.getElementById('productsTbody');
  if (!tbody) return;
  
  const catId = document.getElementById('filterCategory')?.value || 'all';
  tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:40px"><div class="spinner"></div><p>Memuat...</p></div></td></tr>`;
  
  try {
    const url = catId === 'all' ? '/api/products' : `/api/products?category_id=${catId}`;
    allProducts = await fetchAPI(url);
    applyLocalFilters();
    updateStats(allProducts);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="color:var(--error);padding:40px">${err.message}</div></td></tr>`;
  }
}

// ─── Filters & Render ─────────────────────────────────────────
function applyLocalFilters() {
  const query = document.getElementById('productSearch')?.value.toLowerCase() || '';
  const stockFilter = document.getElementById('filterStock')?.value || 'all';
  
  let filtered = allProducts;
  
  // Search
  if (query) {
    filtered = filtered.filter(p => p.name.toLowerCase().includes(query) || (p.category_name||'').toLowerCase().includes(query));
  }
  
  // Stock condition
  if (stockFilter === 'low') {
    filtered = filtered.filter(p => p.stock_qty !== null && p.stock_qty <= (p.low_stock_threshold || 5));
  } else if (stockFilter === 'available') {
    filtered = filtered.filter(p => p.stock_qty === null || p.stock_qty > (p.low_stock_threshold || 5));
  }
  
  renderTable(filtered);
}

function updateStats(products) {
  document.getElementById('statTotal').textContent = products.length;
  
  let low = 0, empty = 0;
  products.forEach(p => {
    if (p.stock_qty !== null) {
      if (p.stock_qty <= 0) empty++;
      else if (p.stock_qty <= (p.low_stock_threshold || 5)) low++;
    }
  });
  
  document.getElementById('statLow').textContent   = low;
  document.getElementById('statEmpty').textContent = empty;
}

function renderTable(products) {
  const tbody = document.getElementById('productsTbody');
  if (!tbody) return;
  
  if (products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:40px"><p>Tidak ada produk ditemukan</p></div></td></tr>`;
    return;
  }
  
  // We assume admin role is present if the adjust modal is in DOM.
  const isAdmin = !!document.getElementById('adjustModal');
  
  tbody.innerHTML = products.map(p => {
    let stockLabel = '';
    let stockBadge = '';
    
    if (p.stock_qty !== null) {
      const q = p.stock_qty;
      const t = p.low_stock_threshold || 5;
      
      let badgeCls = 'safe';
      if (q <= 0) badgeCls = 'danger';
      else if (q <= t) badgeCls = 'warning';
      
      stockBadge = `<span class="stock-badge ${badgeCls}">${q} ${p.stock_unit || ''}</span>`;
      stockLabel = q <= 0 ? 'Habis' : (q <= t ? 'Menipis' : 'Aman');
    } else {
      stockBadge = `<span class="stock-badge safe" style="background:transparent;border:1px solid var(--outline);color:var(--on-surface)">Unlimited</span>`;
      stockLabel = 'Unlimited';
    }
    
    const isAvail = p.is_available === 1;
    const catName = p.category_name || 'Tanpa Kategori';
    const hasImg  = p.has_image;
    
    return `<tr>
      <td>
        <div class="product-thumb-cell" ${hasImg ? `style="background-image:url('/api/products/${p.id}/image')"` : ''}>
          ${!hasImg ? `<span class="material-symbols-outlined" style="opacity:0.3;font-size:20px">restaurant</span>` : ''}
        </div>
      </td>
      <td>
        <div style="font-weight:700">${p.name}</div>
        <div class="text-xs text-muted" style="margin-top:4px"><span class="material-symbols-outlined icon-xs">category</span> ${catName}</div>
      </td>
      <td class="money" style="color:var(--primary);font-weight:700">${formatRupiah(p.price)}</td>
      <td class="stock-col-hide money" style="color:var(--on-surface-variant)">${formatRupiah(p.hpp || 0)}</td>
      <td>
        <div>${stockBadge}</div>
        ${p.stock_qty !== null ? `<div style="font-size:10px;margin-top:4px;color:var(--on-surface-variant)">Batas min: ${p.low_stock_threshold || 5}</div>` : ''}
      </td>
      <td class="stock-col-hide">
        <span class="badge ${isAvail ? 'badge-success' : 'badge-neutral'}">${isAvail ? 'Aktif' : 'Nonaktif'}</span>
        ${p.is_featured ? '<span class="badge badge-info" style="margin-left:4px">Promo</span>' : ''}
      </td>
      <td>
        <div style="display:flex;gap:4px;justify-content:flex-end">
          <button class="action-btn restock" title="Restock" onclick="openRestockModal(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.stock_qty})">
            <span class="material-symbols-outlined">add_circle</span>
          </button>
          ${isAdmin ? `
          <button class="action-btn" style="background:var(--warning-light);color:var(--warning)" title="Adjust Stok (Admin)" onclick="openAdjustModal(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.stock_qty})">
            <span class="material-symbols-outlined">tune</span>
          </button>
          ` : ''}
          <button class="action-btn edit" title="Edit Produk" onclick="openProductModal(${p.id})">
            <span class="material-symbols-outlined">edit</span>
          </button>
          ${isAdmin ? `
          <button class="action-btn delete" title="Hapus" onclick="deleteProduct(${p.id}, '${p.name.replace(/'/g, "\\'")}')">
            <span class="material-symbols-outlined">delete</span>
          </button>
          ` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─── Image Preview ────────────────────────────────────────────
function previewImage(input) {
  const file = input.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('imgPreview').src = e.target.result;
      document.getElementById('imgZone').classList.add('has-image');
      document.getElementById('removeImageFlag').value = '0';
    }
    reader.readAsDataURL(file);
  }
}

function removeImagePreview(e) {
  e.stopPropagation();
  document.getElementById('imgPreview').src = '';
  document.getElementById('imgZone').classList.remove('has-image');
  document.getElementById('prodImage').value = '';
  document.getElementById('removeImageFlag').value = '1';
}

// ─── Product Modal ────────────────────────────────────────────
async function openProductModal(prodId = null) {
  const isEdit = !!prodId;
  document.getElementById('productModalTitle').textContent = isEdit ? 'Edit Produk' : 'Tambah Produk Baru';
  document.getElementById('editProdId').value = prodId || '';
  
  // Reset form
  document.getElementById('productForm').reset();
  removeImagePreview({stopPropagation: ()=>{}});
  document.getElementById('removeImageFlag').value = '0';
  document.getElementById('stockEditHint').style.display = isEdit ? 'block' : 'none';
  document.getElementById('prodStock').disabled = isEdit;
  
  if (isEdit) {
    const p = allProducts.find(x => x.id === prodId);
    if (p) {
      document.getElementById('prodName').value      = p.name;
      document.getElementById('prodCategory').value  = p.category_id || '';
      document.getElementById('prodPrice').value     = p.price;
      document.getElementById('prodHpp').value       = p.hpp || 0;
      document.getElementById('prodDiscount').value  = p.discount_pct || 0;
      document.getElementById('prodStock').value     = p.stock_qty || 0;
      document.getElementById('prodThreshold').value = p.low_stock_threshold || 5;
      document.getElementById('prodUnit').value      = p.stock_unit || 'porsi';
      document.getElementById('prodAvailable').checked = p.is_available === 1;
      document.getElementById('prodFeatured').checked  = p.is_featured === 1;
      
      if (p.has_image) {
        document.getElementById('imgPreview').src = `/api/products/${p.id}/image?t=${Date.now()}`;
        document.getElementById('imgZone').classList.add('has-image');
      }
    }
  }
  
  openModal('productModal');
}

async function saveProduct() {
  const prodId = document.getElementById('editProdId').value;
  const isEdit = !!prodId;
  
  const formData = new FormData();
  formData.append('name', document.getElementById('prodName').value);
  formData.append('category_id', document.getElementById('prodCategory').value);
  formData.append('price', document.getElementById('prodPrice').value);
  formData.append('hpp', document.getElementById('prodHpp').value);
  formData.append('discount_pct', document.getElementById('prodDiscount').value);
  if (!isEdit) formData.append('stock_qty', document.getElementById('prodStock').value);
  formData.append('low_stock_threshold', document.getElementById('prodThreshold').value);
  formData.append('stock_unit', document.getElementById('prodUnit').value);
  formData.append('is_available', document.getElementById('prodAvailable').checked ? 1 : 0);
  formData.append('is_featured', document.getElementById('prodFeatured').checked ? 1 : 0);
  
  const fileInput = document.getElementById('prodImage');
  if (fileInput.files[0]) {
    formData.append('image', fileInput.files[0]);
  }
  
  if (isEdit && document.getElementById('removeImageFlag').value === '1') {
    formData.append('remove_image', '1');
  }
  
  try {
    const btn = document.querySelector('#productModal .btn-primary');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner spinner-sm"></div> Menyimpan...';
    
    if (isEdit) {
      await fetchAPI(`/api/products/${prodId}`, { method: 'PUT', body: formData });
    } else {
      await fetchAPI(`/api/products`, { method: 'POST', body: formData });
    }
    
    await loadProducts();
    closeModal('productModal');
    showToast(isEdit ? 'Produk diperbarui!' : 'Produk berhasil ditambahkan!', 'success');
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    const btn = document.querySelector('#productModal .btn-primary');
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-outlined icon-sm">save</span> Simpan Produk';
  }
}

async function deleteProduct(prodId, name) {
  if (!confirm(`Apakah Anda yakin ingin menghapus produk "${name}"? Data transaksi yang terkait mungkin ikut terpengaruh.`)) return;
  
  try {
    await fetchAPI(`/api/products/${prodId}`, { method: 'DELETE' });
    allProducts = allProducts.filter(p => p.id !== prodId);
    applyLocalFilters();
    updateStats(allProducts);
    showToast('Produk berhasil dihapus.', 'success');
  } catch (err) {
    showToast('Gagal menghapus: ' + err.message, 'error');
  }
}

// ─── Restock Modal ────────────────────────────────────────────
function openRestockModal(prodId, name, currentQty) {
  document.getElementById('restockProdId').value = prodId;
  document.getElementById('restockName').textContent = name;
  document.getElementById('restockCurrent').textContent = `Sisa stok: ${currentQty || 0}`;
  document.getElementById('restockQty').value = '';
  document.getElementById('restockNotes').value = '';
  openModal('restockModal');
}

async function saveRestock() {
  const prodId = document.getElementById('restockProdId').value;
  const qty    = parseInt(document.getElementById('restockQty').value);
  const notes  = document.getElementById('restockNotes').value.trim();
  
  if (!qty || qty <= 0) return showToast('Jumlah restock tidak valid.', 'warning');
  
  try {
    const btn = document.querySelector('#restockModal .btn-primary');
    btn.disabled = true;
    
    const result = await fetchAPI(`/api/products/${prodId}/restock`, {
      method: 'POST', body: { qty, notes }
    });
    
    // Update local data
    const prod = allProducts.find(p => p.id === parseInt(prodId));
    if (prod) prod.stock_qty = result.new_qty;
    applyLocalFilters();
    updateStats(allProducts);
    
    closeModal('restockModal');
    showToast(`Stok berhasil ditambah. Sisa stok sekarang: ${result.new_qty}`, 'success');
  } catch (err) {
    showToast('Gagal restock: ' + err.message, 'error');
  } finally {
    document.querySelector('#restockModal .btn-primary').disabled = false;
  }
}

// ─── Adjustment Modal ─────────────────────────────────────────
function openAdjustModal(prodId, name, currentQty) {
  const modal = document.getElementById('adjustModal');
  if (!modal) return;
  document.getElementById('adjustProdId').value = prodId;
  document.getElementById('adjustName').textContent = name;
  document.getElementById('adjustCurrent').textContent = `Sisa stok: ${currentQty || 0}`;
  document.getElementById('adjustQty').value = '';
  document.getElementById('adjustNotes').value = '';
  openModal('adjustModal');
}

async function saveAdjustment() {
  const prodId = document.getElementById('adjustProdId').value;
  const qty    = parseInt(document.getElementById('adjustQty').value);
  const notes  = document.getElementById('adjustNotes').value.trim();
  
  if (isNaN(qty) || qty === 0) return showToast('Jumlah tidak valid.', 'warning');
  if (!notes) return showToast('Alasan penyesuaian wajib diisi.', 'warning');
  
  try {
    const btn = document.querySelector('#adjustModal .btn-primary');
    btn.disabled = true;
    
    const result = await fetchAPI(`/api/products/${prodId}/adjust`, {
      method: 'POST', body: { qty, notes }
    });
    
    const prod = allProducts.find(p => p.id === parseInt(prodId));
    if (prod) prod.stock_qty = result.new_qty;
    applyLocalFilters();
    updateStats(allProducts);
    
    closeModal('adjustModal');
    showToast(`Stok disesuaikan. Sisa stok sekarang: ${result.new_qty}`, 'success');
  } catch (err) {
    showToast('Gagal menyesuaikan stok: ' + err.message, 'error');
  } finally {
    document.querySelector('#adjustModal .btn-primary').disabled = false;
  }
}
