"""
Бэкенд платформа на FastAPI + aiogram 3 для обслуживания Мастер-бота
и автоматического подключения ботов строительных компаний.
"""

import html
import logging
import os
import re
import sys
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

import httpx
from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandStart, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    Update,
    WebAppInfo,
)
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from supabase import Client, create_client

try:
    from backend.monetization import (
        DEFAULT_PLAN_ID,
        SUBSCRIPTION_PLANS,
        SUBSCRIPTION_PRICE,
        TRIAL_LEADS_COUNT,
        activate_subscription_for_company,
        check_and_consume_lead_access,
        create_payment_url,
        get_company_subscription,
        get_plan,
        mask_address,
        mask_client_name,
        mask_client_phone,
        save_company_subscription,
    )
except ImportError:
    from monetization import (
        DEFAULT_PLAN_ID,
        SUBSCRIPTION_PLANS,
        SUBSCRIPTION_PRICE,
        TRIAL_LEADS_COUNT,
        activate_subscription_for_company,
        check_and_consume_lead_access,
        create_payment_url,
        get_company_subscription,
        get_plan,
        mask_address,
        mask_client_name,
        mask_client_phone,
        save_company_subscription,
    )

try:
    from backend.config import (
        BASE_WEBHOOK_URL,
        BOTFATHER_GUIDE_VIDEO_ID,
        MASTER_BOT_TOKEN,
        MINI_APP_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_URL,
        SUPPORT_TELEGRAM_URL,
    )
except ImportError:
    from config import (
        BASE_WEBHOOK_URL,
        BOTFATHER_GUIDE_VIDEO_ID,
        MASTER_BOT_TOKEN,
        MINI_APP_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_URL,
        SUPPORT_TELEGRAM_URL,
    )

# ---------------------------------------------------------------------------
# Логирование
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("remont_backend")

# ---------------------------------------------------------------------------
# Инициализация Supabase клиента (с безопасным fallback)
# ---------------------------------------------------------------------------
supabase_client: Optional[Client] = None
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL.startswith("http"):
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        logger.info("Supabase клиент успешно подключен.")
    except Exception as e:
        logger.warning(f"Не удалось инициализировать Supabase: {e}")

# In-memory кэш компаний для быстродействия и демо-режима
COMPANIES_CACHE: Dict[str, Dict[str, Any]] = {
    "remont-pro": {
        "id": "remont-pro",
        "name": "РемонтПро",
        "city": "Москва и МО",
        "phone": "+7 (800) 555-35-35",
        "admin_chat_id": None,
        "bot_token": None,
        "secondary_coeff": 1.15,
        "status_text": "Работаем без предоплаты",
        "badge_text": "PRO",
        "logo_letter": "Р",
    }
}


def is_valid_uuid(val: Any) -> bool:
    if not val:
        return False
    return bool(re.match(r"^[0-9a-fA-F-]{36}$", str(val).strip()))


def find_company(identifier: str) -> Optional[Dict[str, Any]]:
    """
    Универсальный поиск компании:
    1. Поиск в кэше по slug / username / uuid
    2. Поиск в Supabase (по id если UUID, либо по bot_username)
    3. Fallback на демо РемонтПро
    """
    if not identifier:
        return None
    raw_key = identifier.strip()
    lower_key = raw_key.lower()

    # 1. Проверяем кэш
    for k in (lower_key, raw_key):
        if k in COMPANIES_CACHE:
            return COMPANIES_CACHE[k]

    # 2. Ищем в Supabase
    if supabase_client:
        try:
            if is_valid_uuid(raw_key):
                res = (
                    supabase_client.table("companies")
                    .select("*")
                    .eq("id", raw_key)
                    .maybe_single()
                    .execute()
                )
            else:
                res = (
                    supabase_client.table("companies")
                    .select("*")
                    .eq("bot_username", lower_key)
                    .maybe_single()
                    .execute()
                )
            if res and res.data:
                comp = res.data
                c_uuid = str(comp.get("id"))
                c_uname = (comp.get("bot_username") or "").lower()

                # Нормализуем объект компании
                comp["uuid"] = c_uuid
                comp["secondary_coeff"] = comp.get("secondary_coeff", 1.15)
                comp["status_text"] = comp.get("status_text", "Работаем без предоплаты")
                comp["badge_text"] = comp.get("badge_text", "PRO")
                comp["logo_letter"] = comp.get("logo_letter", (comp.get("name") or "Р")[0].upper())

                COMPANIES_CACHE[c_uuid] = comp
                if c_uname:
                    COMPANIES_CACHE[c_uname] = comp
                COMPANIES_CACHE[lower_key] = comp
                return comp
        except Exception as e:
            logger.error(f"Ошибка поиска компании '{identifier}' в Supabase: {e}")

    # 3. Fallback если запрашивался remont-pro
    if lower_key == "remont-pro":
        return COMPANIES_CACHE.get("remont-pro")

    return None

# ---------------------------------------------------------------------------
# FSM Состояния регистрации компании прорабом
# ---------------------------------------------------------------------------
class RegisterCompanyFSM(StatesGroup):
    company_name = State()
    city = State()
    bot_token = State()


# ---------------------------------------------------------------------------
# Инициализация Мастер-бота платформы (aiogram 3)
# ---------------------------------------------------------------------------
master_router = Router()
master_dp = Dispatcher(storage=MemoryStorage())
master_dp.include_router(master_router)

master_bot: Optional[Bot] = None
if MASTER_BOT_TOKEN:
    master_bot = Bot(
        token=MASTER_BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )


# ---------------------------------------------------------------------------
# Хэндлеры Мастер-бота (Команды и FSM)
# ---------------------------------------------------------------------------
def find_company_for_admin(admin_chat_id: int) -> Optional[Dict[str, Any]]:
    """Поиск компании по Telegram chat_id прораба"""
    for comp in list(COMPANIES_CACHE.values()):
        if comp.get("admin_chat_id") == admin_chat_id:
            return comp
    if supabase_client:
        try:
            res = (
                supabase_client.table("companies")
                .select("*")
                .eq("admin_chat_id", admin_chat_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if res and res.data:
                comp = res.data[0]
                COMPANIES_CACHE[comp["id"]] = comp
                if comp.get("bot_username"):
                    COMPANIES_CACHE[comp["bot_username"].lower()] = comp
                return comp
        except Exception as e:
            logger.error(f"Ошибка поиска компании для {admin_chat_id}: {e}")
    if "cuberlife_bot" in COMPANIES_CACHE:
        return COMPANIES_CACHE["cuberlife_bot"]
    return None


def get_subscription_keyboard(comp_id: str, comp_name: str, chat_id: int) -> InlineKeyboardMarkup:
    """Генерирует клавиатуру с кнопками для 3-х тарифов подписки"""
    _, url_1m = create_payment_url(comp_id, comp_name, chat_id, "1m")
    _, url_3m = create_payment_url(comp_id, comp_name, chat_id, "3m")
    _, url_1y = create_payment_url(comp_id, comp_name, chat_id, "1y")

    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="💳 1 месяц — 2 990 ₽", url=url_1m)],
            [InlineKeyboardButton(text="🔥 3 месяца — 7 990 ₽ (-11%)", url=url_3m)],
            [InlineKeyboardButton(text="💎 1 год — 24 990 ₽ (-30%)", url=url_1y)],
        ]
    )


# Регулярное выражение токена Telegram бота: 8-12 цифр, двоеточие, 35 символов ключа
TOKEN_REGEX = r"([0-9]{8,12}:[a-zA-Z0-9_-]{35})"


def get_botfather_guide_keyboard() -> InlineKeyboardMarkup:
    """Инлайн-кнопки для шага создания бота: прямая ссылка на @BotFather и связь с поддержкой"""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🤖 Открыть @BotFather",
                    url="https://t.me/BotFather",
                )
            ],
            [
                InlineKeyboardButton(
                    text="💬 Помощь специалиста",
                    url=SUPPORT_TELEGRAM_URL,
                )
            ],
        ]
    )


@master_router.message(Command("subscription"))
async def master_cmd_subscription(message: Message):
    """Кабинет управления подпиской строительной компании"""
    company = find_company_for_admin(message.from_user.id)
    if not company:
        await message.answer(
            "🏢 У вас пока нет зарегистрированной компании.\n"
            "Отправьте /start, чтобы создать персонального бота для приёма заявок!"
        )
        return

    comp_id = company.get("bot_username") or company.get("id") or "cuberlife_bot"
    comp_name = company.get("name") or "Ваша компания"
    sub_info = get_company_subscription(comp_id, company, supabase_client)
    is_active = sub_info.get("is_active", False)
    until = sub_info.get("subscription_until")
    days_left = sub_info.get("days_left", 0)

    trial_used = sub_info.get("trial_leads_used", 0)
    trial_left = max(0, 3 - trial_used)

    if is_active and until:
        until_dt = until.replace(tzinfo=timezone.utc) if until.tzinfo is None else until
        status_line = (
            f"🟢 <b>Статус: Подписка активна</b>\n"
            f"📅 Срок действия: до <b>{until_dt.strftime('%d.%m.%Y')}</b> (осталось {days_left} дн.)\n"
            f"🚀 <b>Приём заявок:</b> Без ограничений (все контакты клиентов открыты)."
        )
    elif trial_used < 3:
        status_line = (
            f"🎁 <b>Статус: Бесплатный триал (Usage-Based Freemium)</b>\n"
            f"📊 <b>Использовано заявок:</b> {trial_used} из 3\n"
            f"⚡️ <b>Осталось полных бесплатных заявок:</b> {trial_left}\n"
            f"💡 <i>Вам доступны 3 бесплатные заявки с полными контактами заказчиков. "
            f"Начиная с 4-й заявки контакты маскируются до оплаты подписки.</i>"
        )
    else:
        status_line = (
            "🔒 <b>Статус: 3 бесплатные заявки триала исчерпаны!</b>\n"
            "⚠️ Новые заявки клиентов поступают в замаскированном виде (+7 (999) ***-**-42).\n"
            "Для снятия маски со всех клиентов и получения прямых номеров оплатите подписку."
        )

    text = (
        f"🏢 <b>Компания:</b> {comp_name}\n"
        f"🤖 <b>Бот:</b> @{company.get('bot_username', comp_id)}\n\n"
        f"{status_line}\n\n"
        "<b>Тарифные планы для подключения / продления:</b>\n"
        "• <b>1 месяц</b> — 2 990 ₽ (базовый)\n"
        "• <b>3 месяца</b> — 7 990 ₽ (скидка 11%, экономия 980 ₽)\n"
        "• <b>1 год</b> — 24 990 ₽ (скидка 30%, экономия 10 890 ₽)\n\n"
        "Выберите тариф для моментальной активации бота:"
    )

    kb = get_subscription_keyboard(comp_id, comp_name, message.from_user.id)
    await message.answer(text, reply_markup=kb)


@master_router.message(Command("pay"))
async def master_cmd_pay(message: Message):
    """Генерация ссылок на оплату подписки (1 месяц, 3 месяца или 1 год)"""
    company = find_company_for_admin(message.from_user.id) or find_company("cuberlife_bot")
    comp_id = (company.get("bot_username") if company else None) or "cuberlife_bot"
    comp_name = (company.get("name") if company else None) or "Строительная компания"

    # Проверяем, указал ли пользователь конкретный тариф (/pay 3m или /pay 1y)
    args = (message.text or "").split()[1:]
    selected_plan = args[0].lower() if args and args[0].lower() in SUBSCRIPTION_PLANS else "1m"
    plan_info = get_plan(selected_plan)
    payment_id, pay_url = create_payment_url(comp_id, comp_name, message.from_user.id, selected_plan)

    text = (
        f"💳 <b>Оплата подписки РемонтПро</b>\n\n"
        f"🏢 Компания: <b>{comp_name}</b>\n"
        f"📦 Выбран тариф: <b>{plan_info['label']}</b>\n"
        f"⚡️ {plan_info['description']}\n\n"
        "После оплаты работа бота запускается мгновенно, "
        "а все скрытые заявки будут доставлены вам со всеми контактами заказчиков."
    )
    kb = get_subscription_keyboard(comp_id, comp_name, message.from_user.id)
    await message.answer(text, reply_markup=kb)


@master_router.message(Command("test_pay"))
async def master_cmd_test_pay(message: Message):
    """
    Секретная команда для тестирования: эмуляция успешной оплаты.
    Использование: /test_pay [1m|3m|1y] или /test_pay [company_id] [1m|3m|1y]
    """
    args = message.text.split()[1:] if message.text else []
    target_plan = "1m"
    target_comp = None

    for arg in args:
        lower_arg = arg.lower()
        if lower_arg in SUBSCRIPTION_PLANS:
            target_plan = lower_arg
        else:
            comp_candidate = find_company(arg)
            if comp_candidate:
                target_comp = comp_candidate

    if not target_comp:
        target_comp = find_company_for_admin(message.from_user.id)
    if not target_comp:
        target_comp = find_company("cuberlife_bot")

    comp_id = (target_comp.get("bot_username") if target_comp else None) or "cuberlife_bot"
    bot_token = target_comp.get("bot_token") if target_comp else None
    plan_info = get_plan(target_plan)

    res = await activate_subscription_for_company(
        company_id=comp_id,
        supabase_client=supabase_client,
        master_bot=master_bot,
        admin_chat_id=message.from_user.id,
        bot_token=bot_token,
        days=plan_info["duration_days"],
        plan_id=target_plan,
    )
    await message.answer(
        f"🧪 <b>[ТЕСТОВЫЙ РЕЖИМ ОПЛАТЫ]</b>\n"
        f"Успешная оплата сэмулирована для компании <b>{target_comp.get('name', comp_id)}</b>!\n\n"
        f"📦 <b>Тариф:</b> {plan_info['label']}\n"
        f"✅ <b>Подписка активна до:</b> {res.get('subscription_until')}\n"
        f"🚀 <b>Бот запущен и работает!</b>\n"
        f"🔓 <b>Разблокировано скрытых заявок:</b> {res.get('unlocked_leads', 0)}."
    )


@master_router.message(Command("newbot"))
@master_router.message(Command("register"))
async def master_cmd_newbot(message: Message, state: FSMContext):
    """Начало создания нового бота"""
    await state.clear()
    welcome_text = (
        "📍 <b>Шаг 1 из 3:</b> Введите название вашей компании или бригады\n"
        "<i>(например: «РемонтСтрой» или «Бригада Алексея»):</i>"
    )
    await message.answer(welcome_text)
    await state.set_state(RegisterCompanyFSM.company_name)


@master_router.message(CommandStart())
async def master_cmd_start(message: Message, state: FSMContext):
    """Приветствие прораба и меню управления ботом"""
    await state.clear()
    existing_comp = find_company_for_admin(message.from_user.id)
    if existing_comp and existing_comp.get("bot_username"):
        uname = existing_comp.get("bot_username")
        cname = existing_comp.get("name")
        sub_info = get_company_subscription(uname, existing_comp, supabase_client)
        is_active = sub_info.get("is_active", False)
        until = sub_info.get("subscription_until")

        trial_used = sub_info.get("trial_leads_used", 0)
        trial_left = max(0, 3 - trial_used)
        if is_active and until:
            until_dt = until.replace(tzinfo=timezone.utc) if until.tzinfo is None else until
            status_desc = f"🟢 Активна (до {until_dt.strftime('%d.%m.%Y')})"
        elif trial_used < 3:
            status_desc = f"🎁 <b>Бесплатный триал:</b> {trial_used}/3 использовано (осталось {trial_left})"
        else:
            status_desc = "🔒 <b>Триал 3 заявок исчерпан</b> (новые контакты маскируются до оплаты)"

        welcome_back = (
            f"👋 <b>С возвращением, {cname}!</b>\n\n"
            f"🤖 <b>Ваш бот:</b> @{uname}\n"
            f"📊 <b>Подписка:</b> {status_desc}\n\n"
            "<b>Доступные команды:</b>\n"
            "• /subscription — Кабинет подписки и выбор тарифов\n"
            "• /pay — Оплатить подписку (1 месяц, 3 месяца или 1 год)\n"
            "• /newbot — Подключить ещё одного бота"
        )
        kb = get_subscription_keyboard(uname, cname, message.from_user.id)
        await message.answer(welcome_back, reply_markup=kb)
        return

    welcome_text = (
        "👋 <b>Привет! Создадим персонального бота для ремонта за 2 минуты.</b>\n\n"
        "С помощью этого бота ваши клиенты смогут мгновенно рассчитывать стоимость ремонта, "
        "а вы будете получать горячие заявки с контактами прямо в этот чат.\n\n"
        "📍 <b>Шаг 1 из 3:</b> Введите название вашей компании или бригады\n"
        "<i>(например: «РемонтСтрой» или «Бригада Алексея»):</i>"
    )
    await message.answer(welcome_text)
    await state.set_state(RegisterCompanyFSM.company_name)


@master_router.callback_query(F.data == "btn_sub")
async def master_callback_sub(call):
    await call.answer()
    await master_cmd_subscription(call.message)


@master_router.callback_query(F.data == "btn_pay")
async def master_callback_pay(call):
    await call.answer()
    await master_cmd_pay(call.message)


@master_router.message(StateFilter(RegisterCompanyFSM.company_name), F.text)
async def master_process_name(message: Message, state: FSMContext):
    """Шаг 1: получение названия компании"""
    name = message.text.strip()
    if len(name) < 2:
        await message.answer("Пожалуйста, введите корректное название (минимум 2 символа):")
        return

    await state.update_data(company_name=name)
    await state.set_state(RegisterCompanyFSM.city)
    await message.answer(
        f"Отлично, «<b>{name}</b>»!\n\n"
        "📍 <b>Шаг 2 из 3:</b> Укажите ваш основной город работы\n"
        "<i>(например: «Москва и МО», «Санкт-Петербург» или «Казань»):</i>"
    )


@master_router.message(StateFilter(RegisterCompanyFSM.city), F.text)
async def master_process_city(message: Message, state: FSMContext):
    """Шаг 2: получение города и переход к привязке токена бота с видеоинструкцией и Deep-Link"""
    city = message.text.strip()
    if len(city) < 2:
        await message.answer("Пожалуйста, введите название города:")
        return

    await state.update_data(city=city)
    await state.set_state(RegisterCompanyFSM.bot_token)

    data = await state.get_data()
    company_name = data.get("company_name", "Ремонт")
    slug_suggestion = re.sub(r"[^a-zA-Z0-9_]", "", company_name.lower().replace(" ", "_")) or "my_remont"

    keyboard = get_botfather_guide_keyboard()
    caption_text = (
        "🎬 <b>Посмотрите 30-секундное видео выше.</b>\n\n"
        "Чтобы заявки и сметы приходили в ваш личный бот, нужен бесплатный токен от Telegram:\n\n"
        "1. Перейдите в @BotFather по кнопке ниже.\n"
        "2. Нажмите <b>Start</b> и отправьте команду <code>/newbot</code>.\n"
        f"3. Введите название бота (например: <i>Ремонт Квартир {city}</i>).\n"
        f"4. Введите юзернейм на латинице с окончанием на <code>bot</code> (например: <i>{slug_suggestion}_bot</i>).\n"
        "5. Скопируйте длинный ключ (<b>HTTP API Token</b>) и отправьте его сюда.\n\n"
        "💡 <i>Защита от ошибок:</i> вы можете скопировать всё сообщение от @BotFather целиком — система сама найдёт в нём токен!"
    )

    # Отправка видеоинструкции (если задан file_id видео или video_note)
    guide_video_id = BOTFATHER_GUIDE_VIDEO_ID or os.getenv("BOTFATHER_GUIDE_VIDEO_ID", "")
    video_sent = False
    if guide_video_id:
        try:
            await message.answer_video(
                video=guide_video_id,
                caption=caption_text,
                reply_markup=keyboard,
            )
            video_sent = True
        except Exception as e:
            logger.warning(f"Не удалось отправить видео по file_id '{guide_video_id}': {e}")

    if not video_sent:
        fallback_text = (
            "📍 <b>Шаг 3 из 3: Подключение вашего личного бота</b>\n\n"
            "Чтобы заявки и сметы приходили в ваш личный бот, нужен бесплатный токен от Telegram:\n\n"
            "1. Перейдите в официальный бот <b>@BotFather</b> по кнопке ниже.\n"
            "2. Нажмите <b>Start</b> и отправьте команду <code>/newbot</code>.\n"
            f"3. Введите название бота (например: <i>Ремонт Квартир {city}</i>).\n"
            f"4. Введите юзернейм на латинице с окончанием на <code>bot</code> (например: <i>{slug_suggestion}_bot</i>).\n"
            "5. Скопируйте полученный HTTP API токен и пришлите его сюда сообщением.\n\n"
            "💡 <i>Подсказка:</i> вы можете просто переслать или скопировать целиком всё сообщение от @BotFather — система сама найдёт в нём токен!"
        )
        await message.answer(fallback_text, reply_markup=keyboard)


@master_router.message(StateFilter(RegisterCompanyFSM.bot_token), F.text)
async def master_process_token(message: Message, state: FSMContext):
    """Шаг 3: валидация токена (Sanity Regex Parsing), создание компании, настройка WebApp кнопки и вебхука"""
    user_input = message.text.strip() if message.text else ""
    guide_kb = get_botfather_guide_keyboard()

    # 1. Попытка вычленить валидный токен через регулярное выражение (8-12 цифр + : + 35 символов)
    token_match = re.search(TOKEN_REGEX, user_input)

    if not token_match:
        # Проверяем типовые ошибки пользователя
        if "@" in user_input or "t.me/" in user_input or user_input.lower().endswith("bot"):
            await message.answer(
                "⚠️ <b>Вы прислали ссылку или юзернейм, а нужен секретный токен API.</b>\n\n"
                "Токен выглядит примерно так:\n"
                "<code>7123456789:AAHk1234567890abcdef1234567890abcde</code>\n\n"
                "1. Зайдите в диалог с <b>@BotFather</b> (кнопка ниже).\n"
                "2. Найдите сообщение от него со строкой <i>«Use this token to access the HTTP API:»</i>.\n"
                "3. Скопируйте длинный ключ (или перешлите всё сообщение целиком сюда).",
                reply_markup=guide_kb,
            )
            return
        else:
            await message.answer(
                "❌ <b>Не удалось распознать токен бота.</b>\n\n"
                "Токен Telegram-бота состоит из цифр, двоеточия и 35 символов ключа:\n"
                "<code>7123456789:AAHk1234567890abcdef1234567890abcde</code>\n\n"
                "Пожалуйста, скопируйте и пришлите сообщение от @BotFather целиком или посмотрите короткую инструкцию выше 👆",
                reply_markup=guide_kb,
            )
            return

    token_candidate = token_match.group(1).strip()

    # 2. Валидация токена через Telegram Bot API (getMe)
    checking_msg = await message.answer("⏳ Проверяем токен бота...")
    bot_info: Optional[Dict[str, Any]] = None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"https://api.telegram.org/bot{token_candidate}/getMe")
            data = resp.json()
            if data.get("ok") and data.get("result"):
                bot_info = data["result"]
    except Exception as e:
        logger.error(f"Ошибка проверки токена через API: {e}")

    if not bot_info:
        await checking_msg.edit_text(
            "❌ <b>Токен недействителен</b> или бот не найден в Telegram.\n\n"
            "Пожалуйста, перепроверьте токен в @BotFather (или создайте бота заново через <code>/newbot</code>) и отправьте токен снова:",
            reply_markup=guide_kb,
        )
        return

    bot_username = bot_info.get("username", "")
    data = await state.get_data()
    company_name = data.get("company_name", "Моя бригада")
    city = data.get("city", "Москва")
    admin_chat_id = message.from_user.id

    # Генерируем удобный slug на основе username бота
    clean_slug = re.sub(r"[^a-zA-Z0-9_-]", "", bot_username.lower())
    company_id = clean_slug if clean_slug else f"comp_{bot_info.get('id')}"

    # 2. Сохраняем компанию и расценки в Supabase (по схеме UUID)
    company_uuid = None
    if supabase_client:
        try:
            # Проверяем, есть ли уже компания с таким bot_username
            existing = (
                supabase_client.table("companies")
                .select("id")
                .eq("bot_username", bot_username.lower())
                .maybe_single()
                .execute()
            )
            company_row = {
                "name": company_name,
                "city": city,
                "phone": "+7 (800) 555-35-35",
                "admin_chat_id": admin_chat_id,
                "bot_token": token_candidate,
                "bot_username": bot_username.lower(),
                "is_active": True,
            }
            if existing and existing.data:
                company_uuid = str(existing.data.get("id"))
                supabase_client.table("companies").update(company_row).eq("id", company_uuid).execute()
                logger.info(f"Компания {bot_username} (UUID {company_uuid}) обновлена в Supabase.")
            else:
                ins_res = supabase_client.table("companies").insert(company_row).execute()
                if ins_res.data and len(ins_res.data) > 0:
                    company_uuid = str(ins_res.data[0].get("id"))
                logger.info(f"Компания {bot_username} (UUID {company_uuid}) создана в Supabase.")

            # Сохраняем расценки в pricing_rules с внешним ключом company_uuid
            if company_uuid:
                p_existing = (
                    supabase_client.table("pricing_rules")
                    .select("id")
                    .eq("company_id", company_uuid)
                    .maybe_single()
                    .execute()
                )
                pricing_row = {
                    "company_id": company_uuid,
                    "price_cosmetic": 4500,
                    "price_capital": 8500,
                    "price_designer": 15000,
                    "coef_secondary": 1.15,
                    "price_design_m2": 2000,
                    "price_demolition_m2": 1200,
                    "price_materials_m2": 3500,
                }
                if p_existing and p_existing.data:
                    supabase_client.table("pricing_rules").update(pricing_row).eq("company_id", company_uuid).execute()
                else:
                    supabase_client.table("pricing_rules").insert(pricing_row).execute()
                logger.info(f"Расценки для компании {bot_username} сохранены в Supabase.")
        except Exception as e:
            logger.error(f"Ошибка сохранения компании в Supabase: {e}")

    # Сохраняем в локальный кэш
    company_obj = {
        "id": company_uuid or company_id,
        "uuid": company_uuid,
        "slug": company_id,
        "name": company_name,
        "city": city,
        "phone": "+7 (800) 555-35-35",
        "admin_chat_id": admin_chat_id,
        "bot_token": token_candidate,
        "bot_username": bot_username.lower(),
        "secondary_coeff": 1.15,
        "status_text": "Работаем без предоплаты",
        "badge_text": "PRO",
        "logo_letter": company_name[0].upper() if company_name else "Р",
    }
    COMPANIES_CACHE[company_id] = company_obj
    COMPANIES_CACHE[bot_username.lower()] = company_obj
    if company_uuid:
        COMPANIES_CACHE[company_uuid] = company_obj

    # 3. Настройка кнопки меню чата (setChatMenuButton)
    app_url = f"{MINI_APP_URL}?company_id={company_id}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            menu_btn_payload = {
                "menu_button": {
                    "type": "web_app",
                    "text": "Рассчитать стоимость",
                    "web_app": {"url": app_url},
                }
            }
            menu_resp = await client.post(
                f"https://api.telegram.org/bot{token_candidate}/setChatMenuButton",
                json=menu_btn_payload,
            )
            logger.info(f"setChatMenuButton результат: {menu_resp.status_code}")
    except Exception as e:
        logger.warning(f"Не удалось настроить setChatMenuButton: {e}")

    # 4. Установка вебхука для клиентского бота
    webhook_url = f"{BASE_WEBHOOK_URL}/webhook/{company_id}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            wh_resp = await client.post(
                f"https://api.telegram.org/bot{token_candidate}/setWebhook",
                json={"url": webhook_url, "drop_pending_updates": True},
            )
            logger.info(f"setWebhook ({webhook_url}) результат: {wh_resp.json()}")
    except Exception as e:
        logger.warning(f"Не удалось установить вебхук для бота {bot_username}: {e}")

    await state.clear()

    # 5. Итоговое поздравление прорабу
    success_text = (
        f"🎉 <b>Поздравляем! Ваш личный бот готов к работе:</b> @{bot_username}\n\n"
        "✅ <b>Что настроено автоматически:</b>\n"
        f"• Кнопка меню в боте открывает калькулятор с брендом «{company_name}»\n"
        f"• Город: {city}\n"
        "• Все заявки от ваших клиентов будут мгновенно приходить сюда!\n\n"
        f"👉 Перейдите в вашего бота @{bot_username} и нажмите кнопку "
        "<b>«Рассчитать стоимость»</b>, чтобы протестировать калькулятор!"
    )
    await checking_msg.edit_text(success_text)


@master_router.message(StateFilter(RegisterCompanyFSM.bot_token))
async def master_process_token_non_text(message: Message, state: FSMContext):
    """Подсказка при отправке не-текстового сообщения (или парсинг токена из подписи к медиа)"""
    caption = message.caption or ""
    token_match = re.search(TOKEN_REGEX, caption)
    if token_match:
        message.text = token_match.group(1)
        await master_process_token(message, state)
        return

    await message.answer(
        "📝 Пожалуйста, отправьте текстовое сообщение с токеном или скопируйте текст сообщения из @BotFather целиком:",
        reply_markup=get_botfather_guide_keyboard(),
    )


@master_router.message(Command("set_guide_video"))
async def master_cmd_set_guide_video(message: Message):
    """Позволяет администратору обновить file_id видеоинструкции BotFather прямо из Telegram"""
    global BOTFATHER_GUIDE_VIDEO_ID
    file_id = None
    if message.video:
        file_id = message.video.file_id
    elif message.video_note:
        file_id = message.video_note.file_id
    elif message.reply_to_message:
        if message.reply_to_message.video:
            file_id = message.reply_to_message.video.file_id
        elif message.reply_to_message.video_note:
            file_id = message.reply_to_message.video_note.file_id

    args = (message.text or "").split()[1:]
    if not file_id and args:
        file_id = args[0].strip()

    if file_id:
        BOTFATHER_GUIDE_VIDEO_ID = file_id
        os.environ["BOTFATHER_GUIDE_VIDEO_ID"] = file_id
        logger.info(f"Обновлен BOTFATHER_GUIDE_VIDEO_ID: {file_id}")
        await message.answer(
            f"✅ <b>Видеоинструкция успешно сохранена!</b>\n\n"
            f"<code>file_id = \"{file_id}\"</code>\n\n"
            "Теперь это видео будет автоматически отправляться новым прорабам на шаге привязки токена."
        )
    else:
        await message.answer(
            "📹 <b>Как установить видеоинструкцию:</b>\n"
            "Отправьте видеоролик или видеосообщение с подписью <code>/set_guide_video</code> "
            "или ответьте командой <code>/set_guide_video</code> на видео/кружочек."
        )


# ---------------------------------------------------------------------------
# FastAPI Модели данных
# ---------------------------------------------------------------------------
class LeadCreateRequest(BaseModel):
    company_id: str = Field(default="remont-pro", description="ID компании/тенанта")
    name: str = Field(..., description="Имя заказчика")
    phone: str = Field(..., description="Контактный телефон")
    city: Optional[str] = Field(default="Москва и МО", description="Город объекта")
    area: float = Field(..., description="Площадь в м²")
    property_type: str = Field(default="new", description="new | secondary")
    renovation_class: str = Field(default="Капитальный", description="Тариф ремонта")
    price_min: float = Field(..., description="Минимальная стоимость вилки")
    price_max: float = Field(..., description="Максимальная стоимость вилки")
    total_base_cost: Optional[float] = Field(default=None)
    active_options: Optional[List[str]] = Field(default_factory=list)
    preferred_date: Optional[str] = Field(default="Завтра", description="Желаемая дата замера")
    communication: Optional[str] = Field(default="telegram", description="telegram | whatsapp | call")
    address: Optional[str] = Field(default=None, description="Адрес объекта или ЖК")
    comment: Optional[str] = Field(default=None)
    agreement_152fz: bool = Field(default=True)


# ---------------------------------------------------------------------------
# Жизненный цикл FastAPI (lifespan)
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Старт: настройка вебхука мастер-бота
    if master_bot and BASE_WEBHOOK_URL:
        master_webhook_url = f"{BASE_WEBHOOK_URL}/webhook/master"
        try:
            await master_bot.set_webhook(master_webhook_url, drop_pending_updates=True)
            logger.info(f"Вебхук Мастер-бота установлен на {master_webhook_url}")
        except Exception as e:
            logger.warning(f"Не удалось установить вебхук для Мастер-бота: {e}")

    yield

    # Завершение: удаление сессий
    if master_bot:
        try:
            await master_bot.session.close()
        except Exception:
            pass


app = FastAPI(
    title="Remont Platform API",
    description="Мастер-бот платформы и вебхуки для ботов строительных компаний",
    version="1.0.0",
    lifespan=lifespan,
)

# Разрешаем CORS для запросов из Telegram Mini App
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health-check
# ---------------------------------------------------------------------------
@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/favicon.ico")
async def favicon_endpoint():
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Вебхук Мастер-бота платформы: POST /webhook/master
# ---------------------------------------------------------------------------
@app.post("/webhook/master")
@app.post("/master-webhook")
async def master_webhook_endpoint(request: Request):
    if not master_bot:
        return Response(status_code=status.HTTP_200_OK)

    try:
        body = await request.json()
        update = Update(**body)
        await master_dp.feed_update(master_bot, update)
    except Exception as e:
        logger.error(f"Ошибка обработки обновления Мастер-бота: {e}")

    return Response(status_code=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Б. Обработчик вебхуков клиентских ботов: POST /webhook/{company_id}
# ---------------------------------------------------------------------------
@app.post("/webhook/{company_id}")
async def client_bot_webhook(company_id: str, request: Request):
    """
    Вебхук для индивидуальных ботов строительных компаний.
    Правило: если подписка истекла — бот полностью останавливается для клиентов!
    Прораб может просматривать статус (/subscription) и оплачивать тарифы.
    """
    try:
        body = await request.json()
    except Exception:
        return Response(status_code=status.HTTP_200_OK)

    # 1. Ищем данные компании через find_company
    company_data = find_company(company_id)
    bot_token = company_data.get("bot_token") if company_data else None
    if not bot_token:
        logger.warning(f"Бот-токен для компании {company_id} не найден.")
        return Response(status_code=status.HTTP_200_OK)

    callback_query = body.get("callback_query")
    message = body.get("message")
    if not message and not callback_query:
        return Response(status_code=status.HTTP_200_OK)

    if callback_query:
        chat_id = callback_query.get("message", {}).get("chat", {}).get("id")
        cb_msg_id = callback_query.get("message", {}).get("message_id")
        cb_data = callback_query.get("data", "")
        text = ""
        is_callback = True
    else:
        chat_id = message.get("chat", {}).get("id")
        cb_msg_id = None
        cb_data = ""
        text = (message.get("text") or "").strip()
        is_callback = False

    admin_chat_id = company_data.get("admin_chat_id")
    is_admin = bool(admin_chat_id and chat_id == admin_chat_id)

    # 2. Проверяем подписку компании
    sub_info = get_company_subscription(company_id, company_data, supabase_client)
    is_active = sub_info.get("is_active", False)
    until = sub_info.get("subscription_until")
    days_left = sub_info.get("days_left", 0)

    # Ссылки на 3 тарифа
    comp_name = company_data.get("name") or company_id
    _, url_1m = create_payment_url(company_id, comp_name, chat_id, "1m")
    _, url_3m = create_payment_url(company_id, comp_name, chat_id, "3m")
    _, url_1y = create_payment_url(company_id, comp_name, chat_id, "1y")

    subscription_keyboard = {
        "inline_keyboard": [
            [{"text": "💳 1 месяц — 2 990 ₽", "url": url_1m}],
            [{"text": "🔥 3 месяца — 7 990 ₽ (-11%)", "url": url_3m}],
            [{"text": "💎 1 год — 24 990 ₽ (-30%)", "url": url_1y}],
        ]
    }

    # Команда /test_pay (тестирование оплаты для прораба/админа)
    if text.startswith("/test_pay"):
        args = text.split()[1:]
        chosen_plan = args[0].lower() if args and args[0].lower() in SUBSCRIPTION_PLANS else "1m"
        plan_info = get_plan(chosen_plan)

        res = await activate_subscription_for_company(
            company_id=company_id,
            supabase_client=supabase_client,
            master_bot=master_bot,
            admin_chat_id=chat_id,
            bot_token=bot_token,
            days=plan_info["duration_days"],
            plan_id=chosen_plan,
        )
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": (
                            f"🧪 <b>[ТЕСТОВЫЙ РЕЖИМ ОПЛАТЫ]</b>\n"
                            f"Подписка успешно активирована на <b>{plan_info['name']}</b> (до {res.get('subscription_until')})!\n"
                            f"🚀 <b>Бот возобновил работу и принимает заявки!</b>\n"
                            f"🔓 Разблокировано лидов: {res.get('unlocked_leads', 0)}."
                        ),
                        "parse_mode": "HTML",
                    },
                )
        except Exception as e:
            logger.error(f"Ошибка отправки /test_pay в боте {company_id}: {e}")
        return Response(status_code=status.HTTP_200_OK)

    # Команда /subscription (кабинет подписки)
    if text == "/subscription":
        trial_used = sub_info.get("trial_leads_used", 0)
        trial_left = max(0, 3 - trial_used)
        if is_active and until:
            until_dt = until.replace(tzinfo=timezone.utc) if until.tzinfo is None else until
            status_desc = (
                f"🟢 <b>Статус: Подписка активна</b>\n"
                f"📅 Срок действия: до <b>{until_dt.strftime('%d.%m.%Y')}</b> (осталось {days_left} дн.)\n"
                f"🚀 <b>Приём заявок:</b> Без ограничений (все контакты клиентов открыты)."
            )
        elif trial_used < 3:
            status_desc = (
                f"🎁 <b>Статус: Бесплатный триал (Usage-Based Freemium)</b>\n"
                f"📊 <b>Использовано заявок:</b> {trial_used} из 3\n"
                f"⚡️ <b>Осталось полных бесплатных заявок:</b> {trial_left}\n"
                f"💡 <i>Первые 3 заявки приходят с полными номерами телефонов и адресами. "
                f"Заявка 4 и далее поступает в замаскированном виде до оплаты подписки.</i>"
            )
        else:
            status_desc = (
                "🔒 <b>Статус: 3 бесплатные заявки триала исчерпаны!</b>\n"
                "⚠️ Новые заявки поступают с замаскированными контактами (+7 (999) ***-**-42).\n"
                "Для снятия маски и получения прямых контактов клиентов выберите тариф:"
            )

        sub_text = (
            f"🏢 <b>Компания:</b> {comp_name}\n\n"
            f"{status_desc}\n\n"
            "<b>Тарифные планы:</b>\n"
            "• <b>1 месяц</b> — 2 990 ₽\n"
            "• <b>3 месяца</b> — 7 990 ₽ (-11%)\n"
            "• <b>1 год</b> — 24 990 ₽ (-30%)\n\n"
            "Выберите тариф для активации безлимитного доступа:"
        )
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": sub_text,
                        "parse_mode": "HTML",
                        "reply_markup": subscription_keyboard,
                    },
                )
        except Exception as e:
            logger.error(f"Ошибка отправки /subscription в боте {company_id}: {e}")
        return Response(status_code=status.HTTP_200_OK)

    # Команда /pay
    if text.startswith("/pay"):
        pay_text = (
            f"💳 <b>Оплата подписки РемонтПро</b>\n\n"
            f"🏢 Компания: <b>{comp_name}</b>\n"
            "Выберите желаемый период подписки:\n\n"
            "• <b>1 месяц</b> — 2 990 ₽\n"
            "• <b>3 месяца</b> — 7 990 ₽ (скидка 11%)\n"
            "• <b>1 год</b> — 24 990 ₽ (скидка 30%)\n\n"
            "После оплаты все заблокированные заявки мгновенно открываются."
        )
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": pay_text,
                        "parse_mode": "HTML",
                        "reply_markup": subscription_keyboard,
                    },
                )
        except Exception as e:
            logger.error(f"Ошибка отправки /pay в боте {company_id}: {e}")
        return Response(status_code=status.HTTP_200_OK)

    # -----------------------------------------------------------------------
    # Usage-Based Freemium: Клиенты (B2C) ВСЕГДА имеют доступ к калькулятору и смете!
    # Их опыт не ломается, заявки успешно сохраняются и рассчитываются.
    # -----------------------------------------------------------------------

    # -----------------------------------------------------------------------
    # ЕСЛИ ПОДПИСКА АКТИВНА: штатная работа бота для клиентов ЧЕРЕЗ КНОПКИ
    # -----------------------------------------------------------------------
    app_url = f"{MINI_APP_URL}?company_id={company_id}"
    company_name = company_data.get("name", "РемонтПро")
    company_city = company_data.get("city", "Москва и МО")
    company_phone = company_data.get("phone", "+7 (800) 555-35-35")

    # Постоянная Reply-клавиатура с кнопками для клиентов
    client_reply_kb = {
        "keyboard": [
            [{"text": "📱 Рассчитать смету онлайн", "web_app": {"url": app_url}}],
            [{"text": "📋 Прайс и смета работ"}, {"text": "📐 Бесплатный замер (0 ₽)"}],
            [{"text": "💬 Связаться с прорабом"}, {"text": "❓ Вопросы и гарантии"}],
        ],
        "resize_keyboard": True,
        "is_persistent": True,
    }

    # Инлайн-меню категорий сметы работ
    price_categories_inline_kb = {
        "inline_keyboard": [
            [
                {"text": "🧱 Демонтаж", "callback_data": "price_cat_demolition"},
                {"text": "📐 Стены и полы", "callback_data": "price_cat_rough"},
            ],
            [
                {"text": "⚡️ Электрика", "callback_data": "price_cat_eng"},
                {"text": "🚿 Сантехника", "callback_data": "price_cat_plumb"},
            ],
            [
                {"text": "🎨 Чистовая отделка", "callback_data": "price_cat_finish"},
                {"text": "📦 Черновые материалы", "callback_data": "price_cat_mat"},
            ],
            [
                {"text": "📱 Открыть интерактивную смету под мою площадь", "web_app": {"url": app_url}},
            ],
        ]
    }

    # 1. Обработка CallbackQuery (инлайн-кнопки категорий сметы)
    if is_callback and cb_data:
        response_text = ""
        cat_back_kb = {
            "inline_keyboard": [
                [{"text": "📱 Рассчитать под мою площадь (WebApp)", "web_app": {"url": app_url}}],
                [{"text": "⬅️ Назад к разделам", "callback_data": "btn_price_categories"}],
            ]
        }

        if cb_data == "btn_price_categories":
            response_text = (
                f"📋 <b>Официальный прайс-лист компании «{company_name}»</b>\n\n"
                "Выберите раздел сметы для просмотра фиксированных расценок:"
            )
            cat_back_kb = price_categories_inline_kb
        elif cb_data == "price_cat_demolition":
            response_text = (
                "🧱 <b>1. Демонтажные и подготовительные работы:</b>\n\n"
                "• Демонтаж обоев и краски: <b>140 ₽ / м²</b>\n"
                "• Снятие линолеума / ламината / плинтусов: <b>180 ₽ / м²</b>\n"
                "• Демонтаж цементной стяжки: <b>550 ₽ / м²</b>\n"
                "• Демонтаж перегородок: <b>450 ₽ / м²</b>\n"
                "• Сбор мусора в мешки, спуск и вывоз: <b>от 8 500 ₽ / рейс</b>\n\n"
                "<i>Все цены фиксируются в приложении к договору.</i>"
            )
        elif cb_data == "price_cat_rough":
            response_text = (
                "📐 <b>2. Черновые работы и геометрия (ГОСТ):</b>\n\n"
                "• Грунтовка глубокого проникновения (2 слоя): <b>85 ₽ / м²</b>\n"
                "• Штукатурка стен по маякам (углы 90°): <b>680 ₽ / м²</b>\n"
                "• Стяжка пола по маякам с армирующей фиброй: <b>580 ₽ / м²</b>\n"
                "• Наливной самонивелирующийся пол: <b>280 ₽ / м²</b>\n"
                "• Обмазочная гидроизоляция санузла с лентой: <b>480 ₽ / м²</b>\n\n"
                "<i>Лазерный контроль вертикалей и горизонталей.</i>"
            )
        elif cb_data == "price_cat_eng":
            response_text = (
                "⚡️ <b>3. Электромонтажные работы по ГОСТ:</b>\n\n"
                "• Прокладка кабеля ВВГнг-LS в негорючей гофре: <b>210 ₽ / пог. м</b>\n"
                "• Алмазное безударное высверливание подрозетника: <b>490 ₽ / точка</b>\n"
                "• Сборка и коммутация силового электрощита с УЗО: <b>9 500 ₽ / щит</b>\n"
                "• Установка чистовых розеток / выключателей: <b>250 ₽ / шт.</b>\n"
                "• Монтаж светодиодной подсветки / треков: <b>650 ₽ / пог. м</b>\n\n"
                "<i>Сварка гильзами, медный ГОСТ кабель, гарантия надёжности.</i>"
            )
        elif cb_data == "price_cat_plumb":
            response_text = (
                "🚿 <b>4. Сантехнические работы и водоснабжение:</b>\n\n"
                "• Разводка труб Rehau / Stout из сшитого полиэтилена: <b>2 400 ₽ / точка</b>\n"
                "• Монтаж коллекторного узла с манометрами и фильтрами: <b>11 500 ₽ / узел</b>\n"
                "• Установка инсталляции подвесного унитаза: <b>3 800 ₽ / шт.</b>\n"
                "• Монтаж ванны / душевого поддона: <b>4 500 ₽ / шт.</b>\n"
                "• Опрессовка системы давлением 10 атм: <b>включена</b>\n\n"
                "<i>Гарантия от протечек на фитинги и соединения 50 лет.</i>"
            )
        elif cb_data == "price_cat_finish":
            response_text = (
                "🎨 <b>5. Чистовая отделка:</b>\n\n"
                "• Финишная шпаклевка стен под лампу Lossew (2 слоя): <b>420 ₽ / м²</b>\n"
                "• Поклейка флизелиновых обоев / покраска: <b>380 ₽ / м²</b>\n"
                "• Укладка керамогранита с запилом углов под 45°: <b>1 650 ₽ / м²</b>\n"
                "• Настил ламината / кварцвинила с подложкой: <b>460 ₽ / м²</b>\n"
                "• Монтаж напольного плинтуса: <b>260 ₽ / пог. м</b>\n"
                "• Установка межкомнатных дверей с доборами: <b>4 200 ₽ / комплект</b>\n"
                "• Монтаж натяжного потолка MSD Premium: <b>780 ₽ / м²</b>\n\n"
                "<i>Идеальная геометрия и аккуратность каждого стыка.</i>"
            )
        elif cb_data == "price_cat_mat":
            response_text = (
                "📦 <b>6. Черновые сертифицированные материалы:</b>\n\n"
                "• Сухие смеси Knauf Ротбанд, МП-75, Пескобетон М-300\n"
                "• Кабель медный ГОСТ Конкорд ВВГнг-LS в негорючей гофре\n"
                "• Трубы Rehau Rautitan, фитинги латунные, краны Bugatti\n"
                "• Гидроизоляция Knauf, грунтовка Тифенгрунд\n\n"
                "🔹 <b>Преимущества:</b> прямые оптовые закупки, экономия до 20%, доставка и подъём."
            )
        elif cb_data == "contact_manager":
            response_text = (
                f"📞 <b>Прямой телефон компании:</b> <code>{company_phone}</code>\n"
                "Дежурный инженер ответит на все вопросы с 09:00 до 21:00 без выходных."
            )

        if response_text and cb_msg_id:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.post(
                        f"https://api.telegram.org/bot{bot_token}/editMessageText",
                        json={
                            "chat_id": chat_id,
                            "message_id": cb_msg_id,
                            "text": response_text,
                            "parse_mode": "HTML",
                            "reply_markup": cat_back_kb,
                        },
                    )
            except Exception as e:
                logger.error(f"Ошибка редактирования сообщения по колбэку: {e}")
        return Response(status_code=status.HTTP_200_OK)

    # 2. Обработка текстовых сообщений и нажатий кнопок
    lower_text = text.lower()

    if text.startswith("/start"):
        greeting_text = (
            f"Здравствуйте!\n\n"
            f"🏠 <b>Добро пожаловать в сервис расчёта стоимости ремонта «{company_name}».</b>\n\n"
            f"📍 Город: <b>{company_city}</b>\n"
            "⚡️ <b>Работаем без предоплаты:</b> оплата поэтапно по факту приёмки качества.\n\n"
            "У нас <b>нет приблизительных цен «на глаз»</b> — все расценки зафиксированы в договоре и смете.\n\n"
            "👇 <b>Нажмите любую кнопку ниже:</b>\n"
            "• <b>📱 Рассчитать смету онлайн:</b> точный расчёт под ваш метраж за 1 минуту\n"
            "• <b>📋 Прайс и смета работ:</b> детальные ставки за м² по всем видам работ\n"
            "• <b>📐 Бесплатный замер (0 ₽):</b> инженер с лазерным дальномером + 3D-план в подарок\n"
            "• <b>💬 Связаться с прорабом:</b> телефон и контакты компании"
        )
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": greeting_text,
                        "parse_mode": "HTML",
                        "reply_markup": client_reply_kb,
                    },
                )
        except Exception as e:
            logger.error(f"Ошибка отправки старта: {e}")

    elif "прайс" in lower_text or "смет" in lower_text:
        # Кнопка «📋 Прайс и смета работ»
        price_text = (
            f"📋 <b>Официальный прайс-лист и смета компании «{company_name}»</b>\n\n"
            "Все расценки зафиксированы в договоре без скрытых надбавок.\n"
            "Выберите раздел работ для просмотра цен за м² и единицу:"
        )
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": price_text,
                        "parse_mode": "HTML",
                        "reply_markup": price_categories_inline_kb,
                    },
                )
        except Exception as e:
            logger.error(f"Ошибка отправки прайса: {e}")

    elif "замер" in lower_text:
        # Кнопка «📐 Бесплатный замер (0 ₽)»
        zamer_text = (
            "📐 <b>Бесплатный выезд инженера-замерщика (0 ₽)</b>\n\n"
            f"Компания «{company_name}» выполняет высокоточные замеры лазерным оборудованием:\n\n"
            "• Проверка геометрии и перепадов стен и пола\n"
            "• Оценка электропроводки и сантехнических узлов\n"
            "• Подробная смета на бланке за 24 часа — <b>бесплатно</b>\n"
            "• 3D-план расстановки мебели и розеток — <b>в подарок!</b>\n\n"
            "Нажмите кнопку ниже, чтобы забронировать замер:"
        )
        zamer_kb = {
            "inline_keyboard": [
                [{"text": "📅 Записаться на замер (в калькуляторе)", "web_app": {"url": app_url}}],
                [{"text": "💬 Задать вопрос инженеру", "callback_data": "contact_manager"}],
            ]
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": zamer_text,
                        "parse_mode": "HTML",
                        "reply_markup": zamer_kb,
                    },
                )
        except Exception as e:
            logger.error(f"Ошибка отправки инфо о замере: {e}")

    elif "прораб" in lower_text or "связ" in lower_text or "контакт" in lower_text:
        # Кнопка «💬 Связаться с прорабом»
        contact_text = (
            f"💬 <b>Служба клиентского сервиса и главный инженер:</b>\n\n"
            f"🏢 <b>Компания:</b> {company_name}\n"
            f"📍 <b>Город:</b> {company_city}\n"
            f"📞 <b>Телефон:</b> <code>{company_phone}</code>\n"
            f"⏰ <b>Время работы:</b> ежедневно с 09:00 до 21:00\n\n"
            "Работаем строго по договору с гарантией 36 месяцев и 0% предоплатой."
        )
        contact_kb = {
            "inline_keyboard": [
                [{"text": "📱 Открыть калькулятор сметы", "web_app": {"url": app_url}}]
            ]
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": contact_text,
                        "parse_mode": "HTML",
                        "reply_markup": contact_kb,
                    },
                )
        except Exception as e:
            logger.error(f"Ошибка отправки контактов: {e}")

    elif "вопрос" in lower_text or "гарант" in lower_text:
        # Кнопка «❓ Вопросы и гарантии»
        faq_text = (
            "❓ <b>Частые вопросы и гарантии надежности:</b>\n\n"
            "🛡 <b>1. Действительно без предоплаты?</b>\n"
            "Да! Вы не платите аванс. Оплата происходит поэтапно по акту выполненных работ.\n\n"
            "📝 <b>2. Фиксируется ли смета в договоре?</b>\n"
            "Да. Составляется подробная построчная смета с фиксированными расценками, исключающая доплаты.\n\n"
            "📦 <b>3. Кто закупает черновые материалы?</b>\n"
            "Мы закупаем смеси Knauf, кабели ГОСТ и трубы Rehau напрямую с оптовых баз со скидкой до 20%.\n\n"
            "⏳ <b>4. Срок гарантии:</b> 36 месяцев (3 года) по договору."
        )
        faq_kb = {
            "inline_keyboard": [
                [{"text": "📱 Рассчитать смету моей квартиры", "web_app": {"url": app_url}}]
            ]
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": faq_text,
                        "parse_mode": "HTML",
                        "reply_markup": faq_kb,
                    },
                )
        except Exception as e:
            logger.error(f"Ошибка отправки FAQ: {e}")

    else:
        # Fallback: выводим кнопки меню
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": "Выберите нужное действие с помощью кнопок меню ниже 👇",
                        "reply_markup": client_reply_kb,
                    },
                )
        except Exception as e:
            logger.error(f"Ошибка отправки fallback: {e}")

    return Response(status_code=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# В. Получение профиля компании и расценок: GET /api/companies/{company_id}
# ---------------------------------------------------------------------------
@app.get("/api/companies/{company_id}")
async def get_company_endpoint(company_id: str):
    """
    Возвращает профиль строительной компании и её расценки для Mini App.
    """
    company = find_company(company_id)
    pricing = None

    company_uuid = company.get("uuid") or company.get("id") if company else None
    if company_uuid and is_valid_uuid(str(company_uuid)) and supabase_client:
        try:
            p_res = (
                supabase_client.table("pricing_rules")
                .select("*")
                .eq("company_id", str(company_uuid))
                .maybe_single()
                .execute()
            )
            if p_res and p_res.data:
                pricing = p_res.data
        except Exception as e:
            logger.error(f"Ошибка получения расценок для {company_id}: {e}")

    if not company:
        company = {
            "id": company_id,
            "name": "РемонтПро",
            "city": "Москва и МО",
            "phone": "+7 (800) 555-35-35",
            "status_text": "Работаем без предоплаты",
            "secondary_coeff": 1.15,
            "badge_text": "PRO",
            "logo_letter": "Р",
        }

    return {
        "success": True,
        "company": company,
        "pricing": pricing,
    }


# ---------------------------------------------------------------------------
# Г. Эндпоинт приема лидов из Mini App: POST /api/leads
# ---------------------------------------------------------------------------
@app.post("/api/leads")
async def create_lead_endpoint(lead: LeadCreateRequest):
    """
    Принимает расчет и контакты заказчика из Mini App,
    проверяет лимиты подписки компании, сохраняет лид в Supabase
    и отправляет мгновенное уведомление (или пейволл) прорабу.
    """
    lead_id = f"LEAD-{abs(hash(lead.phone + str(lead.area))) % 900000 + 100000}"

    # 1. Поиск компании через find_company
    company = find_company(lead.company_id)
    company_uuid = None
    if company:
        cid = str(company.get("id", ""))
        cuuid = str(company.get("uuid", ""))
        if is_valid_uuid(cid):
            company_uuid = cid
        elif is_valid_uuid(cuuid):
            company_uuid = cuuid

    admin_chat_id = company.get("admin_chat_id") if company else None
    bot_token = (company.get("bot_token") if company else None) or MASTER_BOT_TOKEN
    comp_identifier = (company.get("bot_username") if company else None) or lead.company_id

    # 2. Проверка доступа и триала компании (Usage-Based Freemium)
    access_info = check_and_consume_lead_access(comp_identifier, company, supabase_client)
    can_view_full = access_info.get("can_view_full", False)
    is_trial = access_info.get("is_trial", False)
    is_paid = access_info.get("is_paid", False)
    trial_num = access_info.get("trial_num", 1)
    trial_left = access_info.get("trial_left", 0)
    lead_db_status = access_info.get("lead_status", "new")  # 'new' (полный доступ) или 'locked' (замаскированный)

    # 3. Сохранение в Supabase (со статусом new или locked)
    if supabase_client:
        try:
            insert_data = {
                "company_id": company_uuid,
                "client_name": lead.name,
                "client_phone": lead.phone,
                "contact_channel": lead.communication or "telegram",
                "address": lead.address,
                "preferred_date": lead.preferred_date,
                "housing_type": "Новостройка" if lead.property_type == "new" else "Вторичка",
                "repair_type": lead.renovation_class,
                "area_m2": float(lead.area),
                "options": lead.active_options or [],
                "min_cost": float(lead.price_min),
                "max_cost": float(lead.price_max),
                "status": lead_db_status,
            }
            db_res = supabase_client.table("leads").insert(insert_data).execute()
            if db_res.data and len(db_res.data) > 0:
                lead_id = str(db_res.data[0].get("id", lead_id))
            logger.info(f"Лид {lead_id} (статус={lead_db_status}, full={can_view_full}) успешно записан в Supabase.")
        except Exception as e:
            logger.error(f"Ошибка записи лида в Supabase: {e}")

    # 4. Формирование текста уведомления
    clean_phone = re.sub(r"[^0-9+]", "", lead.phone)
    if clean_phone.startswith("8") and len(clean_phone) == 11:
        clean_phone = "+7" + clean_phone[1:]
    elif not clean_phone.startswith("+") and len(clean_phone) >= 10:
        clean_phone = "+" + clean_phone

    channel_name = {
        "telegram": "Telegram",
        "whatsapp": "WhatsApp",
        "call": "Телефонный звонок",
    }.get(lead.communication.lower() if lead.communication else "", "Telegram")

    housing_type = "Новостройка" if lead.property_type == "new" else "Вторичка"
    min_cost = f"{lead.price_min:,.0f}".replace(",", " ")
    max_cost = f"{lead.price_max:,.0f}".replace(",", " ")
    total_cost_num = lead.total_base_cost or lead.price_max or lead.price_min
    total_cost_str = f"{total_cost_num:,.0f}".replace(",", " ")
    digits_only = re.sub(r"[^0-9]", "", clean_phone)

    options_list = lead.active_options or []
    options_str = ""
    if options_list:
        clean_opts = [html.escape(opt) for opt in options_list[:4]]
        options_str = f"🔧 <b>Доп. опции:</b> {', '.join(clean_opts)}\n"

    comp_name = company.get("name") if company else "Ваша компания"
    _, url_1m = create_payment_url(comp_identifier, comp_name, admin_chat_id or 0, "1m")
    _, url_3m = create_payment_url(comp_identifier, comp_name, admin_chat_id or 0, "3m")
    _, url_1y = create_payment_url(comp_identifier, comp_name, admin_chat_id or 0, "1y")

    if not can_view_full:
        # ЗАЯВКА 4 И ДАЛЕЕ (Soft Paywall / Masked Lead)
        masked_name = mask_client_name(lead.name)
        masked_phone = mask_client_phone(lead.phone)
        masked_addr = mask_address(lead.address)

        notification_text = (
            "🔒 <b>НОВАЯ ЗАЯВКА НА ЗАМЕР! КОНТАКТЫ ЗАМАСКИРОВАНЫ</b>\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"👤 <b>Клиент:</b> {html.escape(masked_name)}\n"
            f"📱 <b>Телефон:</b> <code>{html.escape(masked_phone)}</code>\n"
            f"📍 <b>Адрес:</b> {html.escape(masked_addr)}\n"
            f"💬 <b>Связь:</b> {html.escape(channel_name)}\n"
            f"📅 <b>Желаемая дата:</b> {html.escape(str(lead.preferred_date or 'Не указана'))}\n\n"
            f"🏠 <b>Объект:</b> {housing_type}, {lead.area} м², {lead.renovation_class}\n"
            f"💰 <b>Сумма сметы:</b> <b>{total_cost_str} ₽</b>\n"
            f"{options_str}"
            "━━━━━━━━━━━━━━━━━━\n"
            "⚠️ <b>3 бесплатные заявки триала исчерпаны!</b>\n"
            f"Клиент только что зафиксировал смету на <b>{total_cost_str} ₽</b> и ожидает звонка для выезда на замер.\n\n"
            "👉 Нажмите кнопку ниже, чтобы снять маску с телефона и адреса заказчика:"
        )

        inline_keyboard = [
            [{"text": "🔓 Разблокировать клиента за 2 990 ₽/мес", "url": url_1m}],
            [
                {"text": "🔥 3 мес (-11%) — 7 990 ₽", "url": url_3m},
                {"text": "💎 1 год (-30%) — 24 990 ₽", "url": url_1y},
            ],
        ]
    else:
        # Заявка 1, 2, 3 (Trial) ИЛИ Активная платная подписка
        safe_name = html.escape(str(lead.name or "Не указано"))
        safe_phone = html.escape(str(lead.phone or ""))
        safe_date = html.escape(str(lead.preferred_date or "Не указана"))
        safe_comm = html.escape(str(channel_name))
        safe_addr = html.escape(str(lead.address or "г. Москва (уточняется на замере)"))

        if is_trial:
            trial_header = (
                f"🎁 <b>БЕСПЛАТНЫЙ ТРИАЛ:</b> Заявка {trial_num} из {TRIAL_LEADS_COUNT}\n"
                f"<i>(Осталось бесплатных заявок: {trial_left})</i>\n\n"
            )
            trial_footer = (
                f"━━━━━━━━━━━━━━━━━━\n"
                f"💡 <i>Вам предоставлены полные контакты заказчика в рамках бесплатного триала (3 заявки).</i>"
            )
        else:
            sub_until = access_info.get("subscription_until")
            until_dt = sub_until.replace(tzinfo=timezone.utc) if (sub_until and sub_until.tzinfo is None) else sub_until
            until_str = until_dt.strftime("%d.%m.%Y") if until_dt else ""
            trial_header = f"⭐️ <b>Подписка активна:</b> до {until_str}\n\n"
            trial_footer = (
                f"━━━━━━━━━━━━━━━━━━\n"
                f"✅ <i>Заявка принята в работу без ограничений.</i>"
            )

        notification_text = (
            f"🚨 <b>НОВАЯ ЗАЯВКА НА ЗАМЕР!</b>\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"{trial_header}"
            f"👤 <b>Клиент:</b> {safe_name}\n"
            f"📱 <b>Телефон:</b> <code>{safe_phone}</code>\n"
            f"📍 <b>Адрес:</b> {safe_addr}\n"
            f"💬 <b>Связь:</b> {safe_comm}\n"
            f"📅 <b>Желаемая дата замера:</b> {safe_date}\n\n"
            f"🏠 <b>Объект:</b> {housing_type}, {lead.area} м², {lead.renovation_class}\n"
            f"💰 <b>Сумма сметы:</b> <b>{total_cost_str} ₽</b>\n"
            f"{options_str}"
            f"{trial_footer}"
        )

        inline_keyboard = []
        if digits_only:
            inline_keyboard.append([{"text": "💬 Написать в WhatsApp", "url": f"https://wa.me/{digits_only}"}])

    # 5. Отправка мгновенного push-сообщения прорабу
    if admin_chat_id and bot_token:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                send_payload: Dict[str, Any] = {
                    "chat_id": admin_chat_id,
                    "text": notification_text,
                    "parse_mode": "HTML",
                }
                if inline_keyboard:
                    send_payload["reply_markup"] = {"inline_keyboard": inline_keyboard}

                res = await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json=send_payload,
                )
                if res.status_code == 200:
                    logger.info(f"Уведомление прорабу (chat_id={admin_chat_id}, locked={not can_view_full}) доставлено: 200 OK")
                else:
                    logger.warning(
                        f"Ошибка отправки с кнопками ({res.status_code}: {res.text}), отправляем fallback без кнопок..."
                    )
                    plain_text = (
                        f"🚨 НОВАЯ ЗАЯВКА НА ЗАМЕР!\n"
                        f"Клиент: {lead.name if can_view_full else mask_client_name(lead.name)}\n"
                        f"Телефон: {lead.phone if can_view_full else mask_client_phone(lead.phone)}\n"
                        f"Адрес: {lead.address if can_view_full else mask_address(lead.address)}\n"
                        f"Связь: {channel_name}\n"
                        f"Желаемая дата: {lead.preferred_date}\n"
                        f"Объект: {housing_type}, {lead.area} м², {lead.renovation_class}\n"
                        f"Смета: {total_cost_str} руб."
                    )
                    fb_res = await client.post(
                        f"https://api.telegram.org/bot{bot_token}/sendMessage",
                        json={"chat_id": admin_chat_id, "text": plain_text},
                    )
                    logger.info(f"Результат fallback отправки: {fb_res.status_code}")
        except Exception as e:
            logger.error(f"Не удалось отправить уведомление прорабу: {e}")
    else:
        logger.info(
            f"Заявка #{lead_id} принята (admin_chat_id для компании {lead.company_id} не сконфигурирован в Telegram)"
        )

    return {
        "success": True,
        "lead_id": lead_id,
        "is_locked": not can_view_full,
        "message": "Заявка успешно зарегистрирована",
    }


# ---------------------------------------------------------------------------
# Д. Модуль платежей: ЮKassa Вебхук и Checkout страница
# ---------------------------------------------------------------------------
@app.get("/pay/{payment_id}", response_class=HTMLResponse)
async def checkout_page(
    payment_id: str,
    company_id: Optional[str] = "cuberlife_bot",
    admin_chat_id: Optional[int] = None,
    plan: Optional[str] = "1m",
):
    """
    Страница безопасной оплаты подписки (ЮKassa / Тестовый режим)
    с возможностью выбора из 3-х тарифов: 1 месяц, 3 месяца, 1 год.
    """
    comp = find_company(company_id or "cuberlife_bot")
    comp_name = comp.get("name") if comp else "Строительная компания"
    bot_uname = comp.get("bot_username") if comp else "cuberlife_bot"
    initial_plan = plan if plan in SUBSCRIPTION_PLANS else "1m"

    html_content = f"""<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <title>Оплата подписки РемонтПро</title>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
        body {{
            font-family: 'Manrope', -apple-system, sans-serif;
            background: #f4f4f5;
            color: #18181b;
            margin: 0;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            box-sizing: border-box;
        }}
        .card {{
            background: #ffffff;
            border-radius: 20px;
            padding: 28px;
            max-width: 440px;
            width: 100%;
            box-shadow: 0 10px 25px rgba(0,0,0,0.06);
            border: 1px solid #e4e4e7;
        }}
        .badge {{
            display: inline-block;
            background: #f4f4f5;
            color: #52525b;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 4px 10px;
            border-radius: 6px;
            margin-bottom: 12px;
        }}
        h2 {{
            margin: 0 0 6px 0;
            font-size: 20px;
            font-weight: 800;
        }}
        .desc {{
            color: #71717a;
            font-size: 13px;
            margin: 0 0 18px 0;
            line-height: 1.4;
        }}
        .plans-container {{
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 20px;
        }}
        .plan-card {{
            border: 2px solid #e4e4e7;
            border-radius: 14px;
            padding: 12px 14px;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }}
        .plan-card:hover {{
            border-color: #a1a1aa;
        }}
        .plan-card.active {{
            border-color: #18181b;
            background: #fafafa;
        }}
        .plan-title {{
            font-weight: 700;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 6px;
        }}
        .plan-subtitle {{
            font-size: 12px;
            color: #71717a;
            margin-top: 2px;
        }}
        .plan-price {{
            font-weight: 800;
            font-size: 16px;
            text-align: right;
        }}
        .plan-tag {{
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
            background: #dcfce7;
            color: #15803d;
        }}
        .price-box {{
            background: #fafafa;
            border-radius: 12px;
            padding: 14px 16px;
            border: 1px solid #f4f4f5;
            margin-bottom: 20px;
        }}
        .price-row {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
            color: #71717a;
            margin-bottom: 6px;
        }}
        .total-row {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 18px;
            font-weight: 800;
            color: #18181b;
            padding-top: 8px;
            border-top: 1px solid #e4e4e7;
        }}
        .btn {{
            display: block;
            width: 100%;
            background: #18181b;
            color: #ffffff;
            border: none;
            padding: 14px;
            border-radius: 12px;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            text-align: center;
            transition: all 0.2s;
            box-sizing: border-box;
            text-decoration: none;
        }}
        .btn:hover {{
            background: #000000;
            transform: scale(0.99);
        }}
        .success-box {{
            display: none;
            text-align: center;
            padding: 10px 0;
        }}
        .success-icon {{
            font-size: 48px;
            margin-bottom: 12px;
        }}
        .footer-note {{
            font-size: 11px;
            color: #a1a1aa;
            text-align: center;
            margin-top: 16px;
        }}
    </style>
</head>
<body>
    <div class="card" id="checkout-card">
        <div class="badge">ЮKassa · Защищенный платёж</div>
        <h2>Оплата подписки РемонтПро</h2>
        <p class="desc">Для компании «<strong>{comp_name}</strong>». Выберите период:</p>

        <div class="plans-container">
            <div class="plan-card {'active' if initial_plan == '1m' else ''}" id="card-1m" onclick="selectPlan('1m')">
                <div>
                    <div class="plan-title">
                        1 месяц
                    </div>
                    <div class="plan-subtitle">30 дней приёма заявок</div>
                </div>
                <div class="plan-price">2 990 ₽</div>
            </div>

            <div class="plan-card {'active' if initial_plan == '3m' else ''}" id="card-3m" onclick="selectPlan('3m')">
                <div>
                    <div class="plan-title">
                        3 месяца
                        <span class="plan-tag">-11%</span>
                    </div>
                    <div class="plan-subtitle">90 дней (экономия 980 ₽)</div>
                </div>
                <div class="plan-price">7 990 ₽</div>
            </div>

            <div class="plan-card {'active' if initial_plan == '1y' else ''}" id="card-1y" onclick="selectPlan('1y')">
                <div>
                    <div class="plan-title">
                        1 год (365 дней)
                        <span class="plan-tag">-30%</span>
                    </div>
                    <div class="plan-subtitle">~2 080 ₽/мес (выгода 10 890 ₽)</div>
                </div>
                <div class="plan-price">24 990 ₽</div>
            </div>
        </div>

        <div class="price-box">
            <div class="price-row">
                <span>Выбранный тариф:</span>
                <span id="summary-title" style="font-weight:600; color:#18181b;">1 месяц</span>
            </div>
            <div class="price-row">
                <span>Статус бота:</span>
                <span style="font-weight:600; color:#16a34a;">Мгновенная активация</span>
            </div>
            <div class="total-row">
                <span>К оплате:</span>
                <span id="summary-price">2 990 ₽</span>
            </div>
        </div>

        <button class="btn" id="pay-btn" onclick="processPayment()">💳 Оплатить 2 990 ₽</button>
        <p class="footer-note">Платёж защищен по стандарту PCI DSS. Мгновенная активация в Telegram.</p>
    </div>

    <div class="card success-box" id="success-box">
        <div class="success-icon">🎉</div>
        <h2>Подписка успешно оплачена!</h2>
        <p class="desc" id="success-desc">Бот компании запущен и снова принимает заявки. Все скрытые контакты клиентов разблокированы и отправлены вам в Telegram.</p>
        <a class="btn" href="https://t.me/{bot_uname}" style="margin-top:16px;">Вернуться в Telegram</a>
    </div>

    <script>
        const plans = {{
            '1m': {{ name: '1 месяц (30 дней)', price: '2 990 ₽', sum: 2990 }},
            '3m': {{ name: '3 месяца (90 дней)', price: '7 990 ₽', sum: 7990 }},
            '1y': {{ name: '1 год (365 дней)', price: '24 990 ₽', sum: 24990 }}
        }};
        let currentPlan = '{initial_plan}';

        function selectPlan(planId) {{
            currentPlan = planId;
            document.querySelectorAll('.plan-card').forEach(el => el.classList.remove('active'));
            document.getElementById('card-' + planId).classList.add('active');
            
            const p = plans[planId];
            document.getElementById('summary-title').innerText = p.name;
            document.getElementById('summary-price').innerText = p.price;
            document.getElementById('pay-btn').innerText = '💳 Оплатить ' + p.price;
        }}

        // Инициализируем выбранный тариф
        selectPlan(currentPlan);

        async function processPayment() {{
            const btn = document.getElementById('pay-btn');
            btn.innerText = 'Обработка платежа...';
            btn.disabled = true;
            try {{
                const res = await fetch('/api/payments/simulate/{payment_id}?company_id={company_id}&admin_chat_id={admin_chat_id or ""}&plan=' + currentPlan, {{
                    method: 'POST'
                }});
                const data = await res.json();
                if (data.success) {{
                    document.getElementById('checkout-card').style.display = 'none';
                    document.getElementById('success-box').style.display = 'block';
                    document.getElementById('success-desc').innerText = 
                        'Подписка активирована на ' + (data.plan_name || 'выбранный период') + ' (до ' + (data.subscription_until || '') + '). Бот запущен и принимает заявки!';
                }} else {{
                    alert('Ошибка активации: ' + (data.message || 'попробуйте снова'));
                    btn.disabled = false;
                    btn.innerText = '💳 Оплатить ' + plans[currentPlan].price;
                }}
            }} catch (err) {{
                alert('Сетевая ошибка при оплате');
                btn.disabled = false;
                btn.innerText = '💳 Оплатить ' + plans[currentPlan].price;
            }}
        }}
    </script>
</body>
</html>"""
    return HTMLResponse(content=html_content)


@app.post("/api/payments/webhook")
async def yookassa_webhook_endpoint(request: Request):
    """
    Официальный эндпоинт вебхука ЮKassa:
    При получении события payment.succeeded продлевает подписку на выбранный период
    (30, 90 или 365 дней) и разблокирует все скрытые контакты клиентов.
    """
    try:
        body = await request.json()
    except Exception:
        return Response(status_code=status.HTTP_400_BAD_REQUEST)

    event = body.get("event")
    payment_obj = body.get("object", {})

    if event == "payment.succeeded" or payment_obj.get("status") == "succeeded":
        metadata = payment_obj.get("metadata", {})
        company_id = metadata.get("company_id") or "cuberlife_bot"
        admin_chat_id = metadata.get("admin_chat_id")
        plan_id = metadata.get("plan_id") or "1m"
        days_str = metadata.get("days")
        days = int(days_str) if days_str and days_str.isdigit() else None

        if admin_chat_id:
            try:
                admin_chat_id = int(admin_chat_id)
            except Exception:
                pass

        res = await activate_subscription_for_company(
            company_id=company_id,
            supabase_client=supabase_client,
            master_bot=master_bot,
            admin_chat_id=admin_chat_id,
            days=days,
            plan_id=plan_id,
        )
        logger.info(f"Вебхук ЮKassa успешно обработан для {company_id}: {res}")

    return {"status": "ok"}


@app.post("/api/payments/simulate/{payment_id}")
async def simulate_payment_endpoint(payment_id: str, request: Request):
    """
    Эндпоинт тестовой / встроенной оплаты:
    Активирует подписку на выбранный тариф (1m, 3m, 1y) и разблокирует заявки.
    """
    query_params = request.query_params
    company_id = query_params.get("company_id") or "cuberlife_bot"
    plan_id = query_params.get("plan") or "1m"
    admin_chat_id = query_params.get("admin_chat_id")
    if admin_chat_id:
        try:
            admin_chat_id = int(admin_chat_id)
        except Exception:
            admin_chat_id = None

    company = find_company(company_id)
    bot_token = company.get("bot_token") if company else None
    plan_info = get_plan(plan_id)

    res = await activate_subscription_for_company(
        company_id=company_id,
        supabase_client=supabase_client,
        master_bot=master_bot,
        admin_chat_id=admin_chat_id,
        bot_token=bot_token,
        days=plan_info["duration_days"],
        plan_id=plan_id,
    )
    return res


# ---------------------------------------------------------------------------
# Раздача собранного фронтенда калькулятора (dist) через FastAPI
# ---------------------------------------------------------------------------
from fastapi.staticfiles import StaticFiles

# Проверяем возможные пути к папке dist
possible_dist_paths = [
    "/app/dist",
    os.path.abspath("dist"),
    os.path.join(os.path.dirname(__file__), "..", "dist"),
    os.path.join(os.path.dirname(__file__), "dist"),
    "dist",
]

dist_dir = None
for candidate in possible_dist_paths:
    if os.path.exists(candidate) and os.path.isdir(candidate):
        dist_dir = os.path.abspath(candidate)
        break

if dist_dir and os.path.isdir(dist_dir):
    logger.info(f"Подключение статических файлов фронтенда из: {dist_dir}")
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="static")
else:
    logger.warning("Директория dist не найдена. Статический фронтенд не примонтирован.")

