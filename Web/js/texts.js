/* ═══════════════════════════════════════════════════════════════
   texts.js (клиент) — все строки интерфейса, кроме содержимого самих
   заметок, плюс набор контурных (outline) SVG-иконок. Заметки живут
   в Data/notes.json, настройки — в Data/settings.json (см. server.js).

   Почему SVG, а не юникод-эмодзи: настоящая заливка/контур у эмодзи
   зависит от шрифта устройства и не гарантируется на всех платформах.
   Обводка через stroke="currentColor" fill="none" — единственный
   способ надёжно получить "только контурные" иконки (пункт 6),
   поэтому здесь это сделано через SVG, в едином стиле с уже
   существующими иконками шестерёнки/плюса в проекте.
   ═══════════════════════════════════════════════════════════════ */

window.TEXTS = {
  appTitle: 'Заметки',

  menuTitle: 'Главное меню',
  menuSubtitle: 'Блокнот с напоминаниями',
  btnCreate: 'Создать',
  btnNotes: 'Мои заметки',
  btnSearch: 'Поиск',
  btnSettings: 'Настройки',
  btnHelp: 'Помощь',
  btnMenu: 'В меню',
  btnBack: 'Назад',
  btnEdit: 'Изменить',
  btnDelete: 'Удалить',
  btnRemind: 'Напомнить',
  btnSave: 'Сохранить',
  btnCancel: 'Отмена',
  btnClearRemind: 'Убрать напоминание',

  notesListTitle: 'Мои заметки',
  listEmptyTitle: 'Пока нет заметок',
  listEmptyHint: 'Нажмите «Создать», чтобы добавить первую',
  pageLabel: (page, total) => `Стр. ${page} из ${total}`,

  searchTitle: 'Поиск заметок',
  searchPlaceholder: 'Введите текст для поиска…',
  searchEmpty: 'Ничего не найдено',
  searchHint: 'Начните вводить текст заметки',
  searchResultsCount: (n) => `Найдено: ${n}`,

  settingsTitle: 'Настройки стиля',
  settingsSnoozeTitle: 'Время переноса',
  settingsSnoozeHint: 'На сколько минут откладывать напоминание при нажатии «Отложить»',
  settingsSnoozeCustomPlaceholder: 'Своё значение, мин',
  settingsSnoozeSaved: 'Время переноса сохранено',

  helpTitle: 'Помощь',
  helpBody: [
    'Создать — добавить новую заметку, при желании с напоминанием.',
    'Мои заметки — список всех заметок с постраничной навигацией.',
    'Поиск — найти заметки по части текста (без учёта регистра).',
    'Настройки — оформление и время переноса напоминаний.',
    'В карточке заметки доступны: изменить текст, удалить, задать/изменить напоминание.',
  ],

  noteNewTitle: 'Новая заметка',
  noteEditTitle: 'Редактировать заметку',
  noteTextPlaceholder: 'Текст заметки…',
  noteRemindToggle: 'Установить напоминание',
  noteRemindTitle: 'Время напоминания',
  noteDetailNoRemind: 'Без напоминания',
  noteDetailRemindLabel: 'Напоминание:',
  noteDetailCreatedLabel: 'Создано:',
  noteDetailStatusSent: 'Отправлено',
  noteDetailStatusActive: 'Активно',
  noteDetailStatusPaused: 'Пауза',
  noteConfirmDelete: 'Удалить эту заметку?',

  toastCreated: 'Заметка создана',
  toastUpdated: 'Заметка обновлена',
  toastDeleted: 'Заметка удалена',
  toastRemindSaved: 'Напоминание сохранено',
  toastRemindCleared: 'Напоминание убрано',
  toastStyleSaved: 'Стиль сохранён',
  toastErrorPrefix: 'Ошибка: ',
  toastTextRequired: 'Введите текст заметки',
  toastLoadFailed: 'Не удалось загрузить: ',

  loadingSaving: 'Сохранение…',
  loadingDone: 'Готово',
};

// Preset'ы времени переноса (совпадают с DEFAULT/SNOOZE_OPTIONS на сервере)
window.SNOOZE_OPTIONS = [5, 15, 30, 60, 120];
window.DEFAULT_SNOOZE_MINUTES = 30;

/* ─── Контурные SVG-иконки (пункт 6) ────────────────────────────
   Единый стиль: viewBox 0 0 24 24, stroke="currentColor", fill="none",
   stroke-width 2 — как уже было сделано для шестерёнки/плюса. */
window.ICONS = {
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  notes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  gear: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  help: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2-2.4 3.7"/><line x1="12" y1="17" x2="12" y2="17.01"/></svg>`,
  pencil: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  remind: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  hourglass: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12"/><path d="M6 22h12"/><path d="M6 2c0 5 6 6 6 10s-6 5-6 10"/><path d="M18 2c0 5-6 6-6 10s6 5 6 10"/></svg>`,
  chevronLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>`,
};
