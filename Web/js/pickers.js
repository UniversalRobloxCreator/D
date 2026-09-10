/* ═══════════════════════════════════════════════════════════════
   Custom pickers — replaces native <input type="color"> and
   <input type="datetime-local"> with our own bottom-sheet UI.

   Both picker "containers" (.color-picker / .dt-picker) expose a
   `.value` getter/setter and fire an `input`/`change` event, so the
   rest of app.js can keep treating them exactly like a normal
   <input> element.
   ═══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  /* ─── Color conversion helpers ─────────────────────────────── */
  function hexToRgb(hex) {
    hex = String(hex || '#000000').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) hex = '000000';
    const num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b]
      .map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
      .join('');
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    return { h, s: s * 100, v: max * 100 };
  }

  function hsvToRgb(h, s, v) {
    s /= 100; v /= 100;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r, g, b;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }

  /* ─── Shared bottom sheet ───────────────────────────────────── */
  let overlay, sheetBody;

  function ensureSheet() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'picker-overlay hidden';
    overlay.innerHTML = '<div class="picker-sheet"><div class="picker-sheet-handle"></div><div class="picker-sheet-body"></div></div>';
    document.body.appendChild(overlay);
    sheetBody = overlay.querySelector('.picker-sheet-body');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSheet();
    });
  }

  function openSheet() {
    ensureSheet();
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  function closeSheet() {
    if (!overlay) return;
    overlay.classList.remove('show');
    setTimeout(() => overlay.classList.add('hidden'), 250);
  }

  function dragHandler(el, onMove) {
    function move(e) {
      const point = e.touches ? e.touches[0] : e;
      const rect = el.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (point.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (point.clientY - rect.top) / rect.height));
      onMove(x, y);
    }
    function down(e) {
      move(e);
      document.addEventListener('mousemove', move);
      document.addEventListener('touchmove', move, { passive: true });
      document.addEventListener('mouseup', up);
      document.addEventListener('touchend', up);
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchend', up);
    }
    el.addEventListener('mousedown', down);
    el.addEventListener('touchstart', down, { passive: true });
  }

  /* ─── Color picker ──────────────────────────────────────────── */
  function initColorPicker(container) {
    let value = '#000000';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-swatch-btn';
    btn.innerHTML = '<span class="swatch"></span><span class="hex-label"></span>';
    container.innerHTML = '';
    container.appendChild(btn);

    function refreshBtn() {
      btn.querySelector('.swatch').style.background = value;
      btn.querySelector('.hex-label').textContent = value.toUpperCase();
    }

    Object.defineProperty(container, 'value', {
      get() { return value; },
      set(v) {
        if (typeof v === 'string' && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v)) {
          const rgb = hexToRgb(v);
          value = rgbToHex(rgb.r, rgb.g, rgb.b);
        }
        refreshBtn();
      },
      configurable: true
    });

    refreshBtn();

    btn.addEventListener('click', () => openColorSheet(value, (picked) => {
      container.value = picked;
      container.dispatchEvent(new Event('input', { bubbles: true }));
    }));
  }

  function openColorSheet(initialHex, onPick) {
    ensureSheet();
    const rgb0 = hexToRgb(initialHex);
    const hsv0 = rgbToHsv(rgb0.r, rgb0.g, rgb0.b);
    let h = hsv0.h, s = hsv0.s, v = hsv0.v;

    sheetBody.innerHTML = `
      <h3 class="picker-title">Выбор цвета</h3>
      <div class="cp-sv" id="cp-sv"><div class="cp-sv-thumb" id="cp-sv-thumb"></div></div>
      <div class="cp-hue" id="cp-hue"><div class="cp-hue-thumb" id="cp-hue-thumb"></div></div>
      <div class="cp-preview-row">
        <span class="cp-preview" id="cp-preview"></span>
        <input type="text" class="cp-hex-input" id="cp-hex-input" maxlength="7" autocapitalize="off" autocomplete="off" spellcheck="false">
      </div>
      <div class="picker-actions">
        <button type="button" class="btn btn-secondary" id="cp-cancel">Отмена</button>
        <button type="button" class="btn btn-primary" id="cp-apply">Готово</button>
      </div>
    `;

    const svEl = sheetBody.querySelector('#cp-sv');
    const svThumb = sheetBody.querySelector('#cp-sv-thumb');
    const hueEl = sheetBody.querySelector('#cp-hue');
    const hueThumb = sheetBody.querySelector('#cp-hue-thumb');
    const previewEl = sheetBody.querySelector('#cp-preview');
    const hexInput = sheetBody.querySelector('#cp-hex-input');

    function currentHex() {
      const rgb = hsvToRgb(h, s, v);
      return rgbToHex(rgb.r, rgb.g, rgb.b);
    }

    function render() {
      svEl.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h},100%,50%))`;
      svThumb.style.left = s + '%';
      svThumb.style.top = (100 - v) + '%';
      hueThumb.style.left = (h / 360 * 100) + '%';
      const hex = currentHex();
      previewEl.style.background = hex;
      hexInput.value = hex.toUpperCase();
    }
    render();

    dragHandler(svEl, (x, y) => { s = x * 100; v = (1 - y) * 100; render(); });
    dragHandler(hueEl, (x) => { h = x * 360; render(); });

    hexInput.addEventListener('change', () => {
      let val = hexInput.value.trim();
      if (!/^#?[0-9a-fA-F]{6}$/.test(val)) { render(); return; }
      if (!val.startsWith('#')) val = '#' + val;
      const rgb = hexToRgb(val);
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      h = hsv.h; s = hsv.s; v = hsv.v;
      render();
    });

    sheetBody.querySelector('#cp-cancel').addEventListener('click', closeSheet);
    sheetBody.querySelector('#cp-apply').addEventListener('click', () => {
      onPick(currentHex());
      closeSheet();
    });

    openSheet();
  }

  /* ─── Date/time picker ──────────────────────────────────────── */
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const WHEEL_ITEM_H = 40;

  function pad2(n) { return String(n).padStart(2, '0'); }

  function toLocalIso(y, mo, d, hh, mm) {
    return `${y}-${pad2(mo + 1)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}`;
  }

  function initDateTimePicker(container) {
    let value = '';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dt-trigger-btn';
    btn.innerHTML = '<span class="dt-label">Выберите дату и время</span>';
    container.innerHTML = '';
    container.appendChild(btn);

    function refreshBtn() {
      const label = btn.querySelector('.dt-label');
      if (!value) { label.textContent = 'Выберите дату и время'; return; }
      const d = new Date(value);
      if (isNaN(d.getTime())) { label.textContent = 'Выберите дату и время'; return; }
      label.textContent = d.toLocaleString('ru-RU', {
        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    }

    Object.defineProperty(container, 'value', {
      get() { return value; },
      set(v) { value = v || ''; refreshBtn(); },
      configurable: true
    });

    refreshBtn();

    btn.addEventListener('click', () => openDateTimeSheet(value, (picked) => {
      container.value = picked;
      container.dispatchEvent(new Event('input', { bubbles: true }));
      container.dispatchEvent(new Event('change', { bubbles: true }));
    }));
  }

  function buildWheel(el, max, initial, onSettle) {
    el.innerHTML = '';
    el.classList.add('dt-wheel');
    for (let i = 0; i <= max; i++) {
      const it = document.createElement('div');
      it.className = 'dt-wheel-item';
      it.textContent = pad2(i);
      it.dataset.val = String(i);
      it.addEventListener('click', () => {
        el.scrollTo({ top: i * WHEEL_ITEM_H, behavior: 'smooth' });
      });
      el.appendChild(it);
    }

    function markActive(val) {
      el.querySelectorAll('.dt-wheel-item').forEach(it => {
        it.classList.toggle('active', Number(it.dataset.val) === val);
      });
    }

    let settleTimer;
    el.addEventListener('scroll', () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        const idx = Math.min(max, Math.max(0, Math.round(el.scrollTop / WHEEL_ITEM_H)));
        markActive(idx);
        onSettle(idx);
      }, 100);
    });

    // Position after layout so clientHeight/padding are correct.
    requestAnimationFrame(() => {
      el.scrollTop = initial * WHEEL_ITEM_H;
      markActive(initial);
    });
  }

  function openDateTimeSheet(initialVal, onPick) {
    ensureSheet();
    const base = initialVal && !isNaN(new Date(initialVal).getTime())
      ? new Date(initialVal)
      : new Date(Date.now() + 3600000);

    let selYear = base.getFullYear();
    let selMonth = base.getMonth();
    let selDay = base.getDate();
    let selHour = base.getHours();
    let selMinute = base.getMinutes();
    let viewYear = selYear;
    let viewMonth = selMonth;

    sheetBody.innerHTML = `
      <h3 class="picker-title">Дата и время</h3>
      <div class="dt-cal-header">
        <button type="button" class="dt-nav" id="dt-prev" aria-label="Предыдущий месяц">‹</button>
        <span id="dt-month-label"></span>
        <button type="button" class="dt-nav" id="dt-next" aria-label="Следующий месяц">›</button>
      </div>
      <div class="dt-weekdays">
        <span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span>
      </div>
      <div class="dt-grid" id="dt-grid"></div>
      <div class="dt-time-row">
        <div class="dt-wheel" id="dt-wheel-hour"></div>
        <span class="dt-colon">:</span>
        <div class="dt-wheel" id="dt-wheel-min"></div>
      </div>
      <div class="picker-actions">
        <button type="button" class="btn btn-secondary" id="dt-cancel">Отмена</button>
        <button type="button" class="btn btn-primary" id="dt-apply">Готово</button>
      </div>
    `;

    const monthLabel = sheetBody.querySelector('#dt-month-label');
    const grid = sheetBody.querySelector('#dt-grid');

    function renderCalendar() {
      monthLabel.textContent = `${MONTHS[viewMonth]} ${viewYear}`;
      grid.innerHTML = '';
      const first = new Date(viewYear, viewMonth, 1);
      const startOffset = (first.getDay() + 6) % 7; // Monday-first
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const today = new Date();

      for (let i = 0; i < startOffset; i++) {
        const empty = document.createElement('span');
        empty.className = 'dt-day dt-day-empty';
        grid.appendChild(empty);
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'dt-day';
        cell.textContent = String(day);
        const isSelected = day === selDay && viewMonth === selMonth && viewYear === selYear;
        const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
        if (isSelected) cell.classList.add('selected');
        if (isToday) cell.classList.add('today');
        cell.addEventListener('click', () => {
          selDay = day; selMonth = viewMonth; selYear = viewYear;
          renderCalendar();
        });
        grid.appendChild(cell);
      }
    }
    renderCalendar();

    sheetBody.querySelector('#dt-prev').addEventListener('click', () => {
      viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderCalendar();
    });
    sheetBody.querySelector('#dt-next').addEventListener('click', () => {
      viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderCalendar();
    });

    buildWheel(sheetBody.querySelector('#dt-wheel-hour'), 23, selHour, (v) => { selHour = v; });
    buildWheel(sheetBody.querySelector('#dt-wheel-min'), 59, selMinute, (v) => { selMinute = v; });

    sheetBody.querySelector('#dt-cancel').addEventListener('click', closeSheet);
    sheetBody.querySelector('#dt-apply').addEventListener('click', () => {
      onPick(toLocalIso(selYear, selMonth, selDay, selHour, selMinute));
      closeSheet();
    });

    openSheet();
  }

  /* ─── Init ───────────────────────────────────────────────────── */
  function init() {
    document.querySelectorAll('.color-picker').forEach(initColorPicker);
    document.querySelectorAll('.dt-picker').forEach(initDateTimePicker);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
