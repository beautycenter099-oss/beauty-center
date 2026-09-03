import { isAuthenticated, isAdmin, getCurrentUser, login, logout } from './auth.js';
import { initAllSearchableSelects, showToast } from './ui.js';

const APP_VERSION = '2.0.0';

// Map each hash route to a page config
const ROUTES = {
  '#overview':       { title: 'نظرة عامة',          template: `pages/overview.html?v=${APP_VERSION}`,  module: () => import(`./pages/overview.js?v=${APP_VERSION}`), adminOnly: true },
  '#bookings':       { title: 'الحجوزات',           template: `pages/bookings.html?v=${APP_VERSION}`,  module: () => import(`./pages/bookings.js?v=${APP_VERSION}`) },
  '#customers':      { title: 'العملاء',            template: `pages/customers.html?v=${APP_VERSION}`, module: () => import(`./pages/customers.js?v=${APP_VERSION}`) },
  '#orders':         { title: 'طلبات التوصيل',      template: `pages/orders.html?v=${APP_VERSION}`,    module: () => import(`./pages/orders.js?v=${APP_VERSION}`) },
  '#create-invoice': { title: 'إصدار فاتورة مبيعات', template: `pages/invoices.html?v=${APP_VERSION}`,  module: () => import(`./pages/invoices.js?v=${APP_VERSION}`) },
  '#invoices':       { title: 'سجل الفواتير والمبيعات', template: `pages/invoices.html?v=${APP_VERSION}`, module: () => import(`./pages/invoices.js?v=${APP_VERSION}`), adminOnly: true },
  '#catalog':        { title: 'الخدمات والكتالوج',   template: `pages/catalog.html?v=${APP_VERSION}`,   module: () => import(`./pages/catalog.js?v=${APP_VERSION}`) },
  '#inventory':      { title: 'إدارة المخزون',      template: `pages/inventory.html?v=${APP_VERSION}`, module: () => import(`./pages/inventory.js?v=${APP_VERSION}`) },
  '#staff':          { title: 'إدارة الموظفين',     template: `pages/staff.html?v=${APP_VERSION}`,     module: () => import(`./pages/staff.js?v=${APP_VERSION}`), adminOnly: true },
  '#settings':       { title: 'إعدادات العمل',      template: `pages/settings.html?v=${APP_VERSION}`,  module: () => import(`./pages/settings.js?v=${APP_VERSION}`), adminOnly: true },
};

/**
 * Navigate to a given hash route with role permission checks.
 * @param {string} hash
 */
export async function navigate(hash) {
  if (!isAuthenticated()) {
    showLogin();
    return;
  }

  const userIsAdmin = isAdmin();
  const defaultRoute = userIsAdmin ? '#overview' : '#bookings';

  let targetHash = hash || defaultRoute;
  let route = ROUTES[targetHash];

  // If route doesn't exist or is admin-only when user is staff, redirect to default route
  if (!route || (route.adminOnly && !userIsAdmin)) {
    if (route && route.adminOnly && !userIsAdmin) {
      showToast('عفواً، هذه الصفحة مخصصة لمدير النظام فقط', 'warning');
    }
    targetHash = defaultRoute;
    route = ROUTES[targetHash];
  }

  // Update browser hash without triggering hashchange recursion
  if (window.location.hash !== targetHash) {
    history.replaceState(null, '', targetHash);
  }

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === targetHash);
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

    // Special view locking for #create-invoice when staff member
    if (!userIsAdmin && (targetHash === '#create-invoice' || targetHash === '#invoices')) {
      const toggleBtn = document.getElementById('btn-toggle-view');
      if (toggleBtn) toggleBtn.style.display = 'none';
      const panelAll = document.getElementById('panel-all-invoices');
      const panelCreate = document.getElementById('panel-create-invoice');
      if (panelAll) panelAll.classList.remove('active');
      if (panelCreate) panelCreate.classList.add('active');
    }

    initAllSearchableSelects(container);
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">فشل تحميل الصفحة</div>
        <div class="empty-state-text">${err.message}</div>
      </div>`;
    console.error('Router error:', err);
  }
}

/**
 * Show login view, hide dashboard.
 */
export function showLogin() {
  document.getElementById('login-view')?.classList.add('active');
  document.getElementById('dashboard-view')?.classList.remove('active');
  history.replaceState(null, '', '#login');
}

/**
 * Show dashboard, apply role-based sidebar visibility, navigate to route.
 * @param {string} [hash]
 */
export function showDashboard(hash) {
  document.getElementById('login-view')?.classList.remove('active');
  document.getElementById('dashboard-view')?.classList.add('active');

  const user = getCurrentUser();
  const userIsAdmin = isAdmin();

  // Update user profile badge in sidebar
  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-display-role');
  if (nameEl) nameEl.textContent = user?.name || user?.username || 'مستخدم';
  if (roleEl) {
    roleEl.textContent = userIsAdmin ? 'مدير النظام 👑' : 'موظف 👤';
    roleEl.className = `badge ${userIsAdmin ? 'badge-gold' : 'badge-info'}`;
  }

  // Toggle admin-only sidebar links
  const adminLinks = ['#nav-overview', '#nav-staff', '#nav-settings'];
  adminLinks.forEach(id => {
    const el = document.getElementById(id.replace('#', ''));
    if (el) el.style.display = userIsAdmin ? '' : 'none';
  });

  // Toggle section labels
  const systemLabel = document.getElementById('section-label-system');
  if (systemLabel) systemLabel.style.display = userIsAdmin ? '' : 'none';

  const defaultRoute = userIsAdmin ? '#overview' : '#bookings';
  let targetHash = hash || window.location.hash || defaultRoute;
  if (targetHash === '#login') targetHash = defaultRoute;
  navigate(targetHash);
}

/**
 * Initialise router and bind login & logout events.
 */
export function initRouter() {
  // Bind login form submit
  const loginForm = document.getElementById('login-form');
  const usernameInput = document.getElementById('username-input');
  const passwordInput = document.getElementById('password-input');
  const loginError = document.getElementById('login-error');
  const loginSubmit = document.getElementById('login-submit');

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = usernameInput?.value || '';
    const password = passwordInput?.value || '';

    if (loginSubmit) {
      loginSubmit.disabled = true;
      loginSubmit.textContent = 'جاري التحقق...';
    }
    if (loginError) loginError.style.display = 'none';

    try {
      const res = await login(username, password);
      if (res.success) {
        if (usernameInput) usernameInput.value = '';
        if (passwordInput) passwordInput.value = '';
        showDashboard();
      } else {
        if (loginError) {
          loginError.textContent = res.error || 'بيانات الدخول غير صحيحة';
          loginError.style.display = 'block';
        }
      }
    } catch (err) {
      if (loginError) {
        loginError.textContent = 'فشل تسجيل الدخول: ' + err.message;
        loginError.style.display = 'block';
      }
    } finally {
      if (loginSubmit) {
        loginSubmit.disabled = false;
        loginSubmit.textContent = 'تسجيل الدخول';
      }
    }
  });

  // Mobile sidebar toggle handlers
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const sidebarScrim = document.getElementById('sidebar-scrim');
  const sidebar = document.getElementById('sidebar');

  const closeMobileSidebar = () => {
    sidebar?.classList.remove('open');
    sidebarScrim?.classList.remove('open');
  };

  hamburgerBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    sidebarScrim?.classList.toggle('open');
  });

  sidebarScrim?.addEventListener('click', closeMobileSidebar);

  // Bind logout button
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    logout();
    showLogin();
    closeMobileSidebar();
    showToast('تم تسجيل الخروج بنجاح 👋', 'info');
  });

  // Bind sidebar nav click events
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const route = item.dataset.route;
      if (route) navigate(route);
      closeMobileSidebar();
    });
  });

  // Listen to browser hash changes
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    if (hash !== '#login') {
      navigate(hash);
    }
  });

  // Initial startup check
  if (isAuthenticated()) {
    showDashboard();
  } else {
    showLogin();
  }
}
