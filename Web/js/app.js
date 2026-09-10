/* ═══════════════════════════════════════════════════════════════
   Reminders Mini App — Client logic
   ═══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  // ─── Telegram WebApp ────────────────────────────────────────
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor('#0d0d0d');
      tg.setBackgroundColor('#0d0d0d');
    } catch (_) {}
  }

  const initData = tg?.initData || '';

  // ─── State ──────────────────────────────────────────────────
  let reminders = [];
  let currentFilter = 'all';
  let settings = {};
  let editingId = null;

  // ─── DOM ────────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const listEl = $('#reminders-list');
  const emptyEl = $('#empty-state');
  const viewList = $('#view-list');
  const viewSettings = $('#view-settings');
  const modal = $('#modal');
  const form = $('#reminder-form');
  const toastEl = $('#toast');

  // ─── API helpers ────────────────────────────────────────────
  async function api(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (initData) headers['X-Telegram-Init-Data'] = initData;

    const res = await fetch(path, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }

  // ─── Toast ──────────────────────────────────────────────────
  let toastTimer;
  function toast(msg, ms = 2400) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    requestAnimationFrame(() => toastEl.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
      setTimeout(() => toastEl.classList.add('hidden'), 350);
    }, ms);
  }

  // ─── Settings / Theme ───────────────────────────────────────
  const PRESETS = {
    'dark-red': {
      bg: '#0d0d0d', card: '#151515', surface: '#1a1a1a',
      accent: '#ff3333', accentHover: '#ff5555',
      text: '#e0e0e0', muted: '#888888', border: '#333333',
      radius: '14', transition: '0.35', glass: false, blur: '12',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    },
    midnight: {
      bg: '#0a0e17', card: '#111827', surface: '#1f2937',
      accent: '#3b82f6', accentHover: '#60a5fa',
      text: '#e5e7eb', muted: '#9ca3af', border: '#1e293b',
      radius: '12', transition: '0.3', glass: false, blur: '10',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    },
    emerald: {
      bg: '#0a1210', card: '#0f1f1a', surface: '#163028',
      accent: '#10b981', accentHover: '#34d399',
      text: '#d1fae5', muted: '#6ee7b7', border: '#134e3a',
      radius: '16', transition: '0.4', glass: true, blur: '14',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    },
    violet: {
      bg: '#0f0a14', card: '#1a1225', surface: '#251833',
      accent: '#a855f7', accentHover: '#c084fc',
      text: '#f3e8ff', muted: '#c4b5fd', border: '#3b0764',
      radius: '18', transition: '0.35', glass: true, blur: '16',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    },
    ocean: {
      bg: '#061018', card: '#0c1e2b', surface: '#123347',
      accent: '#06b6d4', accentHover: '#22d3ee',
      text: '#e0f7fa', muted: '#67e8f9', border: '#164e63',
      radius: '12', transition: '0.3', glass: false, blur: '10',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    },
    light: {
      bg: '#f5f5f7', card: '#ffffff', surface: '#f0f0f2',
      accent: '#ff3333', accentHover: '#e62e2e',
      text: '#1a1a1a', muted: '#666666', border: '#e0e0e0',
      radius: '14', transition: '0.3', glass: false, blur: '8',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    }
  };

  function applyTheme(s) {
    const root = document.documentElement;
    root.style.setProperty('--bg', s.bg || '#0d0d0d');
    root.style.setProperty('--card', s.card || '#151515');
    root.style.setProperty('--surface', s.surface || '#1a1a1a');
    root.style.setProperty('--accent', s.accent || '#ff3333');
    root.style.setProperty('--accent-hover', s.accentHover || '#ff5555');
    root.style.setProperty('--text', s.text || '#e0e0e0');
    root.style.setProperty('--muted', s.muted || '#888888');
    root.style.setProperty('--border', s.border || '#333333');
    root.style.setProperty('--radius', (s.radius || 14) + 'px');
    root.style.setProperty('--transition', (s.transition || 0.35) + 's');
    root.style.setProperty('--blur', (s.blur || 12) + 'px');
    root.style.setProperty('--font', s.fontFamily || 'system-ui, sans-serif');
    document.body.style.fontFamily = s.fontFamily || '';
    document.body.classList.toggle('glass', !!s.glass);

    // Sync color inputs & ranges
    const map = {
      bg: 'set-bg', card: 'set-card', surface: 'set-surface',
      accent: 'set-accent', accentHover: 'set-accentHover',
      text: 'set-text', muted: 'set-muted', border: 'set-border'
    };
    Object.entries(map).forEach(([k, id]) => {
      const el = document.getElementById(id);
      if (el && s[k]) el.value = s[k];
    });
    const r = document.getElementById('set-radius');
    if (r) { r.value = s.radius || 14; $('#val-radius').textContent = r.value; }
    const t = document.getElementById('set-transition');
    if (t) { t.value = s.transition || 0.35; $('#val-transition').textContent = t.value; }
    const b = document.getElementById('set-blur');
    if (b) { b.value = s.blur || 12; $('#val-blur').textContent = b.value; }
    const g = document.getElementById('set-glass');
    if (g) g.checked = !!s.glass;
    const f = document.getElementById('set-fontFamily');
    if (f && s.fontFamily) f.value = s.fontFamily;
  }

  async function loadSettings() {
    try {
      settings = await api('/api/settings');
      applyTheme(settings);
    } catch (e) {
      console.warn('Settings load failed, using defaults', e);
      settings = PRESETS['dark-red'];
      applyTheme(settings);
    }
  }

  async function saveSettings() {
    const payload = {
      bg: $('#set-bg').value,
      card: $('#set-card').value,
      surface: $('#set-surface').value,
      accent: $('#set-accent').value,
      accentHover: $('#set-accentHover').value,
      text: $('#set-text').value,
      muted: $('#set-muted').value,
      border: $('#set-border').value,
      radius: $('#set-radius').value,
      transition: $('#set-transition').value,
      blur: $('#set-blur').value,
      glass: $('#set-glass').checked,
      fontFamily: $('#set-fontFamily').value
    };
    try {
      settings = await api('/api/settings', { method: 'POST', body: payload });
      applyTheme(settings);
      toast('Стиль сохранён ✨');
    } catch (e) {
      toast('Ошибка сохранения: ' + e.message);
    }
  }

  // Live preview on change
  function bindSettingsLive() {
    $$('[data-key]').forEach(el => {
      const evt = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        const key = el.dataset.key;
        let val = el.type === 'checkbox' ? el.checked : el.value;
        if (key === 'radius') $('#val-radius').textContent = val;
        if (key === 'transition') $('#val-transition').textContent = val;
        if (key === 'blur') $('#val-blur').textContent = val;
        const temp = { ...settings, [key]: val };
        applyTheme(temp);
        settings = temp;
      });
    });

    $$('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = PRESETS[btn.dataset.preset];
        if (p) {
          settings = { ...p };
          applyTheme(settings);
          toast('Пресет применён (сохраните чтобы оставить)');
        }
      });
    });

    $('#btn-save-style').addEventListener('click', saveSettings);
    $('#btn-reset-style').addEventListener('click', () => {
      settings = { ...PRESETS['dark-red'] };
      applyTheme(settings);
      toast('Сброшено к тёмно-красному');
    });
  }

  // ─── Reminders ──────────────────────────────────────────────
  async function loadReminders() {
    try {
      reminders = await api('/api/reminders');
      renderList();
    } catch (e) {
      console.error(e);
      toast('Не удалось загрузить: ' + e.message);
      // If unauthorized in mock — still show empty
      reminders = [];
      renderList();
    }
  }

  function filtered() {
    if (currentFilter === 'active') return reminders.filter(r => r.active && !r.sent);
    if (currentFilter === 'done') return reminders.filter(r => r.sent);
    return reminders;
  }

  function formatDt(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return iso;
    }
  }

  function renderList() {
    const items = filtered();
    listEl.innerHTML = '';
    if (!items.length) {
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    items.forEach(r => {
      const card = document.createElement('article');
      card.className = 'reminder-card' + (r.sent ? ' sent' : '');
      card.innerHTML = `
        <div class="accent-bar"></div>
        <div class="card-top">
          <h3 class="card-title">${escape(r.title)}</h3>
          <div class="card-actions">
            <button data-action="edit" data-id="${r.id}" title="Редактировать">✏️</button>
            <button data-action="delete" data-id="${r.id}" title="Удалить">🗑️</button>
          </div>
        </div>
        ${r.text ? `<p class="card-text">${escape(r.text)}</p>` : ''}
        <div class="card-meta">
          <span class="badge ${r.sent ? 'sent' : ''}">${r.sent ? '✓ Отправлено' : (r.active ? '⏰ Активно' : '⏸ Пауза')}</span>
          <span>${formatDt(r.datetime)}</span>
        </div>
      `;
      listEl.appendChild(card);
    });
  }

  function escape(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ─── Modal ──────────────────────────────────────────────────
  function openModal(reminder = null) {
    editingId = reminder ? reminder.id : null;
    $('#modal-title').textContent = reminder ? 'Редактировать' : 'Новое напоминание';
    $('#edit-id').value = editingId || '';
    $('#f-title').value = reminder?.title || '';
    $('#f-text').value = reminder?.text || '';
    $('#f-active').checked = reminder ? reminder.active : true;

    if (reminder?.datetime) {
      const d = new Date(reminder.datetime);
      // datetime-local needs local YYYY-MM-DDTHH:mm
      const pad = n => String(n).padStart(2, '0');
      const local = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      $('#f-datetime').value = local;
    } else {
      // default: now + 1 hour
      const d = new Date(Date.now() + 3600000);
      const pad = n => String(n).padStart(2, '0');
      $('#f-datetime').value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    modal.classList.remove('hidden');
    setTimeout(() => $('#f-title').focus(), 100);
  }

  function closeModal() {
    modal.classList.add('hidden');
    form.reset();
    editingId = null;
  }

  async function submitForm(e) {
    e.preventDefault();
    const payload = {
      title: $('#f-title').value.trim(),
      text: $('#f-text').value.trim(),
      datetime: new Date($('#f-datetime').value).toISOString(),
      active: $('#f-active').checked
    };
    if (!payload.title) return toast('Укажите заголовок');

    try {
      if (editingId) {
        await api(`/api/reminders/${editingId}`, { method: 'PUT', body: payload });
        toast('Обновлено');
      } else {
        await api('/api/reminders', { method: 'POST', body: payload });
        toast('Напоминание создано ✨');
      }
      closeModal();
      await loadReminders();
    } catch (err) {
      toast('Ошибка: ' + err.message);
    }
  }

  async function deleteReminder(id) {
    if (!confirm('Удалить напоминание?')) return;
    try {
      await api(`/api/reminders/${id}`, { method: 'DELETE' });
      toast('Удалено');
      await loadReminders();
    } catch (err) {
      toast('Ошибка: ' + err.message);
    }
  }

  // ─── Events ─────────────────────────────────────────────────
  function bindEvents() {
    // Tabs
    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        renderList();
      });
    });

    // FAB
    $('#btn-add').addEventListener('click', () => openModal());

    // Settings navigation
    $('#btn-settings').addEventListener('click', () => {
      viewList.classList.add('hidden');
      viewSettings.classList.remove('hidden');
      $('#btn-add').classList.add('hidden');
    });
    $('#btn-back').addEventListener('click', () => {
      viewSettings.classList.add('hidden');
      viewList.classList.remove('hidden');
      $('#btn-add').classList.remove('hidden');
    });

    // Modal
    $('#modal-close').addEventListener('click', closeModal);
    $('#modal-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    form.addEventListener('submit', submitForm);

    // Card actions (delegation)
    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'delete') deleteReminder(id);
      if (action === 'edit') {
        const r = reminders.find(x => x.id === id);
        if (r) openModal(r);
      }
    });

    // Telegram back button
    if (tg) {
      tg.BackButton.onClick(() => {
        if (!viewSettings.classList.contains('hidden')) {
          $('#btn-back').click();
        } else if (!modal.classList.contains('hidden')) {
          closeModal();
        } else {
          tg.close();
        }
      });
    }
  }

  // ─── Deep link: open a specific reminder for rescheduling ────
  // The bot's "🕐 Изменить время" button opens this Mini App with
  // ?reminder=<id>&reschedule=1 so we can jump straight to editing it.
  function openReminderFromDeepLink() {
    try {
      const params = new URLSearchParams(window.location.search);
      const reminderId = params.get('reminder');
      if (!reminderId) return;

      const r = reminders.find(x => x.id === reminderId);
      if (r) openModal(r);
      else toast('Напоминание не найдено');

      if (window.history?.replaceState) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch (_) {}
  }

  // ─── Init ───────────────────────────────────────────────────
  async function init() {
    bindEvents();
    bindSettingsLive();
    await loadSettings();
    await loadReminders();
    openReminderFromDeepLink();

    // Show Telegram back button when needed
    if (tg) {
      const observer = new MutationObserver(() => {
        const inSettings = !viewSettings.classList.contains('hidden');
        const inModal = !modal.classList.contains('hidden');
        if (inSettings || inModal) tg.BackButton.show();
        else tg.BackButton.hide();
      });
      observer.observe(viewSettings, { attributes: true, attributeFilter: ['class'] });
      observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
