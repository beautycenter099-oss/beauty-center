import { supabaseGet, supabasePost, supabasePatch, supabaseDelete } from '../api.js';
import {
  openDrawer, setDrawerHeader, setDrawerFooter, closeDrawer,
  showToast, escHtml, formatCurrency
} from '../ui.js';

let homeServices = [];

export async function init() {
  await loadHomeServices();
}

// ─── Home Services ─────────────────────────────────────────────────

async function loadHomeServices() {
  const tbody   = document.getElementById('services-tbody');
  const countEl = document.getElementById('services-tab-count');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:3rem"><div class="spinner" style="margin:auto"></div></td></tr>`;

  try {
    homeServices = await supabaseGet('home_services', 'select=*&order=name.asc');
    if (countEl) countEl.textContent = homeServices.length;

    if (!homeServices.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">🛎️</div><div class="empty-state-title">لا توجد خدمات بعد</div></div></td></tr>`;
      return;
    }

    tbody.innerHTML = homeServices.map(s => `
      <tr data-id="${s.id}" data-type="service" style="cursor:pointer">
        <td style="font-weight:500">${escHtml(s.name)}</td>
        <td style="color:var(--text-mid);font-size:var(--text-sm);max-width:200px">
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(s.description || '—')}</div>
        </td>
        <td style="white-space:nowrap">${s.duration_minutes} دقيقة</td>
        <td style="font-weight:600;color:var(--accent-gold-hover)">${formatCurrency(s.price)}</td>
        <td>
          <label class="toggle" title="${s.active ? 'نشطة' : 'غير نشطة'}">
            <input type="checkbox" class="service-toggle" data-id="${s.id}" ${s.active ? 'checked' : ''}/>
            <div class="toggle-track"></div><div class="toggle-thumb"></div>
          </label>
        </td>
        <td><button class="btn btn-ghost btn-sm edit-service-btn" data-id="${s.id}">تعديل</button></td>
      </tr>
    `).join('');

    bindServiceEvents(tbody);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger);padding:2rem;text-align:center">فشل تحميل الخدمات: ${escHtml(err.message)}</td></tr>`;
  }
}

function bindServiceEvents(tbody) {
  tbody.querySelectorAll('.service-toggle').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      e.stopPropagation();
      await toggleActive('home_services', Number(toggle.dataset.id), toggle.checked, loadHomeServices);
    });
  });
  tbody.querySelectorAll('.edit-service-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const svc = homeServices.find(s => s.id === Number(btn.dataset.id));
      if (svc) openServiceDrawer(svc);
    });
  });
  tbody.querySelectorAll('tr[data-type="service"]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.toggle') || e.target.closest('.edit-service-btn')) return;
      const svc = homeServices.find(s => s.id === Number(row.dataset.id));
      if (svc) openServiceDrawer(svc);
    });
  });
}

function openServiceDrawer(svc, isNew = false) {
  setDrawerHeader(isNew ? 'خدمة جديدة' : 'تعديل الخدمة', isNew ? '' : svc.name);

  const html = `
    <form class="edit-form" id="service-edit-form">
      <div class="form-group">
        <label class="label" for="edit-svc-name">اسم الخدمة *</label>
        <input id="edit-svc-name" type="text" class="input" value="${escHtml(svc?.name || '')}" required />
      </div>
      <div class="form-group">
        <label class="label" for="edit-svc-desc">الوصف</label>
        <textarea id="edit-svc-desc" class="input" rows="3">${escHtml(svc?.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="label" for="edit-svc-price">السعر (لكل شخص) *</label>
        <div class="input-with-suffix">
          <input id="edit-svc-price" type="number" class="input" step="0.1" min="0" value="${svc?.price ?? ''}" required />
          <span class="input-suffix">ر.ع</span>
        </div>
      </div>
      <div class="form-group">
        <label class="label" for="edit-svc-duration">المدة (لكل شخص) *</label>
        <div class="input-with-suffix">
          <input id="edit-svc-duration" type="number" class="input" step="1" min="1" value="${svc?.duration_minutes ?? ''}" required />
          <span class="input-suffix">دقيقة</span>
        </div>
      </div>
      <div class="form-group">
        <label class="label">الحالة</label>
        <label class="toggle-wrapper" style="cursor:pointer">
          <label class="toggle">
            <input type="checkbox" id="edit-svc-active" ${(svc?.active ?? true) ? 'checked' : ''} />
            <div class="toggle-track"></div><div class="toggle-thumb"></div>
          </label>
          <span class="toggle-label" id="edit-svc-active-label">${(svc?.active ?? true) ? 'نشطة' : 'غير نشطة'}</span>
        </label>
      </div>
    </form>`;

  openDrawer(html);

  document.getElementById('edit-svc-active')?.addEventListener('change', (e) => {
    document.getElementById('edit-svc-active-label').textContent = e.target.checked ? 'نشطة' : 'غير نشطة';
  });

  const footerHtml = isNew
    ? `<button class="btn btn-primary" id="drawer-save-btn">إضافة الخدمة</button>
       <button class="btn btn-ghost" id="drawer-close-btn">إلغاء</button>`
    : `<button class="btn btn-primary" id="drawer-save-btn">حفظ التغييرات</button>
       <button class="btn btn-danger btn-sm" id="drawer-delete-btn" style="margin-right:auto">حذف</button>
       <button class="btn btn-ghost" id="drawer-close-btn">إلغاء</button>`;

  setDrawerFooter(footerHtml);
  document.getElementById('drawer-close-btn')?.addEventListener('click', closeDrawer);

  document.getElementById('drawer-save-btn')?.addEventListener('click', async () => {
    const name     = document.getElementById('edit-svc-name')?.value.trim();
    const desc     = document.getElementById('edit-svc-desc')?.value.trim();
    const price    = document.getElementById('edit-svc-price')?.value;
    const duration = document.getElementById('edit-svc-duration')?.value;
    const active   = document.getElementById('edit-svc-active')?.checked;

    if (!name || !price || !duration) { showToast('يرجى ملء جميع الحقول المطلوبة', 'error'); return; }

    try {
      if (isNew) {
        await supabasePost('home_services', { name, description: desc || null, price: Number(price), duration_minutes: Number(duration), active });
        showToast('تم إضافة الخدمة', 'success');
      } else {
        await supabasePatch('home_services', `id=eq.${svc.id}`, { name, description: desc || null, price: Number(price), duration_minutes: Number(duration), active });
        showToast('تم تحديث الخدمة', 'success');
      }
      closeDrawer();
      await loadHomeServices();
    } catch (err) { showToast('فشلت العملية: ' + err.message, 'error'); }
  });

  if (!isNew) {
    document.getElementById('drawer-delete-btn')?.addEventListener('click', async () => {
      if (!confirm(`حذف "${svc.name}"؟ لا يمكن التراجع عن هذا.`)) return;
      try {
        await supabaseDelete('home_services', `id=eq.${svc.id}`);
        showToast('تم حذف الخدمة', 'success');
        closeDrawer();
        await loadHomeServices();
      } catch (err) { showToast('فشل الحذف: ' + err.message, 'error'); }
    });
  }
}

// ─── Shared helpers ────────────────────────────────────────────────

async function toggleActive(table, id, active, reload) {
  try {
    await supabasePatch(table, `id=eq.${id}`, { active });
    showToast(active ? 'تم التفعيل' : 'تم إلغاء التفعيل', 'success');
  } catch (err) {
    showToast('فشل التحديث: ' + err.message, 'error');
  } finally {
    await reload();
  }
}

// ─── Expose new-item openers for HTML buttons ──────────────────────

window.__catalog_newService = () => openServiceDrawer(null, true);
