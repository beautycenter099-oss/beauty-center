import { supabaseGet, supabasePost, supabasePatch } from '../api.js';
import { navigate } from '../router.js';
import {
  openDrawer, setDrawerHeader, setDrawerFooter, closeDrawer,
  showToast, escHtml, formatCurrency
} from '../ui.js';

let allInvoices = [];
let allProducts = [];
let allServices = [];
let draftItems = [];

export async function init() {
  bindEvents();
  await refreshData();
}

async function refreshData() {
  await Promise.all([loadInvoices(), loadProductsAndServices()]);
}

async function loadProductsAndServices() {
  try {
    const [prods, svcs] = await Promise.all([
      supabaseGet('products', 'select=*&order=name.asc'),
      supabaseGet('home_services', 'select=*&order=name.asc')
    ]);
    allProducts = prods || [];
    allServices = svcs || [];
  } catch (err) {
    console.error('Failed to load products/services:', err);
  }
}

async function loadInvoices() {
  const tbody = document.getElementById('invoices-tbody');
  const countEl = document.getElementById('invoices-count');

  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:3rem"><div class="spinner" style="margin:auto"></div></td></tr>`;

  try {
    allInvoices = await supabaseGet('invoices', 'select=*&order=created_at.desc');
    renderInvoicesTable(allInvoices);
    updateStats(allInvoices);
  } catch (err) {
    // Fallback if table fetch failed
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
  document.getElementById('btn-create-invoice')?.addEventListener('click', () => {
    navigate('#create-invoice');
  });

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
            <div class="empty-state-text">انقر على "إنشاء فاتورة جديدة" لإصدار فاتورة للأحد العملاء</div>
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

// ─── انشاء فاتورة جديدة ──────────────────────────────────────────

function openCreateInvoiceDrawer() {
  draftItems = [];
  setDrawerHeader('إنشاء فاتورة جديدة', 'اختر المنتجات والخدمات المطلوبة');

  const html = `
    <div class="edit-form">
      <div class="form-group">
        <label class="label" for="inv-customer-name">اسم العميل (اختياري)</label>
        <input type="text" id="inv-customer-name" class="input" placeholder="أدخل اسم العميل..." />
      </div>

      <div class="invoice-item-builder">
        <div style="font-weight:600;margin-bottom:var(--space-3);color:var(--accent-gold)">+ إضافة بند للفاتورة</div>
        
        <div class="invoice-item-row-form">
          <div class="form-group" style="margin:0">
            <label class="label" style="font-size:var(--text-xs)">النوع</label>
            <select id="item-type-select" class="input select">
              <option value="product">منتج 📦</option>
              <option value="service">خدمة 🛎️</option>
            </select>
          </div>

          <div class="form-group" style="margin:0">
            <label class="label" style="font-size:var(--text-xs)">العنصر</label>
            <select id="item-id-select" class="input select">
              <option value="">-- اختر العنصر --</option>
            </select>
          </div>

          <div class="form-group" style="margin:0">
            <label class="label" style="font-size:var(--text-xs)">الكمية</label>
            <input type="number" id="item-qty-input" class="input" value="1" min="1" step="1" />
          </div>

          <div class="form-group" style="margin:0">
            <label class="label" style="font-size:var(--text-xs)">السعر الفردي</label>
            <input type="number" id="item-price-input" class="input" readonly style="background:rgba(255,255,255,0.05)" />
          </div>

          <button type="button" id="btn-add-item" class="btn btn-secondary btn-sm" style="height:38px">إضافة</button>
        </div>
        <div id="item-stock-info" style="font-size:var(--text-xs);color:var(--text-muted);margin-top:6px"></div>
      </div>

      <!-- جدول المواد المضافة -->
      <div style="font-weight:600;margin-bottom:var(--space-2)">بنود الفاتورة الحالية:</div>
      <table class="invoice-items-table">
        <thead>
          <tr>
            <th>النوع</th>
            <th>الوصف</th>
            <th>الكمية</th>
            <th>السعر</th>
            <th>الإجمالي</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="draft-items-tbody">
          <tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:1.5rem">لم يتم إضافة بنود بعد</td></tr>
        </tbody>
      </table>

      <!-- صندوق الإجمالي -->
      <div class="invoice-summary-box">
        <span style="font-weight:600">المبلغ الإجمالي الكلي:</span>
        <span class="invoice-summary-total" id="draft-total-display">0.000 ر.ع</span>
      </div>
    </div>`;

  openDrawer(html);

  const typeSelect = document.getElementById('item-type-select');
  const itemSelect = document.getElementById('item-id-select');
  const priceInput = document.getElementById('item-price-input');
  const stockInfo = document.getElementById('item-stock-info');
  const qtyInput = document.getElementById('item-qty-input');

  const populateItems = () => {
    const type = typeSelect.value;
    itemSelect.innerHTML = '<option value="">-- اختر العنصر --</option>';
    priceInput.value = '';
    stockInfo.textContent = '';

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
  };

  typeSelect.addEventListener('change', populateItems);
  populateItems();

  itemSelect.addEventListener('change', () => {
    const type = typeSelect.value;
    const id = Number(itemSelect.value);
    if (!id) {
      priceInput.value = '';
      stockInfo.textContent = '';
      return;
    }

    if (type === 'product') {
      const prod = allProducts.find(p => p.id === id);
      if (prod) {
        priceInput.value = prod.price;
        stockInfo.textContent = prod.stock_quantity != null
          ? `المخزون المتاح: ${prod.stock_quantity} قطعة`
          : 'المخزون غير محدود';
      }
    } else {
      const svc = allServices.find(s => s.id === id);
      if (svc) {
        priceInput.value = svc.price;
        stockInfo.textContent = `مدة الخدمة: ${svc.duration_minutes} دقيقة`;
      }
    }
  });

  document.getElementById('btn-add-item')?.addEventListener('click', () => {
    const type = typeSelect.value;
    const id = Number(itemSelect.value);
    const qty = Number(qtyInput.value);
    const price = Number(priceInput.value);

    if (!id || !qty || qty <= 0) {
      showToast('يرجى اختيار عنصر وتحديد كمية صحيحة', 'error');
      return;
    }

    let itemName = '';
    let availableStock = null;

    if (type === 'product') {
      const prod = allProducts.find(p => p.id === id);
      if (!prod) return;
      itemName = prod.name;
      availableStock = prod.stock_quantity;

      if (availableStock != null) {
        // Calculate already added quantity in draft
        const alreadyAdded = draftItems
          .filter(i => i.type === 'product' && i.id === id)
          .reduce((sum, i) => sum + i.quantity, 0);

        if (alreadyAdded + qty > availableStock) {
          showToast(`عفواً، الكمية المطلوبة (${alreadyAdded + qty}) تتجاوز المخزون المتاح (${availableStock})`, 'error');
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
    showToast('تمت إضافة البند إلى الفاتورة', 'success');
  });

  const footerHtml = `
    <button class="btn btn-primary" id="btn-save-invoice">إصدار الفاتورة وتخصيم المخزون</button>
    <button class="btn btn-ghost" id="btn-close-drawer">إلغاء</button>`;
  setDrawerFooter(footerHtml);

  document.getElementById('btn-close-drawer')?.addEventListener('click', closeDrawer);
  document.getElementById('btn-save-invoice')?.addEventListener('click', async () => {
    if (draftItems.length === 0) {
      showToast('يرجى إضافة بند واحد على الأقل قبل إصدار الفاتورة', 'error');
      return;
    }

    const customerName = document.getElementById('inv-customer-name')?.value.trim() || 'عميل عام';
    const totalAmount = draftItems.reduce((sum, i) => sum + i.total, 0);
    const invoiceNum = 'INV-' + Math.floor(100000 + Math.random() * 900000);

    const saveBtn = document.getElementById('btn-save-invoice');
    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'جاري التخصيم والإصدار...';

      // 1. Deduct Product Stock from database
      for (const item of draftItems) {
        if (item.type === 'product') {
          const prod = allProducts.find(p => p.id === item.id);
          if (prod && prod.stock_quantity != null) {
            const newStock = Math.max(0, prod.stock_quantity - item.quantity);
            await supabasePatch('products', `id=eq.${prod.id}`, { stock_quantity: newStock });
            prod.stock_quantity = newStock; // update local ref
          }
        }
      }

      // 2. Insert Invoice
      const invoicePayload = {
        invoice_number: invoiceNum,
        customer_name: customerName,
        total_amount: totalAmount,
        items: draftItems,
        created_at: new Date().toISOString()
      };

      try {
        await supabasePost('invoices', invoicePayload);
      } catch (err) {
        console.warn('Saving invoice to Supabase DB fallback to localStorage:', err);
        const local = localStorage.getItem('bc_invoices');
        const list = local ? JSON.parse(local) : [];
        invoicePayload.id = Date.now();
        list.unshift(invoicePayload);
        localStorage.setItem('bc_invoices', JSON.stringify(list));
      }

      showToast('تم إصدار الفاتورة وتخصيم المخزون بنجاح! 🧾', 'success');
      closeDrawer();
      await refreshData();

    } catch (err) {
      showToast('فشل إصدار الفاتورة: ' + err.message, 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'إصدار الفاتورة وتخصيم المخزون';
      }
    }
  });
}

function renderDraftItems() {
  const tbody = document.getElementById('draft-items-tbody');
  const totalDisplay = document.getElementById('draft-total-display');
  if (!tbody) return;

  if (draftItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:1.5rem">لم يتم إضافة بنود بعد</td></tr>`;
    if (totalDisplay) totalDisplay.textContent = formatCurrency(0);
    return;
  }

  let grandTotal = 0;
  tbody.innerHTML = draftItems.map((item, index) => {
    grandTotal += item.total;
    const typeLabel = item.type === 'product' ? '📦 منتج' : '🛎️ خدمة';

    return `
      <tr>
        <td style="font-size:var(--text-xs)">${typeLabel}</td>
        <td style="font-weight:600">${escHtml(item.name)}</td>
        <td>${item.quantity}</td>
        <td>${formatCurrency(item.price)}</td>
        <td style="font-weight:700;color:var(--accent-gold-hover)">${formatCurrency(item.total)}</td>
        <td>
          <button class="btn btn-ghost btn-sm remove-draft-item" data-index="${index}" style="color:var(--danger)">✕</button>
        </td>
      </tr>`;
  }).join('');

  if (totalDisplay) totalDisplay.textContent = formatCurrency(grandTotal);

  tbody.querySelectorAll('.remove-draft-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index);
      draftItems.splice(idx, 1);
      renderDraftItems();
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
