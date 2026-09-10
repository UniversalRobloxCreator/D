/* ═══════════════════════════════════════════════════════════════
   All UI texts of the project (except reminder content itself).
   Keep this file as the single source of truth for strings.
   ═══════════════════════════════════════════════════════════════ */

window.TEXTS = {
  // Header / App
  appTitle: 'Reminders',
  appName: 'Блокнот',

  // Tabs / Filters
  tabAll: 'Все',
  tabActive: 'Активные',
  tabDone: 'Отправленные',

  // Empty state
  emptyTitle: 'Пока нет напоминаний',
  emptyHint: 'Нажми «+», чтобы создать первое',
  emptySearch: 'Ничего не найдено',
  emptySearchHint: 'Попробуйте другой запрос',

  // Search
  searchPlaceholder: 'Поиск по тексту…',

  // Buttons / Actions
  btnAdd: 'Добавить',
  btnSettings: 'Настройки',
  btnBack: 'Назад',
  btnSave: 'Сохранить',
  btnCancel: 'Отмена',
  btnReset: 'Сбросить',
  btnEdit: 'Редактировать',
  btnDelete: 'Удалить',

  // Modal
  modalNew: 'Новое напоминание',
  modalEdit: 'Редактировать',
  labelTitle: 'Заголовок',
  labelText: 'Текст',
  labelDatetime: 'Дата и время',
  labelActive: 'Активно',
  placeholderTitle: 'Например: Позвонить маме',
  placeholderText: 'Подробности (необязательно)',

  // Badges
  badgeActive: 'Активно',
  badgeSent: 'Отправлено',
  badgePaused: 'Пауза',

  // Toasts
  toastSaved: 'Стиль сохранён',
  toastCreated: 'Напоминание создано',
  toastUpdated: 'Обновлено',
  toastDeleted: 'Удалено',
  toastReset: 'Сброшено к тёмно-красному',
  toastPreset: 'Пресет применён (сохраните, чтобы оставить)',
  toastError: 'Ошибка',
  toastLoadError: 'Не удалось загрузить',
  toastTitleRequired: 'Укажите заголовок',
  toastNotFound: 'Напоминание не найдено',
  toastConfirmDelete: 'Удалить напоминание?',

  // Settings sections
  settingsTitle: 'Настройки',
  sectionColors: 'Цвета',
  sectionForm: 'Форма и анимация',
  sectionFont: 'Шрифт',
  sectionPresets: 'Пресеты',
  sectionSnooze: 'Перенос напоминания',

  colorBg: 'Фон',
  colorCard: 'Карточки',
  colorSurface: 'Поверхность',
  colorAccent: 'Акцент',
  colorAccentHover: 'Акцент (hover)',
  colorText: 'Текст',
  colorMuted: 'Приглушённый',
  colorBorder: 'Границы',

  labelRadius: 'Скругление',
  labelTransition: 'Скорость анимации',
  labelBlur: 'Размытие (glass)',
  labelGlass: 'Glass-эффект',
  labelSnooze: 'Перенос на (минут)',

  // Presets
  presetDarkRed: 'Тёмно-красный',
  presetMidnight: 'Полночь',
  presetEmerald: 'Изумруд',
  presetViolet: 'Фиолет',
  presetOcean: 'Океан',
  presetLight: 'Светлый',

  // Bot messages (server uses these where possible)
  botHello: '👋 Привет! Это мини-приложение <b>Reminders</b> — твой личный блокнот напоминаний.\n\nНажми кнопку ниже, чтобы открыть.',
  botOpenNotebook: '📝 Открыть блокнот',
  botSnoozeBtn: '🔁 Через {minutes} минут',
  botSnoozeBtnDone: '✅ Через {minutes} минут',
  botChangeTime: '🕐 Изменить время',
  botSnoozeOk: '⏰ Отправлю через {minutes} минут',
  botSnoozeConfirm: '🔁 Хорошо! Напомню про «{title}» ещё раз в {time}.',
  botNotFound: 'Напоминание не найдено',
  botOpenManually: 'Откройте блокнот через /start, чтобы изменить время',
  botError: 'Ошибка, попробуйте ещё раз',

  // Units
  unitPx: 'px',
  unitSec: 's',
  unitMin: 'мин'
};
