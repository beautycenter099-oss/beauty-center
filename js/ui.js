// ─── Toast Notifications ───────────────────────────────────────────

let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.getElementById('toast-container');
  }
  return toastContainer;
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'} [type='info']
 * @param {number} [duration=3500]
 */
export function showToast(message, type = 'info', duration = 3500) {
  const container = getToastContainer();
  if (!container) return;

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(toast);

  const hideToast = () => {
    if (!toast.parentElement) return;
    toast.classList.add('hiding');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    // Fallback if animationend doesn't fire
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 500);
  };

  toast.addEventListener('click', hideToast);
  setTimeout(hideToast, duration);
}

// ─── Drawer ────────────────────────────────────────────────────────

let drawerEl = null;
let scrimEl = null;

function getDrawerEls() {
  if (!drawerEl) drawerEl = document.getElementById('drawer');
  if (!scrimEl)  scrimEl  = document.getElementById('drawer-scrim');
  return { drawerEl, scrimEl };
}

/**
 * Open the drawer with given HTML content.
 * @param {string} html
 */
export function openDrawer(html) {
  const { drawerEl, scrimEl } = getDrawerEls();
  if (!drawerEl) return;
  const body = drawerEl.querySelector('#drawer-body');
  if (body) body.innerHTML = html;
  drawerEl.classList.add('open');
  scrimEl?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

/**
 * Close the drawer.
 */
export function closeDrawer() {
  const { drawerEl, scrimEl } = getDrawerEls();
  drawerEl?.classList.remove('open');
  scrimEl?.classList.remove('open');
  document.body.style.overflow = '';
}

/**
 * Set drawer header content.
 * @param {string} title
 * @param {string} [subtitle]
 */
export function setDrawerHeader(title, subtitle = '') {
  const { drawerEl } = getDrawerEls();
  if (!drawerEl) return;
  const titleEl = drawerEl.querySelector('#drawer-title');
  const subEl   = drawerEl.querySelector('#drawer-subtitle');
  if (titleEl) titleEl.textContent = title;
  if (subEl)   subEl.textContent   = subtitle;
}

/**
 * Set drawer footer content.
 * @param {string} html
 */
export function setDrawerFooter(html) {
  const { drawerEl } = getDrawerEls();
  const footer = drawerEl?.querySelector('#drawer-footer');
  if (footer) footer.innerHTML = html;
}

// ─── Badges ────────────────────────────────────────────────────────

const STATUS_CLASSES = {
  // Booking / Order status
  confirmed:  'badge-info',
  completed:  'badge-success',
  cancelled:  'badge-danger',
  pending:    'badge-neutral',
  // Payment status
  paid:       'badge-success',
  unpaid:     'badge-warning',
  // Generic
  active:     'badge-success',
  inactive:   'badge-neutral',
};

const STATUS_LABELS = {
  confirmed:  'مؤكد',
  completed:  'مكتمل',
  cancelled:  'ملغي',
  pending:    'معلق',
  paid:       'مدفوع',
  unpaid:     'غير مدفوع',
  active:     'نشط',
  inactive:   'غير نشط',
};

/**
 * Returns an HTML badge string for a given status value.
 * @param {string} status
 * @returns {string}
 */
export function badge(status) {
  if (!status) return '';
  const key = status.toLowerCase();
  const cls  = STATUS_CLASSES[key] || 'badge-neutral';
  const label = STATUS_LABELS[key] || status;
  return `<span class="badge ${cls}">${label}</span>`;
}

// ─── Date & Time Formatters ─────────────────────────────────────────

/**
 * Format an ISO date string to a human-readable Arabic date.
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {string} - "29 أغسطس 2026"
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ar-OM', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Format minutes-from-midnight to a human-readable Arabic time.
 * @param {number} minutes
 * @returns {string} - "2:30 م"
 */
export function formatMinutes(minutes) {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'م' : 'ص';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Format a time string "HH:MM:SS" to "2:30 م"
 * @param {string} timeStr
 * @returns {string}
 */
export function formatTimeStr(timeStr) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'م' : 'ص';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Format a currency amount.
 * @param {number|string} amount
 * @param {string} [currency='ر.ع']
 * @returns {string}
 */
export function formatCurrency(amount, currency = 'ر.ع') {
  if (amount == null) return '—';
  return `${Number(amount).toFixed(1)} ${currency}`;
}

/**
 * Get initials from a name (up to 2 chars).
 * @param {string} name
 * @returns {string}
 */
export function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/**
 * Format an ISO timestamp to relative time or short date.
 * @param {string} isoStr
 * @returns {string}
 */
export function formatRelativeDate(isoStr) {
  if (!isoStr) return '—';
  const date = new Date(isoStr);
  const now   = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'اليوم';
  if (diffDays === 1) return 'أمس';
  if (diffDays < 7)  return `منذ ${diffDays} أيام`;
  return formatDate(isoStr.slice(0, 10));
}

// ─── Page Loader ────────────────────────────────────────────────────

/**
 * Set a container to loading state.
 * @param {HTMLElement} el
 */
export function setLoading(el) {
  if (!el) return;
  el.style.position = 'relative';
  const overlay = document.createElement('div');
  overlay.className = 'loader-overlay active';
  overlay.id = 'loader-overlay';
  overlay.innerHTML = '<div class="spinner"></div>';
  el.appendChild(overlay);
}

/**
 * Remove loading state from a container.
 * @param {HTMLElement} el
 */
export function clearLoading(el) {
  el?.querySelector('#loader-overlay')?.remove();
}

// ─── Escape HTML ────────────────────────────────────────────────────

/**
 * Escape HTML special characters.
 * @param {string} str
 * @returns {string}
 */
export function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── CSV Export ─────────────────────────────────────────────────────

/**
 * Download an array of objects as a CSV file.
 * @param {string} filename
 * @param {Object[]} rows - Array of plain objects (all same keys)
 */
export function exportCSV(filename, rows) {
  if (!rows.length) { return; }
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(r =>
      headers.map(h => {
        const val = r[h] ?? '';
        const str = String(val).replace(/"/g, '""');
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
      }).join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
