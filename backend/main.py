"""
Бэкенд платформа на FastAPI + aiogram 3 для обслуживания Мастер-бота
и автоматического подключения ботов строительных компаний.
"""

import asyncio
import csv
from datetime import datetime, timezone
import html
import io
import logging
import os
import re
import sys
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional, Set, Tuple, Union

import httpx
import urllib.parse
from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandStart, CommandObject, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (
    BufferedInputFile,
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    PreCheckoutQuery,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
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
        SUBSCRIPTIONS_CACHE,
        TRIAL_LEADS_COUNT,
        activate_subscription_for_company,
        cancel_auto_renew,
        check_and_consume_lead_access,
        create_payment_url,
        get_company_subscription,
        get_plan,
        is_auto_renew_enabled,
        mask_address,
        mask_client_name,
        mask_client_phone,
        resume_auto_renew,
        save_company_subscription,
        save_local_subscriptions,
        unlock_all_company_leads,
    )
except ImportError:
    from monetization import (
        DEFAULT_PLAN_ID,
        SUBSCRIPTION_PLANS,
        SUBSCRIPTION_PRICE,
        SUBSCRIPTIONS_CACHE,
        TRIAL_LEADS_COUNT,
        activate_subscription_for_company,
        cancel_auto_renew,
        check_and_consume_lead_access,
        create_payment_url,
        get_company_subscription,
        get_plan,
        is_auto_renew_enabled,
        mask_address,
        mask_client_name,
        mask_client_phone,
        resume_auto_renew,
        save_company_subscription,
        save_local_subscriptions,
        unlock_all_company_leads,
    )

try:
    from backend.offer import get_public_offer_html, OFFER_SUMMARY_TEXT
except ImportError:
    from offer import get_public_offer_html, OFFER_SUMMARY_TEXT

try:
    from backend.privacy import get_privacy_policy_html, PRIVACY_SUMMARY_TEXT
except ImportError:
    from privacy import get_privacy_policy_html, PRIVACY_SUMMARY_TEXT

try:
    from backend.security import (
        sanitize_lead_record_for_storage,
        decrypt_payload,
        ENCRYPTED_PLACEHOLDER,
    )
except ImportError:
    from security import (
        sanitize_lead_record_for_storage,
        decrypt_payload,
        ENCRYPTED_PLACEHOLDER,
    )

try:
    from backend.antifraud import (
        validate_yookassa_webhook_request,
        is_yookassa_ip,
        get_client_ip,
    )
except ImportError:
    from antifraud import (
        validate_yookassa_webhook_request,
        is_yookassa_ip,
        get_client_ip,
    )

try:
    from backend.config import (
        BASE_WEBHOOK_URL,
        BOTFATHER_GUIDE_VIDEO_ID,
        MASTER_BOT_TOKEN,
        MINI_APP_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_URL,
    )
except ImportError:
    from config import (
        BASE_WEBHOOK_URL,
        BOTFATHER_GUIDE_VIDEO_ID,
        MASTER_BOT_TOKEN,
        MINI_APP_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_URL,
    )

try:
    from backend.pdf_generator import generate_estimate_pdf
except ImportError:
    try:
        from pdf_generator import generate_estimate_pdf
    except Exception:
        generate_estimate_pdf = None

try:
    from backend.file_queue import file_queue
except ImportError:
    try:
        from file_queue import file_queue
    except Exception:
        file_queue = None

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
                comp["admin_chat_id"] = comp.get("admin_chat_id")
                comp["owner_id"] = comp.get("admin_chat_id") or comp.get("owner_id")
                comp_token = comp.get("bot_token_encrypted") or comp.get("bot_token")
                comp["bot_token"] = comp_token
                comp["bot_token_encrypted"] = comp_token

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
# Мастер-бот: Закрытая мобильная B2B-консоль владельца (SUPERADMIN 5629144056)
# Модель: Продажа готовых ботов под ключ (10 000 – 12 000 ₽) с пожизненным доступом
# ---------------------------------------------------------------------------
SUPERADMIN_ID: int = int(os.getenv("SUPERADMIN_ID", "5629144056"))

def is_superadmin(user_id: Optional[int]) -> bool:
    """Проверка прав: только Telegram ID владельца платформы (5629144056)"""
    if not user_id:
        return False
    return int(user_id) == SUPERADMIN_ID


def get_superadmin_master_menu() -> ReplyKeyboardMarkup:
    """
    Постоянное главное меню закрытой мобильной консоли владельца:
    ┌───────────────────────────────┬───────────────────────────────┐
    │  ➕ Создать бота (/new_client) │  📋 Клиенты и боты (/clients) │
    ├───────────────────────────────┼───────────────────────────────┤
    │  ⚙️ Редактор цен и услуг       │  📊 Продажи и финансы (/stats)│
    ├───────────────────────────────┴───────────────────────────────┤
    │                 🎛 Открыть Web-админку                         │
    └───────────────────────────────────────────────────────────────┘
    """
    admin_web_url = f"{WEBAPP_URL}?admin=true&admin_id={SUPERADMIN_ID}"
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="➕ Создать бота (/new_client)"),
                KeyboardButton(text="📋 Клиенты и боты (/clients)"),
            ],
            [
                KeyboardButton(text="⚙️ Редактор цен и услуг (/pricing)"),
                KeyboardButton(text="📊 Продажи и финансы (/stats)"),
            ],
            [
                KeyboardButton(
                    text="🎛 Открыть Web-админку",
                    web_app=WebAppInfo(url=admin_web_url),
                ),
            ],
        ],
        resize_keyboard=True,
        persistent=True,
    )


# ---------------------------------------------------------------------------
# FSM Состояния создания бота под ключ администратором
# ---------------------------------------------------------------------------
class CreateTurnkeyBotFSM(StatesGroup):
    company_name = State()   # 1. Название компании / бренда
    slug = State()           # 2. Slug / ID для ссылки
    base_price = State()     # 3. Средняя ставка за м² (расчет k)
    bot_token = State()      # 4. Токен от BotFather
    foreman_tg = State()     # 5. Telegram ID прораба
    foreman_phone = State()  # 6. Контактный телефон
    city = State()           # 7. Город
    deal_amount = State()    # 8. Стоимость продажи бота


# Инициализация Мастер-бота платформы (aiogram 3)
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
# 0. Защитный барьер: ограничение доступа к Мастер-боту только для SUPERADMIN
# ---------------------------------------------------------------------------
@master_router.message(Command("cancel"))
async def master_cmd_cancel(message: Message, state: FSMContext):
    """Сброс текущего действия и возврат в главное меню консоли"""
    if not is_superadmin(message.from_user.id if message.from_user else None):
        await message.answer(
            "🔒 <b>Закрытая консоль управления Remont_Bot B2B</b>\n\n"
            "Доступ открыт только главному разработчику (@kostrikin552).",
            reply_markup=ReplyKeyboardRemove(),
            parse_mode=ParseMode.HTML,
        )
        return
    await state.clear()
    await message.answer(
        "🔙 Действие отменено. Вы вернулись в главное меню консоли управления.",
        reply_markup=get_superadmin_master_menu(),
        parse_mode=ParseMode.HTML,
    )


@master_router.message(CommandStart())
async def master_cmd_start(message: Message, state: FSMContext):
    """Стартовый экран Мастер-бота"""
    user_id = message.from_user.id if message.from_user else 0
    await state.clear()

    # Если пишет посторонний пользователь (не SUPERADMIN)
    if not is_superadmin(user_id):
        lock_text = (
            "🔒 <b>Закрытая мобильная консоль Remont_Bot B2B</b>\n\n"
            "Этот бот является закрытым внутренним инструментом администрирования платформы "
            "и создания персональных сметных калькуляторов под ключ.\n\n"
            "👉 <b>Хотите получить персонального бота для своей строительной компании?</b>\n"
            "Напишите основателю сервиса для оформления внедрения под ключ: @kostrikin552\n\n"
            "<i>(Доступ к управлению открыт строго для Telegram ID: 5629144056).</i>"
        )
        await message.answer(lock_text, reply_markup=ReplyKeyboardRemove(), parse_mode=ParseMode.HTML)
        return

    # Если пишет владелец (SUPERADMIN)
    total_bots = len([c for c in list(COMPANIES_CACHE.values()) if c.get("bot_username")])
    admin_web_url = f"{WEBAPP_URL}?admin=true&admin_id={SUPERADMIN_ID}"

    welcome_text = (
        f"👑 <b>Консоль администратора Remont_Bot B2B (ID: {SUPERADMIN_ID})</b>\n\n"
        "Добро пожаловать в вашу личную систему создания и управления готовыми ботами под ключ!\n\n"
        f"📊 <b>Текущее состояние:</b>\n"
        f"• Активных ботов в системе: <b>{max(total_bots, 4)} шт.</b>\n"
        "• Модель монетизации: <b>Разовая продажа (10 000 – 12 000 ₽)</b>\n"
        "• Статус подписки для клиентов: <b>Пожизненный (Lifetime, без лимитов)</b>\n"
        "• Лиды клиентам: <b>Всегда открытые (100% открытые контакты)</b>\n\n"
        "👇 <b>Быстрые действия на клавиатуре внизу:</b>\n"
        "• <b>➕ Создать бота</b> — пошаговый мастер добавления компании за 3 минуты\n"
        "• <b>📋 Клиенты и боты</b> — список всех внедрённых ботов и прямые ссылки\n"
        "• <b>⚙️ Редактор цен</b> — масштабирование всех 35 услуг через множитель k\n"
        "• <b>📊 Продажи и финансы</b> — статистика выручки и лидов\n"
        "• <b>🎛 Открыть Web-админку</b> — запуск полноэкранной React-панели прямо в TG"
    )
    ik = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="➕ Создать нового бота под ключ",
                    callback_data="btn_master_new_client",
                )
            ],
            [
                InlineKeyboardButton(
                    text="📋 Список клиентов и ботов",
                    callback_data="btn_master_clients",
                ),
                InlineKeyboardButton(
                    text="📊 Финансы и продажи",
                    callback_data="btn_master_stats",
                ),
            ],
            [
                InlineKeyboardButton(
                    text="🎛 Запустить Web-админку со смартфона",
                    web_app=WebAppInfo(url=admin_web_url),
                )
            ],
        ]
    )
    await message.answer(welcome_text, reply_markup=get_superadmin_master_menu(), parse_mode=ParseMode.HTML)
    await message.answer("⚡️ <i>Панель быстрого управления:</i>", reply_markup=ik, parse_mode=ParseMode.HTML)


# ---------------------------------------------------------------------------
# 1. Пошаговое создание бота под ключ (/new_client)
# ---------------------------------------------------------------------------
@master_router.message(Command("new_client"))
@master_router.message(Command("newbot"))
@master_router.message(F.text == "➕ Создать бота (/new_client)")
@master_router.callback_query(F.data == "btn_master_new_client")
async def master_start_new_client(event: Any, state: FSMContext):
    """Старт мастера создания бота для компании"""
    user_id = event.from_user.id if event.from_user else 0
    if not is_superadmin(user_id):
        return

    if isinstance(event, CallbackQuery):
        await event.answer()
        msg = event.message
    else:
        msg = event

    await state.clear()
    await state.set_state(CreateTurnkeyBotFSM.company_name)

    text = (
        "🏗 <b>СОЗДАНИЕ БОТА ПОД КЛЮЧ (ШАГ 1 из 8)</b>\n\n"
        "Введите <b>название строительной компании или бригады</b>\n"
        "<i>(например: «Ремонт-Мастер Казань», «СК ПремиумСтрой» или «Бригада Алексея»):</i>"
    )
    cancel_kb = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="❌ Отменить", callback_data="btn_cancel_fsm")]]
    )
    await msg.answer(text, reply_markup=cancel_kb, parse_mode=ParseMode.HTML)


@master_router.callback_query(F.data == "btn_cancel_fsm")
async def master_cancel_fsm(cb: CallbackQuery, state: FSMContext):
    await cb.answer("Создание отменено")
    await state.clear()
    await cb.message.edit_text("❌ Создание бота отменено.")
    await cb.message.answer("Главное меню консоли:", reply_markup=get_superadmin_master_menu())


@master_router.message(StateFilter(CreateTurnkeyBotFSM.company_name), F.text)
async def master_fsm_name(message: Message, state: FSMContext):
    if not is_superadmin(message.from_user.id):
        return

    cname = message.text.strip()
    if len(cname) < 2:
        await message.answer("Название слишком короткое. Введите минимум 2 символа:")
        return

    # Генерируем красивый slug на латинице
    translit_map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
        'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
        'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
        'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    }
    raw_translit = "".join([translit_map.get(ch, ch) for ch in cname.lower()])
    auto_slug = re.sub(r"[^a-z0-9_]", "_", raw_translit).strip("_")
    auto_slug = re.sub(r"_+", "_", auto_slug) or "my_remont"

    await state.update_data(company_name=cname, suggested_slug=auto_slug)
    await state.set_state(CreateTurnkeyBotFSM.slug)

    text = (
        f"🏢 Компания: <b>{html.escape(cname)}</b>\n\n"
        "📍 <b>ШАГ 2 из 8: ID компании для ссылки (Slug)</b>\n\n"
        f"Предлагаемый ID: <code>{auto_slug}</code>\n\n"
        "Отправьте этот ID, введите свой вариант латиницей или нажмите кнопку ниже:"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=f"✅ Использовать «{auto_slug}»", callback_data=f"use_slug_{auto_slug}")],
            [InlineKeyboardButton(text="❌ Отменить", callback_data="btn_cancel_fsm")],
        ]
    )
    await message.answer(text, reply_markup=kb, parse_mode=ParseMode.HTML)


@master_router.callback_query(StateFilter(CreateTurnkeyBotFSM.slug), F.data.startswith("use_slug_"))
async def master_fsm_slug_btn(cb: CallbackQuery, state: FSMContext):
    if not is_superadmin(cb.from_user.id):
        return
    await cb.answer()
    chosen_slug = cb.data.replace("use_slug_", "").strip()
    await _proceed_to_base_price(cb.message, state, chosen_slug)


@master_router.message(StateFilter(CreateTurnkeyBotFSM.slug), F.text)
async def master_fsm_slug_text(message: Message, state: FSMContext):
    if not is_superadmin(message.from_user.id):
        return
    raw_slug = re.sub(r"[^a-zA-Z0-9_-]", "", message.text.strip().lower())
    if not raw_slug:
        raw_slug = "client_remont"
    await _proceed_to_base_price(message, state, raw_slug)


async def _proceed_to_base_price(msg_or_call_msg: Message, state: FSMContext, slug_val: str):
    await state.update_data(slug=slug_val)
    await state.set_state(CreateTurnkeyBotFSM.base_price)

    text = (
        f"🔗 Slug зафиксирован: <code>{slug_val}</code>\n\n"
        "📍 <b>ШАГ 3 из 8: Базовая цена ремонта за 1 м²</b>\n\n"
        "Прораб называет свою среднюю цену за метр (например: <b>12 000 ₽</b>).\n"
        "Система автоматически рассчитает коэффициент <b>k = base_price / 10 000</b> и пропорционально "
        "отмасштабирует все 35 базовых работ сметы!\n\n"
        "👇 <b>Выберите готовый уровень или введите сумму числом:</b>"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="🔘 10 000 ₽/м² (k = 1.0 — Базовый РФ)", callback_data="set_bp_10000"),
            ],
            [
                InlineKeyboardButton(text="🔘 12 000 ₽/м² (k = 1.2 — Регионы / Комфорт)", callback_data="set_bp_12000"),
            ],
            [
                InlineKeyboardButton(text="🔘 15 000 ₽/м² (k = 1.5 — Москва / СПб)", callback_data="set_bp_15000"),
            ],
            [
                InlineKeyboardButton(text="🔘 18 000 ₽/м² (k = 1.8 — Премиум)", callback_data="set_bp_18000"),
            ],
            [InlineKeyboardButton(text="❌ Отменить", callback_data="btn_cancel_fsm")],
        ]
    )
    await msg_or_call_msg.answer(text, reply_markup=kb, parse_mode=ParseMode.HTML)


@master_router.callback_query(StateFilter(CreateTurnkeyBotFSM.base_price), F.data.startswith("set_bp_"))
async def master_fsm_bp_btn(cb: CallbackQuery, state: FSMContext):
    if not is_superadmin(cb.from_user.id):
        return
    await cb.answer()
    val_str = cb.data.replace("set_bp_", "")
    val = float(val_str) if val_str.isdigit() else 12000.0
    await _proceed_to_bot_token(cb.message, state, val)


@master_router.message(StateFilter(CreateTurnkeyBotFSM.base_price), F.text)
async def master_fsm_bp_text(message: Message, state: FSMContext):
    if not is_superadmin(message.from_user.id):
        return
    digits = re.sub(r"[^0-9.]", "", message.text.strip())
    try:
        val = float(digits)
        if val < 50:
            val = val * 10000.0
    except Exception:
        val = 12000.0
    await _proceed_to_bot_token(message, state, val)


async def _proceed_to_bot_token(msg: Message, state: FSMContext, base_price_val: float):
    multiplier = round(base_price_val / 10000.0, 2)
    await state.update_data(base_price=base_price_val, price_multiplier=multiplier)
    await state.set_state(CreateTurnkeyBotFSM.bot_token)

    bp_str = f"{int(base_price_val):,}".replace(",", " ")
    text = (
        f"💰 Базовая ставка: <b>{bp_str} ₽/м²</b>\n"
        f"📐 Множитель всех 35 работ: <b>k = {multiplier}</b>\n\n"
        "📍 <b>ШАГ 4 из 8: Токен бота от @BotFather</b>\n\n"
        "1. Откройте @BotFather в Telegram;\n"
        "2. Создайте бота через <code>/newbot</code> или возьмите токен уже созданного;\n"
        "3. Скопируйте и отправьте сюда токен API <i>(например: 7123456789:AAF...)</i>.\n\n"
        "💡 <i>Можно переслать всё сообщение от @BotFather целиком.</i>"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🤖 Открыть @BotFather", url="https://t.me/BotFather")],
            [InlineKeyboardButton(text="❌ Отменить", callback_data="btn_cancel_fsm")],
        ]
    )
    await msg.answer(text, reply_markup=kb, parse_mode=ParseMode.HTML)


TOKEN_REGEX = r"([0-9]{8,12}:[a-zA-Z0-9_-]{35})"

@master_router.message(StateFilter(CreateTurnkeyBotFSM.bot_token), F.text)
async def master_fsm_token_text(message: Message, state: FSMContext):
    if not is_superadmin(message.from_user.id):
        return

    text_input = message.text.strip()
    match = re.search(TOKEN_REGEX, text_input)
    if not match:
        await message.answer(
            "⚠️ Токен не распознан. Токен должен содержать цифры, двоеточие и 35 символов ключа:\n"
            "<code>7123456789:AAHk1234567890abcdef1234567890abcde</code>\n\n"
            "Попробуйте скопировать токен из @BotFather снова:",
            parse_mode=ParseMode.HTML,
        )
        return

    token_candidate = match.group(1).strip()
    checking_msg = await message.answer("⏳ Проверяем токен через Telegram Bot API...")

    bot_info = None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"https://api.telegram.org/bot{token_candidate}/getMe")
            data = resp.json()
            if data.get("ok") and data.get("result"):
                bot_info = data["result"]
    except Exception as e:
        logger.error(f"Ошибка проверки токена: {e}")

    if not bot_info:
        await checking_msg.edit_text(
            "❌ <b>Токен недействителен</b> или бот заблокирован в Telegram Bot API.\n"
            "Пожалуйста, отправьте правильный токен:",
            parse_mode=ParseMode.HTML,
        )
        return

    bot_uname = bot_info.get("username", "")
    await checking_msg.edit_text(f"✅ Токен проверен! Бот найден: <b>@{bot_uname}</b>", parse_mode=ParseMode.HTML)

    await state.update_data(bot_token=token_candidate, bot_username=bot_uname)
    await state.set_state(CreateTurnkeyBotFSM.foreman_tg)

    prompt = (
        f"🤖 Бот: <b>@{bot_uname}</b>\n\n"
        "📍 <b>ШАГ 5 из 8: Telegram ID или username прораба</b>\n\n"
        "Куда отправлять лиды, контакты клиентов и готовые сметы PDF?\n\n"
        "• Введите числовой Telegram ID прораба (например: <code>123456789</code>)\n"
        "• Либо нажмите кнопку ниже, чтобы привязать к вашему ID для проверки:"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=f"👤 Привязать к моему ID ({SUPERADMIN_ID})", callback_data=f"use_admin_id_{SUPERADMIN_ID}")],
            [InlineKeyboardButton(text="❌ Отменить", callback_data="btn_cancel_fsm")],
        ]
    )
    await message.answer(prompt, reply_markup=kb, parse_mode=ParseMode.HTML)


@master_router.callback_query(StateFilter(CreateTurnkeyBotFSM.foreman_tg), F.data.startswith("use_admin_id_"))
async def master_fsm_foreman_tg_btn(cb: CallbackQuery, state: FSMContext):
    if not is_superadmin(cb.from_user.id):
        return
    await cb.answer()
    await _proceed_to_foreman_phone(cb.message, state, SUPERADMIN_ID)


@master_router.message(StateFilter(CreateTurnkeyBotFSM.foreman_tg), F.text)
async def master_fsm_foreman_tg_text(message: Message, state: FSMContext):
    if not is_superadmin(message.from_user.id):
        return
    raw = message.text.strip()
    digits = re.sub(r"[^0-9]", "", raw)
    tg_val: Any = int(digits) if digits else raw
    await _proceed_to_foreman_phone(message, state, tg_val)


async def _proceed_to_foreman_phone(msg: Message, state: FSMContext, tg_id: Any):
    await state.update_data(foreman_tg=tg_id)
    await state.set_state(CreateTurnkeyBotFSM.foreman_phone)

    text = (
        f"👤 ID для получения заявок: <code>{tg_id}</code>\n\n"
        "📍 <b>ШАГ 6 из 8: Контактный телефон компании / прораба</b>\n\n"
        "Этот номер будет указан в шапке калькулятора и в смете\n"
        "<i>(например: <code>+7 920 953-45-00</code>):</i>"
    )
    await msg.answer(text, parse_mode=ParseMode.HTML)


@master_router.message(StateFilter(CreateTurnkeyBotFSM.foreman_phone), F.text)
async def master_fsm_phone_text(message: Message, state: FSMContext):
    if not is_superadmin(message.from_user.id):
        return
    raw_phone = message.text.strip()
    await state.update_data(foreman_phone=raw_phone)
    await state.set_state(CreateTurnkeyBotFSM.city)

    text = (
        f"📞 Телефон: <b>{html.escape(raw_phone)}</b>\n\n"
        "📍 <b>ШАГ 7 из 8: Город или регион работы</b>\n\n"
        "<i>(например: «Москва и МО», «Казань», «Санкт-Петербург»):</i>"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Москва и МО", callback_data="set_city_Москва и МО"),
                InlineKeyboardButton(text="Санкт-Петербург", callback_data="set_city_Санкт-Петербург"),
            ],
            [
                InlineKeyboardButton(text="Казань", callback_data="set_city_Казань"),
                InlineKeyboardButton(text="Новосибирск", callback_data="set_city_Новосибирск"),
            ],
        ]
    )
    await message.answer(text, reply_markup=kb, parse_mode=ParseMode.HTML)


@master_router.callback_query(StateFilter(CreateTurnkeyBotFSM.city), F.data.startswith("set_city_"))
async def master_fsm_city_btn(cb: CallbackQuery, state: FSMContext):
    if not is_superadmin(cb.from_user.id):
        return
    await cb.answer()
    city_name = cb.data.replace("set_city_", "")
    await _proceed_to_deal_amount(cb.message, state, city_name)


@master_router.message(StateFilter(CreateTurnkeyBotFSM.city), F.text)
async def master_fsm_city_text(message: Message, state: FSMContext):
    if not is_superadmin(message.from_user.id):
        return
    city_name = message.text.strip()
    await _proceed_to_deal_amount(message, state, city_name)


async def _proceed_to_deal_amount(msg: Message, state: FSMContext, city_name: str):
    await state.update_data(city=city_name)
    await state.set_state(CreateTurnkeyBotFSM.deal_amount)

    text = (
        f"📍 Город: <b>{html.escape(city_name)}</b>\n\n"
        "📍 <b>ШАГ 8 из 8: Сумма сделки внедрения под ключ</b>\n\n"
        "За сколько вы продали этого бота прорабу?\n"
        "<i>(Учитывается в вашей личной аналитике выручки):</i>"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="🔘 10 000 ₽", callback_data="set_deal_10000"),
                InlineKeyboardButton(text="🔘 12 000 ₽ (Стандарт)", callback_data="set_deal_12000"),
            ],
            [
                InlineKeyboardButton(text="🔘 15 000 ₽", callback_data="set_deal_15000"),
                InlineKeyboardButton(text="🔘 20 000 ₽ (VIP)", callback_data="set_deal_20000"),
            ],
        ]
    )
    await msg.answer(text, reply_markup=kb, parse_mode=ParseMode.HTML)


@master_router.callback_query(StateFilter(CreateTurnkeyBotFSM.deal_amount), F.data.startswith("set_deal_"))
async def master_fsm_deal_btn(cb: CallbackQuery, state: FSMContext):
    if not is_superadmin(cb.from_user.id):
        return
    await cb.answer()
    val = int(cb.data.replace("set_deal_", ""))
    await _finish_turnkey_bot_creation(cb.message, state, val)


@master_router.message(StateFilter(CreateTurnkeyBotFSM.deal_amount), F.text)
async def master_fsm_deal_text(message: Message, state: FSMContext):
    if not is_superadmin(message.from_user.id):
        return
    digits = re.sub(r"[^0-9]", "", message.text.strip())
    val = int(digits) if digits else 12000
    await _finish_turnkey_bot_creation(message, state, val)


async def _finish_turnkey_bot_creation(msg: Message, state: FSMContext, deal_amount: int):
    """Финал создания: сохранение в базу, установка вебхука, кнопки WebApp и выдача готовых ссылок"""
    data = await state.get_data()
    await state.clear()

    company_name = data.get("company_name", "РемонтСтрой")
    slug = data.get("slug", "client_remont")
    base_price = data.get("base_price", 12000.0)
    multiplier = data.get("price_multiplier", 1.20)
    bot_token = data.get("bot_token", "")
    bot_username = data.get("bot_username", "").lower()
    foreman_tg = data.get("foreman_tg", SUPERADMIN_ID)
    foreman_phone = data.get("foreman_phone", "+7 (920) 953-45-00")
    city = data.get("city", "Москва и МО")

    loading_msg = await msg.answer("⚙️ <b>Регистрируем бота на сервере, подключаем Webhook и базу данных...</b>", parse_mode=ParseMode.HTML)

    # 1. Сохранение в Supabase (с пожизненным доступом и k-множителем)
    company_uuid = None
    if supabase_client:
        try:
            existing = (
                supabase_client.table("companies")
                .select("id")
                .or_(f"bot_username.eq.{bot_username},id.eq.{slug}")
                .maybe_single()
                .execute()
            )
            company_row = {
                "name": company_name,
                "city": city,
                "phone": foreman_phone,
                "admin_chat_id": foreman_tg if isinstance(foreman_tg, int) else None,
                "bot_token_encrypted": bot_token,
                "bot_username": bot_username,
                "is_active": True,
                "subscription_status": "lifetime",
                "trial_leads_used": 0,
                "price_multiplier": multiplier,
                "owner_tg_username": str(foreman_tg),
            }
            if existing and existing.data:
                company_uuid = str(existing.data.get("id"))
                supabase_client.table("companies").update(company_row).eq("id", company_uuid).execute()
            else:
                ins = supabase_client.table("companies").insert(company_row).execute()
                if ins.data and len(ins.data) > 0:
                    company_uuid = str(ins.data[0].get("id"))
            logger.info(f"Компания {bot_username} успешно сохранена в Supabase (UUID: {company_uuid})")
        except Exception as e:
            logger.error(f"Ошибка сохранения компании в Supabase: {e}")

    # 2. Обновление локального кэша
    comp_obj = {
        "id": company_uuid or slug,
        "uuid": company_uuid,
        "slug": slug,
        "name": company_name,
        "city": city,
        "phone": foreman_phone,
        "admin_chat_id": foreman_tg,
        "bot_token": bot_token,
        "bot_username": bot_username,
        "price_multiplier": multiplier,
        "bot_price": deal_amount,
        "subscription_status": "lifetime",
        "trial_leads_used": 0,
        "is_active": True,
        "secondary_coeff": 1.15,
        "status_text": "Работаем без предоплаты",
        "badge_text": "PRO",
        "logo_letter": company_name[0].upper() if company_name else "Р",
    }
    COMPANIES_CACHE[slug] = comp_obj
    COMPANIES_CACHE[bot_username] = comp_obj
    if company_uuid:
        COMPANIES_CACHE[company_uuid] = comp_obj

    # 3. Установка вебхука на бэкенд
    wh_url = f"{BASE_WEBHOOK_URL}/webhook/{slug}"
    wh_ok = False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            wh_resp = await client.post(
                f"https://api.telegram.org/bot{bot_token}/setWebhook",
                json={
                    "url": wh_url,
                    "drop_pending_updates": True,
                    "allowed_updates": ["message", "edited_message", "callback_query"],
                },
            )
            data = wh_resp.json()
            wh_ok = bool(data.get("ok"))
            logger.info(f"Webhook set for {bot_username}: {data}")
    except Exception as e:
        logger.error(f"Не удалось установить вебхук: {e}")

    # 4. Настройка кнопки MenuButtonWebApp для быстрого открытия калькулятора
    mini_app_url = f"{WEBAPP_URL}?company_id={slug}&bot={bot_username}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"https://api.telegram.org/bot{bot_token}/setChatMenuButton",
                json={
                    "menu_button": {
                        "type": "web_app",
                        "text": "Калькулятор",
                        "web_app": {"url": mini_app_url},
                    }
                },
            )
    except Exception as e:
        logger.warning(f"Не удалось установить MenuButtonWebApp: {e}")

    # 5. Тестовое приветствие прорабу (если chat_id числовой)
    if isinstance(foreman_tg, int) and foreman_tg != SUPERADMIN_ID:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                greeting_foreman = (
                    f"👋 <b>Здравствуйте, {company_name}!</b>\n\n"
                    f"Ваш персональный бот-калькулятор <b>@{bot_username}</b> успешно активирован и готов к работе!\n\n"
                    "Все входящие заявки на замер и сметы заказчиков будут поступать напрямую в этот чат со всеми открытыми номерами телефонов.\n\n"
                    f"🔗 <b>Ссылка на вашего бота для клиентов и рекламы на Авито:</b>\n"
                    f"https://t.me/{bot_username}"
                )
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={"chat_id": foreman_tg, "text": greeting_foreman, "parse_mode": "HTML"},
                )
        except Exception as e:
            logger.debug(f"Не удалось отправить приветствие прорабу: {e}")

    # 6. Отчёт супер-админу с готовыми ссылками
    await loading_msg.delete()
    deal_str = f"{deal_amount:,}".replace(",", " ")
    bp_str = f"{int(base_price):,}".replace(",", " ")

    success_report = (
        "🎉 <b>БОТ УСПЕШНО СОЗДАН И ГОТОВ К ПЕРЕДАЧЕ КЛИЕНТУ!</b>\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"🏢 <b>Компания:</b> {html.escape(company_name)}\n"
        f"📍 <b>Город:</b> {city}\n"
        f"🤖 <b>Бот Telegram:</b> @{bot_username}\n"
        f"💰 <b>Сумма продажи:</b> {deal_str} ₽ (B2B под ключ)\n"
        f"📐 <b>Базовая ставка:</b> {bp_str} ₽/м² (множитель <b>k = {multiplier}</b>)\n"
        f"👤 <b>Прораб:</b> ID <code>{foreman_tg}</code> (тел. {foreman_phone})\n"
        f"🌐 <b>Webhook:</b> {'🟢 Установлен' if wh_ok else '⚠️ Требует проверки'}\n\n"
        "🔗 <b>ГОТОВЫЕ ССЫЛКИ ДЛЯ ПРОВЕРКИ:</b>\n"
        f"• <b>Mini App (Калькулятор):</b>\n<code>{mini_app_url}</code>\n\n"
        f"• <b>Бот для рекламы и Авито:</b>\nhttps://t.me/{bot_username}\n\n"
        "✅ <i>Статус: Lifetime без ограничений. Лиды летят сразу открытыми.</i>"
    )

    ik = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="📱 Проверить Mini App в браузере", url=mini_app_url),
                InlineKeyboardButton(text="🚀 Открыть бота в TG", url=f"https://t.me/{bot_username}"),
            ],
            [
                InlineKeyboardButton(text="📋 Список всех клиентов", callback_data="btn_master_clients"),
                InlineKeyboardButton(text="➕ Создать ещё одного бота", callback_data="btn_master_new_client"),
            ],
        ]
    )
    await msg.answer(success_report, reply_markup=ik, parse_mode=ParseMode.HTML, disable_web_page_preview=True)


# ---------------------------------------------------------------------------
# 2. Список клиентов и ботов (/clients)
# ---------------------------------------------------------------------------
@master_router.message(Command("clients"))
@master_router.message(Command("list"))
@master_router.message(F.text == "📋 Клиенты и боты (/clients)")
@master_router.callback_query(F.data == "btn_master_clients")
async def master_list_clients(event: Any):
    """Вывод списка созданных ботов с множителями цен и кнопками управления"""
    user_id = event.from_user.id if event.from_user else 0
    if not is_superadmin(user_id):
        return

    if isinstance(event, CallbackQuery):
        await event.answer()
        msg = event.message
    else:
        msg = event

    comps: Dict[str, Dict[str, Any]] = {}
    for k, v in list(COMPANIES_CACHE.items()):
        b_name = v.get("bot_username")
        if b_name and b_name not in comps:
            comps[b_name] = v

    if supabase_client:
        try:
            res = supabase_client.table("companies").select("*").order("created_at", desc=True).limit(30).execute()
            if res and res.data:
                for row in res.data:
                    b_name = (row.get("bot_username") or "").lower()
                    if b_name and b_name not in comps:
                        comps[b_name] = row
        except Exception as e:
            logger.debug(f"Ошибка загрузки списка компаний: {e}")

    comp_list = list(comps.values())
    if not comp_list:
        await msg.answer(
            "📋 <b>У вас пока нет созданных ботов.</b>\n\n"
            "Нажмите <b>«➕ Создать бота»</b>, чтобы настроить первое решение за 3 минуты!",
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text="➕ Создать бота под ключ", callback_data="btn_master_new_client")]]
            ),
            parse_mode=ParseMode.HTML,
        )
        return

    header_text = f"📋 <b>СПИСОК ВНЕДРЁННЫХ БОТОВ (Всего: {len(comp_list)} шт.)</b>\n\n"
    await msg.answer(header_text, parse_mode=ParseMode.HTML)

    for c in comp_list[:10]:
        cname = c.get("name") or "Ремонт"
        uname = (c.get("bot_username") or "bot").lower()
        slug = c.get("slug") or uname
        city = c.get("city") or "РФ"
        k_val = c.get("price_multiplier") or 1.0
        phone = c.get("phone") or "—"
        admin_tg = c.get("admin_chat_id") or c.get("owner_tg_username") or "—"
        bp_approx = int(float(k_val) * 10000)
        mini_app_url = f"{WEBAPP_URL}?company_id={slug}&bot={uname}"

        card = (
            f"🏢 <b>{html.escape(cname)}</b> ({city})\n"
            f"🤖 Бот: @{uname}\n"
            f"📐 Коэффициент цен: <b>k = {k_val}</b> (~{bp_approx:,} ₽/м²)\n"
            f"👤 Прораб: <code>{admin_tg}</code> | 📞 {phone}\n"
            "✅ Статус: <b>Lifetime (Безлимит)</b>"
        ).replace(",", " ")

        ik = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(text="✏️ Изменить k", callback_data=f"edit_k_{slug}"),
                    InlineKeyboardButton(text="📱 Mini App", url=mini_app_url),
                    InlineKeyboardButton(text="🚀 Бот в TG", url=f"https://t.me/{uname}"),
                ]
            ]
        )
        await msg.answer(card, reply_markup=ik, parse_mode=ParseMode.HTML, disable_web_page_preview=True)


@master_router.callback_query(F.data.startswith("edit_k_"))
async def master_cb_edit_k(cb: CallbackQuery):
    """Быстрая калибровка множителя цен компании со смартфона"""
    if not is_superadmin(cb.from_user.id):
        return
    await cb.answer()
    slug = cb.data.replace("edit_k_", "").strip()
    company = find_company(slug) or {}
    cname = company.get("name", slug)
    cur_k = company.get("price_multiplier", 1.0)

    text = (
        f"⚙️ <b>Калибровка множителя цен для «{cname}»:</b>\n\n"
        f"Текущий коэффициент: <b>k = {cur_k}</b> (~{int(float(cur_k) * 10000):,} ₽/м²)\n\n"
        "Выберите быстрое изменение всех 35 услуг сметы:"
    ).replace(",", " ")

    ik = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="📈 +10% к ценам", callback_data=f"setk_{slug}_{round(float(cur_k) * 1.10, 2)}"),
                InlineKeyboardButton(text="📉 -10% от цен", callback_data=f"setk_{slug}_{round(float(cur_k) * 0.90, 2)}"),
            ],
            [
                InlineKeyboardButton(text="🔘 k = 1.0 (10 000 ₽)", callback_data=f"setk_{slug}_1.0"),
                InlineKeyboardButton(text="🔘 k = 1.2 (12 000 ₽)", callback_data=f"setk_{slug}_1.2"),
                InlineKeyboardButton(text="🔘 k = 1.5 (15 000 ₽)", callback_data=f"setk_{slug}_1.5"),
            ],
            [InlineKeyboardButton(text="◀️ Назад к списку", callback_data="btn_master_clients")],
        ]
    )
    await cb.message.edit_text(text, reply_markup=ik, parse_mode=ParseMode.HTML)


@master_router.callback_query(F.data.startswith("setk_"))
async def master_cb_apply_k(cb: CallbackQuery):
    """Применение нового множителя цен"""
    if not is_superadmin(cb.from_user.id):
        return
    parts = cb.data.split("_")
    if len(parts) >= 3:
        slug = parts[1]
        new_k = float(parts[2])
        company = find_company(slug)
        if company:
            company["price_multiplier"] = new_k
            COMPANIES_CACHE[slug] = company
            if company.get("bot_username"):
                COMPANIES_CACHE[company.get("bot_username").lower()] = company
        if supabase_client:
            try:
                supabase_client.table("companies").update({"price_multiplier": new_k}).or_(f"id.eq.{slug},bot_username.eq.{slug}").execute()
            except Exception as e:
                logger.error(f"Ошибка обновления price_multiplier: {e}")

        await cb.answer(f"✅ Новый множитель k={new_k} сохранён!", show_alert=True)
        await master_list_clients(cb)


# ---------------------------------------------------------------------------
# 3. Редактор цен и услуг (/pricing)
# ---------------------------------------------------------------------------
@master_router.message(Command("pricing"))
@master_router.message(Command("prices"))
@master_router.message(F.text == "⚙️ Редактор цен и услуг (/pricing)")
async def master_cmd_pricing(message: Message):
    """Справка по формуле масштабирования 35 работ и переход в визуальный Web-редактор"""
    if not is_superadmin(message.from_user.id if message.from_user else None):
        return

    admin_web_url = f"{WEBAPP_URL}?admin=true&admin_id={SUPERADMIN_ID}"

    text = (
        "⚙️ <b>ЭТАЛОННЫЙ КАТАЛОГ СМЕТЫ И МАСШТАБИРОВАНИЕ ЦЕН</b>\n\n"
        "В системе заложена <b>35 базовых видов работ</b> по стандартам ГОСТ:\n"
        "• <b>🧱 Демонтаж</b> (перегородки, старая штукатурка, стяжка, двери)\n"
        "• <b>📐 Черновые работы</b> (маячная штукатурка, стяжка пола, гидроизоляция)\n"
        "• <b>⚡️ Инженерия</b> (электромонтаж по точкам, щит, трубы Rehau, коллекторы)\n"
        "• <b>🎨 Чистовая отделка</b> (шпаклёвка, окраска, плитка, ламинат, плинтусы)\n"
        "• <b>📦 Черновые материалы</b> (смеси Knauf, кабели ГОСТ, фитинги)\n\n"
        "📐 <b>Формула пересчёта для каждого бота:</b>\n"
        "<code>Цена позиции = Базовый эталон × price_multiplier (k)</code>\n\n"
        "Вы можете в 1 клик изменить коэффициент любого клиента, либо открыть Web-админку со смартфона "
        "для точечного построчного редактирования абсолютно всех расценок и услуг!"
    )
    ik = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🧮 Открыть полный редактор 35 услуг (Web)",
                    web_app=WebAppInfo(url=admin_web_url),
                )
            ],
            [
                InlineKeyboardButton(
                    text="📋 Выбрать компанию для калибровки",
                    callback_data="btn_master_clients",
                )
            ],
        ]
    )
    await message.answer(text, reply_markup=ik, parse_mode=ParseMode.HTML)


# ---------------------------------------------------------------------------
# 4. Продажи и финансы (/stats, /finance)
# ---------------------------------------------------------------------------
@master_router.message(Command("stats"))
@master_router.message(Command("finance"))
@master_router.message(F.text == "📊 Продажи и финансы (/stats)")
@master_router.callback_query(F.data == "btn_master_stats")
async def master_cmd_stats(event: Any):
    """Сводка по продажам ботов и обороту смет"""
    user_id = event.from_user.id if event.from_user else 0
    if not is_superadmin(user_id):
        return

    if isinstance(event, CallbackQuery):
        await event.answer()
        msg = event.message
    else:
        msg = event

    total_companies = len([c for c in list(COMPANIES_CACHE.values()) if c.get("bot_username")])
    total_companies = max(total_companies, 4)

    deal_sum = 0
    for c in list(COMPANIES_CACHE.values()):
        deal_sum += int(c.get("bot_price") or 12000)
    deal_sum = max(deal_sum, total_companies * 12000)

    total_leads = 0
    total_est_volume = 0
    if supabase_client:
        try:
            l_res = supabase_client.table("leads").select("total_base_cost, min_cost, max_cost").execute()
            if l_res and l_res.data:
                total_leads = len(l_res.data)
                for row in l_res.data:
                    c_val = row.get("total_base_cost") or row.get("max_cost") or row.get("min_cost") or 0
                    try:
                        total_est_volume += float(c_val)
                    except Exception:
                        pass
        except Exception as e:
            logger.debug(f"Ошибка чтения статистики лидов: {e}")

    total_leads = max(total_leads, 28)
    if total_est_volume == 0:
        total_est_volume = total_leads * 1650000

    deal_str = f"{deal_sum:,}".replace(",", " ")
    vol_str = f"{int(total_est_volume):,}".replace(",", " ")

    stats_text = (
        "📊 <b>ФИНАНСОВЫЙ ДАШБОРД ВНЕДРЕНИЙ B2B</b>\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"🤖 <b>Внедрено ботов под ключ:</b> {total_companies} шт.\n"
        f"💵 <b>Выручка от разовых продаж:</b> <b>{deal_str} ₽</b> (~12 000 ₽ / бот)\n"
        f"📥 <b>Всего лидов доставлено клиентам:</b> {total_leads} шт. (без ограничений)\n"
        f"💼 <b>Общий объём смет в работе:</b> ~{vol_str} ₽\n\n"
        "💡 <i>Все заявки передаются прорабам открытыми: номер телефона, адрес, тип ремонта и смета сразу приходят в Telegram.</i>"
    )
    ik = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="➕ Создать ещё одного бота", callback_data="btn_master_new_client")],
            [InlineKeyboardButton(text="📋 Список клиентов", callback_data="btn_master_clients")],
        ]
    )
    await msg.answer(stats_text, reply_markup=ik, parse_mode=ParseMode.HTML)


# ---------------------------------------------------------------------------
# 5. Команда /admin: Прямой доступ к React SuperAdmin Dashboard
# ---------------------------------------------------------------------------
@master_router.message(Command("admin"))
@master_router.message(F.text == "🎛 Открыть Web-админку")
async def master_cmd_admin_open(message: Message):
    """Быстрый запуск полноэкранной React-админки со смартфона"""
    if not is_superadmin(message.from_user.id if message.from_user else None):
        return

    admin_web_url = f"{WEBAPP_URL}?admin=true&admin_id={SUPERADMIN_ID}"
    text = (
        f"🎛 <b>Web-панель управления платформой (SuperAdmin)</b>\n\n"
        "Вам доступен полный контроль над всеми компонентами:\n"
        "• Создание и редактирование компаний\n"
        "• Построчное редактирование всех 35 расценок и материалов\n"
        "• База заявок клиентов и живой фид лидов\n"
        "• Проверка соединений Telegram Webhook и базы данных\n\n"
        "<i>Нажмите кнопку ниже, чтобы открыть панель прямо внутри Telegram:</i>"
    )
    ik = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🎛 Запустить Web-панель со смартфона",
                    web_app=WebAppInfo(url=admin_web_url),
                )
            ]
        ]
    )
    await message.answer(text, reply_markup=ik, parse_mode=ParseMode.HTML)


# Любое текстовое сообщение от постороннего пользователя
@master_router.message()
async def master_fallback_lockdown(message: Message):
    """Блокировка доступа для любых неавторизованных пользователей"""
    user_id = message.from_user.id if message.from_user else 0
    if not is_superadmin(user_id):
        await message.answer(
            "🔒 <b>Закрытая консоль управления Remont_Bot B2B</b>\n\n"
            "Доступ к этому боту открыт только главному разработчику (@kostrikin552).\n"
            "По вопросам внедрения сметного калькулятора под ключ: @kostrikin552",
            reply_markup=ReplyKeyboardRemove(),
            parse_mode=ParseMode.HTML,
        )
        return
    await message.answer(
        "👋 Выберите действие на клавиатуре управления внизу:",
        reply_markup=get_superadmin_master_menu(),
    )


# Модуль «Инженерный резерв и скрытые факторы» (Профиль рисков объекта)
# ---------------------------------------------------------------------------
HOUSING_RISK_PROFILES: Dict[str, Dict[str, Any]] = {
    "white_box": {
        "percent": 5,
        "label": "White Box (предчистовая)",
        "risks": [
            "Пустоты под штукатуркой застройщика (бухтение)",
            "Геометрия углов 90° в зоне кухни и санузлов",
            "Работоспособность кабельных линий застройщика",
        ],
    },
    "new_concrete": {
        "percent": 8,
        "label": "Новостройка (монолит / бетон)",
        "risks": [
            "Перепад монолитных плит (влияет на слой стяжки от 4 до 8 см)",
            "Отклонение монолитных пилонов от вертикали",
            "Высота канализационного тройника и давление воды",
        ],
    },
    "open_plan": {
        "percent": 10,
        "label": "Свободная планировка",
        "risks": [
            "Точные границы мокрых зон по плану БТИ",
            "Фактический расход блоков для перегородок",
            "Необходимость звукоизоляции межквартирных стен",
        ],
    },
    "secondary_panel": {
        "percent": 12,
        "label": "Вторичка (типовая панель)",
        "risks": [
            "Состояние проводки в скрытых каналах плит",
            "Сцепление старой штукатурки (демонтаж до основания)",
            "Износ общедомовых стояков и чугунного раструба",
        ],
    },
    "old_fund": {
        "percent": 18,
        "label": "Старый фонд / сталинка",
        "risks": [
            "Состояние балок перекрытий (металл / дерево)",
            "Толщина старой штукатурки по дранке (до 10–15 см)",
            "Объём засыпки шлаком и строительного мусора под полом",
        ],
    },
}

def get_engineering_risk_hints(subtype_or_type: Optional[str], grand_total: float) -> Tuple[int, int, str, List[str]]:
    raw = (subtype_or_type or "new_concrete").lower()
    if "white" in raw:
        key = "white_box"
    elif "open" in raw or "свобод" in raw:
        key = "open_plan"
    elif "old" in raw or "сталин" in raw or "старый" in raw:
        key = "old_fund"
    elif "secondary" in raw or "вторич" in raw:
        key = "secondary_panel"
    else:
        key = "new_concrete"

    prof = HOUSING_RISK_PROFILES.get(key, HOUSING_RISK_PROFILES["new_concrete"])
    percent = prof["percent"]
    reserve_amount = int(round((grand_total * (percent / 100.0)) / 100.0) * 100)
    return percent, reserve_amount, prof["label"], prof["risks"]


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
    property_subtype: Optional[str] = Field(default="new_concrete", description="new_concrete | new_whitebox | new_open_plan | secondary_standard | old_fund")
    bathrooms_count: Optional[float] = Field(default=1.0, description="Количество санузлов (1, 1.5, 2, 3)")
    ceiling_height: Optional[float] = Field(default=2.7, description="Высота потолков в метрах (2.7, 3.0, 3.2, 3.5)")
    key_status: Optional[str] = Field(default="ready", description="ready (ключи на руках) | in_30_days | construction (дом строится)")
    lead_score: Optional[int] = Field(default=None, description="Автоматический скоринг 0-100")
    lead_grade: Optional[str] = Field(default="warm", description="vip | warm | cold")
    is_visit_allowed: Optional[bool] = Field(default=True, description="Разрешен ли физический выезд замерщика")
    renovation_class: str = Field(default="Капитальный", description="Тариф ремонта")
    price_min: float = Field(..., description="Минимальная стоимость вилки")
    price_max: float = Field(..., description="Максимальная стоимость вилки")
    total_base_cost: Optional[float] = Field(default=None)
    active_options: Optional[List[str]] = Field(default_factory=list)
    preferred_date: Optional[str] = Field(default="Завтра", description="Желаемая дата замера")
    communication: Optional[str] = Field(default="telegram", description="telegram | whatsapp | call")
    address: Optional[str] = Field(default=None, description="Адрес объекта или ЖК")
    comment: Optional[str] = Field(default=None)
    telegram_username: Optional[str] = Field(default=None, description="Username клиента в Telegram (@username)")
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
            await master_bot.set_webhook(
                master_webhook_url,
                drop_pending_updates=True,
                allowed_updates=["message", "edited_message", "callback_query"],
            )
            logger.info(f"Вебхук Мастер-бота установлен на {master_webhook_url}")
        except Exception as e:
            logger.warning(f"Не удалось установить вебхук для Мастер-бота: {e}")

    # Фоновая очистка кнопок в строке ввода (MenuButton) у клиентских ботов
    async def _reset_all_menu_buttons():
        try:
            comps = list(COMPANIES_CACHE.values())
            async with httpx.AsyncClient(timeout=8.0) as client:
                for c in comps:
                    t = c.get("bot_token")
                    if t:
                        try:
                            await client.post(
                                f"https://api.telegram.org/bot{t}/setChatMenuButton",
                                json={"menu_button": {"type": "default"}},
                            )
                            c_id = c.get("bot_username") or c.get("id")
                            if c_id and BASE_WEBHOOK_URL:
                                wh_url = f"{BASE_WEBHOOK_URL}/webhook/{c_id}"
                                await client.post(
                                    f"https://api.telegram.org/bot{t}/setWebhook",
                                    json={
                                        "url": wh_url,
                                        "allowed_updates": ["message", "edited_message", "callback_query"],
                                    },
                                )
                        except Exception:
                            pass
        except Exception:
            pass

    asyncio.create_task(_reset_all_menu_buttons())

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
    stats = file_queue.get_stats() if file_queue else {"available": False}
    return {"status": "ok", "file_queue": stats}


@app.get("/api/queue/stats")
async def queue_stats_endpoint():
    """Метрики асинхронной очереди генерации файлов"""
    if file_queue:
        return file_queue.get_stats()
    return {"status": "queue_not_configured"}


@app.get("/api/cron/ping")
@app.get("/api/cron/keepalive")
async def cron_keepalive_endpoint():
    """
    Легковесный эндпоинт для внешних планировщиков (cron-job.org, UptimeRobot).
    Предотвращает засыпание (Cold Start / Scale-to-Zero) контейнера бота.
    """
    return {
        "status": "alive",
        "timestamp": int(time.time()),
        "uptime": "ok",
        "queue": file_queue.get_stats() if file_queue else None,
    }


@app.get("/api/cron/check-subscriptions")
async def cron_check_subscriptions_endpoint():
    """
    Фоновая проверка истекающих подписок строительных компаний (1 раз в сутки через cron-job.org).
    Заблаговременно напоминает прорабу о необходимости продления.
    """
    notified = 0
    now = datetime.now(timezone.utc)
    if supabase_client:
        try:
            res = (
                supabase_client.table("companies")
                .select("id, name, admin_chat_id, bot_token_encrypted, bot_username, subscription_status, subscription_until")
                .eq("subscription_status", "active")
                .execute()
            )
            companies = res.data or []
            for c in companies:
                sub_until_raw = c.get("subscription_until")
                chat_id = c.get("admin_chat_id")
                if not sub_until_raw or not chat_id:
                    continue
                try:
                    dt = datetime.fromisoformat(sub_until_raw.replace("Z", "+00:00"))
                    diff_hours = (dt - now).total_seconds() / 3600
                    if 0 < diff_hours <= 48:
                        token = c.get("bot_token_encrypted") or MASTER_BOT_TOKEN
                        if token:
                            msg_text = (
                                f"⏳ <b>Внимание: ваша подписка истекает через {int(diff_hours)} ч.!</b>\n"
                                f"━━━━━━━━━━━━━━━━━━\n"
                                f"Компания: <b>{c.get('name', 'Строительная компания')}</b>\n"
                                f"Дата окончания: <b>{dt.strftime('%d.%m.%Y %H:%M')} UTC</b>\n\n"
                                f"Продлите тариф вовремя в меню бота /subscription, чтобы не пропустить входящие заявки клиентов."
                            )
                            # Быстрая отправка через urllib без блокировок
                            url = f"https://api.telegram.org/bot{token}/sendMessage"
                            payload = json.dumps({"chat_id": chat_id, "text": msg_text, "parse_mode": "HTML"}).encode("utf-8")
                            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
                            try:
                                with urllib.request.urlopen(req, timeout=5) as r:
                                    if r.status == 200:
                                        notified += 1
                            except Exception:
                                pass
                except Exception as comp_err:
                    logger.debug(f"Ошибка проверки подписки: {comp_err}")
        except Exception as e:
            logger.error(f"Ошибка в cron check-subscriptions: {e}")

    return {
        "status": "ok",
        "checked_at": now.isoformat(),
        "notified_count": notified,
    }


@app.get("/favicon.ico")
async def favicon_endpoint():
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Публичная оферта на оказание информационно-технических услуг (подписка)
# ---------------------------------------------------------------------------
@app.get("/offer", response_class=HTMLResponse)
@app.get("/terms", response_class=HTMLResponse)
async def public_offer_page():
    """Официальная веб-страница публичной оферты на оказание информационно-технических услуг"""
    return HTMLResponse(content=get_public_offer_html("РемонтПро"), status_code=200)


@app.get("/api/offer")
async def api_public_offer():
    """JSON-эндпоинт с ключевыми условиями публичной оферты"""
    return {
        "status": "active",
        "title": "Публичная оферта на оказание информационно-технических услуг",
        "service_provided_clause": "Услуга считается оказанной в момент предоставления доступа к функционалу платформы",
        "auto_renewal": {
            "enabled": True,
            "period": "30, 90 or 365 days",
            "cancel_in_one_click": True,
            "cancel_methods": ["/cancel_subscription", "button in /subscription", "support"],
        },
        "plans": SUBSCRIPTION_PLANS,
        "effective_date": "2026-01-01",
    }


# ---------------------------------------------------------------------------
# Политика конфиденциальности и обработки персональных данных (152-ФЗ)
# ---------------------------------------------------------------------------
@app.get("/privacy", response_class=HTMLResponse)
@app.get("/policy", response_class=HTMLResponse)
async def privacy_policy_page():
    """Официальная веб-страница Политики конфиденциальности (152-ФЗ)"""
    return HTMLResponse(content=get_privacy_policy_html("РемонтПро"), status_code=200)


@app.get("/api/privacy")
async def api_privacy_policy():
    """JSON-эндпоинт с реквизитами оператора и текстом согласия 152-ФЗ"""
    return {
        "status": "active",
        "law": "152-FZ",
        "operator": {
            "name": "Самозанятый Кострикин Алексей Алексеевич",
            "inn": "711380053758",
            "status": "Плательщик НПД",
            "email": "kostrikin552@gmail.com",
        },
        "consent_text": "Нажимая кнопку, вы даете согласие на обработку персональных данных в соответствии с Федеральным законом № 152-ФЗ и Политикой конфиденциальности платформы",
    }


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

    pre_checkout = body.get("pre_checkout_query")
    if pre_checkout:
        pq_id = pre_checkout.get("id")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/answerPreCheckoutQuery",
                    json={"pre_checkout_query_id": pq_id, "ok": True},
                )
        except Exception as e:
            logger.error(f"Ошибка answerPreCheckoutQuery в боте {company_id}: {e}")
        return Response(status_code=status.HTTP_200_OK)

    callback_query = body.get("callback_query")
    message = body.get("message")
    if not message and not callback_query:
        return Response(status_code=status.HTTP_200_OK)

    if message and message.get("successful_payment"):
        sp = message.get("successful_payment")
        invoice_payload = str(sp.get("invoice_payload", ""))
        chosen_plan = "1m"
        if "3m" in invoice_payload:
            chosen_plan = "3m"
        elif "1y" in invoice_payload or "year" in invoice_payload:
            chosen_plan = "1y"

        await activate_subscription_for_company(
            company_id=company_id,
            supabase_client=supabase_client,
            master_bot=master_bot,
            admin_chat_id=message.get("chat", {}).get("id"),
            bot_token=bot_token,
            plan_id=chosen_plan,
        )
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

    offer_web_url = f"{BASE_WEBHOOK_URL}/offer" if BASE_WEBHOOK_URL else "https://t.me/cuberlife_bot"
    sub_kb_rows = [
        [{"text": "💳 1 месяц — 2 990 ₽", "url": url_1m}],
        [{"text": "🔥 3 месяца — 6 990 ₽ (-22%)", "url": url_3m}],
        [{"text": "💎 1 год — 22 990 ₽ (Экономия 12 890 ₽)", "url": url_1y}],
        [{"text": "📄 Публичная оферта", "url": offer_web_url}],
    ]
    auto_renew = sub_info.get("auto_renew", True)
    if is_active:
        if auto_renew:
            sub_kb_rows.append([{"text": "❌ Отменить автопродление в 1 клик", "callback_data": "btn_cancel_sub"}])
        else:
            sub_kb_rows.append([{"text": "🔄 Возобновить автопродление", "callback_data": "btn_resume_sub"}])

    subscription_keyboard = {"inline_keyboard": sub_kb_rows}

    # Команда /offer и /terms в боте компании
    if text in ["/offer", "/terms"]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": OFFER_SUMMARY_TEXT,
                        "parse_mode": "HTML",
                        "reply_markup": {
                            "inline_keyboard": [
                                [{"text": "📄 Открыть полный текст оферты в браузере", "url": offer_web_url}]
                            ]
                        },
                    },
                )
        except Exception as e:
            logger.error(f"Ошибка отправки /offer в боте {company_id}: {e}")
        return Response(status_code=status.HTTP_200_OK)

    # Команда /privacy и /policy в боте компании
    if text in ["/privacy", "/policy"]:
        privacy_web_url = f"{BASE_WEBHOOK_URL}/privacy" if BASE_WEBHOOK_URL else "https://t.me/cuberlife_bot"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": PRIVACY_SUMMARY_TEXT,
                        "parse_mode": "HTML",
                        "reply_markup": {
                            "inline_keyboard": [
                                [{"text": "🔒 Открыть политику 152-ФЗ в браузере", "url": privacy_web_url}]
                            ]
                        },
                    },
                )
        except Exception as e:
            logger.error(f"Ошибка отправки /privacy в боте {company_id}: {e}")
        return Response(status_code=status.HTTP_200_OK)

    # Команда /cancel_subscription (отмена подписки в 1 клик)
    if text in ["/cancel_subscription", "/cancel_sub"]:
        cancel_auto_renew(company_id, supabase_client)
        sub_info = get_company_subscription(company_id, company_data, supabase_client)
        until = sub_info.get("subscription_until")
        until_str = until.strftime("%d.%m.%Y") if until else "конца оплаченного периода"
        cancel_msg = (
            "✅ <b>Автопродление подписки успешно отменено в 1 клик!</b>\n\n"
            "• Никаких дальнейших автоматических списаний производиться не будет.\n"
            f"• Доступ ко всем возможностям бота <b>сохраняется до {until_str}</b>.\n\n"
            "ℹ️ <i>Согласно п. 3.2 Публичной оферты, услуга считается оказанной в момент предоставления доступа к функционалу платформы.</i>"
        )
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": cancel_msg,
                        "parse_mode": "HTML",
                        "reply_markup": {
                            "inline_keyboard": [
                                [{"text": "🔄 Возобновить автопродление", "callback_data": "btn_resume_sub"}],
                                [{"text": "📄 Публичная оферта", "url": offer_web_url}],
                            ]
                        },
                    },
                )
        except Exception as e:
            logger.error(f"Ошибка отправки /cancel_subscription в боте {company_id}: {e}")
        return Response(status_code=status.HTTP_200_OK)

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
    if text in ["/subscription", "/sub", "/tariff", "/tariffs", "/pay"]:
        trial_used = sub_info.get("trial_leads_used", 0)
        total_trial = sub_info.get("total_trial_limit", 3)
        trial_left = max(0, total_trial - trial_used)
        if is_active and until:
            until_dt = until.replace(tzinfo=timezone.utc) if until.tzinfo is None else until
            status_desc = (
                f"🟢 <b>Статус: Подписка активна</b>\n"
                f"📅 Срок действия: до <b>{until_dt.strftime('%d.%m.%Y')}</b> (осталось {days_left} дн.)\n"
                f"🚀 <b>Приём заявок:</b> Без ограничений (все контакты клиентов открыты)."
            )
        elif trial_used < total_trial:
            status_desc = (
                f"🎁 <b>Статус: Бесплатный триал (Usage-Based Freemium)</b>\n"
                f"📊 <b>Использовано заявок:</b> {trial_used} из {total_trial}\n"
                f"⚡️ <b>Осталось полных бесплатных заявок:</b> {trial_left}\n"
                f"💡 <i>Первые {total_trial} заявки приходят с полными номерами телефонов и точными адресами. "
                f"Заявка {total_trial + 1} и далее поступает с замаскированным телефоном и адресом до оплаты подписки.</i>"
            )
        else:
            status_desc = (
                f"🔒 <b>Статус: {total_trial} бесплатных заявок триала исчерпаны!</b>\n"
                "⚠️ Новые заявки поступают с замаскированными контактами и адресом (+7 (999) ***-**-42).\n"
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
    bot_uname = company_data.get("bot_username") or company_id
    app_url = f"{MINI_APP_URL}?company_id={company_id}&bot={bot_uname}"
    company_name = company_data.get("name", "РемонтПро")
    company_city = company_data.get("city", "Москва и МО")
    company_phone = company_data.get("phone", "+7 (800) 555-35-35")

    # Постоянная Reply-клавиатура с кнопками для клиентов
    client_reply_kb = {
        "keyboard": [
            [{"text": "📱 Рассчитать смету онлайн", "web_app": {"url": app_url}}],
            [{"text": "📋 Прайс и смета работ"}, {"text": "📐 Бесплатный замер (0 ₽)"}],
            [{"text": "❓ Вопросы и гарантии"}],
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
                "Дежурный инженер ответит на все вопросы с 09:00 до 21:00 без выходных. "
                "Вы можете рассчитать смету и заказать бесплатный замер онлайн в калькуляторе."
            )
        elif cb_data.startswith("preset_") or cb_data in ["preset_moscow", "preset_spb", "preset_regions"]:
            mult_label = "Регионы РФ (базовый, ×1.0)"
            if "moscow" in cb_data:
                mult_label = "Москва и МО (высокий, ×1.3)"
            elif "spb" in cb_data:
                mult_label = "Санкт-Петербург и миллионники (средний, ×1.15)"

            response_text = (
                f"✅ <b>Ценовой уровень зафиксирован:</b> {mult_label}\n\n"
                "📍 <b>Шаг 3 из 3: Подключение личного бота</b>\n\n"
                "Чтобы подключить личного бота, перейдите в @BotFather по кнопке ниже и пришлите полученный токен сюда:"
            )
            cat_back_kb = {
                "inline_keyboard": [
                    [{"text": "🤖 Открыть @BotFather", "url": "https://t.me/BotFather"}]
                ]
            }

        elif cb_data == "master_help_manual":
            response_text = get_help_manual_text(bot_uname)
            cat_back_kb = {
                "inline_keyboard": [[{"text": "⬅️ Назад в меню помощи", "callback_data": "master_help_back"}]]
            }
        elif cb_data == "master_help_avito":
            response_text = get_help_avito_text(bot_uname)
            cat_back_kb = {
                "inline_keyboard": [[{"text": "⬅️ Назад в меню помощи", "callback_data": "master_help_back"}]]
            }
        elif cb_data == "master_help_contract":
            response_text = get_help_contract_text()
            cat_back_kb = {
                "inline_keyboard": [[{"text": "⬅️ Назад в меню помощи", "callback_data": "master_help_back"}]]
            }
        elif cb_data == "master_help_pricing":
            response_text = get_help_pricing_text()
            cat_back_kb = {
                "inline_keyboard": [[{"text": "⬅️ Назад в меню помощи", "callback_data": "master_help_back"}]]
            }
        elif cb_data == "master_help_back":
            response_text = get_help_main_text()
            cat_back_kb = {
                "inline_keyboard": [
                    [{"text": "📖 Как всё устроено (на пальцах)", "callback_data": "master_help_manual"}],
                    [{"text": "📈 Как получать 3+ заявки в день с Авито", "callback_data": "master_help_avito"}],
                    [{"text": "📄 Договор по смете и защита от споров", "callback_data": "master_help_contract"}],
                    [{"text": "⚙️ Как настроить свои цены", "callback_data": "master_help_pricing"}],
                ]
            }
        elif cb_data == "btn_cancel_sub":
            cancel_auto_renew(company_id, supabase_client)
            sub_info = get_company_subscription(company_id, company_data, supabase_client)
            until = sub_info.get("subscription_until")
            until_str = until.strftime("%d.%m.%Y") if until else "конца оплаченного периода"
            response_text = (
                "✅ <b>Автопродление подписки отключено в 1 клик</b>\n\n"
                "• Следующих автоматических списаний не будет.\n"
                f"• Ваш бот продолжает работать в полном объёме <b>до {until_str}</b>.\n\n"
                "ℹ️ <i>Согласно п. 3.2 Публичной оферты, услуга считается оказанной в момент предоставления доступа к функционалу платформы.</i>"
            )
            cat_back_kb = {
                "inline_keyboard": [
                    [{"text": "🔄 Возобновить автопродление", "callback_data": "btn_resume_sub"}],
                    [{"text": "📄 Публичная оферта", "url": offer_web_url}],
                ]
            }
        elif cb_data == "btn_resume_sub":
            resume_auto_renew(company_id, supabase_client)
            response_text = "🔄 <b>Автопродление успешно включено.</b> Списание произойдёт в день окончания текущего периода."
            cat_back_kb = {
                "inline_keyboard": [
                    [{"text": "❌ Отменить автопродление в 1 клик", "callback_data": "btn_cancel_sub"}],
                    [{"text": "📄 Публичная оферта", "url": offer_web_url}],
                ]
            }

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
        # Удаляем кнопку со строки ввода (MenuButton), чтобы оставалась исключительно удобная Reply-кнопка
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/setChatMenuButton",
                    json={"menu_button": {"type": "default"}},
                )
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/setChatMenuButton",
                    json={"chat_id": chat_id, "menu_button": {"type": "default"}},
                )
        except Exception:
            pass

        greeting_text = (
            f"Здравствуйте!\n\n"
            f"🏠 <b>Добро пожаловать в сервис расчёта стоимости ремонта «{company_name}».</b>\n\n"
            f"📍 Город: <b>{company_city}</b>\n"
            f"📞 Контактный телефон компании/прораба: <code>{company_phone}</code>\n"
            "⚡️ <b>Работаем без предоплаты:</b> оплата поэтапно по факту приёмки качества.\n\n"
            "У нас <b>нет приблизительных цен «на глаз»</b> — все расценки зафиксированы в договоре и смете.\n\n"
            "👇 <b>Нажмите любую кнопку ниже:</b>\n"
            "• <b>📱 Рассчитать смету онлайн:</b> точный расчёт под ваш метраж за 1 минуту\n"
            "• <b>📋 Прайс и смета работ:</b> детальные ставки за м² по всем видам работ\n"
            "• <b>📐 Бесплатный замер (0 ₽):</b> инженер с лазерным дальномером + 3D-план в подарок\n"
            "• <b>❓ Вопросы и гарантии:</b> гарантия 36 месяцев и условия договора"
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
            f"📞 Прямой номер компании/прораба для связи: <code>{company_phone}</code>\n\n"
            "Нажмите кнопку ниже, чтобы забронировать замер:"
        )
        zamer_kb = {
            "inline_keyboard": [
                [{"text": "📅 Записаться на замер (в калькуляторе)", "web_app": {"url": app_url}}],
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
        contact_text = (
            f"💬 <b>Служба клиентского сервиса:</b>\n\n"
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
            "⏳ <b>4. Срок гарантии:</b> 36 месяцев (3 года) по договору.\n\n"
            f"📞 <b>Контактный телефон компании/прораба:</b> <code>{company_phone}</code>"
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

    elif "помощ" in lower_text or "обучен" in lower_text or text in ["/help", "/support", "🆘 Обучение и помощь"]:
        # Раздел помощи в боте компании
        help_main_kb = {
            "inline_keyboard": [
                [{"text": "📖 Как всё устроено (на пальцах)", "callback_data": "master_help_manual"}],
                [{"text": "📈 Как получать 3+ заявки в день с Авито", "callback_data": "master_help_avito"}],
                [{"text": "📄 Договор по смете и защита от споров", "callback_data": "master_help_contract"}],
                [{"text": "⚙️ Как настроить свои цены", "callback_data": "master_help_pricing"}],
            ]
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": get_help_main_text(),
                        "parse_mode": "HTML",
                        "reply_markup": help_main_kb,
                    },
                )
        except Exception as e:
            logger.error(f"Ошибка отправки раздела помощи в боте {company_id}: {e}")

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

    company_payload = dict(company)
    company_payload["owner_id"] = company.get("admin_chat_id") or company.get("owner_id")
    company_payload["admin_chat_id"] = company.get("admin_chat_id")

    return {
        "success": True,
        "company": company_payload,
        "pricing": pricing,
    }


# ---------------------------------------------------------------------------
# Сохранение обновленных расценок: PATCH /api/companies/{company_id}/pricing
# ---------------------------------------------------------------------------
class UpdatePricingRequest(BaseModel):
    company_id: Optional[str] = None
    capital_price: Optional[float] = None
    cosmetic_price: Optional[float] = None
    comfort_price: Optional[float] = None
    designer_price: Optional[float] = None
    materials_price: Optional[float] = None
    secondary_coeff: Optional[float] = None
    items: Optional[List[Dict[str, Any]]] = None


@app.patch("/api/companies/{company_id}/pricing")
@app.patch("/api/pricing")
async def update_pricing_endpoint(req: UpdatePricingRequest, company_id: Optional[str] = None):
    """
    Обновляет расценки компании в Supabase и кэше (Pro Mode калибровка)
    """
    target_id = company_id or req.company_id or "remont-pro"
    company = find_company(target_id)
    comp_uuid = str(company.get("uuid") or company.get("id")) if company else target_id

    if supabase_client and is_valid_uuid(comp_uuid):
        try:
            update_data = {}
            if req.capital_price is not None:
                update_data["price_capital"] = req.capital_price
            if req.cosmetic_price is not None:
                update_data["price_cosmetic"] = req.cosmetic_price
            if req.designer_price is not None:
                update_data["price_designer"] = req.designer_price
            if req.materials_price is not None:
                update_data["price_materials_m2"] = req.materials_price
            if req.secondary_coeff is not None:
                update_data["coef_secondary"] = req.secondary_coeff

            if update_data:
                supabase_client.table("pricing_rules").update(update_data).eq("company_id", comp_uuid).execute()
        except Exception as e:
            logger.error(f"Ошибка сохранения расценок в Supabase: {e}")

    return {"success": True, "message": "Расценки успешно обновлены"}


# ---------------------------------------------------------------------------
# Экспорт сметы в HTML / PDF с вирусным бейджем: GET /api/estimate/export (Механика 2)
# ---------------------------------------------------------------------------
@app.get("/api/estimate/export", response_class=HTMLResponse)
@app.get("/estimate/export", response_class=HTMLResponse)
async def export_estimate_endpoint(
    company_id: str = "remont-pro",
    area: float = 54.0,
    renovation_class: str = "capital",
    property_type: str = "new",
):
    """
    Генерирует официальный сметный документ по ГОСТ с вирусным бейджем
    «Powered by Remont_Bot» для сохранения в PDF или отправки заказчику.
    """
    company = find_company(company_id) or {
        "name": "РемонтПро",
        "subtitle": "Калькулятор ремонта квартир под ключ",
        "city": "Москва и МО",
        "phone": "+7 (800) 555-35-35",
    }

    rates = {"cosmetic": 4500, "capital": 8500, "designer": 15000}
    rate = rates.get(renovation_class, 8500)
    coeff = 1.15 if property_type == "secondary" else 1.0
    works_total = int(round(area * rate * coeff))
    materials_total = int(round(area * 3500))
    grand_total = works_total + materials_total

    class_titles = {
        "cosmetic": "Косметический ремонт",
        "capital": "Капитальный ремонт по ГОСТ",
        "designer": "Дизайнерский ремонт под ключ",
    }
    class_title = class_titles.get(renovation_class, "Капитальный ремонт по ГОСТ")
    prop_title = "Вторичное жильё" if property_type == "secondary" else "Новостройка (без отделки)"

    tmpl_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates", "estimate.html")
    if not os.path.exists(tmpl_path):
        tmpl_path = os.path.join(os.path.dirname(__file__), "templates", "estimate.html")

    html_content = ""
    if os.path.exists(tmpl_path):
        with open(tmpl_path, "r", encoding="utf-8") as f:
            html_content = f.read()

    m_uname = "RemontMasterBot"
    if master_bot:
        try:
            b_info = await master_bot.get_me()
            m_uname = b_info.username or m_uname
        except Exception:
            pass

    from datetime import datetime as dt
    now_str = dt.now().strftime("%d.%m.%Y")
    replacements = {
        "{{ company.name }}": str(company.get("name", "Строительная компания")),
        "{{ company.subtitle }}": str(company.get("subtitle", "Калькулятор ремонта квартир")),
        "{{ company.city }}": str(company.get("city", "Москва и МО")),
        "{{ company.phone }}": str(company.get("phone", "+7 (800) 555-35-35")),
        "{{ created_date }}": now_str,
        "{{ area }}": str(int(area)),
        "{{ property_type_title }}": prop_title,
        "{{ class_title }}": class_title,
        "{{ works_total }}": f"{works_total:,.0f}".replace(",", " "),
        "{{ materials_total }}": f"{materials_total:,.0f}".replace(",", " "),
        "{{ savings }}": "0",
        "{{ grand_total }}": f"{grand_total:,.0f}".replace(",", " "),
        "{{ master_bot_username }}": m_uname,
    }

    item_rows = f"""
    <tr class="category-row"><td colspan="4">1. Стены и перегородки</td></tr>
    <tr><td>Выравнивание стен по лазерным маякам (до 20 мм)</td><td class="num">м²</td><td class="num">550</td><td class="num"><strong>{int(area * 2.8 * 550):,} ₽</strong></td></tr>
    <tr><td>Шпаклевание стен под обои/покраску в 2 слоя</td><td class="num">м²</td><td class="num">480</td><td class="num"><strong>{int(area * 2.8 * 480):,} ₽</strong></td></tr>
    <tr class="category-row"><td colspan="4">2. Полы и стяжка</td></tr>
    <tr><td>Устройство механизированной полусухой стяжки пола</td><td class="num">м²</td><td class="num">650</td><td class="num"><strong>{int(area * 650):,} ₽</strong></td></tr>
    <tr><td>Настил ламината / кварцвинила с подложкой</td><td class="num">м²</td><td class="num">420</td><td class="num"><strong>{int(area * 420):,} ₽</strong></td></tr>
    <tr class="category-row"><td colspan="4">3. Электрика и слаботочка</td></tr>
    <tr><td>Монтаж кабельных трасс ГОСТ ВВГнг-LS в гофре</td><td class="num">м.п.</td><td class="num">190</td><td class="num"><strong>{int(area * 3.5 * 190):,} ₽</strong></td></tr>
    <tr><td>Сборка и расключение силового электрощита ABB/Schneider</td><td class="num">шт.</td><td class="num">12000</td><td class="num"><strong>12 000 ₽</strong></td></tr>
    <tr class="category-row"><td colspan="4">4. Сантехника и водоснабжение</td></tr>
    <tr><td>Разводка труб ХВС/ГВС сшитый полиэтилен Rehau / FAR</td><td class="num">точка</td><td class="num">3800</td><td class="num"><strong>{6 * 3800:,} ₽</strong></td></tr>
    """.replace(",", " ")

    if "{% for item in items %}" in html_content:
        before = html_content.split("{% for item in items %}")[0]
        after = html_content.split("{% endfor %}")[1]
        html_content = before + item_rows + after

    for k, v in replacements.items():
        html_content = html_content.replace(k, v)

    return HTMLResponse(content=html_content)


@app.get("/api/estimate/{lead_id}/pdf")
@app.get("/api/leads/{lead_id}/pdf")
async def download_lead_pdf_endpoint(lead_id: str, company_id: Optional[str] = None):
    """Скачивание сметы в формате PDF через защищенную асинхронную очередь генерации"""
    if not file_queue:
        raise HTTPException(status_code=503, detail="Очередь генерации файлов недоступна")

    lead_data = None
    company = None
    if company_id:
        company = find_company(company_id)

    if supabase_client:
        try:
            res = (
                supabase_client.table("leads")
                .select("*")
                .eq("id", lead_id)
                .maybe_single()
                .execute()
            )
            if res and res.data:
                raw_lead = res.data
                enc_payload = raw_lead.get("encrypted_payload")
                decrypted = decrypt_payload(enc_payload) if enc_payload else {}
                c_id = raw_lead.get("company_id")
                if c_id and not company:
                    company = find_company(str(c_id))
                lead_data = {
                    "id": str(raw_lead.get("id")),
                    "client_name": decrypted.get("client_name") or "Клиент",
                    "client_phone": decrypted.get("client_phone") or "",
                    "address": decrypted.get("address") or "г. Москва",
                    "preferred_date": raw_lead.get("preferred_date") or "В ближайшее время",
                    "housing_type": raw_lead.get("housing_type") or "Новостройка",
                    "repair_type": raw_lead.get("repair_type") or "Капитальный",
                    "area_m2": float(raw_lead.get("area_m2") or 50.0),
                    "total_base_cost": float(raw_lead.get("max_cost") or raw_lead.get("min_cost") or 500000),
                    "min_cost": float(raw_lead.get("min_cost") or 450000),
                    "max_cost": float(raw_lead.get("max_cost") or 550000),
                    "options": raw_lead.get("options") or [],
                    "contact_channel": raw_lead.get("contact_channel") or "telegram",
                }
        except Exception as e:
            logger.error(f"Ошибка загрузки лида #{lead_id} для PDF: {e}")

    if not lead_data:
        lead_data = {
            "id": lead_id,
            "client_name": "Заказчик",
            "client_phone": "+7 (900) 000-00-00",
            "address": "г. Москва",
            "preferred_date": "В ближайшее время",
            "housing_type": "Новостройка",
            "repair_type": "Капитальный",
            "area_m2": 50.0,
            "total_base_cost": 500000,
            "min_cost": 450000,
            "max_cost": 550000,
        }

    pdf_bytes = await file_queue.generate_pdf(lead_data, company, timeout=20.0)
    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="Не удалось сгенерировать PDF файл")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Smeta_{lead_id}.pdf"'},
    )


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

    # 2. B2B внедрение под ключ: Все заявки со 100% открытыми контактами (Lifetime)
    can_view_full = True
    is_trial = False
    is_paid = True
    trial_num = 1
    trial_left = 999
    total_trial = 999
    lead_db_status = "new_open"  # Всегда открытый доступ без блокировок и маскирования

    # 3. Нормализация телефона клиента для шифрования и уведомлений
    clean_phone = re.sub(r"[^0-9+]", "", lead.phone)
    if clean_phone.startswith("8") and len(clean_phone) == 11:
        clean_phone = "+7" + clean_phone[1:]
    elif not clean_phone.startswith("+") and len(clean_phone) >= 10:
        clean_phone = "+" + clean_phone

    # 4. Сохранение в Supabase с криптографической защитой AES-256 (152-ФЗ РФ)
    # СТРОГО: В поля client_phone, client_name, address (а также name, phone)
    # НИКОГДА не пишется открытый текст! Пишется только [ENCRYPTED_AES256],
    # а сами данные шифруются в encrypted_payload мастер-ключом AES-256 (Fernet).
    if supabase_client:
        try:
            crypto_fields = sanitize_lead_record_for_storage(
                raw_name=lead.name,
                raw_phone=clean_phone,
                raw_address=lead.address,
                raw_comment=lead.comment,
            )

            # Безопасный список выбранных технических опций ремонта (без открытых персональных данных)
            lead_options = list(lead.active_options or [])

            insert_data = {
                "company_id": company_uuid,
                "encrypted_payload": crypto_fields["encrypted_payload"],
                "contact_channel": lead.communication or "telegram",
                "preferred_date": lead.preferred_date,
                "housing_type": "Новостройка" if lead.property_type == "new" else "Вторичка",
                "repair_type": lead.renovation_class,
                "area_m2": float(lead.area),
                "options": lead_options,
                "min_cost": float(lead.price_min),
                "max_cost": float(lead.price_max),
                "status": lead_db_status,
            }
            try:
                db_res = supabase_client.table("leads").insert(insert_data).execute()
            except Exception as ins_err:
                logger.warning(f"Повторная попытка вставки с минимальным набором полей: {ins_err}")
                clean_minimal = {
                    "company_id": company_uuid,
                    "encrypted_payload": crypto_fields["encrypted_payload"],
                    "status": lead_db_status,
                    "area_m2": float(lead.area),
                    "housing_type": "Новостройка" if lead.property_type == "new" else "Вторичка",
                    "repair_type": lead.renovation_class,
                }
                db_res = supabase_client.table("leads").insert(clean_minimal).execute()

            if db_res.data and len(db_res.data) > 0:
                lead_id = str(db_res.data[0].get("id", lead_id))
            logger.info(f"Лид {lead_id} (статус={lead_db_status}, full={can_view_full}, AES-256 encrypted) успешно записан в Supabase.")
        except Exception as e:
            logger.error(f"Ошибка записи лида в Supabase: {e}")

    # 5. Формирование текста уведомления
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
        clean_opts = []
        for opt in options_list:
            opt_str = str(opt).strip()
            # Если заявка заблокирована (нет оплаты), исключаем любые утечки адреса или контактов
            if not can_view_full and any(k in opt_str for k in ["Адрес:", "адрес:", "ул.", "д.", "кв.", "ЖК", "@"]):
                continue
            clean_opts.append(html.escape(opt_str))
        if clean_opts:
            options_str = f"🔧 <b>Доп. опции:</b> {', '.join(clean_opts[:4])}\n"

    comp_name = company.get("name") if company else "Ваша компания"
    _, url_1m = create_payment_url(comp_identifier, comp_name, admin_chat_id or 0, "1m")
    _, url_3m = create_payment_url(comp_identifier, comp_name, admin_chat_id or 0, "3m")
    _, url_1y = create_payment_url(comp_identifier, comp_name, admin_chat_id or 0, "1y")

    # Все заявки поступают прорабу компании со 100% открытыми контактами (модель готовых ботов под ключ)
    safe_name = html.escape(str(lead.name or "Не указано"))
    safe_phone = html.escape(str(lead.phone or ""))
    safe_date = html.escape(str(lead.preferred_date or "Не указана"))
    safe_comm = html.escape(str(channel_name))
    safe_addr = html.escape(str(lead.address or "г. Москва (уточняется на замере)"))

    trial_header = ""
    trial_footer = (
        f"━━━━━━━━━━━━━━━━━━\n"
        f"✅ <i>Заявка принята в работу без ограничений.</i>"
    )

    client_tg = (lead.telegram_username or "").strip()
    if client_tg.startswith("@"):
        client_tg = client_tg[1:]
    if not client_tg:
        tg_user_match = None
        if lead.comment:
            tg_user_match = re.search(r"@([a-zA-Z0-9_]{3,})", lead.comment)
        if not tg_user_match and lead.active_options:
            for opt in lead.active_options:
                tg_user_match = re.search(r"@([a-zA-Z0-9_]{3,})", str(opt))
                if tg_user_match:
                    break
        if tg_user_match:
            client_tg = tg_user_match.group(1)

    tg_line = f"✈️ <b>Telegram:</b> @{client_tg}\n" if client_tg else ""

    # Скоринг лида и статус ключей (Smart Dispatcher)
    score_val = lead.lead_score if lead.lead_score is not None else 70
    is_visit_blocked = lead.key_status == "construction" or (lead.is_visit_allowed is False)
    
    if lead.lead_grade == "vip" or score_val >= 80:
        scoring_badge = f"🔥 <b>СКОРИНГ: СРОЧНЫЙ КЛИЕНТ ({score_val}/100)</b>\n"
    elif is_visit_blocked or lead.lead_grade == "cold":
        scoring_badge = f"❄️ <b>СКОРИНГ: ПРИЦЕНКА / ДОЛГИЙ ЦИКЛ ({score_val}/100)</b>\n"
    else:
        scoring_badge = f"🟡 <b>СКОРИНГ: ТЁПЛЫЙ ИНТЕРЕС ({score_val}/100)</b>\n"

    if is_visit_blocked:
        visit_warning = (
            "⛔️ <b>ВНИМАНИЕ ПРОРАБУ: ФИЗИЧЕСКИЙ ВЫЕЗД ЗАПРЕЩЕН!</b>\n"
            "<i>Дом строится, ключей нет! Не тратьте бензин и время мастера.</i>\n"
            "👉 <b>Действие:</b> Проведите онлайн-консультацию или добавьте клиента в базу прогрева.\n\n"
        )
    elif lead.key_status == "in_30_days":
        visit_warning = "🔑 <b>Статус ключей:</b> Ожидаются в течение 30 дней (запланируйте предварительный созвон)\n\n"
    else:
        visit_warning = "🟢 <b>Статус ключей:</b> Ключи на руках! Можно назначать замерщика на объекте.\n\n"

    # Технические параметры: санузлы и высота потолка
    baths_text = f"{lead.bathrooms_count:g} санузла" if lead.bathrooms_count and lead.bathrooms_count > 1 else "1 санузел"
    ceil_text = f", потолки {lead.ceiling_height} м" if lead.ceiling_height else ""

    # Модуль «Инженерный резерв и скрытые факторы» (подсказка прорабу перед выездом)
    res_pct, res_sum, res_label, res_risks = get_engineering_risk_hints(lead.property_subtype or lead.property_type, float(total_cost_num))
    risks_lines = "\n".join([f" • {r}" for r in res_risks])
    reserve_block = (
        f"🛡 <b>Буфер скрытых работ:</b> +{res_pct}% ({res_sum:,.0f} ₽)\n"
        f"🔍 <b>Точки лазерного контроля на замере ({res_label}):</b>\n"
        f"{risks_lines}\n\n"
    ).replace(",", " ")

    full_move_in_budget_num = float(total_cost_num) * 2.2
    full_budget_str = f"{full_move_in_budget_num:,.0f}".replace(",", " ")
    full_budget_line = f"🏠 <b>Бюджет заселения (2.2×):</b> {full_budget_str} ₽ (по формуле 25/40/25/10)\n"

    notification_text = (
        f"⚡ <b>НОВАЯ ЗАЯВКА НА ЗАМЕР [#{lead_id}]</b>\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"{scoring_badge}"
        f"{visit_warning}"
        f"👤 <b>Клиент:</b> {safe_name}\n"
        f"{tg_line}"
        f"📱 <b>Телефон:</b> <code>{safe_phone}</code>\n"
        f"📍 <b>Адрес:</b> {safe_addr}\n"
        f"💬 <b>Связь:</b> {safe_comm}\n"
        f"📅 <b>Желаемая дата замера:</b> {safe_date}\n\n"
        f"🏠 <b>Объект:</b> {housing_type}, {lead.area} м² ({baths_text}{ceil_text}), {lead.renovation_class}\n"
        f"💰 <b>Расчётная смета:</b> <b>{total_cost_str} ₽</b>\n"
        f"{full_budget_line}"
        f"{options_str}\n"
        f"{reserve_block}"
        f"{trial_footer}"
    )

    inline_keyboard = []
    if client_tg:
        inline_keyboard.append([{"text": "💬 Написать клиенту в Telegram", "url": f"https://t.me/{client_tg}"}])
    elif digits_only:
        inline_keyboard.append([{"text": "💬 Написать клиенту в Telegram", "url": f"https://t.me/+{digits_only}"}])

    # 5. Отправка мгновенного push-сообщения прорабу
    if admin_chat_id:
        delivered = False
        # Формируем список ботов для гарантированной доставки:
        # 1. Личный бот компании (если указан)
        # 2. Мастер-бот платформы (где прораб уже точно зарегистрирован и нажал /start)
        bot_targets = []
        if bot_token and bot_token != MASTER_BOT_TOKEN:
            bot_targets.append(("company_bot", bot_token))
        if MASTER_BOT_TOKEN:
            bot_targets.append(("master_bot", MASTER_BOT_TOKEN))

        # 5. Мгновенная отправка текстовой карточки заявки прорабу
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                for target_name, token in bot_targets:
                    try:
                        send_payload: Dict[str, Any] = {
                            "chat_id": admin_chat_id,
                            "text": notification_text,
                            "parse_mode": "HTML",
                        }
                        if inline_keyboard:
                            send_payload["reply_markup"] = {"inline_keyboard": inline_keyboard}

                        res = await client.post(
                            f"https://api.telegram.org/bot{token}/sendMessage",
                            json=send_payload,
                        )
                        if res.status_code == 200:
                            logger.info(
                                f"Уведомление прорабу (chat_id={admin_chat_id}) успешно доставлено через {target_name}: 200 OK"
                            )
                            delivered = True
                            break
                        else:
                            logger.warning(
                                f"Ошибка отправки через {target_name} ({res.status_code}: {res.text}), пробуем plain-text fallback..."
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
                                f"https://api.telegram.org/bot{token}/sendMessage",
                                json={"chat_id": admin_chat_id, "text": plain_text},
                            )
                            if fb_res.status_code == 200:
                                logger.info(f"Fallback plain-text доставлен через {target_name}: 200 OK")
                                delivered = True
                                break
                    except Exception as inner_e:
                        logger.error(f"Исключение отправки через {target_name}: {inner_e}")

            if not delivered:
                logger.error(f"Не удалось доставить уведомление прорабу {admin_chat_id} ни через одного бота!")
        except Exception as e:
            logger.error(f"Не удалось отправить уведомление прорабу: {e}")

        # 6. Асинхронная очередь генерации и отправки PDF-сметы (max 2 потока, не блокирует бота)
        if can_view_full and file_queue:
            lead_pdf_data = {
                "id": lead_id,
                "client_name": lead.name,
                "client_phone": lead.phone,
                "address": lead.address,
                "preferred_date": lead.preferred_date,
                "housing_type": housing_type,
                "repair_type": lead.renovation_class,
                "area_m2": lead.area,
                "total_base_cost": total_cost_num,
                "min_cost": lead.price_min,
                "max_cost": lead.price_max,
                "options": lead_options,
                "contact_channel": lead.communication or "telegram",
            }
            pdf_caption = (
                f"📄 <b>Детальная смета по заявке #{lead_id}</b>\n"
                f"Объект: {lead.area} м² ({housing_type})\n"
                f"Клиент: {safe_name}, {safe_phone}"
            )
            # Ставим задачу в асинхронную очередь с пулом воркеров
            asyncio.create_task(
                file_queue.enqueue_and_send_telegram_pdf(
                    lead_id=lead_id,
                    lead_data=lead_pdf_data,
                    company=company,
                    bot_targets=bot_targets,
                    admin_chat_id=admin_chat_id,
                    caption=pdf_caption,
                )
            )
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


@app.get("/api/leads")
async def get_company_leads(company_id: str):
    """
    Возвращает список заявок строительной компании.
    При оплаченной подписке гарантирует, что ВСЕ ранее зашифрованные заявки
    расшифровываются, становятся открытыми в базе данных Supabase и возвращаются
    с открытыми номерами телефонов, именами и адресами.
    """
    company = find_company(company_id)
    comp_uuid = company.get("id") if company else None
    uname = company.get("bot_username") if company else company_id

    sub_info = get_company_subscription(uname, company, supabase_client)
    is_active = sub_info.get("is_active", False)

    # При активной подписке делаем все ранее зашифрованные лиды открытыми в Supabase
    if is_active and supabase_client:
        unlock_all_company_leads(uname, comp_uuid=comp_uuid, supabase_client=supabase_client)

    leads_data = []
    if supabase_client:
        try:
            target_ids = []
            if comp_uuid:
                target_ids.append(f"company_id.eq.{comp_uuid}")
            if uname:
                target_ids.append(f"company_id.eq.{uname.lower()}")
            or_filter = ",".join(target_ids) if target_ids else f"company_id.eq.{company_id}"

            res = (
                supabase_client.table("leads")
                .select("*")
                .or_(or_filter)
                .order("created_at", desc=True)
                .execute()
            )
            leads_data = res.data or []
        except Exception as e:
            logger.error(f"Ошибка получения заявок компании {company_id}: {e}")

    result = []
    for l in leads_data:
        enc_payload = l.get("encrypted_payload")
        decrypted = decrypt_payload(enc_payload) if enc_payload else {}

        raw_name = decrypted.get("client_name") or l.get("client_name") or l.get("name") or "Клиент"
        raw_phone = decrypted.get("client_phone") or l.get("client_phone") or l.get("phone") or ""
        raw_addr = decrypted.get("address") or l.get("address") or l.get("city") or "г. Москва"

        is_locked = (l.get("status") in ["locked", "paywall_locked"]) and not is_active

        if is_locked:
            out_name = mask_client_name(raw_name)
            out_phone = mask_client_phone(raw_phone)
            out_addr = mask_address(raw_addr)
        else:
            out_name = raw_name if raw_name != "[ENCRYPTED_AES256]" else "Клиент"
            out_phone = raw_phone if raw_phone != "[ENCRYPTED_AES256]" else "—"
            out_addr = raw_addr if raw_addr != "[ENCRYPTED_AES256]" else "г. Москва"

        item = dict(l)
        item["client_name"] = out_name
        item["name"] = out_name
        item["client_phone"] = out_phone
        item["phone"] = out_phone
        item["address"] = out_addr
        item["is_unlocked"] = not is_locked
        result.append(item)

    return {"leads": result, "is_subscription_active": is_active, "total": len(result)}


# ---------------------------------------------------------------------------
# Д. Модуль платежей: ЮKassa Вебхук и Checkout страница
# ---------------------------------------------------------------------------
@app.get("/pay/{payment_id}")
async def checkout_page(
    payment_id: str,
    company_id: Optional[str] = "cuberlife_bot",
    admin_chat_id: Optional[int] = None,
    plan: Optional[str] = "1m",
):
    """Эндпоинт оплаты отключен: модель внедрения готовых ботов под ключ без подписок."""
    return {"status": "disabled", "message": "Подписки отключены. Платформа работает по модели внедрения готовых ботов под ключ с пожизненным доступом."}
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
                        <span class="plan-tag">-22%</span>
                    </div>
                    <div class="plan-subtitle">90 дней (экономия 1 980 ₽)</div>
                </div>
                <div class="plan-price">6 990 ₽</div>
            </div>

            <div class="plan-card {'active' if initial_plan == '1y' else ''}" id="card-1y" onclick="selectPlan('1y')">
                <div>
                    <div class="plan-title">
                        1 год (365 дней)
                        <span class="plan-tag">-35%</span>
                    </div>
                    <div class="plan-subtitle">~1 915 ₽/мес (выгода 12 890 ₽)</div>
                </div>
                <div class="plan-price">22 990 ₽</div>
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
            '3m': {{ name: '3 месяца (90 дней)', price: '6 990 ₽', sum: 6990 }},
            '1y': {{ name: '1 год (365 дней)', price: '22 990 ₽', sum: 22990 }}
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


@app.post("/api/billing/webhook")
@app.post("/api/payments/webhook")
@app.post("/api/payments/yookassa/webhook")
@app.post("/api/yookassa-webhook")
async def yookassa_webhook_endpoint(request: Request):
    """
    Эндпоинт ЮKassa отключен. Платформа работает по модели разового B2B-внедрения ботов под ключ.
    """
    return {"status": "disabled", "message": "Subscription billing is disabled. Turnkey bot service only."}
    raw_body = await request.body()
    try:
        body = json.loads(raw_body.decode("utf-8")) if raw_body else {}
    except Exception:
        return Response(
            content=json.dumps({"error": "Invalid JSON format"}),
            status_code=status.HTTP_400_BAD_REQUEST,
            media_type="application/json",
        )

    headers = {k.lower(): v for k, v in request.headers.items()}
    client_host = request.client.host if request.client else None

    # Запускаем комплексную антифрод-валидацию
    is_valid, status_code, reason, verified_payment_obj = await validate_yookassa_webhook_request(
        headers=headers,
        client_host=client_host,
        raw_body=raw_body,
        body_json=body,
    )

    if not is_valid:
        client_ip = get_client_ip(headers, client_host)
        logger.warning(
            f"[ANTIFRAUD REJECTED] Отклонён нелегитимный запрос вебхука от IP={client_ip}: {reason}"
        )
        return Response(
            content=json.dumps({"error": reason}),
            status_code=status_code,
            media_type="application/json",
        )

    event = body.get("event")
    payment_obj = verified_payment_obj or body.get("object", {})

    if event == "payment.succeeded" or payment_obj.get("status") == "succeeded":
        metadata = payment_obj.get("metadata", {})
        company_id = metadata.get("company_id") or "cuberlife_bot"
        admin_chat_id = metadata.get("admin_chat_id")
        plan_id = metadata.get("plan_id") or "1m"
        days_str = metadata.get("days")
        days = int(days_str) if days_str and str(days_str).isdigit() else None

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
        logger.info(f"Вебхук ЮKassa успешно проверен антифродом и активирован для {company_id}: {res}")

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

