/* ============================================================
   HokiApp v2.0 — Settings Logic (settings.js)
   ============================================================ */
'use strict';

let allUsers     = [];
let allCategories= [];
let editUserId   = null;
let editCatId    = null;

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadSettings(), loadUsers(), loadCategories()]);
});

// ─── Scroll to section ────────────────────────────────────────
function scrollToSection(id, navItem) {
  document.querySelectorAll('.settings-nav-item').forEach(el => el.classList.remove('active'));
  navItem.classList.add('active');
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Load Settings ─────────────────────────────────────────────
async function loadSettings() {
  try {
    const s = await fetchAPI('/api/settings');

    // Profile
    setVal('settingNama',      s.nama_usaha);
    setVal('settingAlamat',    s.alamat);
    setVal('settingTelepon',   s.telepon);
    setVal('settingEmail',     s.email);
    setVal('settingInstagram', s.instagram || '');

    // Tax
    setChecked('taxEnabled',     s.tax_enabled !== '0');
    setVal('taxRate',            s.tax_rate || '10');
    setChecked('discountEnabled', s.discount_enabled !== '0');

    // Receipt
    setVal('settingReceiptFooter', s.receipt_footer);
    setVal('settingBankName',      s.bank_name);
    setVal('settingBankAccount',   s.bank_account);
    setVal('settingBankHolder',    s.bank_holder);
    setChecked('receiptLogoEnabled', s.receipt_logo_enabled === '1');
    setChecked('autoPrintReceipt',   s.auto_print_receipt === '1');

    // Features
    setChecked('customerNameEnabled',  s.customer_name_enabled !== '0');
    setChecked('tableNumberEnabled',   s.table_number_enabled !== '0');
    setChecked('lowStockNotification', s.low_stock_notification !== '0');
    setChecked('splitBillEnabled',     s.split_bill_enabled === '1');

    updateTaxPreview();

    // Load media images
    await Promise.all([
      loadMediaPreview('logo_data',   'logoPreview',   'logoPreviewImg'),
      loadMediaPreview('banner_data', 'bannerPreview', 'bannerPreviewImg'),
      loadMediaPreview('qris_data',   'qrisPreview',   'qrisPreviewImg'),
    ]);

    // Initialize interactive receipt preview
    initReceiptPreview();
  } catch (err) {
    showToast('Gagal memuat pengaturan: ' + err.message, 'error');
  }
}

function setVal(id, val)     { const el = document.getElementById(id); if (el) el.value = val || ''; }
function setChecked(id, val) { const el = document.getElementById(id); if (el) el.checked = !!val; }

// ─── Media Preview ────────────────────────────────────────────
async function loadMediaPreview(mediaType, previewId, imgId) {
  try {
    const data = await fetchAPI(`/api/settings/media/${mediaType}`);
    if (data.data) {
      const img = document.getElementById(imgId);
      const preview = document.getElementById(previewId);
      if (img) img.src = data.data;
      if (preview) preview.classList.add('has-media');
      
      // Update receipt preview logo if available
      if (mediaType === 'logo_data') {
        const rpLogo = document.getElementById('rpLogo');
        if (rpLogo) {
          rpLogo.src = data.data;
          rpLogo.style.display = 'block';
        }
      }
    }
  } catch (_) {}
}

async function uploadMedia(mediaType, input) {
  const file = input.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  const previewMap = {
    'logo_data':   { preview: 'logoPreview',   img: 'logoPreviewImg' },
    'banner_data': { preview: 'bannerPreview', img: 'bannerPreviewImg' },
    'qris_data':   { preview: 'qrisPreview',   img: 'qrisPreviewImg' },
  };

  try {
    showToast('Mengupload...', 'info', 1500);
    const result = await fetchAPI(`/api/settings/media/${mediaType}`, {
      method: 'POST',
      body: formData,
    });

    const { preview, img } = previewMap[mediaType] || {};
    if (preview && img) {
      const previewEl = document.getElementById(preview);
      const imgEl = document.getElementById(img);
      if (imgEl) imgEl.src = result.data;
      if (previewEl) previewEl.classList.add('has-media');
    }

    // Dynamic UI Update (Instant feedback)
    if (mediaType === 'logo_data') {
      // 1. Update Sidebar Logo
      const sidebarImg = document.getElementById('sidebarLogoImg');
      const sidebarFallback = document.getElementById('sidebarLogoFallback');
      if (sidebarImg) {
        sidebarImg.src = result.data;
        sidebarImg.style.display = 'block';
      }
      if (sidebarFallback) {
        sidebarFallback.style.display = 'none';
      }

      // 2. Update Live Receipt Preview Logo
      const rpLogo = document.getElementById('rpLogo');
      if (rpLogo) {
        rpLogo.src = result.data;
        rpLogo.style.display = 'block';
      }
    }

    showToast('Media berhasil diupload!', 'success');
  } catch (err) {
    showToast('Gagal upload: ' + err.message, 'error');
  }
  input.value = '';
}

async function deleteMedia(mediaType) {
  if (!confirm('Hapus media ini?')) return;
  try {
    await fetchAPI(`/api/settings/media/${mediaType}`, { method: 'DELETE' });
    const previewMap = {
      'logo_data':   { preview: 'logoPreview',   img: 'logoPreviewImg' },
      'banner_data': { preview: 'bannerPreview', img: 'bannerPreviewImg' },
      'qris_data':   { preview: 'qrisPreview',   img: 'qrisPreviewImg' },
    };
    const { preview, img } = previewMap[mediaType] || {};
    if (preview) document.getElementById(preview)?.classList.remove('has-media');
    if (img)     { const el = document.getElementById(img); if (el) el.src = ''; }
    
    // Clear logo from sidebar and receipt preview
    if (mediaType === 'logo_data') {
      const sidebarImg = document.getElementById('sidebarLogoImg');
      const sidebarFallback = document.getElementById('sidebarLogoFallback');
      if (sidebarImg) {
        sidebarImg.src = '';
        sidebarImg.style.display = 'none';
      }
      if (sidebarFallback) {
        sidebarFallback.style.display = 'block';
      }

      const rpLogo = document.getElementById('rpLogo');
      if (rpLogo) {
        rpLogo.src = '';
        rpLogo.style.display = 'none';
      }
    }
    
    showToast('Media dihapus.', 'info');
  } catch (err) {
    showToast('Gagal menghapus: ' + err.message, 'error');
  }
}

// ─── Live Receipt Preview ──────────────────────────────────────
function initReceiptPreview() {
  const inputs = [
    { id: 'settingNama', targetId: 'rpUsahaName', fallback: 'Warung Penyetan Hoki' },
    { id: 'settingAlamat', targetId: 'rpUsahaAlamat', fallback: 'Jl. Raya No. 1, Surabaya, Jawa Timur' },
    { id: 'settingTelepon', targetId: 'rpUsahaTelepon', fallback: '0812-3456-7890' },
    { id: 'settingReceiptFooter', targetId: 'rpFooterText', fallback: 'Terima kasih atas kunjungan Anda!' }
  ];

  inputs.forEach(item => {
    const el = document.getElementById(item.id);
    if (el) {
      el.addEventListener('input', () => {
        const target = document.getElementById(item.targetId);
        if (target) {
          target.textContent = el.value.trim() || item.fallback;
        }
      });
      // Set initial values
      const target = document.getElementById(item.targetId);
      if (target) {
        target.textContent = el.value.trim() || item.fallback;
      }
    }
  });

  const taxEnabledEl = document.getElementById('taxEnabled');
  const taxRateEl = document.getElementById('taxRate');

  if (taxEnabledEl) {
    taxEnabledEl.addEventListener('change', updateReceiptPreview);
  }
  if (taxRateEl) {
    taxRateEl.addEventListener('input', updateReceiptPreview);
  }

  updateReceiptPreview();
}

function updateReceiptPreview() {
  const taxEnabled = document.getElementById('taxEnabled')?.checked;
  const rate = parseFloat(document.getElementById('taxRate')?.value || 10);
  const subtotal = 28000;
  
  const rpTaxRow = document.getElementById('rpTaxRow');
  const rpTotalVal = document.getElementById('rpTotalVal');
  
  if (rpTaxRow) {
    if (taxEnabled) {
      const tax = Math.round(subtotal * rate / 100);
      const total = subtotal + tax;
      rpTaxRow.style.display = 'flex';
      rpTaxRow.querySelector('span:first-child').textContent = `Pajak (${rate}%)`;
      rpTaxRow.querySelector('span:last-child').textContent = formatRupiah(tax);
      if (rpTotalVal) rpTotalVal.textContent = formatRupiah(total);
    } else {
      rpTaxRow.style.display = 'none';
      if (rpTotalVal) rpTotalVal.textContent = formatRupiah(subtotal);
    }
  }
}

// ─── Tax Preview ──────────────────────────────────────────────
function updateTaxPreview() {
  const enabled = document.getElementById('taxEnabled')?.checked;
  const rate    = parseFloat(document.getElementById('taxRate')?.value || 10);
  const sample  = 50000;
  const tax     = enabled ? Math.round(sample * rate / 100) : 0;
  const total   = sample + tax;

  const taxRow = document.getElementById('taxPreviewRow');
  if (taxRow) {
    taxRow.style.display = enabled ? '' : 'none';
    taxRow.querySelector('span:first-child').textContent = `Pajak (${rate}%)`;
    taxRow.querySelector('span:last-child').textContent  = formatRupiah(tax);
  }
  const totalEl = document.getElementById('taxPreviewTotal');
  if (totalEl) totalEl.textContent = formatRupiah(total);
}

// ─── Save Profile ─────────────────────────────────────────────
async function saveProfile() {
  try {
    await fetchAPI('/api/settings', { method: 'PUT', body: {
      nama_usaha:  document.getElementById('settingNama').value.trim(),
      alamat:      document.getElementById('settingAlamat').value.trim(),
      telepon:     document.getElementById('settingTelepon').value.trim(),
      email:       document.getElementById('settingEmail').value.trim(),
      instagram:   document.getElementById('settingInstagram').value.trim(),
    }});
    showToast('Profil berhasil disimpan.', 'success');
  } catch (err) { showToast('Gagal: ' + err.message, 'error'); }
}

// ─── Save Tax Settings ────────────────────────────────────────
async function saveTaxSettings() {
  try {
    await fetchAPI('/api/settings', { method: 'PUT', body: {
      tax_enabled:      document.getElementById('taxEnabled').checked ? '1' : '0',
      tax_rate:         document.getElementById('taxRate').value,
      discount_enabled: document.getElementById('discountEnabled').checked ? '1' : '0',
    }});
    showToast('Pengaturan pajak disimpan.', 'success');
  } catch (err) { showToast('Gagal: ' + err.message, 'error'); }
}

// ─── Save Receipt Settings ────────────────────────────────────
async function saveReceiptSettings() {
  try {
    await fetchAPI('/api/settings', { method: 'PUT', body: {
      receipt_footer:       document.getElementById('settingReceiptFooter').value,
      receipt_logo_enabled: document.getElementById('receiptLogoEnabled').checked ? '1' : '0',
      auto_print_receipt:   document.getElementById('autoPrintReceipt').checked ? '1' : '0',
      bank_name:            document.getElementById('settingBankName').value.trim(),
      bank_account:         document.getElementById('settingBankAccount').value.trim(),
      bank_holder:          document.getElementById('settingBankHolder').value.trim(),
    }});
    showToast('Pengaturan struk disimpan.', 'success');
  } catch (err) { showToast('Gagal: ' + err.message, 'error'); }
}

// ─── Save Feature Settings ────────────────────────────────────
async function saveFeatureSettings() {
  try {
    await fetchAPI('/api/settings', { method: 'PUT', body: {
      customer_name_enabled:  document.getElementById('customerNameEnabled').checked ? '1' : '0',
      table_number_enabled:   document.getElementById('tableNumberEnabled').checked ? '1' : '0',
      low_stock_notification: document.getElementById('lowStockNotification').checked ? '1' : '0',
      split_bill_enabled:     document.getElementById('splitBillEnabled').checked ? '1' : '0',
    }});
    showToast('Pengaturan fitur disimpan.', 'success');
  } catch (err) { showToast('Gagal: ' + err.message, 'error'); }
}

// ─── Users ────────────────────────────────────────────────────
async function loadUsers() {
  try {
    allUsers = await fetchAPI('/api/users');
    renderUsersTable();
  } catch (err) {
    document.getElementById('usersTableBody').innerHTML = `
      <tr><td colspan="5" style="text-align:center;padding:30px;color:var(--error)">Gagal: ${err.message}</td></tr>`;
  }
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (allUsers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state" style="padding:30px"><p>Belum ada user</p></div></td></tr>`;
    return;
  }

  const roleMap = { admin: 'badge-info', kasir: 'badge-neutral' };
  tbody.innerHTML = allUsers.map(u => {
    const initials = (u.nama_lengkap || u.username || 'U')[0].toUpperCase();
    const color    = u.avatar_color || '#1b6d24';
    return `<tr>
      <td>
        <div class="user-avatar-cell">
          <div class="user-avatar-small" style="background:${color}">${initials}</div>
          <div>
            <div style="font-weight:700">${u.nama_lengkap || '—'}</div>
            <div class="text-xs text-muted">${u.created_at ? formatDate(u.created_at) : ''}</div>
          </div>
        </div>
      </td>
      <td class="td-mono">${u.username}</td>
      <td><span class="badge ${roleMap[u.role] || 'badge-neutral'}">${u.role}</span></td>
      <td><span class="badge ${u.is_active ? 'badge-success' : 'badge-neutral'}">${u.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
      <td>
        <div style="display:flex;gap:4px;justify-content:flex-end">
          <button class="action-btn edit" title="Edit" onclick="openUserModal(${u.id})">
            <span class="material-symbols-outlined">edit</span>
          </button>
          <button class="action-btn delete" title="Hapus" onclick="deleteUser(${u.id}, '${u.username}')">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openUserModal(userId = null) {
  editUserId = userId;
  const isEdit = !!userId;
  document.getElementById('userModalTitle').textContent = isEdit ? 'Edit User' : 'Tambah User Baru';
  document.getElementById('editUserId').value = userId || '';
  document.getElementById('userNama').value   = '';
  document.getElementById('userUsername').value = '';
  document.getElementById('userPassword').value  = '';
  document.getElementById('userRole').value      = 'kasir';
  document.getElementById('userActive').checked  = true;
  document.getElementById('userAvatarColor').value = '#1b6d24';
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  document.querySelector('.color-swatch[data-color="#1b6d24"]')?.classList.add('selected');

  const pwReq  = document.getElementById('pwRequired');
  const pwHint = document.getElementById('pwHint');
  if (isEdit) { if (pwReq) pwReq.textContent = '(opsional)'; if (pwHint) pwHint.style.display = ''; }
  else        { if (pwReq) pwReq.textContent = '*';          if (pwHint) pwHint.style.display = 'none'; }

  if (isEdit) {
    const u = allUsers.find(x => x.id === userId);
    if (u) {
      document.getElementById('userNama').value      = u.nama_lengkap || '';
      document.getElementById('userUsername').value  = u.username;
      document.getElementById('userRole').value      = u.role;
      document.getElementById('userActive').checked  = !!u.is_active;
      const col = u.avatar_color || '#1b6d24';
      document.getElementById('userAvatarColor').value = col;
      document.querySelector(`.color-swatch[data-color="${col}"]`)?.classList.add('selected');
    }
  }
  openModal('userModal');
}

function selectAvatarColor(color, el) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('userAvatarColor').value = color;
}

async function saveUser() {
  const isEdit = !!editUserId;
  const nama   = document.getElementById('userNama').value.trim();
  const uname  = document.getElementById('userUsername').value.trim();
  const pw     = document.getElementById('userPassword').value;
  const role   = document.getElementById('userRole').value;
  const active = document.getElementById('userActive').checked;
  const color  = document.getElementById('userAvatarColor').value;

  if (!uname) return showToast('Username wajib diisi.', 'warning');
  if (!isEdit && !pw) return showToast('Password wajib untuk user baru.', 'warning');

  const body = { nama_lengkap: nama, username: uname, role, is_active: active ? 1 : 0, avatar_color: color };
  if (pw) body.password = pw;

  const btn = document.getElementById('btnSaveUser');
  btn.disabled = true;
  try {
    if (isEdit) {
      await fetchAPI(`/api/users/${editUserId}`, { method: 'PUT', body });
    } else {
      await fetchAPI('/api/users', { method: 'POST', body });
    }
    await loadUsers();
    closeModal('userModal');
    showToast(isEdit ? 'User diperbarui.' : 'User baru ditambahkan.', 'success');
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteUser(userId, username) {
  if (!confirm(`Hapus user "${username}"? Aksi ini tidak bisa dibatalkan.`)) return;
  try {
    await fetchAPI(`/api/users/${userId}`, { method: 'DELETE' });
    allUsers = allUsers.filter(u => u.id !== userId);
    renderUsersTable();
    showToast('User dihapus.', 'success');
  } catch (err) { showToast('Gagal: ' + err.message, 'error'); }
}

// ─── Categories ───────────────────────────────────────────────
async function loadCategories() {
  try {
    allCategories = await fetchAPI('/api/categories');
    renderCategoryGrid();
  } catch (err) {
    showToast('Gagal memuat kategori: ' + err.message, 'error');
  }
}

function renderCategoryGrid() {
  const grid = document.getElementById('categoryGrid');
  if (!grid) return;

  if (allCategories.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="padding:20px"><p>Belum ada kategori</p></div>';
    return;
  }

  grid.innerHTML = allCategories.map(cat => `
    <div class="cat-item">
      <div class="cat-item-icon">
        <span class="material-symbols-outlined icon-sm">${cat.icon || 'category'}</span>
      </div>
      <div class="cat-item-name">${cat.name}</div>
      <div class="text-muted text-xs" style="flex:1">${cat.description || ''}</div>
      <div class="cat-item-actions">
        <button class="action-btn edit" onclick="openCategoryModal(${cat.id})" title="Edit">
          <span class="material-symbols-outlined">edit</span>
        </button>
        <button class="action-btn delete" onclick="deleteCategory(${cat.id}, '${cat.name}')" title="Hapus">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
    </div>
  `).join('');
}

function openCategoryModal(catId = null) {
  editCatId = catId;
  const isEdit = !!catId;
  document.getElementById('catModalTitle').textContent = isEdit ? 'Edit Kategori' : 'Tambah Kategori';
  document.getElementById('editCatId').value = catId || '';
  document.getElementById('catName').value        = '';
  document.getElementById('catIcon').value        = 'category';
  document.getElementById('catDescription').value = '';
  document.getElementById('catSortOrder').value   = '0';

  if (isEdit) {
    const c = allCategories.find(x => x.id === catId);
    if (c) {
      document.getElementById('catName').value        = c.name;
      document.getElementById('catIcon').value        = c.icon || 'category';
      document.getElementById('catDescription').value = c.description || '';
      document.getElementById('catSortOrder').value   = c.sort_order || '0';
    }
  }
  openModal('categoryModal');
}

async function saveCategory() {
  const name = document.getElementById('catName').value.trim();
  if (!name) return showToast('Nama kategori wajib diisi.', 'warning');
  const body = {
    name,
    icon:        document.getElementById('catIcon').value.trim() || 'category',
    description: document.getElementById('catDescription').value.trim(),
    sort_order:  parseInt(document.getElementById('catSortOrder').value) || 0,
  };
  try {
    if (editCatId) {
      await fetchAPI(`/api/categories/${editCatId}`, { method: 'PUT', body });
    } else {
      await fetchAPI('/api/categories', { method: 'POST', body });
    }
    await loadCategories();
    closeModal('categoryModal');
    showToast(editCatId ? 'Kategori diperbarui.' : 'Kategori ditambahkan.', 'success');
  } catch (err) { showToast('Gagal: ' + err.message, 'error'); }
}

async function deleteCategory(catId, name) {
  if (!confirm(`Hapus kategori "${name}"? Produk di kategori ini akan tanpa kategori.`)) return;
  try {
    await fetchAPI(`/api/categories/${catId}`, { method: 'DELETE' });
    allCategories = allCategories.filter(c => c.id !== catId);
    renderCategoryGrid();
    showToast('Kategori dihapus.', 'success');
  } catch (err) { showToast('Gagal: ' + err.message, 'error'); }
}
