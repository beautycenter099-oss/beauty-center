import { supabaseGet, supabasePatch } from '../api.js';
import {
  badge, formatDate, formatMinutes, formatCurrency,
  openDrawer, setDrawerHeader, setDrawerFooter, closeDrawer,
  showToast, escHtml, exportCSV
} from '../ui.js';

let allBookings = [];
let selectedBookingId = null;

export async function init() {
  await loadBookings();
  bindFilters();
  document.getElementById('export-bookings-btn')?.addEventListener('click', exportBookings);
}

// ─── Load & Render ──────────────────────────────────────────────────

async function loadBookings() {
  const tbody = document.getElementById('bookings-tbody');
  const countEl = document.getElementById('bookings-count');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:3rem"><div class="spinner" style="margin:auto"></div></td></tr>`;

  try {
    allBookings = await supabaseGet(
      'home_bookings',
      'select=*,customers(id,name,phone,whatsapp_id,default_location),home_booking_items(*,home_services(id,name,price,duration_minutes))&order=booking_date.desc,start_time_minutes.asc'
    );

    renderTable(allBookings, tbody, countEl);
  } catch (err) {
    console.error('Bookings load error:', err);
    tbody.innerHTML = `<tr><td colspan="8" style="color:var(--danger);padding:2rem;text-align:center">فشل تحميل الحجوزات: ${escHtml(err.message)}</td></tr>`;
  }
}

function renderTable(bookings, tbody, countEl) {
  if (countEl) countEl.textContent = `${bookings.length} حجز`;

  if (!bookings.length) {
    tbody.innerHTML = `
      <tr><td colspan="8">
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <div class="empty-state-title">لا توجد حجوزات</div>
          <div class="empty-state-text">جرّب تغيير خيارات التصفية</div>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = bookings.map(b => {
    const customer = b.customers;
    const customerName = customer?.name || customer?.phone || 'غير معروف';
    const items = b.home_booking_items || [];
    const serviceTags = items.map(i =>
      `<span class="service-tag">${escHtml(i.home_services?.name || '?')} ×${i.people_count}</span>`
    ).join('');

    const timeStr = b.start_time_minutes != null
      ? `${formatMinutes(b.start_time_minutes)} – ${formatMinutes(b.end_time_minutes)}`
      : '—';

    return `
      <tr data-id="${b.id}" class="${selectedBookingId === b.id ? 'selected' : ''}">
        <td><span class="booking-code">${escHtml(b.booking_code || '#' + b.id)}</span></td>
        <td>
          <div style="font-weight:500;color:var(--text-dark)">${escHtml(customerName)}</div>
          ${customer?.phone ? `<div style="font-size:11px;color:var(--text-light)">${escHtml(customer.phone)}</div>` : ''}
        </td>
        <td>${formatDate(b.booking_date)}</td>
        <td style="white-space:nowrap;font-size:var(--text-xs);color:var(--text-mid)">${timeStr}</td>
        <td><div class="services-tags">${serviceTags || '<span style="color:var(--text-light);font-size:12px">—</span>'}</div></td>
        <td style="font-weight:600;color:var(--accent-gold-hover)">${formatCurrency(b.total_price)}</td>
        <td>${badge(b.status)}</td>
        <td>${badge(b.payment_status)}</td>
      </tr>`;
  }).join('');

  // Row click → drawer
  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => {
      const id = Number(row.dataset.id);
      const booking = allBookings.find(b => b.id === id);
      if (booking) openBookingDrawer(booking);
    });
  });
}

// ─── Filters ───────────────────────────────────────────────────────

function bindFilters() {
  const statusFilter  = document.getElementById('filter-status');
  const dateFromInput = document.getElementById('filter-date-from');
  const dateToInput   = document.getElementById('filter-date-to');
  const clearBtn      = document.getElementById('filter-clear');

  const applyFilters = () => {
    const status   = statusFilter?.value || '';
    const dateFrom = dateFromInput?.value || '';
    const dateTo   = dateToInput?.value || '';

    const filtered = allBookings.filter(b => {
      if (status && b.status !== status) return false;
      if (dateFrom && b.booking_date < dateFrom) return false;
      if (dateTo   && b.booking_date > dateTo)   return false;
      return true;
    });

    const tbody   = document.getElementById('bookings-tbody');
    const countEl = document.getElementById('bookings-count');
    renderTable(filtered, tbody, countEl);
  };

  statusFilter?.addEventListener('change', applyFilters);
  dateFromInput?.addEventListener('change', applyFilters);
  dateToInput?.addEventListener('change', applyFilters);

  clearBtn?.addEventListener('click', () => {
    if (statusFilter)  statusFilter.value  = '';
    if (dateFromInput) dateFromInput.value = '';
    if (dateToInput)   dateToInput.value   = '';
    renderTable(allBookings, document.getElementById('bookings-tbody'), document.getElementById('bookings-count'));
  });
}

// ─── Booking Drawer ────────────────────────────────────────────────

function openBookingDrawer(booking) {
  selectedBookingId = booking.id;

  // Highlight selected row
  document.querySelectorAll('#bookings-tbody tr').forEach(r => {
    r.classList.toggle('selected', Number(r.dataset.id) === booking.id);
  });

  const customer = booking.customers;
  const items    = booking.home_booking_items || [];
  const code     = booking.booking_code || '#' + booking.id;

  setDrawerHeader(code, `حجز منزلي · ${formatDate(booking.booking_date)}`);

  const timeStr = booking.start_time_minutes != null
    ? `${formatMinutes(booking.start_time_minutes)} – ${formatMinutes(booking.end_time_minutes)}`
    : '—';

  const mapLink = booking.address
    ? `<a href="${escHtml(booking.address)}" target="_blank" class="map-link">📍 فتح الخريطة</a>`
    : '<span style="color:var(--text-light)">—</span>';

  const lineItems = items.map(i => {
    const svc   = i.home_services;
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
    <!-- بيانات العميل -->
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
      <div class="drawer-field">
        <span class="drawer-field-label">واتساب</span>
        <span class="drawer-field-value" dir="ltr">${escHtml(customer?.whatsapp_id || '—')}</span>
      </div>
    </div>

    <!-- تفاصيل الحجز -->
    <div class="drawer-section">
      <div class="drawer-section-title">تفاصيل الحجز</div>
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

    <!-- الخدمات -->
    <div class="drawer-section">
      <div class="drawer-section-title">الخدمات</div>
      <table class="line-items-table">
        <thead>
          <tr>
            <th>الخدمة</th><th>العدد</th><th>سعر الوحدة</th><th>المجموع</th>
          </tr>
        </thead>
        <tbody>${lineItems || '<tr><td colspan="4" style="padding:1rem;color:var(--text-light);text-align:center">لا توجد خدمات</td></tr>'}</tbody>
      </table>
      <div class="booking-total-row">
        <span class="booking-total-label">المجموع الكلي</span>
        <span class="booking-total-value">${formatCurrency(booking.total_price)}</span>
      </div>
    </div>
  `;

  openDrawer(html);

  // Footer actions
  const canComplete = booking.status === 'confirmed';
  const canCancel   = booking.status === 'confirmed';
  const canMarkPaid = booking.payment_status === 'unpaid' && booking.status !== 'cancelled';

  setDrawerFooter(`
    ${canMarkPaid  ? `<button class="btn btn-success" id="drawer-paid-btn">تم الدفع</button>`           : ''}
    ${canComplete  ? `<button class="btn btn-ghost"   id="drawer-complete-btn">تأكيد الاكتمال</button>` : ''}
    ${canCancel    ? `<button class="btn btn-danger"   id="drawer-cancel-btn">إلغاء الحجز</button>`      : ''}
    <button class="btn btn-ghost" id="drawer-close-btn" style="margin-right:auto">إغلاق</button>
  `);

  document.getElementById('drawer-close-btn')?.addEventListener('click', closeDrawer);

  document.getElementById('drawer-paid-btn')?.addEventListener('click', async () => {
    await updateBooking(booking.id, { payment_status: 'paid' });
  });

  document.getElementById('drawer-complete-btn')?.addEventListener('click', async () => {
    await updateBooking(booking.id, { status: 'completed' });
  });

  document.getElementById('drawer-cancel-btn')?.addEventListener('click', async () => {
    if (confirm('هل أنت متأكد من رغبتك في إلغاء هذا الحجز؟')) {
      await updateBooking(booking.id, { status: 'cancelled' });
    }
  });
}

async function updateBooking(bookingId, data) {
  try {
    await supabasePatch('home_bookings', `id=eq.${bookingId}`, { ...data, updated_at: new Date().toISOString() });
    const label = data.payment_status === 'paid' ? 'تم تحديد الحجز كمدفوع'
                : data.status === 'completed'    ? 'تم تأكيد اكتمال الحجز'
                : 'تم إلغاء الحجز';
    showToast(label, 'success');
    closeDrawer();
    selectedBookingId = null;
    await loadBookings();
  } catch (err) {
    showToast('فشل التحديث: ' + err.message, 'error');
  }
}

function exportBookings() {
  const rows = allBookings.map(b => ({
    Code:         b.booking_code || b.id,
    Customer:     b.customers?.name || b.customers?.phone || '',
    Phone:        b.customers?.phone || '',
    Date:         b.booking_date,
    Time:         b.start_time_minutes != null ? `${Math.floor(b.start_time_minutes/60)}:${String(b.start_time_minutes%60).padStart(2,'0')}` : '',
    Total:        b.total_price,
    Status:       b.status,
    Payment:      b.payment_status,
  }));
  exportCSV('home_bookings.csv', rows);
}
