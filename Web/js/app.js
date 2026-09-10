/* ═══════════════════════════════════════════════════════════════
   Reminders / Notes Mini App — Client logic
   ═══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const T = window.TEXTS;
  const I = window.ICONS;

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
  let notes = [];
  let searchResults = [];
  let settings = {};
  let currentSnooze = window.DEFAULT_SNOOZE_MINUTES;
  let editingId = null;
  let currentNoteId = null;
  let listPage = 1;
  const PAGE_SIZE = 5;
  let viewStack = ['menu'];

  // ─── DOM ────────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const views = {
    menu: $('#view-menu'),
    list: $('#view-list'),
    search: $('#view-search'),
    note: $('#view-note'),
    settings: $('#view-settings'),
    help: $('#view-help'),
  };
  const modal = $('#modal');
  const modalRemind = $('#modal-remind');
  const form = $('#note-form');
  const toastEl = $('#toast');
  const fab = $('#btn-add');

  // ─── API helpers ────────────────────────────────────────────
  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (initData) headers['X-Telegram-Init-Data'] = initData;
    const res = await fetch(path, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
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

  // ─── Иконки (только контурные, пункт 6) ────────────────────
  function icon(name) {
    return I[name] || '';
  }

  function setIconOnly(el, name) {
    if (!el) return;
    el.innerHTML = `<span class="icon">${icon(name)}</span>`;
  }

  function setIconLabel(el, name, label) {
    if (!el) return;
    el.innerHTML = `<span class="icon">${icon(name)}</span><span class="btn-label">${label}</span>`;
  }

  // Индикатор загрузки: часы -> галочка (пункт 3), через edit на самой иконке.
  function playLoading(iconEl) {
    if (!iconEl) return () => {};
    iconEl.innerHTML = icon('hourglass');
    iconEl.classList.add('icon-spin');
    return function done(ok = true) {
      iconEl.classList.remove('icon-spin');
      iconEl.innerHTML = icon(ok ? 'check' : 'close');
      setTimeout(() => { iconEl.innerHTML = icon('check'); }, 900);
    };
  }

  function applyStaticTexts() {
    $('#menu-subtitle').textContent = T.menuSubtitle;
    setIconLabel($('#menu-create'), 'plus', T.btnCreate);
    setIconLabel($('#menu-notes'), 'notes', T.btnNotes);
    setIconLabel($('#menu-search'), 'search', T.btnSearch);
    setIconLabel($('#menu-settings'), 'gear', T.btnSettings);
    setIconLabel($('#menu-help'), 'help', T.btnHelp);

    setIconOnly($('#btn-home'), 'notes');
    setIconOnly($('#btn-settings-shortcut'), 'gear');
    setIconOnly($('#btn-add'), 'plus');
    setIconOnly($('#pg-prev'), 'chevronLeft');
    setIconOnly($('#pg-next'), 'chevronRight');
    setIconOnly($('#search-go'), 'search');
    setIconOnly($('#modal-close'), 'close');
    setIconOnly($('#modal-remind-close'), 'close');
    setIconOnly($('#list-empty-state .empty-icon'), 'notes');
    setIconOnly($('#search-empty-state .empty-icon'), 'search');

    $('#list-title').textContent = T.notesListTitle;
    $('#list-empty-title').textContent = T.listEmptyTitle;
    $('#list-empty-hint').textContent = T.listEmptyHint;
    setIconLabel($('#list-to-menu'), 'home', T.btnMenu);

    $('#search-title').textContent = T.searchTitle;
    $('#search-input').placeholder = T.searchPlaceholder;
    $('#search-empty-label').textContent = T.searchHint;
    setIconLabel($('#search-to-menu'), 'home', T.btnMenu);

    $('#note-detail-title').textContent = '';
    setIconLabel($('#note-btn-edit'), 'pencil', T.btnEdit);
    setIconLabel($('#note-btn-remind'), 'remind', T.btnRemind);
    setIconLabel($('#note-btn-delete'), 'trash', T.btnDelete);
    setIconLabel($('#note-btn-menu'), 'home', T.btnMenu);

    setIconLabel($('#btn-back-settings'), 'chevronLeft', T.btnBack);
    $('#settings-title-text').textContent = T.settingsTitle;
    $('#settings-snooze-title').textContent = T.settingsSnoozeTitle;
    $('#settings-snooze-hint').textContent = T.settingsSnoozeHint;
    $('#snooze-custom').placeholder = T.settingsSnoozeCustomPlaceholder;
    $('#btn-save-style').textContent = T.btnSave;

    $('#help-title-text').textContent = T.helpTitle;
    setIconLabel($('#help-to-menu'), 'home', T.btnMenu);
    $('#help-list').innerHTML = T.helpBody.map((li) => `<li>${escape(li)}</li>`).join('');

    $('#note-text-label').textContent = T.noteTextPlaceholder;
    $('#f-text').placeholder = T.noteTextPlaceholder;
    $('#note-remind-toggle-label').textContent = T.noteRemindToggle;
    $('#note-remind-time-label').textContent = T.noteRemindTitle;
    $('#note-remind-time-label-2').textContent = T.noteRemindTitle;
    $('#modal-cancel').textContent = T.btnCancel;
    $('#modal-submit-label').textContent = T.btnSave;
    setIconOnly($('#modal-submit-icon'), 'check');

    $('#modal-remind-title').textContent = T.btnRemind;
    $('#modal-remind-clear').textContent = T.btnClearRemind;
    $('#modal-remind-save-label').textContent = T.btnSave;
    setIconOnly($('#remind-submit-icon'), 'check');
  }

  function escape(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ─── Навигация между экранами (плавная смена, пункт 3) ──────
  function renderView(name) {
    Object.entries(views).forEach(([key, el]) => {
      if (key === name) {
        el.classList.remove('hidden');
        requestAnimationFrame(() => el.classList.add('active'));
      } else {
        el.classList.remove('active');
        el.classList.add('hidden');
      }
    });
    fab.classList.toggle('hidden', name !== 'list');
    if (tg) {
      if (name === 'menu') tg.BackButton.hide();
      else tg.BackButton.show();
    }
  }

  function goToMenu() {
    viewStack = ['menu'];
    renderView('menu');
  }

  function navigateTo(name) {
    viewStack.push(name);
    renderView(name);
  }

  function goBack() {
    if (!modal.classList.contains('hidden')) return closeModal();
    if (!modalRemind.classList.contains('hidden')) return closeRemindModal();
    if (viewStack.length > 1) {
      viewStack.pop();
      renderView(viewStack[viewStack.length - 1]);
    } else if (tg) {
      tg.close();
    }
  }

  // ─── Settings / Theme ───────────────────────────────────────
  const PRESETS = {
    'dark-red': { bg: '#0d0d0d', card: '#151515', surface: '#1a1a1a', accent: '#ff3333', accentHover: '#ff5555', text: '#e0e0e0', muted: '#888888', border: '#333333', radius: '14', transition: '0.35', glass: false, blur: '12', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
    midnight: { bg: '#0a0e17', card: '#111827', surface: '#1f2937', accent: '#3b82f6', accentHover: '#60a5fa', text: '#e5e7eb', muted: '#9ca3af', border: '#1e293b', radius: '12', transition: '0.3', glass: false, blur: '10', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
    emerald: { bg: '#0a1210', card: '#0f1f1a', surface: '#163028', accent: '#10b981', accentHover: '#34d399', text: '#d1fae5', muted: '#6ee7b7', border: '#134e3a', radius: '16', transition: '0.4', glass: true, blur: '14', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
    violet: { bg: '#0f0a14', card: '#1a1225', surface: '#251833', accent: '#a855f7', accentHover: '#c084fc', text: '#f3e8ff', muted: '#c4b5fd', border: '#3b0764', radius: '18', transition: '0.35', glass: true, blur: '16', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
    ocean: { bg: '#061018', card: '#0c1e2b', surface: '#123347', accent: '#06b6d4', accentHover: '#22d3ee', text: '#e0f7fa', muted: '#67e8f9', border: '#164e63', radius: '12', transition: '0.3', glass: false, blur: '10', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
    light: { bg: '#f5f5f7', card: '#ffffff', surface: '#f0f0f2', accent: '#ff3333', accentHover: '#e62e2e', text: '#1a1a1a', muted: '#666666', border: '#e0e0e0', radius: '14', transition: '0.3', glass: false, blur: '8', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
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

    const map = { bg: 'set-bg', card: 'set-card', surface: 'set-surface', accent: 'set-accent', accentHover: 'set-accentHover', text: 'set-text', muted: 'set-muted', border: 'set-border' };
    Object.entries(map).forEach(([k, id]) => {
      const el = document.getElementById(id);
      if (el && s[k]) el.value = s[k];
    });
    const r = $('#set-radius'); if (r) { r.value = s.radius || 14; $('#val-radius').textContent = r.value; }
    const t = $('#set-transition'); if (t) { t.value = s.transition || 0.35; $('#val-transition').textContent = t.value; }
    const b = $('#set-blur'); if (b) { b.value = s.blur || 12; $('#val-blur').textContent = b.value; }
    const g = $('#set-glass'); if (g) g.checked = !!s.glass;
    const f = $('#set-fontFamily'); if (f && s.fontFamily) f.value = s.fontFamily;
  }

  function renderSnoozeOptions() {
    const wrap = $('#snooze-options');
    wrap.innerHTML = window.SNOOZE_OPTIONS.map((m) =>
      `<button type="button" class="snooze-pill${m === currentSnooze ? ' active' : ''}" data-mins="${m}">${m} мин</button>`
    ).join('');
    const isPreset = window.SNOOZE_OPTIONS.includes(currentSnooze);
    $('#snooze-custom').value = isPreset ? '' : currentSnooze;

    wrap.querySelectorAll('.snooze-pill').forEach((btn) => {
      btn.addEventListener('click', async () => {
        currentSnooze = Number(btn.dataset.mins);
        renderSnoozeOptions();
        await saveSnooze();
      });
    });
  }

  async function saveSnooze() {
    try {
      settings = await api('/api/settings', { method: 'POST', body: { snoozeMinutes: currentSnooze } });
      currentSnooze = settings.snoozeMinutes;
      toast(T.settingsSnoozeSaved);
    } catch (e) {
      toast(T.toastErrorPrefix + e.message);
    }
  }

  async function loadSettings() {
    try {
      settings = await api('/api/settings');
    } catch (e) {
      console.warn('Settings load failed, using defaults', e);
      settings = { ...PRESETS['dark-red'], snoozeMinutes: window.DEFAULT_SNOOZE_MINUTES };
    }
    currentSnooze = settings.snoozeMinutes || window.DEFAULT_SNOOZE_MINUTES;
    applyTheme(settings);
    renderSnoozeOptions();
  }

  async function saveStyleSettings() {
    const payload = {
      bg: $('#set-bg').value, card: $('#set-card').value, surface: $('#set-surface').value,
      accent: $('#set-accent').value, accentHover: $('#set-accentHover').value,
      text: $('#set-text').value, muted: $('#set-muted').value, border: $('#set-border').value,
      radius: $('#set-radius').value, transition: $('#set-transition').value, blur: $('#set-blur').value,
      glass: $('#set-glass').checked, fontFamily: $('#set-fontFamily').value,
    };
    try {
      settings = await api('/api/settings', { method: 'POST', body: payload });
      applyTheme(settings);
      toast(T.toastStyleSaved);
    } catch (e) {
      toast(T.toastErrorPrefix + e.message);
    }
  }

  function bindSettingsLive() {
    $$('[data-key]').forEach((el) => {
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

    $$('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = PRESETS[btn.dataset.preset];
        if (p) { settings = { ...settings, ...p }; applyTheme(settings); }
      });
    });

    $('#btn-save-style').addEventListener('click', saveStyleSettings);
    $('#btn-reset-style').addEventListener('click', () => {
      settings = { ...settings, ...PRESETS['dark-red'] };
      applyTheme(settings);
    });

    $('#snooze-custom').addEventListener('change', async () => {
      const v = Number($('#snooze-custom').value);
      if (Number.isFinite(v) && v > 0) {
        currentSnooze = Math.round(v);
        renderSnoozeOptions();
        await saveSnooze();
      }
    });
  }

  // ─── Заметки: список / пагинация ─────────────────────────────
  async function loadNotes() {
    try {
      notes = await api('/api/notes');
    } catch (e) {
      toast(T.toastLoadFailed + e.message);
      notes = [];
    }
    listPage = 1;
    renderNotesPage();
  }

  function formatDt(iso) {
    if (!iso) return T.noteDetailNoRemind;
    try {
      const d = new Date(iso);
      return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  function noteRow(n) {
    const row = document.createElement('article');
    row.className = 'reminder-card' + (n.sent ? ' sent' : '');
    row.dataset.id = n.id;
    row.innerHTML = `
      <div class="accent-bar"></div>
      <div class="card-top">
        <h3 class="card-title">${escape(n.title)}</h3>
      </div>
      <div class="card-meta">
        <span class="badge ${n.sent ? 'sent' : ''}">${n.sent ? T.noteDetailStatusSent : (n.active ? T.noteDetailStatusActive : T.noteDetailStatusPaused)}</span>
        <span>${n.remindAt ? formatDt(n.remindAt) : ''}</span>
      </div>`;
    row.addEventListener('click', () => openNoteDetail(n.id));
    return row;
  }

  function renderNotesPage() {
    const listEl = $('#notes-list');
    const emptyEl = $('#list-empty-state');
    const pag = $('#list-pagination');
    listEl.innerHTML = '';

    if (!notes.length) {
      emptyEl.classList.remove('hidden');
      pag.classList.add('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    const totalPages = Math.max(1, Math.ceil(notes.length / PAGE_SIZE));
    listPage = Math.min(listPage, totalPages);
    const start = (listPage - 1) * PAGE_SIZE;
    notes.slice(start, start + PAGE_SIZE).forEach((n) => listEl.appendChild(noteRow(n)));

    pag.classList.toggle('hidden', totalPages <= 1);
    $('#pg-label').textContent = T.pageLabel(listPage, totalPages);
    $('#pg-prev').disabled = listPage <= 1;
    $('#pg-next').disabled = listPage >= totalPages;
  }

  // ─── Карточка заметки ─────────────────────────────────────────
  function findNote(id) {
    return notes.find((n) => n.id === id) || searchResults.find((n) => n.id === id);
  }

  function openNoteDetail(id) {
    const n = findNote(id);
    if (!n) { toast(T.noteNotFoundToast || 'Заметка не найдена'); return; }
    currentNoteId = id;
    $('#note-detail-title').textContent = n.title;
    $('#note-detail-text').textContent = n.text;
    $('#note-detail-status').textContent = n.sent ? T.noteDetailStatusSent : (n.active ? T.noteDetailStatusActive : T.noteDetailStatusPaused);
    $('#note-detail-status').className = 'badge' + (n.sent ? ' sent' : '');
    $('#note-detail-created').textContent = `${T.noteDetailCreatedLabel} ${formatDt(n.createdAt)}`;
    $('#note-detail-remind').textContent = `${T.noteDetailRemindLabel} ${n.remindAt ? formatDt(n.remindAt) : T.noteDetailNoRemind}`;
    navigateTo('note');
  }

  async function refreshCurrentDataViews() {
    await loadNotes();
    if (currentNoteId) {
      const n = findNote(currentNoteId);
      if (n) openNoteDetail(currentNoteId);
    }
  }

  // ─── Create / Edit modal ────────────────────────────────────
  function openNoteModal(note = null) {
    editingId = note ? note.id : null;
    $('#modal-title').textContent = note ? T.noteEditTitle : T.noteNewTitle;
    $('#edit-id').value = editingId || '';
    $('#f-text').value = note?.text || '';
    const hasRemind = !!(note && note.remindAt);
    $('#f-remind-toggle').checked = hasRemind;
    $('#f-datetime-wrap').classList.toggle('hidden', !hasRemind);

    const pad = (n) => String(n).padStart(2, '0');
    const d = note?.remindAt ? new Date(note.remindAt) : new Date(Date.now() + 3600000);
    $('#f-datetime').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('show'));
    setTimeout(() => $('#f-text').focus(), 100);
  }

  function closeModal() {
    modal.classList.remove('show');
    setTimeout(() => modal.classList.add('hidden'), 200);
    form.reset();
    $('#f-datetime-wrap').classList.add('hidden');
    editingId = null;
  }

  async function submitNoteForm(e) {
    e.preventDefault();
    const text = $('#f-text').value.trim();
    if (!text) return toast(T.toastTextRequired);

    const hasRemind = $('#f-remind-toggle').checked;
    const payload = { text, remindAt: hasRemind ? new Date($('#f-datetime').value).toISOString() : null };

    const done = playLoading($('#modal-submit-icon'));
    try {
      if (editingId) {
        await api(`/api/notes/${editingId}`, { method: 'PUT', body: payload });
        toast(T.toastUpdated);
      } else {
        await api('/api/notes', { method: 'POST', body: payload });
        toast(T.toastCreated);
      }
      done(true);
      closeModal();
      await refreshCurrentDataViews();
    } catch (err) {
      done(false);
      toast(T.toastErrorPrefix + err.message);
    }
  }

  async function deleteNote(id) {
    if (!confirm(T.noteConfirmDelete)) return;
    try {
      await api(`/api/notes/${id}`, { method: 'DELETE' });
      toast(T.toastDeleted);
      if (currentNoteId === id) { currentNoteId = null; goBack(); }
      await loadNotes();
      if (searchResults.length) await runSearch();
    } catch (err) {
      toast(T.toastErrorPrefix + err.message);
    }
  }

  // ─── Быстрое напоминание (modal-remind) ─────────────────────
  function openRemindModal() {
    const n = findNote(currentNoteId);
    if (!n) return;
    const pad = (x) => String(x).padStart(2, '0');
    const d = n.remindAt ? new Date(n.remindAt) : new Date(Date.now() + 3600000);
    $('#r-datetime').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    modalRemind.classList.remove('hidden');
    requestAnimationFrame(() => modalRemind.classList.add('show'));
  }

  function closeRemindModal() {
    modalRemind.classList.remove('show');
    setTimeout(() => modalRemind.classList.add('hidden'), 200);
  }

  async function saveRemind(clear = false) {
    const payload = { remindAt: clear ? null : new Date($('#r-datetime').value).toISOString() };
    const done = playLoading($('#remind-submit-icon'));
    try {
      await api(`/api/notes/${currentNoteId}`, { method: 'PUT', body: payload });
      done(true);
      toast(clear ? T.toastRemindCleared : T.toastRemindSaved);
      closeRemindModal();
      await refreshCurrentDataViews();
    } catch (err) {
      done(false);
      toast(T.toastErrorPrefix + err.message);
    }
  }

  // ─── Поиск (пункт 4) ──────────────────────────────────────────
  function searchResultRow(n, index) {
    const row = document.createElement('article');
    row.className = 'reminder-card search-row';
    row.innerHTML = `
      <div class="accent-bar"></div>
      <div class="card-top">
        <h3 class="card-title">${index}. ${escape(n.title)}</h3>
        <div class="card-actions">
          <button data-action="open" title="${T.btnEdit}"><span class="icon">${icon('pencil')}</span></button>
          <button data-action="delete" title="${T.btnDelete}"><span class="icon">${icon('trash')}</span></button>
        </div>
      </div>
      <div class="card-meta">
        <span>${n.remindAt ? formatDt(n.remindAt) : ''}</span>
      </div>`;
    row.querySelector('[data-action="open"]').addEventListener('click', (e) => { e.stopPropagation(); openNoteDetail(n.id); });
    row.querySelector('[data-action="delete"]').addEventListener('click', (e) => { e.stopPropagation(); deleteNote(n.id); });
    return row;
  }

  async function runSearch() {
    const q = $('#search-input').value.trim();
    const resultsEl = $('#search-results');
    const emptyEl = $('#search-empty-state');
    const countEl = $('#search-count');
    resultsEl.innerHTML = '';

    if (!q) {
      searchResults = [];
      countEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      $('#search-empty-label').textContent = T.searchHint;
      return;
    }

    try {
      searchResults = await api(`/api/notes/search?q=${encodeURIComponent(q)}`);
    } catch (e) {
      toast(T.toastErrorPrefix + e.message);
      searchResults = [];
    }

    if (!searchResults.length) {
      countEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      $('#search-empty-label').textContent = T.searchEmpty;
      return;
    }

    emptyEl.classList.add('hidden');
    countEl.classList.remove('hidden');
    countEl.textContent = T.searchResultsCount(searchResults.length);
    searchResults.forEach((n, i) => resultsEl.appendChild(searchResultRow(n, i + 1)));
  }

  // ─── Deep link: открыть заметку из уведомления ────────────────
  function openNoteFromDeepLink() {
    try {
      const params = new URLSearchParams(window.location.search);
      const noteId = params.get('note');
      if (!noteId) return;
      const n = notes.find((x) => x.id === noteId);
      if (n) { navigateTo('list'); openNoteDetail(noteId); }
      if (window.history?.replaceState) window.history.replaceState({}, '', window.location.pathname);
    } catch (_) {}
  }

  // ─── Events ─────────────────────────────────────────────────
  function bindEvents() {
    $('#btn-home').addEventListener('click', goToMenu);
    $('#btn-settings-shortcut').addEventListener('click', () => navigateTo('settings'));

    $('#menu-create').addEventListener('click', () => openNoteModal());
    $('#menu-notes').addEventListener('click', async () => { navigateTo('list'); await loadNotes(); });
    $('#menu-search').addEventListener('click', () => {
      navigateTo('search');
      $('#search-input').value = '';
      $('#search-results').innerHTML = '';
      $('#search-count').classList.add('hidden');
      $('#search-empty-state').classList.remove('hidden');
      $('#search-empty-label').textContent = T.searchHint;
    });
    $('#menu-settings').addEventListener('click', () => navigateTo('settings'));
    $('#menu-help').addEventListener('click', () => navigateTo('help'));

    $('#list-to-menu').addEventListener('click', goToMenu);
    $('#search-to-menu').addEventListener('click', goToMenu);
    $('#help-to-menu').addEventListener('click', goToMenu);
    $('#note-btn-menu').addEventListener('click', goToMenu);
    $('#btn-back-settings').addEventListener('click', goBack);

    $('#pg-prev').addEventListener('click', () => { if (listPage > 1) { listPage--; renderNotesPage(); } });
    $('#pg-next').addEventListener('click', () => { listPage++; renderNotesPage(); });

    $('#search-go').addEventListener('click', runSearch);
    $('#search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });

    $('#btn-add').addEventListener('click', () => openNoteModal());

    $('#note-btn-edit').addEventListener('click', () => openNoteModal(findNote(currentNoteId)));
    $('#note-btn-delete').addEventListener('click', () => deleteNote(currentNoteId));
    $('#note-btn-remind').addEventListener('click', openRemindModal);

    $('#modal-close').addEventListener('click', closeModal);
    $('#modal-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    form.addEventListener('submit', submitNoteForm);
    $('#f-remind-toggle').addEventListener('change', (e) => {
      $('#f-datetime-wrap').classList.toggle('hidden', !e.target.checked);
    });

    $('#modal-remind-close').addEventListener('click', closeRemindModal);
    modalRemind.addEventListener('click', (e) => { if (e.target === modalRemind) closeRemindModal(); });
    $('#modal-remind-save').addEventListener('click', () => saveRemind(false));
    $('#modal-remind-clear').addEventListener('click', () => saveRemind(true));

    if (tg) tg.BackButton.onClick(goBack);
  }

  // ─── Init ───────────────────────────────────────────────────
  async function init() {
    applyStaticTexts();
    bindEvents();
    bindSettingsLive();
    await loadSettings();
    await loadNotes();
    openNoteFromDeepLink();
    renderView('menu');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
