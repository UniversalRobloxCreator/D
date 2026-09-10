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

const BOT_TOKEN = String(process.env.BOT_TOKEN || '').trim();
const PUBLIC_URL = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
const MINIAPP_URL = String(process.env.MINIAPP_URL || PUBLIC_URL).trim().replace(/\/+$/, '');

// Ensure data directory and files exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
['reminders.json', 'settings.json', 'users.json'].forEach(f => {
  const p = path.join(DATA_DIR, f);
  if (!fs.existsSync(p)) fs.writeFileSync(p, f === 'settings.json' ? '{}' : '[]', 'utf8');
});

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
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
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

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(WEB_DIR));

// CORS for local testing
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Auth helper: extract user from header or body
function getUser(req) {
  const initData = req.headers['x-telegram-init-data'] || req.body?.initData || '';
  let user = validateTelegramWebAppData(initData);
  if (!user && process.env.ALLOW_MOCK === '1') {
    // Mock user for local testing without Telegram
    user = { id: 123456789, first_name: 'Test', last_name: 'User', username: 'testuser' };
  }
  return user;
}

// ─── API: Reminders ───────────────────────────────────────────

app.get('/api/reminders', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const all = readJson(REMINDERS_DB, []);
  const list = all.filter(r => r.userId === user.id).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
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

  // Save/update user
  const users = readJson(USERS_DB, []);
  if (!users.find(u => u.id === user.id)) {
    users.push({ id: user.id, first_name: user.first_name, username: user.username || '', createdAt: new Date().toISOString() });
    writeJson(USERS_DB, users);
  }

  res.status(201).json(reminder);
});

app.put('/api/reminders/:id', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const all = readJson(REMINDERS_DB, []);
  const idx = all.findIndex(r => r.id === req.params.id && r.userId === user.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const { title, text, datetime, active } = req.body || {};
  if (title !== undefined) all[idx].title = String(title).slice(0, 120);
  if (text !== undefined) all[idx].text = String(text).slice(0, 1000);
  if (datetime !== undefined) {
    all[idx].datetime = new Date(datetime).toISOString();
    all[idx].sent = false; // reset if time changed
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
  all = all.filter(r => !(r.id === req.params.id && r.userId === user.id));
  if (all.length === before) return res.status(404).json({ error: 'Not found' });
  writeJson(REMINDERS_DB, all);
  res.json({ ok: true });
});

// ─── API: Settings (style) ────────────────────────────────────

app.get('/api/settings', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const all = readJson(SETTINGS_DB, {});
  const defaults = {
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
    transition: '0.35s',
    glass: false,
    blur: '12'
  };
  const userSettings = all[String(user.id)] || {};
  res.json({ ...defaults, ...userSettings });
});

app.post('/api/settings', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const all = readJson(SETTINGS_DB, {});
  const allowed = [
    'bg', 'card', 'surface', 'accent', 'accentHover', 'text', 'muted',
    'border', 'radius', 'fontFamily', 'transition', 'glass', 'blur'
  ];
  const incoming = req.body || {};
  const clean = {};
  allowed.forEach(k => {
    if (incoming[k] !== undefined) clean[k] = incoming[k];
  });
  all[String(user.id)] = { ...(all[String(user.id)] || {}), ...clean };
  writeJson(SETTINGS_DB, all);
  res.json(all[String(user.id)]);
});

// ─── Telegram Bot: webhook & sending ──────────────────────────

async function sendTelegramMessage(chatId, text, extra = {}) {
  if (!BOT_TOKEN) {
    console.log('[MOCK SEND]', chatId, text, JSON.stringify(extra));
    return { ok: true, mock: true };
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...extra
  };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await r.json();
  } catch (e) {
    console.error('sendTelegramMessage error', e);
    return { ok: false, error: e.message };
  }
}

async function answerCallbackQuery(id, text, showAlert = false) {
  if (!BOT_TOKEN) {
    console.log('[MOCK ANSWER CB]', id, text);
    return { ok: true, mock: true };
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: id, text, show_alert: showAlert })
    });
    return await r.json();
  } catch (e) {
    console.error('answerCallbackQuery error', e);
    return { ok: false, error: e.message };
  }
}

// Builds the Mini App URL that opens directly on a given reminder,
// so the "Изменить время" button can jump straight to editing it.
function buildReminderUrl(reminderId) {
  if (!MINIAPP_URL) return null;
  const sep = MINIAPP_URL.includes('?') ? '&' : '?';
  return `${MINIAPP_URL}${sep}reminder=${encodeURIComponent(reminderId)}&reschedule=1`;
}

// Builds the pair of inline buttons attached to a sent reminder message:
// 1) snooze 25 minutes (handled entirely server-side via callback_query)
// 2) open the Mini App to pick a brand-new time for this reminder
function buildReminderKeyboard(reminderId) {
  const rescheduleUrl = buildReminderUrl(reminderId);
  const secondButton = rescheduleUrl
    ? { text: '🕐 Изменить время', web_app: { url: rescheduleUrl } }
    : { text: '🕐 Изменить время', callback_data: `reschedule_info:${reminderId}` };

  return {
    reply_markup: {
      inline_keyboard: [[
        { text: '🔁 Через 25 минут', callback_data: `snooze:${reminderId}` },
        secondButton
      ]]
    }
  };
}

async function handleCallbackQuery(cq) {
  const data = String(cq.data || '');
  const chatId = cq.message?.chat?.id;

  try {
    if (data.startsWith('snooze:')) {
      const id = data.slice('snooze:'.length);
      const all = readJson(REMINDERS_DB, []);
      const idx = all.findIndex(r => r.id === id);

      if (idx === -1) {
        await answerCallbackQuery(cq.id, 'Напоминание не найдено', true);
        return;
      }

      const newDue = new Date(Date.now() + 25 * 60 * 1000);
      all[idx].datetime = newDue.toISOString();
      all[idx].sent = false;
      all[idx].active = true;
      writeJson(REMINDERS_DB, all);

      await answerCallbackQuery(cq.id, '⏰ Отправлю через 25 минут');
      if (chatId) {
        await sendTelegramMessage(
          chatId,
          `🔁 Хорошо! Напомню про «${escapeHtml(all[idx].title)}» ещё раз в ${formatDate(newDue)}.`
        );
      }
      return;
    }

    if (data.startsWith('reschedule_info:')) {
      // No public Mini App URL is configured, so we can't open a web_app button.
      await answerCallbackQuery(cq.id, 'Откройте блокнот через /start, чтобы изменить время', true);
      return;
    }

    await answerCallbackQuery(cq.id);
  } catch (e) {
    console.error('handleCallbackQuery error', e);
    try { await answerCallbackQuery(cq.id, 'Ошибка, попробуйте ещё раз', true); } catch (_) {}
  }
}

app.post('/tg/webhook', async (req, res) => {
  res.sendStatus(200); // always ack quickly

  const update = req.body;
  if (!update) return;

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  // /start
  if (update.message && update.message.text) {
    const text = update.message.text.trim();
    const chatId = update.message.chat.id;
    if (text.startsWith('/start')) {
      const keyboard = MINIAPP_URL
        ? {
            reply_markup: {
              inline_keyboard: [[
                { text: '📝 Открыть блокнот', web_app: { url: MINIAPP_URL } }
              ]]
            }
          }
        : {};
      await sendTelegramMessage(
        chatId,
        '👋 Привет! Это мини-приложение <b>Reminders</b> — твой личный блокнот напоминаний.\n\nНажми кнопку ниже, чтобы открыть.',
        keyboard
      );
    }
  }
});

// Setup webhook on start (if PUBLIC_URL set)
async function setupWebhook() {
  if (!BOT_TOKEN || !PUBLIC_URL) {
    console.log('⚠️  BOT_TOKEN or PUBLIC_URL not set — webhook not registered. Local/mock mode.');
    return;
  }
  const webhookUrl = `${PUBLIC_URL}/tg/webhook`;
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl })
    });
    const data = await r.json();
    console.log('Webhook setup:', data.ok ? 'OK → ' + webhookUrl : data);
  } catch (e) {
    console.error('Webhook setup failed', e.message);
  }
}

// ─── Scheduler: check every minute for due reminders ──────────

cron.schedule('* * * * *', async () => {
  const now = new Date();
  const all = readJson(REMINDERS_DB, []);
  let changed = false;

  for (const r of all) {
    if (!r.active || r.sent) continue;
    const due = new Date(r.datetime);
    if (due <= now) {
      const msg = `⏰ <b>${escapeHtml(r.title)}</b>\n\n${escapeHtml(r.text || '')}\n\n<i>${formatDate(due)}</i>`;
      await sendTelegramMessage(r.userId, msg, buildReminderKeyboard(r.id));
      r.sent = true;
      r.active = false; // auto-disable after send
      changed = true;
      console.log(`Sent reminder ${r.id} to ${r.userId}`);
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
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(WEB_DIR, 'index.html'));
});

// Start
app.listen(PORT, () => {
  console.log(`\n🚀 Reminders Mini App running on http://localhost:${PORT}`);
  console.log(`   Data dir: ${DATA_DIR}`);
  if (process.env.ALLOW_MOCK === '1') console.log('   MOCK mode enabled (no Telegram auth required)');
  setupWebhook();
});
