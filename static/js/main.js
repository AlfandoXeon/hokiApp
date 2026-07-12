/* ============================================================
   HokiApp — Global Utilities (main.js)
   ============================================================ */

'use strict';

// ─── Format Rupiah ───────────────────────────────────────────
function formatRupiah(amount) {
  if (amount === null || amount === undefined) return 'Rp 0';
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
}

function parseRupiah(str) {
  return parseInt(String(str).replace(/[^0-9]/g, ''), 10) || 0;
}

// ─── API Helper ─────────────────────────────────────────────
async function fetchAPI(url, options = {}) {
  const defaults = {
    headers: { 'Content-Type': 'application/json' },
  };
  const config = { ...defaults, ...options };
  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  } else if (config.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  } catch (err) {
    throw err;
  }
}

// ─── Toast Notification ─────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: 'check_circle', error: 'error', info: 'info', warning: 'warning' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="material-symbols-outlined toast-icon" style="font-size:20px">${icons[type] || 'info'}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  toast.addEventListener('click', () => removeToast(toast));

  setTimeout(() => removeToast(toast), duration);
}

function removeToast(toast) {
  toast.classList.add('toast-out');
  setTimeout(() => toast.remove(), 280);
}

// ─── Modal Helpers ───────────────────────────────────────────
function openModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
}

// Close modal when clicking overlay background
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Set current date in dashboard
  const dateEl = document.getElementById('currentDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }
});

// ─── Number Input Formatting ─────────────────────────────────
function formatNumberInput(input) {
  const raw = input.value.replace(/[^0-9]/g, '');
  const num = parseInt(raw, 10);
  if (!isNaN(num)) {
    input.value = num.toLocaleString('id-ID');
  } else {
    input.value = '';
  }
}

// ─── Date Formatter ─────────────────────────────────────────
function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

// ─── Debounce ───────────────────────────────────────────────
function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
