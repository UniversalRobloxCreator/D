/* ═══════════════════════════════════════════════════════════════
   texts.js — все строки проекта (кроме содержимого самих заметок),
   используемые сервером (сообщения бота, callback-уведомления).
   Аналог texts.py / locales/ru.py для Node.js-бэкенда.

   Иконки: используем ТОЛЬКО контурные (outline / monochrome) юникод-
   символы. Часть символов ниже — это официальные Unicode-символы с
   "двойным начертанием" (text vs emoji presentation); добавление
   U+FE0E (VS15) гарантированно переключает их в контурный/чёрно-белый
   вид на клиентах, которые это поддерживают (ICONS.SAFE — надёжно
   монохромные всегда, без вариантов; ICONS.BEST_EFFORT — просим
   контурный вид через VS15, но не все шрифты/клиенты это уважают,
   поэтому в веб-интерфейсе для этих смыслов используются настоящие
   SVG-иконки с обводкой (см. Web/js/texts.js), а в текстовых
   сообщениях бота такие места вместо эмодзи используют обычное слово).
   ═══════════════════════════════════════════════════════════════ */

// Гарантированно контурные/монохромные символы (не зависят от эмодзи-шрифта)
const ICONS = {
  PHONE: '\u260E\uFE0E',      // ☎︎
  PLUS: '+',
  MINUS: '\u2212',            // −
  PENCIL: '\u270E\uFE0E',     // ✎︎
  GEAR: '\u2699\uFE0E',       // ⚙︎
  HOUSE: '\u2302',            // ⌂
  CHECK: '\u2713',            // ✓
  ARROW_LEFT: '\u2190',       // ←
  ARROW_RIGHT: '\u2192',      // →
  HOURGLASS: '\u231B\uFE0E',  // ⌛︎
  QUESTION: '?',
};

const TEXTS = {
  // ── Бот: приветствие и общие сообщения ──────────────────────
  botGreeting:
    `${ICONS.HOUSE} Привет! Это <b>Заметки с напоминаниями</b> — открой блокнот кнопкой ниже.`,
  botOpenAppBtn: `${ICONS.HOUSE} Открыть блокнот`,
  botRescheduleHint: `${ICONS.HOURGLASS} Откройте блокнот через /start, чтобы изменить время.`,

  // ── Напоминания / snooze (пункт 7) ──────────────────────────
  reminderPrefix: `${ICONS.HOURGLASS} Напоминание`,
  snoozeButtonLabel: (mins) => `${ICONS.HOURGLASS} Отложить на ${mins} мин`,
  snoozedButtonLabel: (mins) => `${ICONS.CHECK} Отложено на ${mins} мин`,
  snoozeToast: (mins) => `${ICONS.CHECK} Отложено на ${mins} мин`,
  snoozeAgainToast: 'Уже отложено',
  noteNotFoundToast: 'Заметка не найдена',
  genericErrorToast: 'Ошибка, попробуйте ещё раз',
  snoozedFollowUp: (mins, dateStr) =>
    `${ICONS.CHECK} Хорошо! Напомню снова через ${mins} мин (${dateStr}).`,

  // ── Ошибки API ───────────────────────────────────────────────
  errUnauthorized: 'Unauthorized',
  errTextRequired: 'text required',
  errNotFound: 'Not found',
};

module.exports = { TEXTS, ICONS };
