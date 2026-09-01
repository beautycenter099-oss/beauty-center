import { supabaseGet, supabasePost, supabasePatch } from '../api.js';
import { showToast, escHtml } from '../ui.js';

let products = [];

export async function init() {
  await loadProducts();
  bindForms();
}

async function loadProducts() {
  const select = document.getElementById('existing-prod-select');
  if (!select) return;

  try {
    select.innerHTML = '<option value="">جاري التحميل...</option>';
    products = await supabaseGet('products', 'select=id,name,stock_quantity,price&order=name.asc');
    
    if (products.length === 0) {
      select.innerHTML = '<option value="">لا توجد منتجات حالية</option>';
      return;
    }

    select.innerHTML = '<option value="">-- اختر منتجاً --</option>' + 
      products.map(p => {
        const currentStock = p.stock_quantity != null ? p.stock_quantity : 'غير محدود';
        return `<option value="${p.id}">${escHtml(p.name)} (المخزون الحالي: ${currentStock})</option>`;
      }).join('');
  } catch (err) {
    select.innerHTML = '<option value="">فشل تحميل المنتجات</option>';
    showToast('فشل تحميل المنتجات: ' + err.message, 'error');
  }
}

function bindForms() {
  const newProductForm = document.getElementById('new-product-form');
  const updateStockForm = document.getElementById('update-stock-form');

  if (newProductForm) {
    newProductForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btn = newProductForm.querySelector('button[type="submit"]');
      const name = document.getElementById('new-prod-name').value.trim();
      const priceStr = document.getElementById('new-prod-price').value;
      const stockStr = document.getElementById('new-prod-stock').value;
      
      if (!name || !priceStr) {
        showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
        return;
      }
      
      const payload = {
        name,
        price: Number(priceStr),
        stock_quantity: stockStr !== '' ? Number(stockStr) : null,
        active: true
      };

      try {
        btn.disabled = true;
        btn.textContent = 'جاري الإضافة...';
        await supabasePost('products', payload);
        showToast('تم إضافة المنتج بنجاح', 'success');
        
        newProductForm.reset();
        await loadProducts(); // Reload dropdown
      } catch (err) {
        showToast('فشل في إضافة المنتج: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'إضافة المنتج';
      }
    });
  }

  if (updateStockForm) {
    const select = document.getElementById('existing-prod-select');
    const priceInput = document.getElementById('update-prod-price');

    if (select && priceInput) {
      select.addEventListener('change', () => {
        const prod = products.find(p => p.id === Number(select.value));
        priceInput.value = prod ? prod.price : '';
      });
    }

    updateStockForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btn = updateStockForm.querySelector('button[type="submit"]');
      const prodId = document.getElementById('existing-prod-select').value;
      const addQtyStr = document.getElementById('add-stock-qty').value;
      
      if (!prodId || !addQtyStr) {
        showToast('يرجى اختيار المنتج وتحديد الكمية', 'error');
        return;
      }
      
      const addQty = Number(addQtyStr);
      const product = products.find(p => p.id === Number(prodId));
      
      if (!product) {
        showToast('المنتج غير موجود', 'error');
        return;
      }
      
      // If stock is null (unlimited), we initialize it to addQty, otherwise add to current
      const newQty = product.stock_quantity != null ? product.stock_quantity + addQty : addQty;
      
      const payload = { stock_quantity: newQty };
      const updatePriceStr = document.getElementById('update-prod-price').value;
      if (updatePriceStr !== '') {
        payload.price = Number(updatePriceStr);
      }

      try {
        btn.disabled = true;
        btn.textContent = 'جاري الإضافة...';
        
        await supabasePatch('products', `id=eq.${prodId}`, payload);
        showToast('تم التحديث بنجاح', 'success');
        
        updateStockForm.reset();
        await loadProducts(); // Reload dropdown to show new quantities
      } catch (err) {
        showToast('فشل تحديث الكمية: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'إضافة الكمية';
      }
    });
  }
}
