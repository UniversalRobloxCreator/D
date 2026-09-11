/* ═══════════════════════════════════════════════════════════════
   Reminders Mini App — Client logic (optimized)
   ═══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

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
  const T = window.APP_TEXTS || {};

  let reminders = [];
  let currentFilter = 'all';
  let searchQuery = '';
  let settings = {};
  let editingId = null;
  let renderPending = false;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const listEl = $('#reminders-list');
  const emptyEl = $('#empty-state');
  const emptyTitle = $('#empty-title');
  const emptyHint = $('#empty-hint');
  const emptyIcon = $('#empty-icon');
  const viewList = $('#view-list');
  const viewSettings = $('#view-settings');
  const modal = $('#modal');
  const form = $('#reminder-form');
  const toastEl = $('#toast');
  const searchInput = $('#search-input');
  const searchClear = $('#search-clear');

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

  let toastTimer;
  function toast(msg, ms = 2200) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    requestAnimationFrame(() => toastEl.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
      setTimeout(() => toastEl.classList.add('hidden'), 280);
    }, ms);
  }

  // Пресеты — только цвета и оформление.
  // Шрифт и таймер повторной отправки настраиваются отдельно и не сбрасываются.
  const PRESETS = {
    'dark-red': {
      bg: '#0d0d0d', card: '#151515', surface: '#1a1a1a',
      accent: '#ff3333', accentHover: '#ff5555',
      text: '#e0e0e0', muted: '#888888', border: '#333333',
      radius: '14', transition: '0.35', glass: false, blur: '12'
    },
    midnight: {
      bg: '#0a0a12', card: '#12121e', surface: '#1a1a2e',
      accent: '#6c5ce7', accentHover: '#a29bfe',
      text: '#eef0f5', muted: '#7f8c9b', border: '#2a2a40',
      radius: '16', transition: '0.3', glass: true, blur: '14'
    },
    emerald: {
      bg: '#0b1210', card: '#121c18', surface: '#1a2820',
      accent: '#00b894', accentHover: '#55efc4',
      text: '#e8f5ef', muted: '#7a9a8c', border: '#2a3c34',
      radius: '12', transition: '0.35', glass: false, blur: '10'
    },
    violet: {
      bg: '#100b14', card: '#1a1222', surface: '#241830',
      accent: '#a855f7', accentHover: '#c084fc',
      text: '#f3e8ff', muted: '#9b8aad', border: '#3b2a4a',
      radius: '18', transition: '0.4', glass: true, blur: '16'
    },
    ocean: {
      bg: '#061018', card: '#0c1a24', surface: '#122838',
      accent: '#00cec9', accentHover: '#81ecec',
      text: '#e0f7fa', muted: '#6b9aaa', border: '#1e3a4a',
      radius: '14', transition: '0.3', glass: false, blur: '12'
    },
    light: {
      bg: '#f5f5f7', card: '#ffffff', surface: '#eeeef0',
      accent: '#e11d48', accentHover: '#fb7185',
      text: '#1a1a1a', muted: '#6b7280', border: '#e5e5e7',
      radius: '14', transition: '0.3', glass: false, blur: '10'
    }
  };

  const THEME_CACHE_KEY = 'reminders-theme-v1';

  function cacheTheme(s) {
    try {
      const toStore = {
        bg: s.bg, card: s.card, surface: s.surface,
        accent: s.accent, accentHover: s.accentHover,
        text: s.text, muted: s.muted, border: s.border,
        radius: s.radius, fontFamily: s.fontFamily,
        transition: s.transition, glass: !!s.glass, blur: s.blur
      };
      localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(toStore));
    } catch (_) {}
  }

  function applyTheme(s, { skipCache = false } = {}) {
    const root = document.documentElement;
    const map = {
      bg: '--bg', card: '--card', surface: '--surface',
      accent: '--accent', accentHover: '--accent-hover',
      text: '--text', muted: '--muted', border: '--border',
      radius: '--radius', fontFamily: '--font',
      transition: '--transition', blur: '--blur'
    };
    Object.entries(map).forEach(([k, cssVar]) => {
      if (s[k] === undefined) return;
      let v = s[k];
      if (k === 'radius') v = `${v}px`;
      if (k === 'transition') v = `${v}s`;
      if (k === 'blur') v = `${v}px`;
      root.style.setProperty(cssVar, v);
    });
    document.body.style.fontFamily = s.fontFamily || '';
    document.body.classList.toggle('glass', !!s.glass);

    const colorMap = {
      bg: 'set-bg', card: 'set-card', surface: 'set-surface',
      accent: 'set-accent', accentHover: 'set-accentHover',
      text: 'set-text', muted: 'set-muted', border: 'set-border'
    };
    Object.entries(colorMap).forEach(([k, id]) => {
      const el = document.getElementById(id);
      if (el && s[k]) el.value = s[k];
    });
    const r = document.getElementById('set-radius');
    if (r) { r.value = s.radius || 14; const vr = $('#val-radius'); if (vr) vr.textContent = r.value; }
    const t = document.getElementById('set-transition');
    if (t) { t.value = s.transition || 0.35; const vt = $('#val-transition'); if (vt) vt.textContent = t.value; }
    const b = document.getElementById('set-blur');
    if (b) { b.value = s.blur || 12; const vb = $('#val-blur'); if (vb) vb.textContent = b.value; }
    const g = document.getElementById('set-glass');
    if (g) g.checked = !!s.glass;
    const f = document.getElementById('set-fontFamily');
    if (f && s.fontFamily) f.value = s.fontFamily;
    const sn = document.getElementById('set-snoozeMinutes');
    if (sn && s.snoozeMinutes !== undefined) {
      sn.value = s.snoozeMinutes || 30;
      const vs = $('#val-snooze');
      if (vs) vs.textContent = sn.value;
    }

    if (!skipCache) cacheTheme(s);

    if (tg) {
      try {
        tg.setHeaderColor(s.bg || '#0d0d0d');
        tg.setBackgroundColor(s.bg || '#0d0d0d');
      } catch (_) {}
    }
  }

  async function loadSettings() {
    try {
      settings = await api('/api/settings');
      applyTheme(settings);
    } catch (e) {
      console.warn('Settings load failed', e);
      settings = {
        ...PRESETS['dark-red'],
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        snoozeMinutes: 30
      };
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
      fontFamily: $('#set-fontFamily').value,
      snoozeMinutes: Number($('#set-snoozeMinutes').value) || 30
    };
    try {
      settings = await api('/api/settings', { method: 'POST', body: payload });
      applyTheme(settings);
      toast(T.toastStyleSaved || 'Стиль сохранён ✨');
    } catch (e) {
      toast((T.toastSaveFail || 'Ошибка') + ': ' + e.message);
    }
  }

  function bindSettingsLive() {
    $$('[data-key]').forEach(el => {
      const evt = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        const key = el.dataset.key;
        let val = el.type === 'checkbox' ? el.checked : el.value;
        if (key === 'radius') { const v = $('#val-radius'); if (v) v.textContent = val; }
        if (key === 'transition') { const v = $('#val-transition'); if (v) v.textContent = val; }
        if (key === 'blur') { const v = $('#val-blur'); if (v) v.textContent = val; }
        if (key === 'snoozeMinutes') { const v = $('#val-snooze'); if (v) v.textContent = val; }
        const temp = { ...settings, [key]: key === 'snoozeMinutes' ? Number(val) : val };
        applyTheme(temp);
        settings = temp;
        // Auto-save snooze so bot inline buttons use the new value immediately
        if (key === 'snoozeMinutes') {
          clearTimeout(window.__snoozeSaveTimer);
          window.__snoozeSaveTimer = setTimeout(() => {
            api('/api/settings', { method: 'POST', body: { snoozeMinutes: Number(val) || 30 } })
              .then(s => { settings = { ...settings, ...s }; })
              .catch(() => {});
          }, 400);
        }
      });
    });

    $$('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = PRESETS[btn.dataset.preset];
        if (p) {
          // Пресет меняет только стиль; шрифт и таймер остаются как были
          settings = {
            ...settings,
            ...p,
            fontFamily: settings.fontFamily,
            snoozeMinutes: settings.snoozeMinutes
          };
          applyTheme(settings);
          toast(T.toastPreset || 'Пресет применён');
        }
      });
    });

    $('#btn-save-style').addEventListener('click', saveSettings);
    $('#btn-reset-style').addEventListener('click', () => {
      // Сброс стиля, но сохраняем выбранный шрифт и таймер
      settings = {
        ...PRESETS['dark-red'],
        fontFamily: settings.fontFamily || 'system-ui, -apple-system, "Segoe UI", sans-serif',
        snoozeMinutes: settings.snoozeMinutes || 30
      };
      applyTheme(settings);
      toast(T.toastReset || 'Сброшено');
    });
  }

  async function loadReminders() {
    try {
      reminders = await api('/api/reminders');
      scheduleRender();
    } catch (e) {
      console.error(e);
      toast((T.toastLoadFail || 'Не удалось загрузить') + ': ' + e.message);
      reminders = [];
      scheduleRender();
    }
  }

  function filtered() {
    let items = reminders;
    if (currentFilter === 'active') items = items.filter(r => r.active && !r.sent);
    else if (currentFilter === 'done') items = items.filter(r => r.sent);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(r =>
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.text && r.text.toLowerCase().includes(q))
      );
    }
    return items;
  }

  function formatDt(iso) {
    try {
      return new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return iso;
    }
  }

  function escape(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
      renderPending = false;
      renderList();
    });
  }

  function renderList() {
    const items = filtered();
    const frag = document.createDocumentFragment();

    if (!items.length) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      const isSearch = !!searchQuery;
      emptyIcon.innerHTML = isSearch
        ? `<svg class="icon-outline empty-svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
        : `<svg class="icon-outline empty-svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
      emptyTitle.textContent = isSearch
        ? (T.emptySearch || 'Ничего не найдено')
        : (T.emptyTitle || 'Пока нет напоминаний');
      emptyHint.textContent = isSearch
        ? (T.emptySearchHint || 'Попробуйте другой запрос')
        : (T.emptyHint || 'Нажми «+» чтобы создать первое');
      return;
    }
    emptyEl.classList.add('hidden');

    const maxAnim = 8;
    items.forEach((r, i) => {
      const card = document.createElement('article');
      card.className = 'reminder-card' + (r.sent ? ' sent' : '');
      if (i < maxAnim) card.style.animationDelay = `${i * 0.04}s`;

      // Время и надпись — только у заметок с напоминанием (активных или уже отправленных)
      const isReminder = !!(r.active || r.sent);
      const badgeClass = r.sent ? 'badge sent' : 'badge';
      const badgeText = r.sent
        ? (T.badgeSent || 'Отправлено')
        : (T.badgeActive || 'Напоминание');

      const iconEdit = `<svg class="icon-outline" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
      const iconDel = `<svg class="icon-outline" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;

      const metaHtml = isReminder ? `
        <div class="card-meta">
          <span class="${badgeClass}">${badgeText}</span>
          <time datetime="${escape(r.datetime)}">${formatDt(r.datetime)}</time>
        </div>` : '';

      // preview text truncated for list
      const preview = r.text
        ? `<p class="card-text">${escape(r.text.length > 120 ? r.text.slice(0, 120) + '…' : r.text)}</p>`
        : '';

      card.dataset.id = r.id;
      card.innerHTML = `
        <div class="accent-bar"></div>
        <div class="card-top">
          <h3 class="card-title">${escape(r.title)}</h3>
          <div class="card-actions">
            <button type="button" data-action="edit" data-id="${r.id}" title="${T.editTitle || 'Редактировать'}" aria-label="${T.editTitle || 'Редактировать'}">
              ${iconEdit}
            </button>
            <button type="button" data-action="delete" data-id="${r.id}" title="${T.deleteTitle || 'Удалить'}" aria-label="${T.deleteTitle || 'Удалить'}">
              ${iconDel}
            </button>
          </div>
        </div>
        ${preview}
        ${metaHtml}
      `;
      frag.appendChild(card);
    });

    listEl.innerHTML = '';
    listEl.appendChild(frag);
  }

  function toLocalStr(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function setDatetimeVisible(on) {
    const row = $('#datetime-row');
    if (!row) return;
    row.classList.toggle('hidden', !on);
  }

  function openModal(reminder) {
    editingId = reminder?.id || null;
    $('#modal-title').textContent = reminder
      ? (T.modalEdit || 'Редактировать')
      : (T.modalNew || 'Новое напоминание');
    $('#f-title').value = reminder?.title || '';
    $('#f-text').value = reminder?.text || '';

    const isActive = reminder ? !!reminder.active : false;
    $('#f-active').checked = isActive;
    setDatetimeVisible(isActive);

    if (reminder?.datetime) {
      $('#f-datetime').value = toLocalStr(new Date(reminder.datetime));
    } else if (isActive) {
      // локальные дата и время пользователя
      $('#f-datetime').value = toLocalStr(new Date());
    } else {
      $('#f-datetime').value = '';
    }

    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('open'));
    setTimeout(() => $('#f-title').focus(), 50);
  }

  function openView(reminder) {
    if (!reminder) return;
    const view = $('#view-modal');
    if (!view) return;
    $('#view-title').textContent = reminder.title || 'Заметка';
    const body = reminder.text && reminder.text.trim()
      ? reminder.text
      : 'Нет текста';
    $('#view-text').textContent = body;
    $('#view-text').classList.toggle('view-text-empty', !(reminder.text && reminder.text.trim()));
    const meta = $('#view-meta');
    if (reminder.active || reminder.sent) {
      meta.classList.remove('hidden');
      meta.innerHTML = `<span class="badge ${reminder.sent ? 'sent' : ''}">${
        reminder.sent ? (T.badgeSent || 'Отправлено') : (T.badgeActive || 'Напоминание')
      }</span><time datetime="${escape(reminder.datetime)}">${formatDt(reminder.datetime)}</time>`;
    } else {
      meta.classList.add('hidden');
      meta.innerHTML = '';
    }
    $('#view-edit').dataset.id = reminder.id;
    $('#view-delete').dataset.id = reminder.id;
    view.classList.remove('hidden');
    requestAnimationFrame(() => view.classList.add('open'));
  }

  function closeView() {
    const view = $('#view-modal');
    if (!view) return;
    view.classList.remove('open');
    setTimeout(() => view.classList.add('hidden'), 280);
  }

  function closeModal() {
    modal.classList.remove('open');
    setTimeout(() => {
      modal.classList.add('hidden');
      editingId = null;
      form.reset();
      setDatetimeVisible(false);
    }, 280);
  }

  async function submitForm(e) {
    e.preventDefault();
    const title = $('#f-title').value.trim();
    if (!title) return toast('Укажите заголовок');

    const active = $('#f-active').checked;
    let raw = $('#f-datetime').value;
    if (active && !raw) {
      return toast('Укажите дату и время');
    }
    // Если таймер выключен — сохраняем локальное «сейчас», чтобы поле не было пустым на сервере
    if (!raw) raw = toLocalStr(new Date());
    const dt = new Date(raw);
    if (isNaN(dt.getTime())) return toast('Некорректная дата и время');

    const payload = {
      title,
      text: $('#f-text').value.trim(),
      datetime: dt.toISOString(),
      active
    };

    try {
      if (editingId) {
        await api(`/api/reminders/${editingId}`, { method: 'PUT', body: payload });
      } else {
        await api('/api/reminders', { method: 'POST', body: payload });
      }
      closeModal();
      toast(T.toastSaved || 'Сохранено ✨');
      await loadReminders();
    } catch (err) {
      toast((T.toastSaveFail || 'Ошибка') + ': ' + err.message);
    }
  }

  async function deleteReminder(id) {
    if (!confirm(T.confirmDelete || 'Удалить это напоминание?')) return;
    try {
      await api(`/api/reminders/${id}`, { method: 'DELETE' });
      toast(T.toastDeleted || 'Удалено');
      await loadReminders();
    } catch (e) {
      toast(e.message);
    }
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function bindEvents() {
    $('#f-active').addEventListener('change', () => {
      const on = $('#f-active').checked;
      setDatetimeVisible(on);
      if (on) {
        // при включении таймера подставляем локальные дату и время пользователя
        const cur = $('#f-datetime').value;
        if (!cur || isNaN(new Date(cur).getTime())) {
          $('#f-datetime').value = toLocalStr(new Date());
        }
      }
    });

    $('#btn-add').addEventListener('click', () => openModal(null));
    $('#btn-settings').addEventListener('click', () => {
      viewList.classList.add('hidden');
      viewSettings.classList.remove('hidden');
      viewSettings.classList.add('view-enter');
    });
    $('#btn-back').addEventListener('click', () => {
      viewSettings.classList.add('hidden');
      viewSettings.classList.remove('view-enter');
      viewList.classList.remove('hidden');
    });
    $('#modal-close').addEventListener('click', closeModal);
    $('#modal-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    form.addEventListener('submit', submitForm);

    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        scheduleRender();
      });
    });

    const onSearch = debounce(() => {
      searchQuery = (searchInput.value || '').trim();
      searchClear.classList.toggle('hidden', !searchQuery);
      scheduleRender();
    }, 180);

    searchInput.addEventListener('input', onSearch);
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      searchClear.classList.add('hidden');
      scheduleRender();
      searchInput.focus();
    });

    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) {
        e.stopPropagation();
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        if (action === 'delete') deleteReminder(id);
        if (action === 'edit') {
          const r = reminders.find(x => x.id === id);
          if (r) openModal(r);
        }
        return;
      }
      // клик по карточке — просто прочитать заметку
      const card = e.target.closest('.reminder-card');
      if (!card) return;
      const id = card.dataset.id;
      const r = reminders.find(x => x.id === id);
      if (r) openView(r);
    });

    const viewModal = $('#view-modal');
    if (viewModal) {
      $('#view-close')?.addEventListener('click', closeView);
      viewModal.addEventListener('click', (e) => {
        if (e.target === viewModal) closeView();
      });
      $('#view-edit')?.addEventListener('click', () => {
        const id = $('#view-edit').dataset.id;
        closeView();
        const r = reminders.find(x => x.id === id);
        if (r) openModal(r);
      });
      $('#view-delete')?.addEventListener('click', () => {
        const id = $('#view-delete').dataset.id;
        closeView();
        deleteReminder(id);
      });
    }

    if (tg) {
      tg.BackButton.onClick(() => {
        if (!viewSettings.classList.contains('hidden')) {
          $('#btn-back').click();
        } else if ($('#view-modal') && !$('#view-modal').classList.contains('hidden')) {
          closeView();
        } else if (!modal.classList.contains('hidden')) {
          closeModal();
        } else {
          tg.close();
        }
      });
    }
  }

  function openReminderFromDeepLink() {
    try {
      const params = new URLSearchParams(window.location.search);
      const reminderId = params.get('reminder');
      if (!reminderId) return;

      const r = reminders.find(x => x.id === reminderId);
      if (r) openModal(r);
      else toast(T.toastNotFound || 'Напоминание не найдено');

      if (window.history?.replaceState) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch (_) {}
  }

  async function init() {
    bindEvents();
    bindSettingsLive();
    await loadSettings();
    await loadReminders();
    openReminderFromDeepLink();

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
