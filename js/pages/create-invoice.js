import { supabaseGet, supabasePost, supabasePatch } from '../api.js';
import { navigate } from '../router.js';
import { showToast, escHtml, formatCurrency } from '../ui.js';

let allProducts = [];
let allServices = [];
let draftItems = [];

export async function init() {
  draftItems = [];
  bindEvents();
  await loadProductsAndServices();
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

function bindEvents() {
  const backBtn = document.getElementById('btn-back-to-invoices');
  const cancelBtn = document.getElementById('btn-cancel-create-invoice');
  const typeSelect = document.getElementById('create-item-type');
  const itemSelect = document.getElementById('create-item-id');
  const priceInput = document.getElementById('create-item-price');
  const stockInfo = document.getElementById('create-item-stock-info');
  const addItemBtn = document.getElementById('btn-create-add-item');
  const submitBtn = document.getElementById('btn-submit-invoice');

  const backHandler = () => navigate('#invoices');
  backBtn?.addEventListener('click', backHandler);
  cancelBtn?.addEventListener('click', backHandler);

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
      navigate('#invoices');
    } catch (err) {
      showToast('فشل إصدار الفاتورة: ' + err.message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 إصدار الفاتورة وتخصيم المخزون';
      }
    }
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
