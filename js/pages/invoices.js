import { supabaseGet, supabasePost, supabasePatch } from '../api.js';
import { isAdmin } from '../auth.js';
import {
  openDrawer, setDrawerHeader, setDrawerFooter, closeDrawer,
  showToast, escHtml, formatCurrency, initAllSearchableSelects
} from '../ui.js';

let allInvoices = [];
let allProducts = [];
let allServices = [];
let draftItems = [];

export async function init() {
  draftItems = [];
  bindEvents();
  renderDraftItems();

  if (isAdmin()) {
    await refreshData();
  } else {
    // Staff members can only issue new invoices, not query/view invoice history
    await loadProductsAndServices();
    document.getElementById('panel-all-invoices')?.classList.remove('active');
    document.getElementById('panel-create-invoice')?.classList.add('active');
    const toggleBtn = document.getElementById('btn-toggle-view');
    if (toggleBtn) toggleBtn.style.display = 'none';
  }

  initAllSearchableSelects(document.getElementById('panel-create-invoice'));
}

async function refreshData() {
  if (!isAdmin()) return;
  await Promise.all([loadInvoices(), loadProductsAndServices()]);
}


async function loadProductsAndServices() {
  const itemSelect = document.getElementById('create-item-id');
  if (itemSelect) itemSelect.innerHTML = '<option value="">جاري التحميل...</option>';

  try {
    const [prods, svcs] = await Promise.all([
      supabaseGet('products', 'select=*&order=name.asc'),
      supabaseGet('home_services', 'select=*&order=name.asc')
    ]);
    allProducts = prods || [];
    allServices = svcs || [];
    populateItemDropdown();
  } catch (err) {
    console.error('Failed to load products/services:', err);
    showToast('فشل تحميل المنتجات والخدمات: ' + err.message, 'error');
  }
}

function populateItemDropdown() {
  const typeSelect = document.getElementById('create-item-type');
  const itemSelect = document.getElementById('create-item-id');
  const priceInput = document.getElementById('create-item-price');
  const stockInfo = document.getElementById('create-item-stock-info');

  if (!typeSelect || !itemSelect) return;

  const type = typeSelect.value;
  itemSelect.innerHTML = '<option value="">-- اختر العنصر --</option>';
  if (priceInput) priceInput.value = '';
  if (stockInfo) stockInfo.textContent = '';

  if (type === 'product') {
    allProducts.filter(p => p.active !== false).forEach(p => {
      const stockTxt = p.stock_quantity != null ? `(المخزون: ${p.stock_quantity})` : '(مخزون غير محدود)';
      itemSelect.innerHTML += `<option value="${p.id}">${escHtml(p.name)} ${stockTxt}</option>`;
    });
  } else {
    allServices.filter(s => s.active !== false).forEach(s => {
      itemSelect.innerHTML += `<option value="${s.id}">${escHtml(s.name)}</option>`;
    });
  }
}

async function loadInvoices() {
  const tbody = document.getElementById('invoices-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:3rem"><div class="spinner" style="margin:auto"></div></td></tr>`;

  try {
    allInvoices = await supabaseGet('invoices', 'select=*&order=created_at.desc');
    renderInvoicesTable(allInvoices);
    updateStats(allInvoices);
  } catch (err) {
    console.warn('Supabase fetch invoices failed:', err.message);
    const local = localStorage.getItem('bc_invoices');
    allInvoices = local ? JSON.parse(local) : [];
    renderInvoicesTable(allInvoices);
    updateStats(allInvoices);
  }
}

function updateStats(invoices) {
  const totalInvoicesEl = document.getElementById('stat-total-invoices');
  const totalRevenueEl = document.getElementById('stat-total-revenue');
  const itemsSoldEl = document.getElementById('stat-items-sold');

  let revenue = 0;
  let itemsCount = 0;

  invoices.forEach(inv => {
    revenue += Number(inv.total_amount || 0);
    if (Array.isArray(inv.items)) {
      inv.items.forEach(item => {
        itemsCount += Number(item.quantity || 0);
      });
    }
  });

  if (totalInvoicesEl) totalInvoicesEl.textContent = invoices.length;
  if (totalRevenueEl) totalRevenueEl.textContent = formatCurrency(revenue);
  if (itemsSoldEl) itemsSoldEl.textContent = itemsCount;
}

function bindEvents() {
  // Toggle between Create Invoice & All Invoices
  const toggleBtn = document.getElementById('btn-toggle-view');
  const titleEl = document.getElementById('invoices-header-title');
  const subEl = document.getElementById('invoices-header-sub');

  toggleBtn?.addEventListener('click', () => {
    const currentView = toggleBtn.dataset.view;

    if (currentView === 'create') {
      // Switch to All Invoices
      document.getElementById('panel-create-invoice')?.classList.remove('active');
      document.getElementById('panel-all-invoices')?.classList.add('active');
      toggleBtn.dataset.view = 'all';
      toggleBtn.innerHTML = '➕ إضافة فاتورة جديدة';
      if (titleEl) titleEl.textContent = 'جميع الفواتير والمبيعات 📋';
      if (subEl) subEl.textContent = 'سجل الفواتير الصادرة وإحصائيات مبيعات المركز';
    } else {
      // Switch to Create Invoice
      document.getElementById('panel-all-invoices')?.classList.remove('active');
      document.getElementById('panel-create-invoice')?.classList.add('active');
      toggleBtn.dataset.view = 'create';
      toggleBtn.innerHTML = '📋 عرض جميع الفواتير';
      if (titleEl) titleEl.textContent = 'إصدار فاتورة مبيعات جديدة 🧾';
      if (subEl) subEl.textContent = 'قم بإضافة المنتجات والخدمات المطلوبة للتخصيم التلقائي وإصدار الفاتورة';
    }
  });

  // Create Invoice Item Form
  const typeSelect = document.getElementById('create-item-type');
  const itemSelect = document.getElementById('create-item-id');
  const priceInput = document.getElementById('create-item-price');
  const stockInfo = document.getElementById('create-item-stock-info');
  const addItemBtn = document.getElementById('btn-create-add-item');
  const submitBtn = document.getElementById('btn-submit-invoice');

  typeSelect?.addEventListener('change', populateItemDropdown);

  itemSelect?.addEventListener('change', () => {
    const type = typeSelect.value;
    const id = Number(itemSelect.value);

    if (!id) {
      if (priceInput) priceInput.value = '';
      if (stockInfo) stockInfo.textContent = '';
      return;
    }

    if (type === 'product') {
      const prod = allProducts.find(p => p.id === id);
      if (prod) {
        if (priceInput) priceInput.value = prod.price;
        if (stockInfo) {
          stockInfo.textContent = prod.stock_quantity != null
            ? `المخزون المتوفر في قاعدة البيانات: ${prod.stock_quantity} قطعة`
            : 'المخزون غير محدود';
        }
      }
    } else {
      const svc = allServices.find(s => s.id === id);
      if (svc) {
        if (priceInput) priceInput.value = svc.price;
        if (stockInfo) stockInfo.textContent = `مدة الخدمة: ${svc.duration_minutes} دقيقة`;
      }
    }
  });

  addItemBtn?.addEventListener('click', () => {
    const type = typeSelect.value;
    const id = Number(itemSelect.value);
    const qtyInput = document.getElementById('create-item-qty');
    const qty = Number(qtyInput?.value || 1);
    const price = Number(priceInput?.value || 0);

    if (!id || qty <= 0) {
      showToast('يرجى اختيار عنصر وتحديد كمية صحيحة', 'error');
      return;
    }

    let itemName = '';
    if (type === 'product') {
      const prod = allProducts.find(p => p.id === id);
      if (!prod) return;
      itemName = prod.name;

      if (prod.stock_quantity != null) {
        const alreadyAdded = draftItems
          .filter(i => i.type === 'product' && i.id === id)
          .reduce((sum, i) => sum + i.quantity, 0);

        if (alreadyAdded + qty > prod.stock_quantity) {
          showToast(`عفواً، الكمية المطلوبة (${alreadyAdded + qty}) تتجاوز المخزون المتاح (${prod.stock_quantity})`, 'error');
          return;
        }
      }
    } else {
      const svc = allServices.find(s => s.id === id);
      if (!svc) return;
      itemName = svc.name;
    }

    draftItems.push({
      type,
      id,
      name: itemName,
      quantity: qty,
      price: price,
      total: qty * price
    });

    renderDraftItems();
    showToast('تم إضافة البند بنجاح', 'success');
  });

  submitBtn?.addEventListener('click', async () => {
    const customerNameInput = document.getElementById('new-inv-customer-name');
    const customerPhoneInput = document.getElementById('new-inv-customer-phone');
    const customerName = customerNameInput?.value.trim();

    if (!customerName) {
      showToast('يرجى إدخال اسم العميل', 'error');
      customerNameInput?.focus();
      return;
    }

    if (draftItems.length === 0) {
      showToast('يرجى إضافة بند واحد على الأقل قبل إصدار الفاتورة', 'error');
      return;
    }

    const totalAmount = draftItems.reduce((sum, i) => sum + i.total, 0);
    const invoiceNum = 'INV-' + Math.floor(100000 + Math.random() * 900000);

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'جاري التخصيم والإصدار...';

      // 1. Deduct Product Stock from database
      for (const item of draftItems) {
        if (item.type === 'product') {
          const prod = allProducts.find(p => p.id === item.id);
          if (prod && prod.stock_quantity != null) {
            const newStock = Math.max(0, prod.stock_quantity - item.quantity);
            await supabasePatch('products', `id=eq.${prod.id}`, { stock_quantity: newStock });
            prod.stock_quantity = newStock;
          }
        }
      }

      // 2. Save Invoice
      const invoicePayload = {
        invoice_number: invoiceNum,
        customer_name: customerName,
        customer_phone: customerPhoneInput?.value.trim() || null,
        total_amount: totalAmount,
        items: draftItems,
        created_at: new Date().toISOString()
      };

      try {
        await supabasePost('invoices', invoicePayload);
      } catch (err) {
        console.warn('DB post invoice error, saving to local:', err);
        const local = localStorage.getItem('bc_invoices');
        const list = local ? JSON.parse(local) : [];
        invoicePayload.id = Date.now();
        list.unshift(invoicePayload);
        localStorage.setItem('bc_invoices', JSON.stringify(list));
      }

      showToast('تم إصدار الفاتورة وتخصيم المخزون بنجاح! 🧾', 'success');

      // Reset form and draft items
      if (customerNameInput) customerNameInput.value = '';
      if (customerPhoneInput) customerPhoneInput.value = '';
      draftItems = [];
      renderDraftItems();

      // Refresh data and auto-switch to All Invoices tab
      await refreshData();
      toggleBtn?.click();

    } catch (err) {
      showToast('فشل إصدار الفاتورة: ' + err.message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 إصدار الفاتورة';
      }
    }
  });

  // Filter handlers for All Invoices table
  const searchInput = document.getElementById('invoice-search');
  const dateFrom = document.getElementById('invoice-date-from');
  const dateTo = document.getElementById('invoice-date-to');
  const clearBtn = document.getElementById('invoice-filter-clear');

  const filterHandler = () => applyFilters();
  searchInput?.addEventListener('input', filterHandler);
  dateFrom?.addEventListener('change', filterHandler);
  dateTo?.addEventListener('change', filterHandler);

  clearBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    renderInvoicesTable(allInvoices);
  });
}

function renderDraftItems() {
  const tbody = document.getElementById('create-items-tbody');
  const itemsCountEl = document.getElementById('summary-items-count');
  const piecesCountEl = document.getElementById('summary-pieces-count');
  const grandTotalEl = document.getElementById('summary-grand-total');

  if (!tbody) return;

  if (draftItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem">
          لم يتم إضافة بنود للفاتورة بعد. استخدم النموذج أعلاه لإضافة منتجات أو خدمات.
        </td>
      </tr>`;
    if (itemsCountEl) itemsCountEl.textContent = '0 مادة';
    if (piecesCountEl) piecesCountEl.textContent = '0 قطعة';
    if (grandTotalEl) grandTotalEl.textContent = formatCurrency(0);
    return;
  }

  let totalPieces = 0;
  let grandTotal = 0;

  tbody.innerHTML = draftItems.map((item, index) => {
    totalPieces += item.quantity;
    grandTotal += item.total;
    const typeLabel = item.type === 'product' ? '📦 منتج' : '🛎️ خدمة';

    return `
      <tr>
        <td style="font-size:var(--text-xs)">${typeLabel}</td>
        <td style="font-weight:600">${escHtml(item.name)}</td>
        <td><span class="badge badge-neutral">${item.quantity}</span></td>
        <td>${formatCurrency(item.price)}</td>
        <td style="font-weight:700;color:var(--accent-gold-hover)">${formatCurrency(item.total)}</td>
        <td style="text-align:center">
          <button class="btn btn-ghost btn-sm remove-item-btn" data-index="${index}" style="color:var(--danger)">
            حذف ✕
          </button>
        </td>
      </tr>`;
  }).join('');

  if (itemsCountEl) itemsCountEl.textContent = `${draftItems.length} مادة`;
  if (piecesCountEl) piecesCountEl.textContent = `${totalPieces} قطعة`;
  if (grandTotalEl) grandTotalEl.textContent = formatCurrency(grandTotal);

  tbody.querySelectorAll('.remove-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index);
      draftItems.splice(idx, 1);
      renderDraftItems();
    });
  });
}

function applyFilters() {
  const query = document.getElementById('invoice-search')?.value.trim().toLowerCase() || '';
  const from = document.getElementById('invoice-date-from')?.value;
  const to = document.getElementById('invoice-date-to')?.value;

  const filtered = allInvoices.filter(inv => {
    const matchNum = (inv.invoice_number || '').toLowerCase().includes(query);
    const matchCust = (inv.customer_name || '').toLowerCase().includes(query);
    const matchQuery = !query || matchNum || matchCust;

    const invDate = inv.created_at ? inv.created_at.slice(0, 10) : '';
    const matchFrom = !from || invDate >= from;
    const matchTo = !to || invDate <= to;

    return matchQuery && matchFrom && matchTo;
  });

  renderInvoicesTable(filtered);
}

function renderInvoicesTable(invoices) {
  const tbody = document.getElementById('invoices-tbody');
  const countEl = document.getElementById('invoices-count');
  if (!tbody) return;

  if (countEl) countEl.textContent = `${invoices.length} فاتورة`;

  if (!invoices.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <div class="empty-state-icon">🧾</div>
            <div class="empty-state-title">لا توجد فواتير صادرة بعد</div>
            <div class="empty-state-text">انقر على "إضافة فاتورة جديدة" لإصدار فاتورة لأحد العملاء</div>
          </div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = invoices.map(inv => {
    const itemsList = Array.isArray(inv.items) ? inv.items : [];
    const itemsSummary = itemsList.length > 0
      ? `${itemsList.length} مادة (${itemsList.reduce((acc, i) => acc + (Number(i.quantity) || 1), 0)} قطعة)`
      : '0 مادة';

    const formattedDate = inv.created_at
      ? new Date(inv.created_at).toLocaleDateString('ar-OM', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';

    return `
      <tr>
        <td style="font-weight:700;color:var(--accent-gold)">${escHtml(inv.invoice_number || '—')}</td>
        <td style="font-weight:500">${escHtml(inv.customer_name || 'عميل عام')}</td>
        <td style="color:var(--text-mid);font-size:var(--text-sm)">${formattedDate}</td>
        <td><span class="badge badge-neutral">${itemsSummary}</span></td>
        <td style="font-weight:700;color:var(--accent-gold-hover)">${formatCurrency(inv.total_amount)}</td>
        <td style="text-align:center">
          <button class="btn btn-ghost btn-sm view-invoice-btn" data-id="${inv.id}">عرض الفاتورة</button>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.view-invoice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const inv = invoices.find(i => String(i.id) === String(btn.dataset.id));
      if (inv) openViewInvoiceDrawer(inv);
    });
  });
}

// ─── عرض وطباعة الفاتورة ──────────────────────────────────────────

function openViewInvoiceDrawer(inv) {
  setDrawerHeader(`فاتورة ${inv.invoice_number}`, `العميل: ${inv.customer_name || 'عميل عام'}`);

  const items = Array.isArray(inv.items) ? inv.items : [];
  const formattedDate = inv.created_at
    ? new Date(inv.created_at).toLocaleDateString('ar-OM', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const html = `
    <div id="printable-area" class="printable-invoice">
      <div class="printable-invoice-header">
        <div>
          <div class="printable-brand-title">✦ مركز التجميل</div>
          <div style="font-size:0.9rem;color:#64748b">فاتورة مبيعات ومخزون</div>
          <div style="font-size:0.85rem;color:#94a3b8;margin-top:4px">تاريخ الإصدار: ${formattedDate}</div>
        </div>
        <div style="text-align:left">
          <div class="printable-invoice-num">${escHtml(inv.invoice_number)}</div>
          <div style="font-size:0.9rem;color:#334155;margin-top:4px">العميل: ${escHtml(inv.customer_name || 'عميل عام')}</div>
        </div>
      </div>

      <table class="printable-invoice-table">
        <thead>
          <tr>
            <th>#</th>
            <th>النوع</th>
            <th>البيان / الخدمة أو المنتج</th>
            <th>الكمية</th>
            <th>السعر الفردي</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${item.type === 'product' ? 'منتج' : 'خدمة'}</td>
              <td style="font-weight:600;color:#0f172a">${escHtml(item.name)}</td>
              <td>${item.quantity}</td>
              <td>${formatCurrency(item.price)}</td>
              <td style="font-weight:600">${formatCurrency(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="printable-total-row">
            <td colspan="5" style="text-align:right;padding-right:1rem;font-weight:700">إجمالي الفاتورة:</td>
            <td style="font-weight:700;color:#0f172a">${formatCurrency(inv.total_amount)}</td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top:2rem;text-align:center;font-size:0.85rem;color:#64748b;border-top:1px dashed #e2e8f0;padding-top:1rem">
        شكراً لزيارتكم مركز التجميل ✨
      </div>
    </div>`;

  openDrawer(html);

  const footerHtml = `
    <button class="btn btn-primary" id="btn-print-invoice">
      🖨️ طباعة الفاتورة
    </button>
    <button class="btn btn-ghost" id="btn-close-view">إغلاق</button>`;
  setDrawerFooter(footerHtml);

  document.getElementById('btn-close-view')?.addEventListener('click', closeDrawer);
  document.getElementById('btn-print-invoice')?.addEventListener('click', () => {
    const printContent = document.getElementById('printable-area')?.outerHTML;
    const win = window.open('', '', 'width=850,height=700');
    win.document.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>طباعة الفاتورة - ${inv.invoice_number}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet" />
        <style>
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            direction: rtl !important;
            text-align: right !important;
            font-family: 'Cairo', sans-serif;
            background: #ffffff;
            color: #1e293b;
          }
          body {
            padding: 30px;
          }
          .printable-invoice {
            background: #ffffff;
            color: #0f172a;
            padding: 2.5rem;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            direction: rtl !important;
            text-align: right !important;
            max-width: 800px;
            margin: 0 auto;
          }
          .printable-invoice-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 1.5rem;
            margin-bottom: 1.5rem;
            direction: rtl;
          }
          .printable-brand-title {
            font-size: 1.6rem;
            font-weight: 700;
            color: #0f172a;
          }
          .printable-invoice-num {
            font-size: 1.25rem;
            font-weight: 700;
            color: #b89726;
          }
          .printable-invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin: 1.5rem 0;
            direction: rtl;
          }
          .printable-invoice-table th,
          .printable-invoice-table td {
            padding: 12px 14px;
            border-bottom: 1px solid #e2e8f0;
            text-align: right !important;
          }
          .printable-invoice-table th {
            background: #f8fafc;
            color: #475569;
            font-weight: 700;
            font-size: 0.95rem;
          }
          .printable-total-row {
            font-weight: 700;
            font-size: 1.2rem;
            color: #0f172a;
            background: #f8fafc;
          }
          .printable-total-row td {
            border-top: 2px solid #cbd5e1;
          }
          @media print {
            body { padding: 0; }
            .printable-invoice { border: none; padding: 0; max-width: 100%; }
          }
        </style>
      </head>
      <body dir="rtl">
        ${printContent}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 300);
          }
        </script>
      </body>
      </html>
    `);
    win.document.close();
  });
}
