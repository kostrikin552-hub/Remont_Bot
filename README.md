# Remont_Bot — Платформа для строительных компаний: Мастер-бот + Mini App + FastAPI

Программный комплекс для строительных и ремонтно-отделочных компаний и прорабов:
- **FastAPI Бэкенд (`backend/`)**: Обслуживание Мастер-бота платформы, автоматическое подключение ботов строительных бригад, вебхуки и прием лидов.
- **Telegram Mini App (`src/`)**: Интерактивный калькулятор ремонта в нативном стиле iOS / Telegram (React 19, TypeScript, Vite, Tailwind CSS, Supabase, Haptic Feedback).
- **Мастер-бот платформы**: FSM-регистрация прораба за 2 минуты (название, город, токен @BotFather) с автонастройкой кнопки `setChatMenuButton` и вебхука.
- **Мультитенантность**: Динамическая подгрузка бренда, контактов, городов и прайс-листов для разных компаний из Supabase по `company_id`.
- **Соответствие 152-ФЗ РФ**: Обязательный чекбокс согласия и встроенная Политика конфиденциальности.

---

## 📁 Структура репозитория

```
├── backend/                   # FastAPI бэкенд + aiogram 3 (Мастер-бот и Webhook движок)
│   ├── config.py              # Загрузка и валидация переменных окружения
│   ├── main.py                # FastAPI приложение, FSM мастер-бота, эндпоинты /webhook и /api/leads
│   ├── Dockerfile             # Docker-образ Python 3.11-slim для Render / Cloud Run
│   ├── requirements.txt       # Зависимости Python (FastAPI, aiogram, Supabase, httpx)
│   └── .env.example           # Шаблон конфигурации бэкенда
├── bot/                       # Автономный клиентский Telegram бот (aiogram 3)
│   ├── main.py                # Обработка /start, WebAppData и команд
│   ├── requirements.txt       # Зависимости Python
│   └── .env.example           # Пример конфигурации
├── src/                       # Исходный код Telegram Mini App (React 19 + TypeScript)
│   ├── components/            # UI компоненты (Header, Slider, Cards, Modals и др.)
│   ├── lib/
│   │   └── supabase.ts        # Клиент Supabase, fallback-логика, отправка лидов на бэкенд
│   ├── utils/
│   │   └── telegram.ts        # Telegram WebApp SDK хелперы, Haptic Feedback
│   ├── types.ts               # TypeScript типы
│   ├── App.tsx                # Главный контейнер приложения
│   └── main.tsx               # Монтирование React приложения
├── supabase_schema.sql        # SQL DDL схема таблиц companies, pricing_rules, leads для Supabase
├── index.html                 # HTML точка входа с Telegram WebApp SDK
├── package.json               # Зависимости Node.js
└── vite.config.ts             # Конфигурация Vite
```

---

## ⚙️ Архитектура бэкенда (`backend/`)

### 1. Мастер-бот платформы (FSM для прорабов)
- При команде `/start` запускается сценарий создания бота:
  1. Запрос названия компании/бригады.
  2. Запрос города работы.
  3. Запрос API-токена бота от `@BotFather`.
- При получении токена:
  1. Проверяет токен через `getMe`.
  2. Сохраняет компанию в Supabase (`admin_chat_id = message.from_user.id`).
  3. Автоматически настраивает кнопку меню нового бота через `setChatMenuButton`:
     `web_app: {"url": f"{MINI_APP_URL}?company_id={company_id}"}`.
  4. Устанавливает вебхук для клиентского бота на `{BASE_WEBHOOK_URL}/webhook/{company_id}`.
  5. Отправляет прорабу поздравление со ссылкой на его готового бота.

### 2. Вебхук клиентских ботов: `POST /webhook/{company_id}`
- При команде `/start` клиенту высылается приветствие и кнопка «Рассчитать стоимость ремонта» с персональным `company_id`.

### 3. Прием лидов из Mini App: `POST /api/leads`
- Сохраняет расчет в Supabase (`leads`).
- Находит `admin_chat_id` прораба и отправляет моментальное сообщение в Telegram с контактами, площадью, сметой и кнопками:
  `[📞 Позвонить]` и `[💬 Открыть чат в TG]`.

---

## 🚀 Деплой бэкенда на Render (Docker)

1. Создайте **Web Service** на [Render.com](https://render.com).
2. Подключите репозиторий `kostrikin552-hub/Remont_Bot`.
3. В настройках:
   - **Environment**: Docker
   - **Docker Context**: `.`
   - **Dockerfile Path**: `backend/Dockerfile`
4. Добавьте переменные окружения:
   - `SUPABASE_URL`: URL проекта Supabase
   - `SUPABASE_SERVICE_ROLE_KEY`: Service role ключ из Supabase (Settings -> API)
   - `MASTER_BOT_TOKEN`: токен главного бота платформы от @BotFather
   - `BASE_WEBHOOK_URL`: `https://ваш-сервис.onrender.com`
   - `MINI_APP_URL`: URL опубликованного фронтенда Mini App
   - `PORT`: `10000`

---

## 🗄 Настройка Supabase

Выполните скрипт `supabase_schema.sql` в **SQL Editor** Supabase. Он создает таблицы:
- `companies`: ID компании, название, город, телефон, `admin_chat_id`, `bot_token`, `bot_username`.
- `pricing_rules`: индивидуальные расценки за м² для каждого тарифа и доп. опций.
- `leads`: данные клиентов, смета, контакты и согласие с 152-ФЗ.
