import { isAuthenticated } from './auth.js';

// Map each hash route to a page config
const ROUTES = {
  '#overview':  { title: 'نظرة عامة',              template: 'pages/overview.html',  module: () => import('./pages/overview.js') },
  '#bookings':  { title: 'الحجوزات المنزلية',      template: 'pages/bookings.html',  module: () => import('./pages/bookings.js') },
  '#customers': { title: 'العملاء',                template: 'pages/customers.html', module: () => import('./pages/customers.js') },
  '#orders':    { title: 'طلبات التوصيل',          template: 'pages/orders.html',    module: () => import('./pages/orders.js') },
  '#invoices':        { title: 'الفواتير والمبيعات',     template: 'pages/invoices.html',        module: () => import('./pages/invoices.js') },
  '#create-invoice': { title: 'إنشاء فاتورة جديدة',    template: 'pages/create-invoice.html', module: () => import('./pages/create-invoice.js') },
  '#catalog':   { title: 'الخدمات والمنتجات',      template: 'pages/catalog.html',   module: () => import('./pages/catalog.js') },
  '#inventory': { title: 'المخزون',                template: 'pages/inventory.html', module: () => import('./pages/inventory.js') },
  '#staff':     { title: 'الموظفون',               template: 'pages/staff.html',     module: () => import('./pages/staff.js') },
  '#settings':  { title: 'إعدادات العمل',          template: 'pages/settings.html',  module: () => import('./pages/settings.js') },
};

const DEFAULT_ROUTE = '#overview';

/**
 * Navigate to a given hash route.
 * @param {string} hash
 */
export async function navigate(hash) {
  if (!isAuthenticated()) {
    showLogin();
    return;
  }

  const route = ROUTES[hash] || ROUTES[DEFAULT_ROUTE];
  const activeHash = ROUTES[hash] ? hash : DEFAULT_ROUTE;

  // Update browser hash without triggering hashchange
  if (window.location.hash !== activeHash) {
    history.replaceState(null, '', activeHash);
  }

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === activeHash);
  });

  // Update topbar title
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = route.title;

  // Load HTML template into #page-content
  const container = document.getElementById('page-content');
  if (!container) return;

  container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:4rem;"><div class="spinner"></div></div>';

  try {
    const html = await fetch(route.template).then(r => r.text());
    container.innerHTML = html;

    // Import and init the page module
    const mod = await route.module();
    if (typeof mod.init === 'function') {
      await mod.init();
    }
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Failed to load page</div>
        <div class="empty-state-text">${err.message}</div>
      </div>`;
    console.error('Router error:', err);
  }
}

/**
 * Show login view, hide dashboard.
 */
export function showLogin() {
  document.getElementById('login-view').classList.add('active');
  document.getElementById('dashboard-view').classList.remove('active');
  history.replaceState(null, '', '#login');
}

/**
 * Show dashboard, hide login, navigate to a route.
 * @param {string} [hash]
 */
export function showDashboard(hash) {
  document.getElementById('login-view').classList.remove('active');
  document.getElementById('dashboard-view').classList.add('active');
  navigate(hash || window.location.hash || DEFAULT_ROUTE);
}

/**
 * Initialise the router — call once on app start.
 */
export function initRouter() {
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    if (hash !== '#login') {
      navigate(hash);
    }
  });
}
