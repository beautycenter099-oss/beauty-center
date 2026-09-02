import { supabaseGet, supabasePost, supabasePatch, supabaseDelete } from '../api.js';
import { showToast, escHtml, getInitials, formatDate, openDrawer, setDrawerHeader, setDrawerFooter, closeDrawer } from '../ui.js';

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

let staffList = [];

export async function init() {
  await loadStaff();
  document.getElementById('new-staff-btn')?.addEventListener('click', () => openStaffDrawer(null));
}

// ─── Load Staff ────────────────────────────────────────────────────

async function loadStaff() {
  const container = document.getElementById('staff-grid');
  if (!container) return;
  container.innerHTML = `<div style="text-align:center;padding:4rem"><div class="spinner" style="margin:auto"></div></div>`;

  try {
    staffList = await supabaseGet('staff', 'select=*&order=name.asc');

    if (!staffList.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👩‍💼</div>
          <div class="empty-state-title">لا يوجد موظفون بعد</div>
          <div class="empty-state-text">اضغط "إضافة موظف" للبدء</div>
        </div>`;
      return;
    }

    container.innerHTML = staffList.map(s => buildStaffCard(s)).join('');
    bindStaffCardEvents(container);
  } catch (err) {
    container.innerHTML = `<div style="color:var(--danger);padding:2rem">فشل تحميل الموظفين: ${escHtml(err.message)}</div>`;
  }
}

function buildStaffCard(s) {
  const initials = getInitials(s.name);
  return `
    <div class="staff-card" data-staff-id="${s.id}">
      <div class="staff-card-header">
        <div class="staff-card-identity">
          <div class="staff-avatar">${escHtml(initials)}</div>
          <div>
            <div class="staff-name">${escHtml(s.name)}</div>
            <div class="staff-phone" dir="ltr">${escHtml(s.phone || '—')} ${s.username ? `· 👤 <span style="color:var(--accent-gold-hover)">${escHtml(s.username)}</span>` : ''}</div>
          </div>
        </div>
        <div class="staff-card-actions">
          <span class="badge ${s.active ? 'badge-success' : 'badge-neutral'}">${s.active ? 'نشط' : 'غير نشط'}</span>
          <button class="btn btn-ghost btn-sm edit-staff-btn" data-id="${s.id}">تعديل الحساب</button>
          <svg class="staff-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      <!-- Expandable body -->
      <div class="staff-schedule" id="schedule-${s.id}">
        <div style="font-size:var(--text-xs);font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-light);margin-bottom:var(--space-3)">
          الجدول الأسبوعي
        </div>
        <div class="schedule-grid" id="schedule-grid-${s.id}">
          <div class="schedule-grid-header">
            <div>اليوم</div><div>البداية</div><div>النهاية</div><div>نشط</div>
          </div>
          <div style="grid-column:1/-1;text-align:center;padding:var(--space-4);color:var(--text-light)">
            <div class="spinner" style="margin:auto;width:20px;height:20px;border-width:2px"></div>
          </div>
        </div>

        <!-- Days Off -->
        <div class="days-off-section">
          <div class="days-off-title">أيام الإجازة</div>
          <div class="days-off-list" id="daysoff-list-${s.id}"></div>
          <div class="add-day-off-row">
            <input type="date" id="daysoff-date-${s.id}" class="input" />
            <input type="text" id="daysoff-reason-${s.id}" class="input" placeholder="السبب (اختياري)" style="width:180px" />
            <button class="btn btn-ghost btn-sm add-day-off-btn" data-staff-id="${s.id}">+ إضافة</button>
          </div>
        </div>
      </div>
    </div>`;
}

function bindStaffCardEvents(container) {
  // Toggle expand on header click
  container.querySelectorAll('.staff-card-header').forEach(header => {
    header.addEventListener('click', async (e) => {
      if (e.target.closest('.edit-staff-btn')) return;
      const card = header.closest('.staff-card');
      const staffId = Number(card.dataset.staffId);
      const wasExpanded = card.classList.contains('expanded');

      // Collapse all
      container.querySelectorAll('.staff-card').forEach(c => c.classList.remove('expanded'));

      if (!wasExpanded) {
        card.classList.add('expanded');
        await loadStaffSchedule(staffId);
        await loadStaffDaysOff(staffId);
      }
    });
  });

  // Edit button → drawer
  container.querySelectorAll('.edit-staff-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const staff = staffList.find(s => s.id === Number(btn.dataset.id));
      if (staff) openStaffDrawer(staff);
    });
  });

  // Add day off buttons
  container.querySelectorAll('.add-day-off-btn').forEach(btn => {
    btn.addEventListener('click', () => addDayOff(Number(btn.dataset.staffId)));
  });
}

// ─── Schedule ──────────────────────────────────────────────────────

async function loadStaffSchedule(staffId) {
  const grid = document.getElementById(`schedule-grid-${staffId}`);
  if (!grid) return;

  try {
    const hours = await supabaseGet('staff_working_hours', `select=*&staff_id=eq.${staffId}&order=day_of_week.asc`);

    // Build a map day → row
    const byDay = {};
    hours.forEach(h => { byDay[h.day_of_week] = h; });

    grid.innerHTML = `
      <div class="schedule-grid-header">
        <div>اليوم</div><div>البداية</div><div>النهاية</div><div>نشط</div>
      </div>
      ${DAYS.map((day, idx) => {
        const row = byDay[idx];
        return `
          <div class="schedule-row" data-day="${idx}" data-row-id="${row?.id || ''}">
            <div class="schedule-day-name">${day}</div>
            <div>
              <input type="time" class="schedule-time-input sched-start"
                value="${row?.start_time?.slice(0,5) || '09:00'}"
                ${!row?.active ? 'disabled' : ''} />
            </div>
            <div>
              <input type="time" class="schedule-time-input sched-end"
                value="${row?.end_time?.slice(0,5) || '17:00'}"
                ${!row?.active ? 'disabled' : ''} />
            </div>
            <div>
              <label class="toggle" style="width:34px;height:20px">
                <input type="checkbox" class="sched-active" ${row?.active ? 'checked' : ''} />
                <div class="toggle-track"></div>
                <div class="toggle-thumb" style="width:14px;height:14px;top:3px;left:3px"></div>
              </label>
            </div>
          </div>`;
      }).join('')}
      <div class="schedule-save-row">
        <button class="btn btn-primary btn-sm save-schedule-btn" data-staff-id="${staffId}">حفظ الجدول</button>
        <div class="settings-saved-indicator" id="sched-saved-${staffId}"><span>✓</span> تم الحفظ</div>
      </div>`;

    // Wire up: toggle active → enable/disable time inputs
    grid.querySelectorAll('.sched-active').forEach(toggle => {
      toggle.addEventListener('change', () => {
        const row = toggle.closest('.schedule-row');
        row.querySelectorAll('.schedule-time-input').forEach(inp => {
          inp.disabled = !toggle.checked;
        });
      });
    });

    // Save schedule
    grid.querySelector(`.save-schedule-btn`)?.addEventListener('click', () => saveSchedule(staffId, hours, grid));

  } catch (err) {
    grid.innerHTML = `<div style="grid-column:1/-1;color:var(--danger);padding:1rem">فشل تحميل الجدول: ${escHtml(err.message)}</div>`;
  }
}

async function saveSchedule(staffId, existingHours, grid) {
  const rows = grid.querySelectorAll('.schedule-row[data-day]');
  const byDay = {};
  existingHours.forEach(h => { byDay[h.day_of_week] = h; });

  try {
    for (const row of rows) {
      const day    = Number(row.dataset.day);
      const active = row.querySelector('.sched-active').checked;
      const start  = row.querySelector('.sched-start').value + ':00';
      const end    = row.querySelector('.sched-end').value   + ':00';
      const existing = byDay[day];

      if (existing) {
        await supabasePatch('staff_working_hours', `id=eq.${existing.id}`, { active, start_time: start, end_time: end });
      } else {
        await supabasePost('staff_working_hours', { staff_id: staffId, day_of_week: day, start_time: start, end_time: end, active });
      }
    }
    showToast('تم حفظ الجدول', 'success');
    const ind = document.getElementById(`sched-saved-${staffId}`);
    if (ind) { ind.classList.add('visible'); setTimeout(() => ind.classList.remove('visible'), 3000); }
  } catch (err) {
    showToast('فشل حفظ الجدول: ' + err.message, 'error');
  }
}

// ─── Days Off ──────────────────────────────────────────────────────

async function loadStaffDaysOff(staffId) {
  const listEl = document.getElementById(`daysoff-list-${staffId}`);
  if (!listEl) return;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const daysOff = await supabaseGet('staff_days_off',
      `select=*&staff_id=eq.${staffId}&day_off=gte.${today}&order=day_off.asc`
    );

    if (!daysOff.length) {
      listEl.innerHTML = `<span style="font-size:var(--text-xs);color:var(--text-light)">لا توجد إجازات قادمة</span>`;
      return;
    }

    listEl.innerHTML = daysOff.map(d => `
      <span class="day-off-chip" data-id="${d.id}">
        ${formatDate(d.day_off)}${d.reason ? ' · ' + escHtml(d.reason) : ''}
        <span class="day-off-chip-remove remove-dayoff" data-id="${d.id}" title="حذف">×</span>
      </span>
    `).join('');

    listEl.querySelectorAll('.remove-dayoff').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await supabaseDelete('staff_days_off', `id=eq.${btn.dataset.id}`);
          await loadStaffDaysOff(staffId);
          showToast('تم حذف الإجازة', 'success');
        } catch (err) {
          showToast('فشل الحذف: ' + err.message, 'error');
        }
      });
    });
  } catch (err) {
    listEl.innerHTML = `<span style="color:var(--danger)">فشل تحميل الإجازات</span>`;
  }
}

async function addDayOff(staffId) {
  const dateInput   = document.getElementById(`daysoff-date-${staffId}`);
  const reasonInput = document.getElementById(`daysoff-reason-${staffId}`);
  const date   = dateInput?.value;
  const reason = reasonInput?.value.trim();

  if (!date) { showToast('يرجى تحديد التاريخ', 'error'); return; }

  try {
    await supabasePost('staff_days_off', { staff_id: staffId, day_off: date, reason: reason || null });
    showToast('تمت إضافة الإجازة', 'success');
    if (dateInput)   dateInput.value   = '';
    if (reasonInput) reasonInput.value = '';
    await loadStaffDaysOff(staffId);
  } catch (err) {
    showToast('فشل إضافة الإجازة: ' + err.message, 'error');
  }
}

// ─── Staff Drawer (Create / Edit) ──────────────────────────────────

function openStaffDrawer(staff) {
  const isNew = !staff;
  setDrawerHeader(isNew ? 'إضافة حساب موظف جديد' : 'تعديل حساب الموظف', isNew ? '' : staff.name);

  const html = `
    <form class="edit-form" id="staff-edit-form">
      <div class="form-group">
        <label class="label" for="edit-staff-name">الاسم الكامل *</label>
        <input id="edit-staff-name" type="text" class="input" value="${escHtml(staff?.name || '')}" placeholder="مثال: سارة أحمد" required />
      </div>
      <div class="form-group">
        <label class="label" for="edit-staff-phone">رقم الهاتف</label>
        <input id="edit-staff-phone" type="text" class="input" dir="ltr" value="${escHtml(staff?.phone || '')}" placeholder="مثال: +968 9XXX XXXX" />
      </div>
      
      <div style="border-top:1px dashed var(--border-color);margin:1.25rem 0;padding-top:1rem">
        <div style="font-weight:600;font-size:var(--text-sm);color:var(--accent-gold-hover);margin-bottom:0.75rem">
          🔑 بيانات تسجيل الدخول (حساب الموظف)
        </div>
        <div class="form-group">
          <label class="label" for="edit-staff-username">اسم المستخدم (Username) *</label>
          <input id="edit-staff-username" type="text" class="input" value="${escHtml(staff?.username || '')}" placeholder="مثال: sara" required dir="ltr" />
        </div>
        <div class="form-group">
          <label class="label" for="edit-staff-password">كلمة المرور (Password) *</label>
          <input id="edit-staff-password" type="text" class="input" value="${escHtml(staff?.password || '')}" placeholder="أدخل كلمة المرور" required dir="ltr" />
        </div>
      </div>

      <div class="form-group">
        <label class="label">الحالة</label>
        <label class="toggle-wrapper" style="cursor:pointer">
          <label class="toggle">
            <input type="checkbox" id="edit-staff-active" ${(staff?.active ?? true) ? 'checked' : ''} />
            <div class="toggle-track"></div><div class="toggle-thumb"></div>
          </label>
          <span class="toggle-label" id="edit-staff-active-label">${(staff?.active ?? true) ? 'نشط' : 'غير نشط'}</span>
        </label>
      </div>
    </form>`;

  openDrawer(html);

  document.getElementById('edit-staff-active')?.addEventListener('change', (e) => {
    document.getElementById('edit-staff-active-label').textContent = e.target.checked ? 'نشط' : 'غير نشط';
  });

  const footerHtml = isNew
    ? `<button class="btn btn-primary" id="drawer-save-btn">إضافة حساب الموظف</button>
       <button class="btn btn-ghost" id="drawer-close-btn">إلغاء</button>`
    : `<button class="btn btn-primary" id="drawer-save-btn">حفظ التغييرات</button>
       <button class="btn btn-danger btn-sm" id="drawer-delete-btn" style="margin-right:auto">حذف الموظف</button>
       <button class="btn btn-ghost" id="drawer-close-btn">إلغاء</button>`;

  setDrawerFooter(footerHtml);
  document.getElementById('drawer-close-btn')?.addEventListener('click', closeDrawer);

  document.getElementById('drawer-save-btn')?.addEventListener('click', async () => {
    const name     = document.getElementById('edit-staff-name')?.value.trim();
    const phone    = document.getElementById('edit-staff-phone')?.value.trim();
    const username = document.getElementById('edit-staff-username')?.value.trim();
    const password = document.getElementById('edit-staff-password')?.value.trim();
    const active   = document.getElementById('edit-staff-active')?.checked;

    if (!name) { showToast('الاسم مطلوب', 'error'); return; }
    if (!username) { showToast('اسم المستخدم مطلوب', 'error'); return; }
    if (!password) { showToast('كلمة المرور مطلوبة', 'error'); return; }

    const payload = {
      name,
      phone: phone || null,
      username,
      password,
      role: 'staff',
      active
    };

    try {
      if (isNew) {
        await supabasePost('staff', payload);
        showToast('تمت إضافة حساب الموظف بنجاح 👤', 'success');
      } else {
        await supabasePatch('staff', `id=eq.${staff.id}`, payload);
        showToast('تم تحديث حساب الموظف وكلمة المرور 🔑', 'success');
      }
      closeDrawer();
      await loadStaff();
    } catch (err) { showToast('فشلت العملية: ' + err.message, 'error'); }
  });

  if (!isNew) {
    document.getElementById('drawer-delete-btn')?.addEventListener('click', async () => {
      if (!confirm(`حذف "${staff.name}" من قائمة الموظفين؟ لا يمكن التراجع عن هذا.`)) return;
      try {
        await supabaseDelete('staff', `id=eq.${staff.id}`);
        showToast('تم حذف الموظف', 'success');
        closeDrawer();
        await loadStaff();
      } catch (err) { showToast('فشل الحذف: ' + err.message, 'error'); }
    });
  }
}
