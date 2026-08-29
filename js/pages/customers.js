import { supabaseGet, supabasePatch } from '../api.js';
import {
  badge, formatDate, formatCurrency, formatRelativeDate,
  openDrawer, setDrawerHeader, setDrawerFooter, closeDrawer,
  showToast, escHtml, getInitials
} from '../ui.js';

let allCustomers = [];

export async function init() {
  await loadCustomers();
  bindSearch();
}

// ─── Load & Render ──────────────────────────────────────────────────

async function loadCustomers() {
  const tbody   = document.getElementById('customers-tbody');
  const countEl = document.getElementById('customers-count');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:3rem"><div class="spinner" style="margin:auto"></div></td></tr>`;

  try {
    allCustomers = await supabaseGet(
      'customers',
      'select=*&order=created_at.desc'
    );
    renderTable(allCustomers, tbody, countEl);
  } catch (err) {
    console.error('Customers load error:', err);
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger);padding:2rem;text-align:center">فشل تحميل العملاء: ${escHtml(err.message)}</td></tr>`;
  }
}

function renderTable(customers, tbody, countEl) {
  if (countEl) countEl.textContent = `${customers.length} عميل`;

  if (!customers.length) {
    tbody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <div class="empty-state-title">لم يتم العثور على عملاء</div>
          <div class="empty-state-text">جرّب البحث بكلمات أخرى</div>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = customers.map(c => {
    const initials = getInitials(c.name);
    const hasLocation = c.default_location && c.default_location.includes('maps.google');

    return `
      <tr data-id="${c.id}" style="cursor:pointer">
        <td>
          <div class="customer-name-cell">
            <div class="customer-avatar">${escHtml(initials)}</div>
            <span class="customer-name-text ${c.name ? '' : 'customer-no-name'}">
              ${escHtml(c.name || 'بدون اسم')}
            </span>
          </div>
        </td>
        <td dir="ltr" style="text-align:right">${escHtml(c.phone || '—')}</td>
        <td dir="ltr" style="font-size:var(--text-xs);color:var(--text-mid);text-align:right">${escHtml(c.whatsapp_id || '—')}</td>
        <td>
          ${hasLocation
            ? `<a href="${escHtml(c.default_location)}" target="_blank" class="map-link" onclick="event.stopPropagation()">📍 عرض</a>`
            : '<span style="color:var(--text-light)">—</span>'
          }
        </td>
        <td style="color:var(--text-mid);font-size:var(--text-sm)">${formatRelativeDate(c.created_at)}</td>
        <td style="text-align:left">
          <button class="btn btn-ghost btn-sm" data-customer-id="${c.id}">عرض ←</button>
        </td>
      </tr>`;
  }).join('');

  // Row & button click → drawer
  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.map-link')) return; // don't open drawer for map links
      const id = Number(row.dataset.id);
      const customer = allCustomers.find(c => c.id === id);
      if (customer) openCustomerDrawer(customer);
    });
  });
}

// ─── Search ────────────────────────────────────────────────────────

function bindSearch() {
  const searchInput = document.getElementById('customer-search');
  if (!searchInput) return;

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = q
      ? allCustomers.filter(c =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.phone || '').toLowerCase().includes(q) ||
          (c.whatsapp_id || '').toLowerCase().includes(q)
        )
      : allCustomers;

    renderTable(filtered, document.getElementById('customers-tbody'), document.getElementById('customers-count'));
  });
}

// ─── Customer Drawer ───────────────────────────────────────────────

async function openCustomerDrawer(customer) {
  setDrawerHeader(customer.name || 'عميل بدون اسم', customer.phone || '');

  // Immediately open with a loading state
  openDrawer(`<div style="text-align:center;padding:3rem"><div class="spinner" style="margin:auto"></div></div>`);
  setDrawerFooter(`<button class="btn btn-ghost" id="drawer-close-btn" style="margin-right:auto">إغلاق</button>`);
  document.getElementById('drawer-close-btn')?.addEventListener('click', closeDrawer);

  // Fetch history
  let bookings = [];
  let orders   = [];

  try {
    [bookings, orders] = await Promise.all([
      supabaseGet(
        'home_bookings',
        `select=id,booking_code,booking_date,total_price,status,payment_status,start_time_minutes,end_time_minutes,home_booking_items(*,home_services(name))&customer_id=eq.${customer.id}&order=booking_date.desc`
      ),
      supabaseGet(
        'orders',
        `select=id,order_code,order_date,total_price,status,payment_status,order_items(*,products(name))&customer_id=eq.${customer.id}&order=order_date.desc`
      ),
    ]);
  } catch (err) {
    console.error('Customer history error:', err);
  }

  const initials = getInitials(customer.name);
  const hasLocation = customer.default_location?.includes('maps.google');

  const bookingsHtml = bookings.length
    ? bookings.map(b => `
        <div style="padding:var(--space-3) 0;border-bottom:1px solid var(--border-light)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span class="booking-code">${escHtml(b.booking_code || '#' + b.id)}</span>
            <span>${badge(b.status)}</span>
          </div>
          <div style="font-size:var(--text-sm);color:var(--text-mid)">${formatDate(b.booking_date)} · ${formatCurrency(b.total_price)}</div>
          <div style="font-size:11px;color:var(--text-light);margin-top:2px">
            ${(b.home_booking_items || []).map(i => escHtml(i.home_services?.name || '?') + ' ×' + i.people_count).join('، ')}
          </div>
        </div>
      `).join('')
    : '<div class="history-empty">لا توجد حجوزات سابقة</div>';

  const ordersHtml = orders.length
    ? orders.map(o => `
        <div style="padding:var(--space-3) 0;border-bottom:1px solid var(--border-light)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span class="booking-code">${escHtml(o.order_code || '#' + o.id)}</span>
            <span>${badge(o.status)}</span>
          </div>
          <div style="font-size:var(--text-sm);color:var(--text-mid)">${formatDate(o.order_date)} · ${formatCurrency(o.total_price)}</div>
          <div style="font-size:11px;color:var(--text-light);margin-top:2px">
            ${(o.order_items || []).map(i => escHtml(i.products?.name || '?') + ' ×' + i.quantity).join('، ')}
          </div>
        </div>
      `).join('')
    : '<div class="history-empty">لا توجد طلبات سابقة</div>';

  const html = `
    <!-- Profile header -->
    <div class="customer-profile-header">
      <div class="customer-profile-avatar">${escHtml(initials)}</div>
      <div>
        <div class="customer-profile-info-name">${escHtml(customer.name || 'بدون اسم')}</div>
        <div class="customer-profile-info-phone" dir="ltr">${escHtml(customer.phone || '')}</div>
      </div>
    </div>

    <!-- Details -->
    <div class="drawer-section">
      <div class="drawer-section-title">معلومات الاتصال</div>
      <div class="drawer-field">
        <span class="drawer-field-label">رقم الهاتف</span>
        <span class="drawer-field-value" dir="ltr">${escHtml(customer.phone || '—')}</span>
      </div>
      <div class="drawer-field">
        <span class="drawer-field-label">معرف واتساب</span>
        <span class="drawer-field-value" dir="ltr">${escHtml(customer.whatsapp_id || '—')}</span>
      </div>
      <div class="drawer-field">
        <span class="drawer-field-label">الموقع المحفوظ</span>
        <span class="drawer-field-value">
          ${hasLocation
            ? `<a href="${escHtml(customer.default_location)}" target="_blank" class="map-link">📍 فتح الخريطة</a>`
            : '—'
          }
        </span>
      </div>
      <div class="drawer-field">
        <span class="drawer-field-label">تاريخ الانضمام</span>
        <span class="drawer-field-value">${formatDate(customer.created_at?.slice(0, 10))}</span>
      </div>
    </div>

    <!-- Stats -->
    <div class="drawer-section">
      <div class="info-grid">
        <div class="info-item">
          <div class="info-item-label">الحجوزات</div>
          <div class="info-item-value">${bookings.length}</div>
        </div>
        <div class="info-item">
          <div class="info-item-label">الطلبات</div>
          <div class="info-item-value">${orders.length}</div>
        </div>
        <div class="info-item">
          <div class="info-item-label">إيراد الحجوزات</div>
          <div class="info-item-value" style="font-size:var(--text-sm)">
            ${formatCurrency(bookings.reduce((s, b) => s + Number(b.total_price || 0), 0))}
          </div>
        </div>
        <div class="info-item">
          <div class="info-item-label">إيراد الطلبات</div>
          <div class="info-item-value" style="font-size:var(--text-sm)">
            ${formatCurrency(orders.reduce((s, o) => s + Number(o.total_price || 0), 0))}
          </div>
        </div>
      </div>
    </div>

    <!-- History Tabs -->
    <div class="drawer-section">
      <div class="history-tabs">
        <div class="history-tab active" data-tab="bookings">الحجوزات (${bookings.length})</div>
        <div class="history-tab" data-tab="orders">الطلبات (${orders.length})</div>
      </div>
      <div class="history-panel active" id="history-bookings">${bookingsHtml}</div>
      <div class="history-panel" id="history-orders">${ordersHtml}</div>
    </div>
  `;

  // Inject HTML into the already-open drawer
  const drawerBody = document.getElementById('drawer-body');
  if (drawerBody) drawerBody.innerHTML = html;

  // Wire up tabs
  document.querySelectorAll('.history-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.history-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`history-${tab.dataset.tab}`)?.classList.add('active');
    });
  });

  // Footer: edit name
  setDrawerFooter(`
    <button class="btn btn-ghost" id="edit-customer-name-btn">✏️ تعديل الاسم</button>
    <button class="btn btn-ghost" id="drawer-close-btn" style="margin-right:auto">إغلاق</button>
  `);
  document.getElementById('drawer-close-btn')?.addEventListener('click', closeDrawer);
  document.getElementById('edit-customer-name-btn')?.addEventListener('click', () => showEditNameForm(customer));
}

function showEditNameForm(customer) {
  setDrawerFooter(`
    <div style="display:flex;align-items:center;gap:var(--space-3);width:100%">
      <input id="customer-name-input" type="text" class="input" value="${escHtml(customer.name || '')}"
        placeholder="اسم العميل" style="flex:1" />
      <button class="btn btn-primary" id="save-customer-name-btn">حفظ</button>
      <button class="btn btn-ghost" id="cancel-name-edit-btn">إلغاء</button>
    </div>
  `);

  // Focus input
  setTimeout(() => document.getElementById('customer-name-input')?.focus(), 50);

  document.getElementById('cancel-name-edit-btn')?.addEventListener('click', () => {
    setDrawerFooter(`
      <button class="btn btn-ghost" id="edit-customer-name-btn">✏️ تعديل الاسم</button>
      <button class="btn btn-ghost" id="drawer-close-btn" style="margin-right:auto">إغلاق</button>
    `);
    document.getElementById('drawer-close-btn')?.addEventListener('click', closeDrawer);
    document.getElementById('edit-customer-name-btn')?.addEventListener('click', () => showEditNameForm(customer));
  });

  document.getElementById('save-customer-name-btn')?.addEventListener('click', async () => {
    const newName = document.getElementById('customer-name-input')?.value.trim();
    if (!newName) { showToast('لا يمكن ترك الاسم فارغاً', 'error'); return; }
    try {
      await supabasePatch('customers', `id=eq.${customer.id}`, { name: newName });
      showToast('تم تحديث اسم العميل', 'success');

      // Update local cache and refresh table
      customer.name = newName;
      const idx = allCustomers.findIndex(c => c.id === customer.id);
      if (idx !== -1) allCustomers[idx].name = newName;
      renderTable(allCustomers, document.getElementById('customers-tbody'), document.getElementById('customers-count'));

      // Update drawer header + profile
      setDrawerHeader(newName, customer.phone || '');
      const profileName = document.querySelector('.customer-profile-info-name');
      if (profileName) profileName.textContent = newName;
      const avatarEl = document.querySelector('.customer-profile-avatar');
      if (avatarEl) avatarEl.textContent = getInitials(newName);

      // Reset footer back to normal
      setDrawerFooter(`
        <button class="btn btn-ghost" id="edit-customer-name-btn">✏️ تعديل الاسم</button>
        <button class="btn btn-ghost" id="drawer-close-btn" style="margin-right:auto">إغلاق</button>
      `);
      document.getElementById('drawer-close-btn')?.addEventListener('click', closeDrawer);
      document.getElementById('edit-customer-name-btn')?.addEventListener('click', () => showEditNameForm(customer));
    } catch (err) {
      showToast('فشل تحديث الاسم: ' + err.message, 'error');
    }
  });
}
