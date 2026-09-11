try { require('dotenv').config(); } catch (_) {}

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const PORT = Number(process.env.PORT || 3000);
const BASE_DIR = __dirname;
const WEB_DIR = path.join(BASE_DIR, 'Web');
const DATA_DIR = path.join(BASE_DIR, 'Data');

const REMINDERS_DB = path.join(DATA_DIR, 'reminders.json');
const SETTINGS_DB = path.join(DATA_DIR, 'settings.json');
const USERS_DB = path.join(DATA_DIR, 'users.json');
const TEXTS_FILE = path.join(BASE_DIR, 'texts.json');

const BOT_TOKEN = String(process.env.BOT_TOKEN || '').trim();
const PUBLIC_URL = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
const MINIAPP_URL = String(process.env.MINIAPP_URL || PUBLIC_URL).trim().replace(/\/+$/, '');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
['reminders.json', 'settings.json', 'users.json'].forEach(f => {
  const p = path.join(DATA_DIR, f);
  if (!fs.existsSync(p)) fs.writeFileSync(p, f === 'settings.json' ? '{}' : '[]', 'utf8');
});

let TEXTS = {};
try {
  TEXTS = JSON.parse(fs.readFileSync(TEXTS_FILE, 'utf8'));
} catch {
  TEXTS = { app: {}, bot: {} };
}

function tBot(key, vars = {}) {
  let s = (TEXTS.bot && TEXTS.bot[key]) || key;
  Object.entries(vars).forEach(([k, v]) => {
    s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(v));
  });
  return s;
}

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw || (Array.isArray(fallback) ? '[]' : '{}'));
    if (parsed === null || parsed === undefined) return fallback;
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
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
      .map(([k, v]) => k + '=' + v)
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

function getSnoozeMinutes(userId) {
  const all = readJson(SETTINGS_DB, {});
  const s = all[String(userId)] || {};
  const n = Number(s.snoozeMinutes);
  if (Number.isFinite(n) && n >= 1 && n <= 1440) return Math.round(n);
  return 30;
}

app.get('/api/texts', (_req, res) => {
  res.json(TEXTS);
});

app.get('/api/reminders', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const all = readJson(REMINDERS_DB, []);
  const list = all
    .filter(r => String(r.userId) === String(user.id))
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  res.json(list);
});

app.post('/api/reminders', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { title, text, datetime, active = true } = req.body || {};
  if (!title || !datetime) {
    return res.status(400).json({ error: 'title and datetime required' });
  }

  const all = readJson(REMINDERS_DB, []);
  const reminder = {
    id: crypto.randomUUID(),
    userId: user.id,
    title: String(title).slice(0, 120),
    text: String(text || '').slice(0, 1000),
    datetime: new Date(datetime).toISOString(),
    active: Boolean(active),
    sent: false,
    createdAt: new Date().toISOString()
  };
  all.push(reminder);
  writeJson(REMINDERS_DB, all);

  const users = readJson(USERS_DB, []);
  if (!users.find(u => String(u.id) === String(user.id))) {
    users.push({
      id: user.id,
      first_name: user.first_name,
      username: user.username || '',
      createdAt: new Date().toISOString()
    });
    writeJson(USERS_DB, users);
  }

  res.status(201).json(reminder);
});

app.put('/api/reminders/:id', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const all = readJson(REMINDERS_DB, []);
  const idx = all.findIndex(r => r.id === req.params.id && String(r.userId) === String(user.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const { title, text, datetime, active } = req.body || {};
  if (title !== undefined) all[idx].title = String(title).slice(0, 120);
  if (text !== undefined) all[idx].text = String(text).slice(0, 1000);
  if (datetime !== undefined) {
    all[idx].datetime = new Date(datetime).toISOString();
    all[idx].sent = false;
  }
  if (active !== undefined) all[idx].active = Boolean(active);

  writeJson(REMINDERS_DB, all);
  res.json(all[idx]);
});

app.delete('/api/reminders/:id', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  let all = readJson(REMINDERS_DB, []);
  const before = all.length;
  all = all.filter(r => !(r.id === req.params.id && String(r.userId) === String(user.id)));
  if (all.length === before) return res.status(404).json({ error: 'Not found' });
  writeJson(REMINDERS_DB, all);
  res.json({ ok: true });
});

const SETTINGS_DEFAULTS = {
  bg: '#0d0d0d',
  card: '#151515',
  surface: '#1a1a1a',
  accent: '#ff3333',
  accentHover: '#ff5555',
  text: '#e0e0e0',
  muted: '#888888',
  border: '#333333',
  radius: '14',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  transition: '0.35',
  glass: false,
  blur: '12',
  snoozeMinutes: 30
};

const SETTINGS_ALLOWED = [
  'bg', 'card', 'surface', 'accent', 'accentHover', 'text', 'muted',
  'border', 'radius', 'fontFamily', 'transition', 'glass', 'blur', 'snoozeMinutes'
];

app.get('/api/settings', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const all = readJson(SETTINGS_DB, {});
  const userSettings = all[String(user.id)] || {};
  res.json({ ...SETTINGS_DEFAULTS, ...userSettings });
});

app.post('/api/settings', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const all = readJson(SETTINGS_DB, {});
  const incoming = req.body || {};
  const clean = {};
  SETTINGS_ALLOWED.forEach(k => {
    if (incoming[k] !== undefined) {
      if (k === 'snoozeMinutes') {
        const n = Number(incoming[k]);
        clean[k] = Number.isFinite(n) ? Math.min(1440, Math.max(1, Math.round(n))) : 30;
      } else {
        clean[k] = incoming[k];
      }
    }
  });
  all[String(user.id)] = { ...(all[String(user.id)] || {}), ...clean };
  writeJson(SETTINGS_DB, all);
  res.json({ ...SETTINGS_DEFAULTS, ...all[String(user.id)] });
});

async function tgApi(method, body) {
  if (!BOT_TOKEN) {
    console.log('[MOCK TG]', method, JSON.stringify(body));
    return { ok: true, mock: true };
  }
  try {
    const r = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/' + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!data.ok) console.error('TG API error', method, data);
    return data;
  } catch (e) {
    console.error(method, e.message);
    return { ok: false, error: e.message };
  }
}

async function sendTelegramMessage(chatId, text, extra = {}) {
  return tgApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...extra
  });
}

async function answerCallbackQuery(id, text, showAlert = false) {
  return tgApi('answerCallbackQuery', {
    callback_query_id: id,
    text: text || '',
    show_alert: showAlert
  });
}

async function editMessageReplyMarkup(chatId, messageId, inlineKeyboard) {
  return tgApi('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: inlineKeyboard }
  });
}

async function editMessageText(chatId, messageId, text, inlineKeyboard) {
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML'
  };
  if (inlineKeyboard) {
    body.reply_markup = { inline_keyboard: inlineKeyboard };
  }
  return tgApi('editMessageText', body);
}

function buildReminderUrl(reminderId) {
  if (!MINIAPP_URL) return null;
  const sep = MINIAPP_URL.includes('?') ? '&' : '?';
  return MINIAPP_URL + sep + 'reminder=' + encodeURIComponent(reminderId) + '&reschedule=1';
}

/** Returns inline_keyboard rows (not wrapped in reply_markup). */
function buildReminderKeyboardRows(reminderId, minutes, { snoozed = false } = {}) {
  const m = Math.max(1, Number(minutes) || 30);
  const rescheduleUrl = buildReminderUrl(reminderId);
  const secondButton = rescheduleUrl
    ? { text: tBot('rescheduleBtn'), web_app: { url: rescheduleUrl } }
    : { text: tBot('rescheduleBtn'), callback_data: 'reschedule_info:' + reminderId };

  const snoozeText = snoozed
    ? tBot('snoozeBtnDone', { minutes: m })
    : tBot('snoozeBtn', { minutes: m });

  const firstButton = snoozed
    ? { text: snoozeText, callback_data: 'snooze_done:' + reminderId }
    : { text: snoozeText, callback_data: 'snooze:' + reminderId + ':' + m };

  return [[firstButton, secondButton]];
}

async function handleCallbackQuery(cq) {
  const data = String(cq.data || '');
  const chatId = cq.message && cq.message.chat ? cq.message.chat.id : undefined;
  const messageId = cq.message ? cq.message.message_id : undefined;

  try {
    if (data.startsWith('snooze_done:')) {
      await answerCallbackQuery(cq.id, '✓ Уже перенесено');
      return;
    }

    // Format: snooze:<id>:<minutes>  OR legacy snooze:<id>
    if (data.startsWith('snooze:')) {
      const parts = data.split(':');
      const id = parts[1];
      let minutes = Number(parts[2]);

      const all = readJson(REMINDERS_DB, []);
      const idx = all.findIndex(r => r.id === id);

      if (idx === -1) {
        await answerCallbackQuery(cq.id, tBot('notFound'), true);
        return;
      }

      if (!Number.isFinite(minutes) || minutes < 1) {
        minutes = getSnoozeMinutes(all[idx].userId);
      }
      minutes = Math.min(1440, Math.max(1, Math.round(minutes)));

      const newDue = new Date(Date.now() + minutes * 60 * 1000);
      all[idx].datetime = newDue.toISOString();
      all[idx].sent = false;
      all[idx].active = true;
      writeJson(REMINDERS_DB, all);

      await answerCallbackQuery(cq.id, tBot('snoozeAnswer', { minutes }));

      // Перезаписываем исходное сообщение: новый текст + одна кнопка с галочкой
      if (chatId != null && messageId != null) {
        const rewritten = tBot('reminderBody', {
          title: escapeHtml(all[idx].title),
          text: escapeHtml(all[idx].text || ''),
          time: formatDate(newDue)
        }) + '\n\n<i>Повтор через ' + minutes + ' мин — ' + formatDate(newDue) + '</i>';

        const rows = [[
          {
            text: tBot('snoozeBtnDone', { minutes }),
            callback_data: 'snooze_done:' + id
          }
        ]];

        const editResult = await editMessageText(chatId, messageId, rewritten, rows);
        if (!editResult.ok) {
          console.error('editMessageText failed', editResult);
          // fallback: хотя бы клавиатуру обновить
          await editMessageReplyMarkup(chatId, messageId, rows);
        }
      }
      // Новое уведомление уйдёт автоматически через cron, когда наступит newDue
      return;
    }

    if (data.startsWith('reschedule_info:')) {
      await answerCallbackQuery(cq.id, tBot('rescheduleInfo'), true);
      return;
    }

    await answerCallbackQuery(cq.id);
  } catch (e) {
    console.error('handleCallbackQuery error', e);
    try { await answerCallbackQuery(cq.id, tBot('errorGeneric'), true); } catch (_) {}
  }
}

app.post('/tg/webhook', async (req, res) => {
  res.sendStatus(200);

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
        ? {
            reply_markup: {
              inline_keyboard: [[{ text: tBot('openNotebook'), web_app: { url: MINIAPP_URL } }]]
            }
          }
        : {};
      await sendTelegramMessage(chatId, tBot('start'), keyboard);
    }
  }
});

async function setupWebhook() {
  if (!BOT_TOKEN || !PUBLIC_URL) {
    console.log('⚠️  BOT_TOKEN or PUBLIC_URL not set — webhook not registered. Local/mock mode.');
    return;
  }
  const webhookUrl = PUBLIC_URL + '/tg/webhook';
  try {
    const data = await tgApi('setWebhook', { url: webhookUrl });
    console.log('Webhook setup:', data.ok ? 'OK → ' + webhookUrl : data);
  } catch (e) {
    console.error('Webhook setup failed', e.message);
  }
}

cron.schedule('* * * * *', async () => {
  const now = new Date();
  const all = readJson(REMINDERS_DB, []);
  let changed = false;

  for (const r of all) {
    if (!r.active || r.sent) continue;
    const due = new Date(r.datetime);
    if (due <= now) {
      const minutes = getSnoozeMinutes(r.userId);
      const msg = tBot('reminderBody', {
        title: escapeHtml(r.title),
        text: escapeHtml(r.text || ''),
        time: formatDate(due)
      });
      const result = await sendTelegramMessage(r.userId, msg, {
        reply_markup: { inline_keyboard: buildReminderKeyboardRows(r.id, minutes) }
      });
      if (result && result.ok === false) {
        console.error('Failed to send reminder', r.id, result);
        continue;
      }
      r.sent = true;
      r.active = false;
      changed = true;
      console.log('Sent reminder ' + r.id + ' to ' + r.userId + ' (snooze=' + minutes + 'm)');
    }
  }
  if (changed) writeJson(REMINDERS_DB, all);
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(d) {
  // Фиксированный формат и часовой пояс, чтобы время в сообщении
  // всегда совпадало с ожидаемым (не зависело от TZ сервера).
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d);

  const get = (type) => {
    const p = parts.find(x => x.type === type);
    return p ? p.value : '';
  };
  // DD.MM.YYYY HH:MM без запятой и лишних символов
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}

app.get('*', (req, res) => {
  res.sendFile(path.join(WEB_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log('\n🚀 Reminders Mini App running on http://localhost:' + PORT);
  console.log('   Data dir: ' + DATA_DIR);
  console.log('   Notes file: ' + REMINDERS_DB + ' (filtered by Telegram userId)');
  if (process.env.ALLOW_MOCK === '1') console.log('   MOCK mode enabled (no Telegram auth required)');
  setupWebhook();
});
