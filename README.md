# 📝 Reminders — Telegram Mini App (Блокнот напоминаний)

Мини-приложение для Telegram: красивый блокнот напоминаний с планировщиком и полной настройкой стиля.

## Возможности

- Создание, редактирование и удаление напоминаний
- Бот отправляет сообщение в указанное время (проверка каждую минуту)
- К каждому отправленному напоминанию бот прикрепляет 2 кнопки:
  - **🔁 Через 25 минут** — отправит то же напоминание повторно через 25 минут
  - **🕐 Изменить время** — открывает Mini App сразу на редактировании этого напоминания
- Данные (напоминания, пользователи, стиль) хранятся в JSON-файлах в `Data/` и переживают перезапуск сервера
- Полностью кастомные color-picker и date/time-picker (без системных диалогов браузера/ОС)
- Плавный современный UI (тёмная тема, анимации, glass-эффект)
- **Настройки стиля**: цвета, скругление, скорость анимаций, шрифт, пресеты
- Работает как Telegram Mini App + локально в браузере (mock-режим)

## Структура

```
├── server.js          # Node.js (Express) backend + scheduler — единственная точка входа
├── Dockerfile          # Node 20 / Debian slim образ
├── docker-compose.yml
├── .dockerignore
├── package.json
├── .env.example
├── Data/              # JSON-хранилище (монтируется как volume в Docker)
│   ├── reminders.json
│   ├── settings.json
│   └── users.json
└── Web/
    ├── index.html
    ├── css/style.css
    └── js/
        ├── pickers.js  # кастомные color/date-time пикеры
        └── app.js
```

## Быстрый старт (локально)

### Вариант 1 — напрямую через npm (рекомендуется)

```bash
cp .env.example .env
npm install
npm start
# или npm run dev — с автоперезапуском (node --watch)
```

Откройте http://localhost:3000  
С `ALLOW_MOCK=1` авторизация Telegram не требуется — можно тестировать всё сразу.

### Вариант 2 — Docker (Node 20 / Debian slim)

Образ собирается на `node:20-bookworm-slim`, запускается непривилегированным
пользователем `node`, использует `tini` как PID 1 и хранит данные в томе
`./Data`, который переживает пересборку и перезапуск контейнера.

```bash
cp .env.example .env
# при желании впишите BOT_TOKEN / PUBLIC_URL в .env

docker compose up -d --build
```

Откройте http://localhost:3000

Без docker-compose — напрямую через `docker`:

```bash
docker build -t telegram-reminders-miniapp .
docker run -d \
  --name reminders-miniapp \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  -v "$(pwd)/Data:/app/Data" \
  telegram-reminders-miniapp
```

Логи: `docker logs -f reminders-miniapp`. Остановить: `docker compose down` (или `docker stop reminders-miniapp`).

## Настройка Telegram-бота

1. Создайте бота у [@BotFather](https://t.me/BotFather)
2. Получите токен → впишите в `.env` как `BOT_TOKEN`
3. В BotFather: `/newapp` → укажите HTTPS-URL вашего сервера (например `https://your-domain.com`)
4. Укажите `PUBLIC_URL=https://your-domain.com` в `.env`
5. Перезапустите сервер — webhook зарегистрируется автоматически
6. Напишите боту `/start` — появится кнопка «Открыть блокнот»

> Кнопка «🕐 Изменить время» под напоминанием откроет Mini App только если
> задан `PUBLIC_URL` (или `MINIAPP_URL`) — без него бот покажет подсказку
> открыть блокнот вручную через `/start`. Кнопка «🔁 Через 25 минут»
> работает всегда, так как обрабатывается на сервере.

## API (кратко)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/reminders` | Список напоминаний текущего пользователя |
| POST | `/api/reminders` | Создать |
| PUT | `/api/reminders/:id` | Изменить |
| DELETE | `/api/reminders/:id` | Удалить |
| GET/POST | `/api/settings` | Получить / сохранить стиль |
| POST | `/tg/webhook` | Webhook Telegram |

Авторизация: заголовок `X-Telegram-Init-Data` (или mock-пользователь при `ALLOW_MOCK=1`).

## Стиль

В настройках (иконка шестерёнки) можно менять:

- Фон, карточки, акцент, текст, границы
- Скругление, скорость анимаций, blur
- Glass-эффект
- Шрифт
- Готовые пресеты: Тёмно-красный, Полночь, Изумруд, Фиолет, Океан, Светлый

Настройки сохраняются на сервере для каждого пользователя (в `Data/settings.json`).
Выбор цвета и даты/времени сделан через собственный UI (bottom-sheet с
кастомным color-picker и колёсиком часов/минут), а не через системные
диалоги браузера.

## Требования

- Node.js >= 20 (образ Docker — `node:20-bookworm-slim`)
- Docker + Docker Compose (для контейнерного запуска, вариант 2 — необязательно)
- Для продакшена: HTTPS + домен (Telegram Mini App)

---
Сделано в стиле примера FileHub (плавные анимации, тёмная тема, CSS-переменные).
