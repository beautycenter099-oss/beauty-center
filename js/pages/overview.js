import { supabaseGet } from '../api.js';
import { badge, formatDate, formatMinutes, formatCurrency, formatRelativeDate, escHtml } from '../ui.js';

export async function init() {
  renderGreeting();
  await loadKPIs();
  await loadRecentBookings();
  await loadRecentOrders();
}

function renderGreeting() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'صباح الخير 👋'
                 : hour < 17 ? 'مساء الخير 👋'
                 : 'مساء النور 👋';
  setKPI('overview-greeting', greeting);

  const dateEl = document.getElementById('overview-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('ar-OM', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }
}

async function loadKPIs() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';

  try {
    // Today's bookings
    const todayBookings = await supabaseGet('home_bookings', `select=id&booking_date=eq.${today}`);
    setKPI('kpi-today-bookings', todayBookings.length);

    // Monthly revenue (home bookings)
    const monthlyHomeBookings = await supabaseGet(
      'home_bookings',
      `select=total_price&booking_date=gte.${monthStart}&status=neq.cancelled`
    );
    const homeRevenue = monthlyHomeBookings.reduce((s, b) => s + Number(b.total_price || 0), 0);

    // Monthly revenue (orders)
    const monthlyOrders = await supabaseGet(
      'orders',
      `select=total_price&order_date=gte.${monthStart}&status=neq.cancelled`
    );
    const ordersRevenue = monthlyOrders.reduce((s, o) => s + Number(o.total_price || 0), 0);

    const totalRevenue = homeRevenue + ordersRevenue;
    setKPI('kpi-monthly-revenue', totalRevenue.toFixed(1) + ' ر.ع');

    // Total customers
    const customers = await supabaseGet('customers', 'select=id');
    setKPI('kpi-total-customers', customers.length);

    // Unpaid bookings
    const unpaid = await supabaseGet('home_bookings', 'select=id&payment_status=eq.unpaid&status=neq.cancelled');
    setKPI('kpi-unpaid', unpaid.length);

  } catch (err) {
    console.error('KPI load error:', err);
  }
}

function setKPI(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function loadRecentBookings() {
  const tbody = document.getElementById('recent-bookings-tbody');
  if (!tbody) return;

  try {
    const bookings = await supabaseGet(
      'home_bookings',
      'select=id,booking_code,booking_date,start_time_minutes,total_price,status,payment_status,customers(name,phone)&order=created_at.desc&limit=5'
    );

    if (!bookings.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state" style="padding:2rem;text-align:center;color:var(--text-light)">لا توجد حجوزات حتى الآن</td></tr>`;
      return;
    }

    tbody.innerHTML = bookings.map(b => `
      <tr>
        <td><span class="booking-code">${escHtml(b.booking_code || '#' + b.id)}</span></td>
        <td>${escHtml(b.customers?.name || b.customers?.phone || 'غير معروف')}</td>
        <td>${formatDate(b.booking_date)}</td>
        <td>${formatCurrency(b.total_price)}</td>
        <td>${badge(b.status)}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Recent bookings error:', err);
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger);padding:1rem;text-align:center">فشل التحميل</td></tr>`;
  }
}

async function loadRecentOrders() {
  const tbody = document.getElementById('recent-orders-tbody');
  if (!tbody) return;

  try {
    const orders = await supabaseGet(
      'orders',
      'select=id,order_code,order_date,total_price,status,payment_status,customers(name,phone)&order=created_at.desc&limit=5'
    );

    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state" style="padding:2rem;text-align:center;color:var(--text-light)">لا توجد طلبات حتى الآن</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(o => `
      <tr>
        <td><span class="booking-code">${escHtml(o.order_code || '#' + o.id)}</span></td>
        <td>${escHtml(o.customers?.name || o.customers?.phone || 'غير معروف')}</td>
        <td>${formatDate(o.order_date)}</td>
        <td>${formatCurrency(o.total_price)}</td>
        <td>${badge(o.status)}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Recent orders error:', err);
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger);padding:1rem;text-align:center">فشل التحميل</td></tr>`;
  }
}
