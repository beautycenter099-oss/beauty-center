import { supabaseGet } from '../api.js';
import {
  badge, formatDate, formatMinutes, formatCurrency, escHtml,
  openDrawer, setDrawerHeader, setDrawerFooter, closeDrawer
} from '../ui.js';

let recentBookings = [];
let recentOrders = [];

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
    recentBookings = await supabaseGet(
      'home_bookings',
      'select=*,customers(*),home_booking_items(*,home_services(*))&order=created_at.desc&limit=5'
    );

    if (!recentBookings.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state" style="padding:2rem;text-align:center;color:var(--text-light)">لا توجد حجوزات حتى الآن</td></tr>`;
      return;
    }

    tbody.innerHTML = recentBookings.map(b => `
      <tr data-id="${b.id}" style="cursor:pointer">
        <td><span class="booking-code">${escHtml(b.booking_code || '#' + b.id)}</span></td>
        <td>${escHtml(b.customers?.name || b.customers?.phone || 'غير معروف')}</td>
        <td>${formatDate(b.booking_date)}</td>
        <td>${formatCurrency(b.total_price)}</td>
        <td>${badge(b.status)}</td>
      </tr>
    `).join('');

    tbody.querySelectorAll('tr[data-id]').forEach(row => {
      row.addEventListener('click', () => {
        const id = Number(row.dataset.id);
        const booking = recentBookings.find(b => b.id === id);
        if (booking) openOverviewBookingDrawer(booking);
      });
    });
  } catch (err) {
    console.error('Recent bookings error:', err);
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger);padding:1rem;text-align:center">فشل التحميل</td></tr>`;
  }
}

async function loadRecentOrders() {
  const tbody = document.getElementById('recent-orders-tbody');
  if (!tbody) return;

  try {
    recentOrders = await supabaseGet(
      'orders',
      'select=*,customers(*),order_items(*,products(*))&order=created_at.desc&limit=5'
    );

    if (!recentOrders.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state" style="padding:2rem;text-align:center;color:var(--text-light)">لا توجد طلبات حتى الآن</td></tr>`;
      return;
    }

    tbody.innerHTML = recentOrders.map(o => `
      <tr data-id="${o.id}" style="cursor:pointer">
        <td><span class="booking-code">${escHtml(o.order_code || '#' + o.id)}</span></td>
        <td>${escHtml(o.customers?.name || o.customers?.phone || 'غير معروف')}</td>
        <td>${formatDate(o.order_date)}</td>
        <td>${formatCurrency(o.total_price)}</td>
        <td>${badge(o.status)}</td>
      </tr>
    `).join('');

    tbody.querySelectorAll('tr[data-id]').forEach(row => {
      row.addEventListener('click', () => {
        const id = Number(row.dataset.id);
        const order = recentOrders.find(o => o.id === id);
        if (order) openOverviewOrderDrawer(order);
      });
    });
  } catch (err) {
    console.error('Recent orders error:', err);
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger);padding:1rem;text-align:center">فشل التحميل</td></tr>`;
  }
}

function openOverviewBookingDrawer(booking) {
  const customer = booking.customers;
  const items = booking.home_booking_items || [];
  const code = booking.booking_code || '#' + booking.id;

  setDrawerHeader(code, `تفاصيل الحجز · ${formatDate(booking.booking_date)}`);

  const timeStr = booking.start_time_minutes != null
    ? `${formatMinutes(booking.start_time_minutes)} – ${formatMinutes(booking.end_time_minutes)}`
    : '—';

  const bookingType = (booking.booking_type || booking.type || booking.location_type || 'home').toLowerCase();
  const typeBadge = bookingType === 'center'
    ? `<span class="badge badge-info">🏢 بالمركز</span>`
    : `<span class="badge badge-gold">🏠 منزلي</span>`;

  const mapLink = booking.address
    ? `<a href="${escHtml(booking.address)}" target="_blank" class="map-link">📍 فتح الخريطة</a>`
    : '<span style="color:var(--text-light)">—</span>';

  const lineItems = items.map(i => {
    const svc = i.home_services;
    const total = (Number(i.unit_price || 0) * (i.people_count || 1)).toFixed(1);
    return `
      <tr>
        <td>${escHtml(svc?.name || '?')}</td>
        <td style="text-align:center">${i.people_count}</td>
        <td>${formatCurrency(i.unit_price)}</td>
        <td class="td-total">${formatCurrency(total)}</td>
      </tr>`;
  }).join('');

  const html = `
    <div class="drawer-section">
      <div class="drawer-section-title">بيانات العميل</div>
      <div class="drawer-field">
        <span class="drawer-field-label">الاسم</span>
        <span class="drawer-field-value">${escHtml(customer?.name || '—')}</span>
      </div>
      <div class="drawer-field">
        <span class="drawer-field-label">الهاتف</span>
        <span class="drawer-field-value" dir="ltr">${escHtml(customer?.phone || '—')}</span>
      </div>
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">تفاصيل الحجز</div>
      <div class="drawer-field">
        <span class="drawer-field-label">نوع الحجز</span>
        <span class="drawer-field-value">${typeBadge}</span>
      </div>
      <div class="drawer-field">
        <span class="drawer-field-label">التاريخ</span>
        <span class="drawer-field-value">${formatDate(booking.booking_date)}</span>
      </div>
      <div class="drawer-field">
        <span class="drawer-field-label">الوقت</span>
        <span class="drawer-field-value">${timeStr}</span>
      </div>
      <div class="drawer-field">
        <span class="drawer-field-label">الموقع</span>
        <span class="drawer-field-value">${mapLink}</span>
      </div>
      <div class="drawer-field">
        <span class="drawer-field-label">الحالة</span>
        <span class="drawer-field-value">${badge(booking.status)}</span>
      </div>
      <div class="drawer-field">
        <span class="drawer-field-label">حالة الدفع</span>
        <span class="drawer-field-value">${badge(booking.payment_status)}</span>
      </div>
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">الخدمات المطلوبة</div>
      <table class="line-items-table">
        <thead>
          <tr><th>الخدمة</th><th>العدد</th><th>سعر الوحدة</th><th>المجموع</th></tr>
        </thead>
        <tbody>${lineItems || '<tr><td colspan="4" style="padding:1rem;color:var(--text-light);text-align:center">لا توجد خدمات</td></tr>'}</tbody>
      </table>
      <div class="booking-total-row" style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-4) 0;border-top:2px solid var(--border-color);margin-top:var(--space-3)">
        <span style="font-weight:700">المجموع الكلي</span>
        <span style="font-size:1.3rem;font-weight:700;color:var(--accent-gold-hover)">${formatCurrency(booking.total_price)}</span>
      </div>
    </div>
  `;

  openDrawer(html);
  setDrawerFooter(`
    <button class="btn btn-ghost" id="drawer-close-btn" style="margin-right:auto">إغلاق</button>
  `);
  document.getElementById('drawer-close-btn')?.addEventListener('click', closeDrawer);
}

function openOverviewOrderDrawer(order) {
  const customer = order.customers;
  const items = order.order_items || [];
  const code = order.order_code || '#' + order.id;

  setDrawerHeader(code, `تفاصيل طلب التوصيل · ${formatDate(order.order_date)}`);

  const mapLink = order.address
    ? `<a href="${escHtml(order.address)}" target="_blank" class="map-link">📍 فتح الخريطة</a>`
    : '<span style="color:var(--text-light)">—</span>';

  const lineItems = items.map(i => {
    const lineTotal = (Number(i.unit_price || 0) * (i.quantity || 1)).toFixed(1);
    return `
      <tr>
        <td>${escHtml(i.products?.name || '?')}</td>
        <td style="text-align:center">${i.quantity}</td>
        <td>${formatCurrency(i.unit_price)}</td>
        <td class="td-total">${formatCurrency(lineTotal)}</td>
      </tr>`;
  }).join('');

  const html = `
    <div class="drawer-section">
      <div class="drawer-section-title">بيانات العميل</div>
      <div class="drawer-field">
        <span class="drawer-field-label">الاسم</span>
        <span class="drawer-field-value">${escHtml(customer?.name || '—')}</span>
      </div>
      <div class="drawer-field">
        <span class="drawer-field-label">الهاتف</span>
        <span class="drawer-field-value" dir="ltr">${escHtml(customer?.phone || '—')}</span>
      </div>
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">تفاصيل الطلب</div>
      <div class="drawer-field">
        <span class="drawer-field-label">تاريخ التوصيل</span>
        <span class="drawer-field-value">${formatDate(order.order_date)}</span>
      </div>
      <div class="drawer-field">
        <span class="drawer-field-label">عنوان التوصيل</span>
        <span class="drawer-field-value">${mapLink}</span>
      </div>
      <div class="drawer-field">
        <span class="drawer-field-label">الحالة</span>
        <span class="drawer-field-value">${badge(order.status)}</span>
      </div>
      <div class="drawer-field">
        <span class="drawer-field-label">حالة الدفع</span>
        <span class="drawer-field-value">${badge(order.payment_status)}</span>
      </div>
    </div>

    <div class="drawer-section">
      <div class="drawer-section-title">المنتجات المطلوبة</div>
      <table class="line-items-table">
        <thead>
          <tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>المجموع</th></tr>
        </thead>
        <tbody>${lineItems || '<tr><td colspan="4" style="padding:1rem;color:var(--text-light);text-align:center">لا توجد منتجات</td></tr>'}</tbody>
      </table>

      <div style="margin-top:var(--space-4);padding-top:var(--space-3);border-top:1px solid var(--border-color);display:flex;flex-direction:column;gap:var(--space-2)">
        <div style="display:flex;justify-content:space-between;font-size:var(--text-sm);color:var(--text-muted)">
          <span>مجموع المنتجات</span>
          <span>${formatCurrency(order.items_total)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:var(--text-sm);color:var(--text-muted)">
          <span>رسوم التوصيل</span>
          <span>${formatCurrency(order.delivery_fee)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:1.2rem;font-weight:700;margin-top:var(--space-2);color:var(--accent-gold-hover)">
          <span>المجموع الكلي</span>
          <span>${formatCurrency(order.total_price)}</span>
        </div>
      </div>
    </div>
  `;

  openDrawer(html);
  setDrawerFooter(`
    <button class="btn btn-ghost" id="drawer-close-btn" style="margin-right:auto">إغلاق</button>
  `);
  document.getElementById('drawer-close-btn')?.addEventListener('click', closeDrawer);
}
