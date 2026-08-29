import { supabaseGet, supabasePatch } from '../api.js';
import {
  badge, formatDate, formatCurrency,
  openDrawer, setDrawerHeader, setDrawerFooter, closeDrawer,
  showToast, escHtml
} from '../ui.js';

let allOrders = [];
let selectedOrderId = null;

export async function init() {
  await loadOrders();
  bindFilters();
}

// ─── Load & Render ──────────────────────────────────────────────────

async function loadOrders() {
  const tbody   = document.getElementById('orders-tbody');
  const countEl = document.getElementById('orders-count');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:3rem"><div class="spinner" style="margin:auto"></div></td></tr>`;

  try {
    allOrders = await supabaseGet(
      'orders',
      'select=*,customers(id,name,phone,whatsapp_id),order_items(*,products(id,name,price))&order=order_date.desc,created_at.desc'
    );
    renderTable(allOrders, tbody, countEl);
  } catch (err) {
    console.error('Orders load error:', err);
    tbody.innerHTML = `<tr><td colspan="8" style="color:var(--danger);padding:2rem;text-align:center">فشل تحميل الطلبات: ${escHtml(err.message)}</td></tr>`;
  }
}

function renderTable(orders, tbody, countEl) {
  if (countEl) countEl.textContent = `${orders.length} طلب`;

  if (!orders.length) {
    tbody.innerHTML = `
      <tr><td colspan="8">
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <div class="empty-state-title">لا توجد طلبات</div>
          <div class="empty-state-text">جرّب تغيير خيارات التصفية</div>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const customer = o.customers;
    const customerName = customer?.name || customer?.phone || 'غير معروف';
    const items = o.order_items || [];
    const productTags = items.map(i =>
      `<span class="product-tag">${escHtml(i.products?.name || '?')} ×${i.quantity}</span>`
    ).join('');

    return `
      <tr data-id="${o.id}" class="${selectedOrderId === o.id ? 'selected' : ''}">
        <td><span class="order-code">${escHtml(o.order_code || '#' + o.id)}</span></td>
        <td>
          <div style="font-weight:500;color:var(--text-dark)">${escHtml(customerName)}</div>
          ${customer?.phone ? `<div style="font-size:11px;color:var(--text-light)" dir="ltr">${escHtml(customer.phone)}</div>` : ''}
        </td>
        <td>${formatDate(o.order_date)}</td>
        <td><div class="products-tags">${productTags || '<span style="color:var(--text-light);font-size:12px">—</span>'}</div></td>
        <td style="color:var(--text-mid);font-size:var(--text-sm)">${formatCurrency(o.delivery_fee)}</td>
        <td style="font-weight:600;color:var(--accent-gold-hover)">${formatCurrency(o.total_price)}</td>
        <td>${badge(o.status)}</td>
        <td>${badge(o.payment_status)}</td>
      </tr>`;
  }).join('');

  // Row click → drawer
  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => {
      const id = Number(row.dataset.id);
      const order = allOrders.find(o => o.id === id);
      if (order) openOrderDrawer(order);
    });
  });
}

// ─── Filters ───────────────────────────────────────────────────────

function bindFilters() {
  const statusFilter  = document.getElementById('order-filter-status');
  const paymentFilter = document.getElementById('order-filter-payment');
  const dateFromInput = document.getElementById('order-filter-date-from');
  const dateToInput   = document.getElementById('order-filter-date-to');
  const clearBtn      = document.getElementById('order-filter-clear');

  const applyFilters = () => {
    const status  = statusFilter?.value  || '';
    const payment = paymentFilter?.value || '';
    const from    = dateFromInput?.value || '';
    const to      = dateToInput?.value   || '';

    const filtered = allOrders.filter(o => {
      if (status  && o.status         !== status)  return false;
      if (payment && o.payment_status !== payment) return false;
      if (from    && o.order_date     <  from)     return false;
      if (to      && o.order_date     >  to)       return false;
      return true;
    });

    const tbody   = document.getElementById('orders-tbody');
    const countEl = document.getElementById('orders-count');
    renderTable(filtered, tbody, countEl);
  };

  statusFilter?.addEventListener('change',  applyFilters);
  paymentFilter?.addEventListener('change', applyFilters);
  dateFromInput?.addEventListener('change', applyFilters);
  dateToInput?.addEventListener('change',   applyFilters);

  clearBtn?.addEventListener('click', () => {
    if (statusFilter)  statusFilter.value  = '';
    if (paymentFilter) paymentFilter.value = '';
    if (dateFromInput) dateFromInput.value = '';
    if (dateToInput)   dateToInput.value   = '';
    renderTable(allOrders, document.getElementById('orders-tbody'), document.getElementById('orders-count'));
  });
}

// ─── Order Drawer ──────────────────────────────────────────────────

function openOrderDrawer(order) {
  selectedOrderId = order.id;

  document.querySelectorAll('#orders-tbody tr').forEach(r => {
    r.classList.toggle('selected', Number(r.dataset.id) === order.id);
  });

  const customer = order.customers;
  const items    = order.order_items || [];
  const code     = order.order_code || '#' + order.id;

  setDrawerHeader(code, `طلب توصيل · ${formatDate(order.order_date)}`);

  const mapLink = order.address
    ? `<a href="${escHtml(order.address)}" target="_blank" class="map-link">📍 فتح الخريطة</a>`
    : '<span style="color:var(--text-light)">—</span>';

  const lineItems = items.map(i => {
    const lineTotal = (Number(i.unit_price || 0) * (i.quantity || 1)).toFixed(3);
    return `
      <tr>
        <td>${escHtml(i.products?.name || '?')}</td>
        <td style="text-align:center">${i.quantity}</td>
        <td>${formatCurrency(i.unit_price)}</td>
        <td class="td-total">${formatCurrency(lineTotal)}</td>
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
    </div>

    <!-- تفاصيل الطلب -->
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

    <!-- المنتجات -->
    <div class="drawer-section">
      <div class="drawer-section-title">المنتجات</div>
      <table class="line-items-table">
        <thead>
          <tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>المجموع</th></tr>
        </thead>
        <tbody>${lineItems || '<tr><td colspan="4" style="padding:1rem;color:var(--text-light);text-align:center">لا توجد منتجات</td></tr>'}</tbody>
      </table>

      <div class="order-total-row">
        <div class="order-total-line">
          <span>مجموع المنتجات</span>
          <span>${formatCurrency(order.items_total)}</span>
        </div>
        <div class="order-total-line">
          <span>رسوم التوصيل</span>
          <span>${formatCurrency(order.delivery_fee)}</span>
        </div>
        <div class="order-total-line grand">
          <span>المجموع الكلي</span>
          <span class="total-value">${formatCurrency(order.total_price)}</span>
        </div>
      </div>
    </div>
  `;

  openDrawer(html);

  const canComplete = order.status === 'confirmed';
  const canCancel   = order.status === 'confirmed';
  const canMarkPaid = order.payment_status === 'unpaid';

  setDrawerFooter(`
    ${canMarkPaid  ? `<button class="btn btn-success" id="drawer-paid-btn">تم الدفع</button>`           : ''}
    ${canComplete  ? `<button class="btn btn-ghost"   id="drawer-complete-btn">تأكيد التوصيل</button>`  : ''}
    ${canCancel    ? `<button class="btn btn-danger"   id="drawer-cancel-btn">إلغاء الطلب</button>`     : ''}
    <button class="btn btn-ghost" id="drawer-close-btn" style="margin-right:auto">إغلاق</button>
  `);

  document.getElementById('drawer-close-btn')?.addEventListener('click', closeDrawer);

  document.getElementById('drawer-paid-btn')?.addEventListener('click', async () => {
    await updateOrder(order.id, { payment_status: 'paid' });
  });

  document.getElementById('drawer-complete-btn')?.addEventListener('click', async () => {
    await updateOrder(order.id, { status: 'completed' });
  });

  document.getElementById('drawer-cancel-btn')?.addEventListener('click', async () => {
    if (confirm('هل أنت متأكد من رغبتك في إلغاء هذا الطلب؟')) {
      await updateOrder(order.id, { status: 'cancelled' });
    }
  });
}

async function updateOrder(orderId, data) {
  try {
    await supabasePatch('orders', `id=eq.${orderId}`, { ...data, updated_at: new Date().toISOString() });
    const label = data.payment_status === 'paid' ? 'تم تحديد الطلب كمدفوع'
                : data.status === 'completed'    ? 'تم تأكيد توصيل الطلب'
                : 'تم إلغاء الطلب';
    showToast(label, 'success');
    closeDrawer();
    selectedOrderId = null;
    await loadOrders();
  } catch (err) {
    showToast('فشل تحديث الطلب: ' + err.message, 'error');
  }
}
