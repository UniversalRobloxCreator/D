try { require('dotenv').config(); } catch (_) {}

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const cron = require('node-cron');
const { TEXTS, ICONS } = require('./texts');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const PORT = Number(process.env.PORT || 3000);
const BASE_DIR = __dirname;
const WEB_DIR = path.join(BASE_DIR, 'Web');
const DATA_DIR = path.join(BASE_DIR, 'Data');

// ── Пункт 1: где хранятся заметки ───────────────────────────────
// Заметки: Data/notes.json — словарь { "<telegramId>": [ {id, text,
// createdAt, remindAt, active, sent}, ... ] }.
// Настройки (стиль + время переноса напоминаний): Data/settings.json,
// словарь по тому же принципу { "<telegramId>": {...} }.
const NOTES_DB = path.join(DATA_DIR, 'notes.json');
const LEGACY_REMINDERS_DB = path.join(DATA_DIR, 'reminders.json'); // для миграции старых данных
const SETTINGS_DB = path.join(DATA_DIR, 'settings.json');
const USERS_DB = path.join(DATA_DIR, 'users.json');

const BOT_TOKEN = String(process.env.BOT_TOKEN || '').trim();
const PUBLIC_URL = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
const MINIAPP_URL = String(process.env.MINIAPP_URL || PUBLIC_URL).trim().replace(/\/+$/, '');

const DEFAULT_SNOOZE_MINUTES = 30;
const SNOOZE_OPTIONS = [5, 15, 30, 60, 120];

// ─────────────────────────────────────────────────────────────────
// Пункт 2 (оптимизация): всё хранилище держим в памяти и читаем с
// диска ровно один раз при старте. Каждый GET-запрос обслуживается
// из кэша без обращения к диску. На диск пишем асинхронно и только
// при реальном изменении данных (create/update/delete/settings),
// атомарно (запись во временный файл + rename), чтобы не терять
// данные при падении процесса посреди записи.
// ─────────────────────────────────────────────────────────────────
let notesCache = null;     // { [userId]: Note[] }
let settingsCache = null;  // { [userId]: Settings }
let usersCache = null;     // Array<{id, first_name, username, createdAt}>
let usersIndex = null;     // Set<number> для быстрой проверки "уже видели"

async function ensureDataDir() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
}

async function readJsonSafe(file, fallback) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed === null || parsed === undefined) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

// Атомарная запись: пишем во временный файл рядом и переименовываем
// поверх целевого — rename() на одной файловой системе атомарен, так
// что при падении процесса мы теряем максимум незавершённую запись,
// но никогда не оставляем notes.json в наполовину записанном виде.
async function atomicWriteJson(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmp, file);
}

// load_notes(): загрузка (с миграцией со старого формата reminders.json,
// где заметки лежали единым списком с полем userId у каждой записи).
async function loadNotes() {
  let data = await readJsonSafe(NOTES_DB, null);
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data;
  }

  // notes.json ещё нет — пробуем смигрировать старый reminders.json
  const legacy = await readJsonSafe(LEGACY_REMINDERS_DB, null);
  const migrated = {};
  if (Array.isArray(legacy)) {
    for (const r of legacy) {
      const uid = String(r.userId);
      if (!migrated[uid]) migrated[uid] = [];
      migrated[uid].push({
        id: r.id || crypto.randomUUID(),
        text: r.text || r.title || '',
        createdAt: r.createdAt || new Date().toISOString(),
        remindAt: r.datetime || null,
        active: r.active !== undefined ? Boolean(r.active) : Boolean(r.datetime),
        sent: Boolean(r.sent),
      });
    }
  }
  return migrated;
}

// save_notes(): атомарная запись всего кэша на диск.
async function saveNotes() {
  await atomicWriteJson(NOTES_DB, notesCache);
}

// get_user_notes(): заметки одного пользователя из кэша (без диска).
function getUserNotes(userId) {
  const key = String(userId);
  if (!notesCache[key]) notesCache[key] = [];
  return notesCache[key];
}

async function loadSettings() {
  const data = await readJsonSafe(SETTINGS_DB, {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

async function saveSettingsToDisk() {
  await atomicWriteJson(SETTINGS_DB, settingsCache);
}

function defaultStyleSettings() {
  return {
    bg: '#0d0d0d', card: '#151515', surface: '#1a1a1a',
    accent: '#ff3333', accentHover: '#ff5555',
    text: '#e0e0e0', muted: '#888888', border: '#333333',
    radius: '14', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    transition: '0.35s', glass: false, blur: '12',
    snoozeMinutes: DEFAULT_SNOOZE_MINUTES,
  };
}

function getUserSettings(userId) {
  const key = String(userId);
  const saved = settingsCache[key] || {};
  return { ...defaultStyleSettings(), ...saved };
}

async function loadUsers() {
  const data = await readJsonSafe(USERS_DB, []);
  return Array.isArray(data) ? data : [];
}

async function saveUsersToDisk() {
  await atomicWriteJson(USERS_DB, usersCache);
}

function rememberUser(user) {
  if (usersIndex.has(user.id)) return;
  usersIndex.add(user.id);
  usersCache.push({
    id: user.id,
    first_name: user.first_name,
    username: user.username || '',
    createdAt: new Date().toISOString(),
  });
  // Не блокируем ответ на запись — фиксируем в фоне.
  saveUsersToDisk().catch((e) => console.error('saveUsers error', e));
}

async function initStorage() {
  await ensureDataDir();
  notesCache = await loadNotes();
  settingsCache = await loadSettings();
  usersCache = await loadUsers();
  usersIndex = new Set(usersCache.map((u) => u.id));
  // Если только что смигрировали со старого формата — сразу сохраним
  // в новом файле, чтобы notes.json точно существовал на диске.
  if (!fs.existsSync(NOTES_DB)) await saveNotes();
  if (!fs.existsSync(SETTINGS_DB)) await saveSettingsToDisk();
  if (!fs.existsSync(USERS_DB)) await saveUsersToDisk();
}

function validateTelegramWebAppData(initData) {
  if (!BOT_TOKEN || !initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculated = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (calculated !== hash) return null;
    const userStr = params.get('user');
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

// Casefold-эквивалент для регистронезависимого поиска (пункт 4).
function casefold(s) {
  return String(s || '').toLocaleLowerCase('ru-RU');
}

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(WEB_DIR));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function getUser(req) {
  const initData = req.headers['x-telegram-init-data'] || req.body?.initData || '';
  let user = validateTelegramWebAppData(initData);
  if (!user && process.env.ALLOW_MOCK === '1') {
    user = { id: 123456789, first_name: 'Test', last_name: 'User', username: 'testuser' };
  }
  return user;
}

function serializeNote(n) {
  return {
    id: n.id,
    text: n.text,
    title: (n.text || '').split('\n')[0].slice(0, 80) || 'Без текста',
    createdAt: n.createdAt,
    remindAt: n.remindAt,
    active: n.active,
    sent: n.sent,
  };
}

// ─── API: Заметки ───────────────────────────────────────────────

app.get('/api/notes', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: TEXTS.errUnauthorized });

  const list = getUserNotes(user.id)
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(serializeNote);
  res.json(list);
});

app.get('/api/notes/search', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: TEXTS.errUnauthorized });

  const q = casefold(req.query.q || '');
  const all = getUserNotes(user.id);
  const results = q
    ? all.filter((n) => casefold(n.text).includes(q))
    : [];
  res.json(results.map(serializeNote));
});

app.post('/api/notes', async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: TEXTS.errUnauthorized });

  const { text, remindAt } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: TEXTS.errTextRequired });
  }

  const note = {
    id: crypto.randomUUID(),
    text: String(text).slice(0, 2000),
    createdAt: new Date().toISOString(),
    remindAt: remindAt ? new Date(remindAt).toISOString() : null,
    active: Boolean(remindAt),
    sent: false,
  };
  getUserNotes(user.id).push(note);

  rememberUser(user);
  try {
    await saveNotes();
  } catch (e) {
    console.error('saveNotes error', e);
    return res.status(500).json({ error: 'save failed' });
  }
  res.status(201).json(serializeNote(note));
});

app.put('/api/notes/:id', async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: TEXTS.errUnauthorized });

  const list = getUserNotes(user.id);
  const note = list.find((n) => n.id === req.params.id);
  if (!note) return res.status(404).json({ error: TEXTS.errNotFound });

  const { text, remindAt, active } = req.body || {};
  if (text !== undefined) note.text = String(text).slice(0, 2000);
  if (remindAt !== undefined) {
    note.remindAt = remindAt ? new Date(remindAt).toISOString() : null;
    note.sent = false;
    note.active = Boolean(remindAt);
  }
  if (active !== undefined) note.active = Boolean(active);

  try {
    await saveNotes();
  } catch (e) {
    console.error('saveNotes error', e);
    return res.status(500).json({ error: 'save failed' });
  }
  res.json(serializeNote(note));
});

app.delete('/api/notes/:id', async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: TEXTS.errUnauthorized });

  const list = getUserNotes(user.id);
  const idx = list.findIndex((n) => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: TEXTS.errNotFound });
  list.splice(idx, 1);

  try {
    await saveNotes();
  } catch (e) {
    console.error('saveNotes error', e);
    return res.status(500).json({ error: 'save failed' });
  }
  res.json({ ok: true });
});

// ─── API: Настройки (стиль + время переноса, пункт 7) ───────────

app.get('/api/settings', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: TEXTS.errUnauthorized });
  res.json(getUserSettings(user.id));
});

app.post('/api/settings', async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: TEXTS.errUnauthorized });

  const allowed = [
    'bg', 'card', 'surface', 'accent', 'accentHover', 'text', 'muted',
    'border', 'radius', 'fontFamily', 'transition', 'glass', 'blur',
    'snoozeMinutes',
  ];
  const incoming = req.body || {};
  const clean = {};
  allowed.forEach((k) => {
    if (incoming[k] === undefined) return;
    if (k === 'snoozeMinutes') {
      const n = Number(incoming[k]);
      clean[k] = Number.isFinite(n) && n > 0 && n <= 1440 ? Math.round(n) : DEFAULT_SNOOZE_MINUTES;
    } else {
      clean[k] = incoming[k];
    }
  });

  const key = String(user.id);
  settingsCache[key] = { ...(settingsCache[key] || {}), ...clean };

  try {
    await saveSettingsToDisk();
  } catch (e) {
    console.error('saveSettings error', e);
    return res.status(500).json({ error: 'save failed' });
  }
  res.json(getUserSettings(user.id));
});

app.get('/api/snooze-options', (req, res) => {
  res.json({ options: SNOOZE_OPTIONS, default: DEFAULT_SNOOZE_MINUTES });
});

// ─── Telegram Bot: webhook и отправка сообщений ──────────────────

async function tgApi(method, payload) {
  if (!BOT_TOKEN) {
    console.log(`[MOCK ${method}]`, JSON.stringify(payload));
    return { ok: true, mock: true };
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await r.json();
  } catch (e) {
    console.error(`${method} error`, e);
    return { ok: false, error: e.message };
  }
}

function sendTelegramMessage(chatId, text, extra = {}) {
  return tgApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

function answerCallbackQuery(id, text, showAlert = false) {
  return tgApi('answerCallbackQuery', { callback_query_id: id, text, show_alert: showAlert });
}

function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
  return tgApi('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}

function buildReminderUrl(noteId) {
  if (!MINIAPP_URL) return null;
  const sep = MINIAPP_URL.includes('?') ? '&' : '?';
  return `${MINIAPP_URL}${sep}note=${encodeURIComponent(noteId)}&reschedule=1`;
}

// Кнопка «Отложить на N мин» — N берётся из настроек конкретного
// пользователя (пункт 7).
function buildReminderKeyboard(userId, noteId) {
  const mins = getUserSettings(userId).snoozeMinutes;
  return {
    inline_keyboard: [[
      { text: TEXTS.snoozeButtonLabel(mins), callback_data: `snooze:${userId}:${noteId}` },
    ]],
  };
}

async function handleCallbackQuery(cq) {
  const data = String(cq.data || '');
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;

  try {
    if (data === 'noop') {
      await answerCallbackQuery(cq.id, TEXTS.snoozeAgainToast);
      return;
    }

    if (data.startsWith('snooze:')) {
      const [, userId, noteId] = data.split(':');
      const note = getUserNotes(userId).find((n) => n.id === noteId);

      if (!note) {
        await answerCallbackQuery(cq.id, TEXTS.noteNotFoundToast, true);
        return;
      }

      const mins = getUserSettings(userId).snoozeMinutes;
      const newDue = new Date(Date.now() + mins * 60 * 1000);
      note.remindAt = newDue.toISOString();
      note.sent = false;
      note.active = true;
      await saveNotes();

      // Ставим галочку на кнопке и делаем её неактивной (пункт 7):
      // меняем текст на "Отложено на N мин" и заменяем callback_data
      // на инертный 'noop', чтобы повторное нажатие ничего не делало.
      if (chatId && messageId) {
        await editMessageReplyMarkup(chatId, messageId, {
          inline_keyboard: [[{ text: TEXTS.snoozedButtonLabel(mins), callback_data: 'noop' }]],
        });
      }

      await answerCallbackQuery(cq.id, TEXTS.snoozeToast(mins));
      return;
    }

    if (data.startsWith('reschedule_info:')) {
      await answerCallbackQuery(cq.id, TEXTS.botRescheduleHint, true);
      return;
    }

    await answerCallbackQuery(cq.id);
  } catch (e) {
    console.error('handleCallbackQuery error', e);
    try { await answerCallbackQuery(cq.id, TEXTS.genericErrorToast, true); } catch (_) {}
  }
}

app.post('/tg/webhook', async (req, res) => {
  res.sendStatus(200); // отвечаем Telegram сразу, обработка — ниже

  const update = req.body;
  if (!update) return;

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  if (update.message && update.message.text) {
    const text = update.message.text.trim();
    const chatId = update.message.chat.id;
    if (text.startsWith('/start')) {
      const keyboard = MINIAPP_URL
        ? { reply_markup: { inline_keyboard: [[{ text: TEXTS.botOpenAppBtn, web_app: { url: MINIAPP_URL } }]] } }
        : {};
      await sendTelegramMessage(chatId, TEXTS.botGreeting, keyboard);
    }
  }
});

async function setupWebhook() {
  if (!BOT_TOKEN || !PUBLIC_URL) {
    console.log('BOT_TOKEN или PUBLIC_URL не заданы — webhook не регистрируется (локальный/mock режим).');
    return;
  }
  const webhookUrl = `${PUBLIC_URL}/tg/webhook`;
  const data = await tgApi('setWebhook', { url: webhookUrl });
  console.log('Webhook setup:', data.ok ? 'OK -> ' + webhookUrl : data);
}

// ─── Планировщик: проверка просроченных напоминаний раз в минуту ─
// Пункт 2 (оптимизация): читаем due-заметки из уже загруженного в
// память кэша, а не с диска — на диск пишем только если что-то
// реально изменилось за проход.
cron.schedule('* * * * *', async () => {
  const now = new Date();
  let changed = false;

  for (const userId of Object.keys(notesCache)) {
    for (const note of notesCache[userId]) {
      if (!note.active || note.sent || !note.remindAt) continue;
      const due = new Date(note.remindAt);
      if (due <= now) {
        const msg = `${TEXTS.reminderPrefix}\n\n${escapeHtml(note.text)}`;
        await sendTelegramMessage(userId, msg, { reply_markup: buildReminderKeyboard(userId, note.id) });
        note.sent = true;
        note.active = false;
        changed = true;
      }
    }
  }
  if (changed) {
    try {
      await saveNotes();
    } catch (e) {
      console.error('saveNotes (cron) error', e);
    }
  }
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(WEB_DIR, 'index.html'));
});

// Start
initStorage()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\nБлокнот заметок запущен: http://localhost:${PORT}`);
      console.log(`   Заметки: ${NOTES_DB}`);
      console.log(`   Настройки: ${SETTINGS_DB}`);
      if (process.env.ALLOW_MOCK === '1') console.log('   MOCK режим включён (авторизация Telegram не требуется)');
      setupWebhook();
    });
  })
  .catch((e) => {
    console.error('Не удалось инициализировать хранилище:', e);
    process.exit(1);
  });
