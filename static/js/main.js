/* ============================================================
   HokiApp v2.0 — Global JavaScript Utilities (main.js)
   ============================================================ */

'use strict';

// ─── Theme Management ─────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('themeIcon');
  if (icon) icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
  localStorage.setItem('hoki_theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  // Persist to server
  fetchAPI('/api/settings', { method: 'PUT', body: { theme: next } }).catch(() => {});
}

// Init theme from localStorage (before render for no flash)
(function initTheme() {
  const saved = localStorage.getItem('hoki_theme');
  if (saved) applyTheme(saved);
})();

// ─── Sidebar Management ───────────────────────────────────────
let sidebarCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';

function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('mainContent');
  if (!sidebar || !mainContent) return;

  if (sidebarCollapsed && window.innerWidth > 768) {
    sidebar.classList.add('collapsed');
    mainContent.classList.add('sidebar-collapsed');
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('mainContent');
  if (!sidebar) return;

  sidebarCollapsed = !sidebarCollapsed;
  sidebar.classList.toggle('collapsed', sidebarCollapsed);
  mainContent?.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  localStorage.setItem('sidebar_collapsed', sidebarCollapsed);
}

function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar) return;

  const isOpen = sidebar.classList.contains('mobile-open');
  sidebar.classList.toggle('mobile-open', !isOpen);
  overlay?.classList.toggle('active', !isOpen);
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar?.classList.remove('mobile-open');
  overlay?.classList.remove('active');
}

// ─── API Helper ───────────────────────────────────────────────
async function fetchAPI(url, options = {}) {
  const { method = 'GET', body = null } = options;

  const config = { method, credentials: 'same-origin' };

  if (body !== null) {
    if (body instanceof FormData) {
      config.body = body;
      // Let browser set Content-Type automatically
    } else {
      config.headers = { 'Content-Type': 'application/json' };
      config.body    = JSON.stringify(body);
    }
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      errMsg = err.error || err.message || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response;
}

// ─── Toast Notifications ──────────────────────────────────────
const TOAST_ICONS = {
  success: 'check_circle',
  error:   'error',
  warning: 'warning',
  info:    'info',
};

function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="material-symbols-outlined toast-icon icon-fill">${TOAST_ICONS[type] || 'info'}</span>
    <span style="flex:1">${message}</span>
    <button onclick="this.closest('.toast').click()" style="background:none;border:none;color:inherit;cursor:pointer;opacity:0.6;padding:0 0 0 6px">
      <span class="material-symbols-outlined" style="font-size:16px">close</span>
    </button>
  `;
  container.appendChild(toast);

  const dismiss = () => {
    toast.classList.add('closing');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  toast.addEventListener('click', dismiss);
  setTimeout(dismiss, duration);
}

// ─── Modal Management ─────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  // Focus first input
  setTimeout(() => {
    const first = el.querySelector('input:not([type="hidden"]), select, textarea');
    first?.focus();
  }, 200);
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// Close on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    const id = e.target.id;
    if (id) closeModal(id);
  }
});

// Close on ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const openModals = document.querySelectorAll('.modal-overlay.open');
    openModals.forEach(m => closeModal(m.id));
    // Also close mobile sidebar
    closeMobileSidebar();
  }
});

// ─── Format Helpers ───────────────────────────────────────────
function formatRupiah(amount, showSymbol = true) {
  const num   = Math.round(parseFloat(amount) || 0);
  const parts = num.toLocaleString('id-ID');
  return showSymbol ? `Rp\u00A0${parts}` : parts;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) + ' ' +
         d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatPercent(n) {
  return (parseFloat(n) || 0).toFixed(1) + '%';
}

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ─── Animated Number Counter ──────────────────────────────────
function animateNumber(el, target, duration = 800, prefix = '', suffix = '', formatter = null) {
  const start = parseFloat(el.dataset.prev || 0);
  const startTime = performance.now();
  el.dataset.prev = target;

  function update(now) {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    const current  = start + (target - start) * eased;

    if (formatter) {
      el.textContent = formatter(current);
    } else {
      el.textContent = prefix + Math.round(current).toLocaleString('id-ID') + suffix;
    }

    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ─── Pending Orders Badge (global) ────────────────────────────
async function loadPendingBadge() {
  try {
    const data = await fetchAPI('/api/transactions/pending');
    const badge = document.getElementById('pendingNavBadge');
    if (badge) {
      if (data.length > 0) {
        badge.textContent = data.length;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
    // Notif dot
    const notifDot = document.getElementById('notifDot');
    if (notifDot) notifDot.style.display = data.length > 0 ? '' : 'none';
  } catch (_) {}
}

// ─── Logo from DB ─────────────────────────────────────────────
async function loadSidebarLogo() {
  const img = document.getElementById('sidebarLogoImg');
  const fallback = document.getElementById('sidebarLogoFallback');
  if (!img) return;
  try {
    const data = await fetchAPI('/api/settings/media/logo_data');
    if (data.data) {
      img.src = data.data;
      img.style.display = 'block';
      if (fallback) fallback.style.display = 'none';
    }
  } catch (_) {}
}

// ─── User Menu (simple) ───────────────────────────────────────
function showUserMenu() {
  // Simple: navigate to settings
  window.location.href = '/settings';
}

// ─── DOMContentLoaded Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  loadPendingBadge();

  // Load logo if available
  if (document.getElementById('sidebarLogoImg')) {
    loadSidebarLogo();
  }

  // Responsive: close sidebar on resize to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      closeMobileSidebar();
    }
  });
});

// ─── Confirm Helper ───────────────────────────────────────────
function confirmAction(message, onConfirm, modalId = 'confirmModal') {
  // Try to use existing confirm modal if exists, otherwise browser confirm
  const modal = document.getElementById(modalId);
  if (!modal) {
    if (window.confirm(message)) onConfirm();
    return;
  }
  const msgEl = modal.querySelector('.confirm-message');
  if (msgEl) msgEl.textContent = message;
  openModal(modalId);
  const confirmBtn = modal.querySelector('.confirm-btn');
  if (confirmBtn) {
    confirmBtn.onclick = () => {
      closeModal(modalId);
      onConfirm();
    };
  }
}
