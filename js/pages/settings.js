import { supabaseGet, supabasePatch } from '../api.js';
import { showToast, escHtml } from '../ui.js';

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

let settingsId = null;

export async function init() {
  await Promise.all([loadSettings(), loadCenterHours()]);
}

// ─── Helpers ───────────────────────────────────────────────────────

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function formatTimeDisplay(minutes) {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// ─── Business Settings ─────────────────────────────────────────────

async function loadSettings() {
  try {
    const rows = await supabaseGet('business_settings', 'select=*&limit=1');
    if (!rows.length) return;

    const s = rows[0];
    settingsId = s.id;

    setVal('settings-business-name', s.business_name);
    setVal('settings-home-start', minutesToTime(s.home_working_start_minutes ?? 420));
    setVal('settings-home-end',   minutesToTime(s.home_working_end_minutes   ?? 1440));
    updateTimePreview('settings-home-start', 'preview-home-start');
    updateTimePreview('settings-home-end',   'preview-home-end');
    setVal('settings-home-capacity',   s.home_capacity   ?? 1);
    setVal('settings-center-capacity', s.center_capacity ?? 1);
    setVal('settings-delivery-fee',    s.delivery_fee    ?? 0);

    bindTimePreview('settings-home-start', 'preview-home-start');
    bindTimePreview('settings-home-end',   'preview-home-end');
    bindSaveBtn('save-general-btn',  saveGeneral);
    bindSaveBtn('save-hours-btn',    saveHours);
    bindSaveBtn('save-capacity-btn', saveCapacity);
  } catch (err) {
    showToast('Failed to load settings: ' + err.message, 'error');
  }
}

// ─── Center Working Hours ──────────────────────────────────────────

async function loadCenterHours() {
  const grid = document.getElementById('center-hours-grid');
  if (!grid) return;

  grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:var(--space-4)"><div class="spinner" style="margin:auto"></div></div>`;

  try {
    const rows = await supabaseGet('center_working_hours', 'select=*&order=day_of_week.asc');

    // Map day → row
    const byDay = {};
    rows.forEach(r => { byDay[r.day_of_week] = r; });

    grid.innerHTML = `
      <div class="schedule-grid-header">
        <div>اليوم</div><div>فتح</div><div>إغلاق</div><div>مفتوح</div>
      </div>
      ${DAYS.map((day, idx) => {
        const row = byDay[idx];
        return `
          <div class="schedule-row" data-day="${idx}" data-row-id="${row?.id || ''}">
            <div class="schedule-day-name">${day}</div>
            <div>
              <input type="time" class="schedule-time-input center-start"
                value="${row?.start_time?.slice(0, 5) || '09:00'}"
                ${!row?.active ? 'disabled' : ''} />
            </div>
            <div>
              <input type="time" class="schedule-time-input center-end"
                value="${row?.end_time?.slice(0, 5) || '18:00'}"
                ${!row?.active ? 'disabled' : ''} />
            </div>
            <div>
              <label class="toggle" style="width:34px;height:20px">
                <input type="checkbox" class="center-active" ${row?.active ? 'checked' : ''} />
                <div class="toggle-track"></div>
                <div class="toggle-thumb" style="width:14px;height:14px;top:3px;left:3px"></div>
              </label>
            </div>
          </div>`;
      }).join('')}
      <div class="schedule-save-row">
        <button class="btn btn-primary btn-sm" id="save-center-hours-btn">حفظ الساعات</button>
        <div class="settings-saved-indicator" id="saved-center-hours"><span>✓</span> تم الحفظ</div>
      </div>`;

    // Wire active toggle → enable/disable time inputs
    grid.querySelectorAll('.center-active').forEach(toggle => {
      toggle.addEventListener('change', () => {
        const row = toggle.closest('.schedule-row');
        row.querySelectorAll('.schedule-time-input').forEach(inp => {
          inp.disabled = !toggle.checked;
        });
      });
    });

    document.getElementById('save-center-hours-btn')?.addEventListener('click', () => saveCenterHours(rows, grid));

  } catch (err) {
    grid.innerHTML = `<div style="grid-column:1/-1;color:var(--danger);padding:1rem">Failed to load center hours: ${escHtml(err.message)}</div>`;
  }
}

async function saveCenterHours(existingRows, grid) {
  const byDay = {};
  existingRows.forEach(r => { byDay[r.day_of_week] = r; });

  const scheduleRows = grid.querySelectorAll('.schedule-row[data-day]');

  try {
    for (const row of scheduleRows) {
      const day    = Number(row.dataset.day);
      const active = row.querySelector('.center-active').checked;
      const start  = row.querySelector('.center-start').value + ':00';
      const end    = row.querySelector('.center-end').value   + ':00';
      const existing = byDay[day];

      if (existing) {
        await supabasePatch('center_working_hours', `id=eq.${existing.id}`, { active, start_time: start, end_time: end });
      }
      // Note: we don't INSERT missing rows here as center_working_hours
      // should already have all 7 days from the initial seed
    }

    showToast('تم حفظ ساعات المركز', 'success');
    const ind = document.getElementById('saved-center-hours');
    if (ind) { ind.classList.add('visible'); setTimeout(() => ind.classList.remove('visible'), 3000); }

    // Reload to reflect saved state
    await loadCenterHours();
  } catch (err) {
    showToast('فشل الحفظ: ' + err.message, 'error');
  }
}

// ─── Shared Helpers ────────────────────────────────────────────────

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}

function bindTimePreview(inputId, previewId) {
  document.getElementById(inputId)?.addEventListener('input', () => updateTimePreview(inputId, previewId));
}

function updateTimePreview(inputId, previewId) {
  const el = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!el || !preview) return;
  try { preview.textContent = formatTimeDisplay(timeToMinutes(el.value)); } catch { preview.textContent = ''; }
}

function bindSaveBtn(btnId, saveFn) {
  document.getElementById(btnId)?.addEventListener('click', saveFn);
}

async function save(data, indicatorId) {
  if (!settingsId) return;
  try {
    await supabasePatch('business_settings', `id=eq.${settingsId}`, { ...data, updated_at: new Date().toISOString() });
    showToast('تم حفظ الإعدادات', 'success');
    const ind = document.getElementById(indicatorId);
    if (ind) { ind.classList.add('visible'); setTimeout(() => ind.classList.remove('visible'), 3000); }
  } catch (err) {
    showToast('فشل الحفظ: ' + err.message, 'error');
  }
}

async function saveGeneral() {
  const name = document.getElementById('settings-business-name')?.value.trim();
  if (!name) { showToast('اسم المركز مطلوب', 'error'); return; }
  await save({ business_name: name }, 'saved-general');
}

async function saveHours() {
  const startVal = document.getElementById('settings-home-start')?.value;
  const endVal   = document.getElementById('settings-home-end')?.value;
  if (!startVal || !endVal) { showToast('يرجى تحديد وقت البداية والنهاية', 'error'); return; }
  const startMin = timeToMinutes(startVal);
  const endMin   = timeToMinutes(endVal);
  if (endMin <= startMin) { showToast('يجب أن يكون وقت الإغلاق بعد وقت الفتح', 'error'); return; }
  await save({ home_working_start_minutes: startMin, home_working_end_minutes: endMin }, 'saved-hours');
}

async function saveCapacity() {
  const homeCapacity   = Number(document.getElementById('settings-home-capacity')?.value)   || 1;
  const centerCapacity = Number(document.getElementById('settings-center-capacity')?.value) || 1;
  const deliveryFee    = Number(document.getElementById('settings-delivery-fee')?.value)    || 0;
  await save({ home_capacity: homeCapacity, center_capacity: centerCapacity, delivery_fee: deliveryFee }, 'saved-capacity');
}
