/* ============================================================
   HokiApp — Settings Logic (settings.js)
   ============================================================ */

'use strict';

// ─── State ────────────────────────────────────────────────────
let allUsers    = [];
let editUserId  = null;

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadSettings(), loadUsers()]);
});

// ─── Settings Load ─────────────────────────────────────────────
async function loadSettings() {
  try {
    const s = await fetchAPI('/api/settings');

    // Profile
    document.getElementById('settingNama').value    = s.nama_usaha || '';
    document.getElementById('settingAlamat').value  = s.alamat     || '';
    document.getElementById('settingTelepon').value = s.telepon    || '';
    document.getElementById('settingEmail').value   = s.email      || '';

    // Tax
    document.getElementById('taxEnabled').checked = s.tax_enabled !== '0';
    document.getElementById('taxRate').value      = s.tax_rate || '10';

    // Receipt
    document.getElementById('receiptFooter').value = s.receipt_footer || '';
    document.getElementById('bankName').value      = s.bank_name    || '';
    document.getElementById('bankAccount').value   = s.bank_account || '';
    document.getElementById('bankHolder').value    = s.bank_holder  || '';

  } catch (err) {
    showToast('Gagal memuat pengaturan: ' + err.message, 'error');
  }
}

// ─── Save Profile ─────────────────────────────────────────────
async function saveProfile() {
  const data = {
    nama_usaha: document.getElementById('settingNama').value.trim(),
    alamat:     document.getElementById('settingAlamat').value.trim(),
    telepon:    document.getElementById('settingTelepon').value.trim(),
    email:      document.getElementById('settingEmail').value.trim(),
  };

  try {
    await fetchAPI('/api/settings', { method: 'PUT', body: data });
    showToast('Profil warung berhasil disimpan.', 'success');
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  }
}

// ─── Save Tax Settings ─────────────────────────────────────────
async function saveTaxSettings() {
  const data = {
    tax_enabled: document.getElementById('taxEnabled').checked ? '1' : '0',
    tax_rate:    document.getElementById('taxRate').value || '10',
  };
  try {
    await fetchAPI('/api/settings', { method: 'PUT', body: data });
    showToast('Pengaturan pajak disimpan.', 'success');
  } catch (err) {
    showToast('Gagal menyimpan pajak: ' + err.message, 'error');
  }
}

// ─── Save Receipt Settings ────────────────────────────────────
async function saveReceiptSettings() {
  const data = {
    receipt_footer: document.getElementById('receiptFooter').value,
    bank_name:      document.getElementById('bankName').value.trim(),
    bank_account:   document.getElementById('bankAccount').value.trim(),
    bank_holder:    document.getElementById('bankHolder').value.trim(),
  };
  try {
    await fetchAPI('/api/settings', { method: 'PUT', body: data });
    showToast('Pengaturan struk disimpan.', 'success');
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  }
}

// ─── Users ─────────────────────────────────────────────────────
async function loadUsers() {
  try {
    allUsers = await fetchAPI('/api/users');
    renderUsersTable();
  } catch (err) {
    document.getElementById('usersTableBody').innerHTML = `
      <tr><td colspan="5" style="text-align:center;padding:32px;color:var(--error)">Gagal: ${err.message}</td></tr>`;
  }
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (allUsers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>Belum ada user</p></div></td></tr>`;
    return;
  }

  const roleColors = { admin: 'badge-info', kasir: 'badge-neutral' };

  tbody.innerHTML = allUsers.map(u => `
    <tr>
      <td class="td-bold">${u.nama_lengkap || '—'}</td>
      <td class="td-muted">${u.username}</td>
      <td><span class="badge ${roleColors[u.role] || 'badge-neutral'} user-role-badge">${u.role}</span></td>
      <td>
        <span class="badge ${u.is_active ? 'badge-success' : 'badge-neutral'}">
          ${u.is_active ? 'Aktif' : 'Nonaktif'}
        </span>
      </td>
      <td>
        <div style="display:flex;gap:6px;justify-content:flex-end">
          <button class="action-btn edit" title="Edit" onclick="openUserModal(${u.id})">
            <span class="material-symbols-outlined">edit</span>
          </button>
          <button class="action-btn delete" title="Hapus" onclick="deleteUser(${u.id}, '${u.username}')">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openUserModal(userId = null) {
  editUserId = userId;
  const isEdit = !!userId;

  document.getElementById('userModalTitle').textContent = isEdit ? 'Edit User' : 'Tambah User Baru';
  document.getElementById('editUserId').value           = userId || '';
  document.getElementById('userNama').value             = '';
  document.getElementById('userUsername').value         = '';
  document.getElementById('userPassword').value         = '';
  document.getElementById('userRole').value             = 'kasir';
  document.getElementById('userActive').checked         = true;

  const pwRequired = document.getElementById('pwRequired');
  const pwHint     = document.getElementById('pwHint');
  if (isEdit) {
    if (pwRequired) pwRequired.textContent = '(opsional)';
    if (pwHint) pwHint.style.display = '';
  } else {
    if (pwRequired) pwRequired.textContent = '*';
    if (pwHint) pwHint.style.display = 'none';
  }

  if (isEdit) {
    const u = allUsers.find(x => x.id === userId);
    if (u) {
      document.getElementById('userNama').value     = u.nama_lengkap || '';
      document.getElementById('userUsername').value = u.username;
      document.getElementById('userRole').value     = u.role;
      document.getElementById('userActive').checked = !!u.is_active;
    }
  }

  openModal('userModal');
}

async function saveUser() {
  const isEdit   = !!editUserId;
  const nama     = document.getElementById('userNama').value.trim();
  const username = document.getElementById('userUsername').value.trim();
  const password = document.getElementById('userPassword').value;
  const role     = document.getElementById('userRole').value;
  const isActive = document.getElementById('userActive').checked;

  if (!username) return showToast('Username wajib diisi.', 'warning');
  if (!isEdit && !password) return showToast('Password wajib diisi untuk user baru.', 'warning');

  const body = { nama_lengkap: nama, username, role, is_active: isActive ? 1 : 0 };
  if (password) body.password = password;

  try {
    if (isEdit) {
      await fetchAPI(`/api/users/${editUserId}`, { method: 'PUT', body });
    } else {
      await fetchAPI('/api/users', { method: 'POST', body });
    }
    await loadUsers();
    closeModal('userModal');
    showToast(isEdit ? 'User berhasil diperbarui.' : 'User baru ditambahkan.', 'success');
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
}

async function deleteUser(userId, username) {
  if (!confirm(`Hapus user "${username}"? Aksi ini tidak bisa dibatalkan.`)) return;
  try {
    await fetchAPI(`/api/users/${userId}`, { method: 'DELETE' });
    allUsers = allUsers.filter(u => u.id !== userId);
    renderUsersTable();
    showToast('User berhasil dihapus.', 'success');
  } catch (err) {
    showToast('Gagal menghapus: ' + err.message, 'error');
  }
}
