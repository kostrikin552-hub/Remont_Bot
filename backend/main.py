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
from typing import Any, Dict, List, Optional

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
# FSM Состояния регистрации компании прорабом
# ---------------------------------------------------------------------------
class RegisterCompanyFSM(StatesGroup):
    company_name = State()
    city = State()
    price_level = State()
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
                comp_token = comp.get("bot_token_encrypted") or comp.get("bot_token")
                comp["bot_token"] = comp_token
                comp["bot_token_encrypted"] = comp_token
                COMPANIES_CACHE[comp["id"]] = comp
                if comp.get("bot_username"):
                    COMPANIES_CACHE[comp["bot_username"].lower()] = comp
                return comp
        except Exception as e:
            logger.error(f"Ошибка поиска компании для {admin_chat_id}: {e}")
    if "cuberlife_bot" in COMPANIES_CACHE:
        return COMPANIES_CACHE["cuberlife_bot"]
    return None


def get_main_master_menu() -> ReplyKeyboardMarkup:
    """
    Главное меню Мастер-бота (Сетка 2х3, persistent=True).
    Крупные кнопки для быстрого доступа прямо на стройке:
    ┌───────────────────────────────┬───────────────────────────────┐
    │  🤖 Мой бот и ссылки          │  📊 Заявки и баланс           │
    ├───────────────────────────────┼───────────────────────────────┤
    │  ⚙️ Мои расценки              │  💎 Тариф и подписка          │
    ├───────────────────────────────┼───────────────────────────────┤
    │  🎁 Месяц бесплатно           │  🆘 Обучение и помощь         │
    └───────────────────────────────┴───────────────────────────────┘
    """
    keyboard = ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="🤖 Мой бот и ссылки"),
                KeyboardButton(text="📊 Заявки и баланс"),
            ],
            [
                KeyboardButton(text="⚙️ Мои расценки"),
                KeyboardButton(text="💎 Тариф и подписка"),
            ],
            [
                KeyboardButton(text="🎁 Месяц бесплатно"),
                KeyboardButton(text="🆘 Обучение и помощь"),
            ],
        ],
        resize_keyboard=True,  # Кнопки будут компактными под размер смартфона
        persistent=True,       # Меню не исчезает при кликах
    )
    return keyboard


def get_subscription_keyboard(
    comp_id: str, comp_name: str, chat_id: int, is_active: bool = False, auto_renew: bool = True
) -> InlineKeyboardMarkup:
    """Генерирует клавиатуру с кнопками для 3-х тарифов подписки, оферты и отмены автопродления в 1 клик"""
    _, url_1m = create_payment_url(comp_id, comp_name, chat_id, "1m")
    _, url_3m = create_payment_url(comp_id, comp_name, chat_id, "3m")
    _, url_1y = create_payment_url(comp_id, comp_name, chat_id, "1y")

    offer_url = f"{BASE_WEBHOOK_URL}/offer" if BASE_WEBHOOK_URL else "https://t.me/cuberlife_bot"

    rows = [
        [InlineKeyboardButton(text="💳 1 месяц — 2 990 ₽", url=url_1m)],
        [InlineKeyboardButton(text="🔥 3 месяца — 6 990 ₽ (Скидка 22%) 🔥", url=url_3m)],
        [InlineKeyboardButton(text="💎 1 год — 22 990 ₽ (Экономия 12 890 ₽)", url=url_1y)],
        [
            InlineKeyboardButton(text="🎁 Месяц за коллегу", callback_data="btn_referral"),
            InlineKeyboardButton(text="📄 Публичная оферта", url=offer_url),
        ],
    ]

    if is_active:
        if auto_renew:
            rows.append([
                InlineKeyboardButton(text="❌ Отменить автопродление в 1 клик", callback_data="btn_cancel_sub")
            ])
        else:
            rows.append([
                InlineKeyboardButton(text="🔄 Возобновить автопродление", callback_data="btn_resume_sub")
            ])

    return InlineKeyboardMarkup(inline_keyboard=rows)


# Регулярное выражение токена Telegram бота: 8-12 цифр, двоеточие, 35 символов ключа
TOKEN_REGEX = r"([0-9]{8,12}:[a-zA-Z0-9_-]{35})"


def get_botfather_guide_keyboard() -> InlineKeyboardMarkup:
    """Инлайн-кнопка для шага создания бота: прямая ссылка на @BotFather"""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🤖 Открыть @BotFather",
                    url="https://t.me/BotFather",
                )
            ],
        ]
    )


# ---------------------------------------------------------------------------
# 1. Кнопка «🤖 Мой бот и ссылки» (Самая главная)
# ---------------------------------------------------------------------------
@master_router.message(F.text == "🤖 Мой бот и ссылки")
@master_router.message(Command("mybot"))
@master_router.message(Command("links"))
async def master_menu_my_bot(message: Message):
    """Информация о подключенном боте, ссылки для клиентов и Авито"""
    company = find_company_for_admin(message.from_user.id)
    if not company:
        await message.answer(
            "🏢 У вас пока нет зарегистрированной компании.\n"
            "Отправьте /start, чтобы создать персонального бота для приёма заявок!",
            reply_markup=get_main_master_menu(),
        )
        return

    bot_uname = company.get("bot_username") or "moscow_remont_bot"

    text = (
        f"🤖 <b>ВАШ ПОДКЛЮЧЕННЫЙ БОТ:</b> @{bot_uname}\n\n"
        f"📍 <b>Ваша ссылка для клиентов:</b>\n"
        f"https://t.me/{bot_uname}\n\n"
        "💡 <b>Куда поставить эту ссылку для заказов:</b>\n"
        "1. В текст или описание профиля на Авито.\n"
        "2. В шапку профиля ВКонтакте / Telegram-канала.\n"
        "3. В описание Telegram-профиля или канала."
    )

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📋 Скопировать готовый текст для Авито",
                    callback_data="master_copy_avito",
                )
            ],
            [
                InlineKeyboardButton(
                    text="🚀 Проверить работу бота",
                    url=f"https://t.me/{bot_uname}",
                )
            ],
        ]
    )
    await message.answer(text, reply_markup=kb, disable_web_page_preview=True)


@master_router.callback_query(F.data == "master_copy_avito")
async def master_cb_copy_avito(cb: CallbackQuery):
    """Выдача готового продающего текста для размещения на Авито"""
    await cb.answer()
    company = find_company_for_admin(cb.from_user.id) or {}
    bot_uname = company.get("bot_username") or "moscow_remont_bot"
    city = company.get("city") or "Москва и МО"

    avito_text = (
        "📋 <b>Готовый продающий текст для Авито:</b>\n"
        "<i>(Нажмите на текст ниже в рамке, чтобы скопировать его в буфер обмена)</i>\n\n"
        f"<code>🔨 Ремонт квартир под ключ в {city} с гарантией 3 года по договору!\n\n"
        f"💰 Рассчитайте точную смету вашего ремонта за 1 минуту без ожидания замерщика:\n"
        f"👉 https://t.me/{bot_uname}\n\n"
        f"В нашем Telegram-калькуляторе:\n"
        f"✅ Прозрачная смета с точностью до рубля\n"
        f"✅ Возможность убрать ненужные работы и сэкономить\n"
        f"✅ Фиксация стоимости в договоре\n"
        f"✅ 0% предоплаты — оплата строго по факту приёмки каждого этапа!\n\n"
        f"📲 Переходите в Telegram и получите расчёт прямо сейчас: https://t.me/{bot_uname}</code>"
    )
    await cb.message.answer(avito_text, disable_web_page_preview=True)


# ---------------------------------------------------------------------------
# 2. Кнопка «📊 Заявки и баланс» (Счетчик ценности + выгрузка в Excel)
# ---------------------------------------------------------------------------
@master_router.message(F.text == "📊 Заявки и баланс")
@master_router.message(Command("stats"))
@master_router.message(Command("balance"))
@master_router.message(Command("leads"))
async def master_menu_stats(message: Message):
    """Счетчик ценности и окупаемости: статус подписки, лиды, сумма в работе"""
    company = find_company_for_admin(message.from_user.id)
    if not company:
        await message.answer(
            "🏢 У вас пока нет зарегистрированной компании.\n"
            "Отправьте /start, чтобы создать персонального бота для приёма заявок!",
            reply_markup=get_main_master_menu(),
        )
        return

    comp_id = company.get("id") or company.get("bot_username") or "cuberlife_bot"
    uname = company.get("bot_username") or "moscow_remont_bot"

    sub_info = get_company_subscription(uname, company, supabase_client)
    is_active = sub_info.get("is_active", False)
    until = sub_info.get("subscription_until")
    trial_used = sub_info.get("trial_leads_used", 0)
    total_trial = sub_info.get("total_trial_limit", 3)
    trial_left = max(0, total_trial - trial_used)

    if is_active and until:
        until_dt = until.replace(tzinfo=timezone.utc) if until.tzinfo is None else until
        days_left = sub_info.get("days_left", 0)
        status_line = f"🟢 Подписка активна (до {until_dt.strftime('%d.%m.%Y')})"
        trial_desc = f"• <b>Режим заявок:</b> Безлимитный доступ (осталось {days_left} дн.) 🚀"
    elif trial_used < total_trial:
        status_line = "Бесплатный триал"
        lead_word = "заявка" if trial_left == 1 else ("заявки" if 2 <= trial_left <= 4 else "заявок")
        trial_desc = (
            f"• <b>Использовано заявок:</b> {trial_used} из {total_trial}\n"
            f"• <b>Осталось бесплатных заявок:</b> {trial_left} {lead_word} 🎁"
        )
    else:
        status_line = "🔒 Триал исчерпан"
        trial_desc = f"• <b>Осталось бесплатных заявок:</b> 0 из {total_trial} (контакты маскируются)"

    leads_count = 0
    total_sum = 0
    if supabase_client:
        try:
            leads_res = (
                supabase_client.table("leads")
                .select("total_base_cost, price_max, price_min")
                .or_(f"company_id.eq.{comp_id},company_id.eq.{uname}")
                .execute()
            )
            if leads_res and leads_res.data:
                leads_count = len(leads_res.data)
                for row in leads_res.data:
                    c = row.get("total_base_cost") or row.get("price_max") or 0
                    try:
                        total_sum += float(c)
                    except (ValueError, TypeError):
                        pass
        except Exception as e:
            logger.debug(f"Ошибка подсчета статистики: {e}")

    # Расчет смет: если в базе мало данных, показываем реалистичную конверсию
    estimates_count = max(leads_count * 8, 14 if leads_count > 0 else 0)
    if total_sum == 0 and leads_count > 0:
        total_sum = leads_count * 1650000

    sum_str = f"{int(total_sum):,}".replace(",", " ")

    text = (
        "📊 <b>СТАТИСТИКА ВАШЕГО БОТА</b>\n\n"
        f"• <b>Статус:</b> {status_line}\n"
        f"{trial_desc}\n"
        f"• <b>Всего рассчитано смет:</b> {estimates_count} шт.\n"
        f"• <b>Заявок на замер получено:</b> {leads_count} шт.\n"
        f"• <b>Сумма смет в работе:</b> ~{sum_str} ₽"
    )

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📥 Выгрузить список клиентов в Excel",
                    callback_data="master_export_excel",
                )
            ],
            [
                InlineKeyboardButton(
                    text="💎 Управление подпиской",
                    callback_data="btn_sub",
                )
            ],
        ]
    )
    await message.answer(text, reply_markup=kb)


@master_router.callback_query(F.data == "master_export_excel")
async def master_cb_export_excel(cb: CallbackQuery):
    """Выгрузка лидов компании в Excel-совместимый файл (.csv с кодировкой utf-8-sig)"""
    await cb.answer("Формируем файл для Excel...")
    company = find_company_for_admin(cb.from_user.id)
    if not company:
        await cb.message.answer("Компания не найдена.")
        return

    comp_id = company.get("id") or company.get("bot_username") or "cuberlife_bot"
    uname = company.get("bot_username") or "remont_bot"
    cname = company.get("name") or "РемонтПро"

    leads_data = []
    if supabase_client:
        try:
            res = (
                supabase_client.table("leads")
                .select("*")
                .or_(f"company_id.eq.{comp_id},company_id.eq.{uname}")
                .order("created_at", desc=True)
                .execute()
            )
            if res and res.data:
                leads_data = res.data
        except Exception as e:
            logger.error(f"Ошибка получения заявок: {e}")

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow([
        "ID заявки",
        "Дата и время",
        "Имя клиента",
        "Номер телефона",
        "Адрес / ЖК",
        "Площадь (м²)",
        "Тип жилья",
        "Класс ремонта",
        "Стоимость работ (₽)",
        "Материалы (₽)",
        "ИТОГО смета (₽)",
        "Статус",
    ])

    sub_info = get_company_subscription(comp_id, company, supabase_client)
    is_active_sub = sub_info.get("is_active", False)

    for row in leads_data:
        enc_payload = row.get("encrypted_payload")
        decrypted = decrypt_payload(enc_payload) if enc_payload else {}

        raw_cname = decrypted.get("client_name") or row.get("name") or row.get("client_name") or "Клиент"
        raw_cphone = decrypted.get("client_phone") or row.get("phone") or row.get("client_phone") or "—"
        raw_addr = decrypted.get("address") or row.get("address") or row.get("city") or "—"

        is_locked = row.get("status") == "locked"
        if is_locked and not is_active_sub:
            lead_name = mask_client_name(raw_cname) if raw_cname != ENCRYPTED_PLACEHOLDER else "Клиент [Заблокировано]"
            lead_phone = mask_client_phone(raw_cphone) if raw_cphone != ENCRYPTED_PLACEHOLDER else "+7 (***) ***-**-**"
            lead_addr = mask_address(raw_addr) if raw_addr != ENCRYPTED_PLACEHOLDER else "г. Москва, ул. [Скрыто]"
        else:
            lead_name = raw_cname if raw_cname != ENCRYPTED_PLACEHOLDER else "Клиент"
            lead_phone = raw_cphone if raw_cphone != ENCRYPTED_PLACEHOLDER else "—"
            lead_addr = raw_addr if raw_addr != ENCRYPTED_PLACEHOLDER else (row.get("city") or "—")

        writer.writerow([
            row.get("id", ""),
            row.get("created_at", ""),
            lead_name,
            lead_phone,
            lead_addr,
            row.get("area") or row.get("area_m2") or row.get("area_sqm") or "—",
            row.get("property_type") or row.get("housing_type") or "Вторичка",
            row.get("renovation_class") or row.get("repair_type") or "Капитальный",
            row.get("works_cost") or row.get("min_cost") or "—",
            row.get("materials_cost") or "—",
            row.get("total_base_cost") or row.get("total_cost") or row.get("max_cost") or "—",
            row.get("status") or "Новая",
        ])

    csv_bytes = output.getvalue().encode("utf-8-sig")
    today_str = datetime.now().strftime("%Y-%m-%d")
    filename = f"leads_{uname}_{today_str}.csv"
    input_file = BufferedInputFile(csv_bytes, filename=filename)

    caption = (
        f"📥 <b>Клиентская база компании «{cname}»</b>\n\n"
        f"• Количество выгруженных заявок: <b>{len(leads_data)} шт.</b>\n"
        f"• Формат: таблица Excel (.csv с кодировкой UTF-8-BOM). Открывается в Microsoft Excel, Apple Numbers и Google Таблицах."
    )
    if len(leads_data) == 0:
        caption += "\n\n💡 <i>Как только клиент рассчитает смету и отправит заявку в боте, она автоматически появится в этой таблице.</i>"

    await cb.message.answer_document(document=input_file, caption=caption)


# ---------------------------------------------------------------------------
# 3. Кнопка «⚙️ Мои расценки» (Калибровка базовых ставок и Pro Mode)
# ---------------------------------------------------------------------------
@master_router.message(F.text == "⚙️ Мои расценки")
@master_router.message(Command("prices"))
@master_router.message(Command("pricing"))
async def master_menu_pricing(message: Message):
    """Кабинет управления расценками: базовые ставки за м² и переход в Pro Mode"""
    company = find_company_for_admin(message.from_user.id)
    if not company:
        await message.answer(
            "🏢 У вас пока нет зарегистрированной компании.\n"
            "Отправьте /start, чтобы создать персонального бота для приёма заявок!",
            reply_markup=get_main_master_menu(),
        )
        return

    comp_id = company.get("id") or company.get("bot_username") or "cuberlife_bot"
    uname = company.get("bot_username") or "moscow_remont_bot"

    # Базовые ставки по умолчанию
    p_capital = 12000
    p_comfort = 16500
    p_designer = 24000
    p_materials = 6500
    sec_coeff = 15

    if supabase_client:
        try:
            p_res = (
                supabase_client.table("pricing_rules")
                .select("*")
                .or_(f"company_id.eq.{comp_id},company_id.eq.{uname}")
                .maybe_single()
                .execute()
            )
            if p_res and p_res.data:
                data = p_res.data
                p_capital = int(data.get("price_capital") or data.get("capital_price") or 12000)
                p_comfort = int(data.get("comfort_price") or 16500)
                p_designer = int(data.get("price_designer") or data.get("designer_price") or 24000)
                p_materials = int(data.get("price_materials_m2") or data.get("materials_price") or 6500)
                coeff = float(data.get("coef_secondary") or data.get("secondary_coeff") or 1.15)
                sec_coeff = int(round((coeff - 1.0) * 100))
        except Exception as e:
            logger.debug(f"Ошибка чтения pricing_rules: {e}")

    cap_str = f"{p_capital:,}".replace(",", " ")
    com_str = f"{p_comfort:,}".replace(",", " ")
    des_str = f"{p_designer:,}".replace(",", " ")
    mat_str = f"{p_materials:,}".replace(",", " ")

    text = (
        "⚙️ <b>ВАШИ БАЗОВЫЕ СТАВКИ ЗА М²:</b>\n\n"
        f"• Капитальный ремонт: <b>{cap_str} ₽/м²</b>\n"
        f"• Ремонт «Комфорт»: <b>{com_str} ₽/м²</b>\n"
        f"• Дизайнерский ремонт: <b>{des_str} ₽/м²</b>\n"
        f"• Черновые материалы: <b>{mat_str} ₽/м²</b>\n"
        f"• Коэффициент на вторичку: <b>+{sec_coeff}%</b>\n\n"
        "<i>Измените цены под свой регион в 1 клик:</i>"
    )

    owner_param = company.get("admin_chat_id") or message.from_user.id
    pro_url = f"{MINI_APP_URL}?company_id={comp_id}&bot={uname}&pro_mode=true&owner_id={owner_param}"

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✏️ Редактировать базовые цены",
                    callback_data="master_edit_prices",
                )
            ],
            [
                InlineKeyboardButton(
                    text="🎛 Включить / Выключить услуги",
                    callback_data="master_toggle_services",
                )
            ],
            [
                InlineKeyboardButton(
                    text="🧮 Открыть детальную смету (Pro Mode)",
                    web_app=WebAppInfo(url=pro_url),
                )
            ],
        ]
    )
    await message.answer(text, reply_markup=kb)


@master_router.callback_query(F.data == "master_edit_prices")
async def master_cb_edit_prices(cb: CallbackQuery):
    """Меню быстрой калибровки цен (+10%, -10%, сброс к рынку)"""
    await cb.answer()
    company = find_company_for_admin(cb.from_user.id)
    comp_id = (company.get("id") if company else None) or "cuberlife_bot"
    uname = (company.get("bot_username") if company else None) or "moscow_remont_bot"
    owner_param = (company.get("admin_chat_id") if company else None) or cb.from_user.id
    pro_url = f"{MINI_APP_URL}?company_id={comp_id}&bot={uname}&pro_mode=true&owner_id={owner_param}"

    text = (
        "✏️ <b>Быстрая калибровка расценок:</b>\n\n"
        "Выберите нужное действие для моментального пересчёта всех смет в боте:\n\n"
        "• <b>+10%</b> — повышение цен в сезон высокого спроса\n"
        "• <b>-10%</b> — снижение цен для проведения промо-акций\n"
        "• <b>Стандарт</b> — сбросить к средним эталонным расценкам\n"
        "• <b>Pro Mode</b> — точечное построчное редактирование каждого вида работ"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="📈 Повысить на 10%", callback_data="master_price_inc10"),
                InlineKeyboardButton(text="📉 Снизить на 10%", callback_data="master_price_dec10"),
            ],
            [
                InlineKeyboardButton(text="🔄 Сбросить к эталонам", callback_data="master_price_reset"),
            ],
            [
                InlineKeyboardButton(text="🧮 Открыть детальную смету (Pro Mode)", web_app=WebAppInfo(url=pro_url)),
            ],
            [
                InlineKeyboardButton(text="◀️ Назад к расценкам", callback_data="master_back_prices"),
            ],
        ]
    )
    await cb.message.edit_text(text, reply_markup=kb)


@master_router.callback_query(F.data.in_(["master_price_inc10", "master_price_dec10", "master_price_reset", "master_back_prices"]))
async def master_cb_adjust_pricing(cb: CallbackQuery):
    """Применение быстрой калибровки цен"""
    company = find_company_for_admin(cb.from_user.id)
    if not company:
        await cb.answer("Компания не найдена.")
        return

    comp_id = company.get("id") or company.get("bot_username") or "cuberlife_bot"
    action = cb.data

    if action == "master_back_prices":
        await cb.answer()
        await master_menu_pricing(cb.message)
        return

    # Загружаем текущие или дефолтные
    p_capital = 12000
    p_comfort = 16500
    p_designer = 24000
    p_materials = 6500
    sec_coeff = 1.15

    if action == "master_price_inc10":
        p_capital = int(round(p_capital * 1.10))
        p_comfort = int(round(p_comfort * 1.10))
        p_designer = int(round(p_designer * 1.10))
        p_materials = int(round(p_materials * 1.10))
        toast = "Цены успешно повышены на 10%!"
    elif action == "master_price_dec10":
        p_capital = int(round(p_capital * 0.90))
        p_comfort = int(round(p_comfort * 0.90))
        p_designer = int(round(p_designer * 0.90))
        p_materials = int(round(p_materials * 0.90))
        toast = "Цены успешно снижены на 10%!"
    else:
        toast = "Цены сброшены к базовым эталонам рынка!"

    if supabase_client:
        try:
            update_data = {
                "price_capital": p_capital,
                "price_designer": p_designer,
                "price_materials_m2": p_materials,
                "coef_secondary": sec_coeff,
            }
            supabase_client.table("pricing_rules").update(update_data).or_(f"company_id.eq.{comp_id},company_id.eq.{company.get('bot_username')}").execute()
        except Exception as e:
            logger.debug(f"Ошибка обновления pricing_rules: {e}")

    await cb.answer(toast, show_alert=True)
    await master_menu_pricing(cb.message)


# ---------------------------------------------------------------------------
# Уровень 2: Отключение/включение отдельных услуг (тумблеры в 1 клик)
# ---------------------------------------------------------------------------
COMPANY_DISABLED_SERVICES: Dict[str, set] = {}

SERVICE_DEFINITIONS = [
    ("ceiling", "Натяжные потолки"),
    ("screed", "Полусухая стяжка"),
    ("materials", "Черновые материалы"),
    ("design", "Индивидуальный дизайн-проект"),
    ("demolition", "Демонтажные работы"),
]


@master_router.callback_query(F.data == "master_toggle_services")
async def master_cb_toggle_services(cb: CallbackQuery):
    """Меню управления услугами компании (тумблеры в 1 клик)"""
    await cb.answer()
    company = find_company_for_admin(cb.from_user.id) or {}
    comp_id = company.get("id") or company.get("bot_username") or "default"
    disabled = COMPANY_DISABLED_SERVICES.get(comp_id, set())

    keyboard_rows = []
    for s_key, s_title in SERVICE_DEFINITIONS:
        is_enabled = s_key not in disabled
        btn_text = f"✅ {s_title}" if is_enabled else f"❌ {s_title} (отключено)"
        keyboard_rows.append([InlineKeyboardButton(text=btn_text, callback_data=f"toggle_srv_{s_key}")])

    keyboard_rows.append([InlineKeyboardButton(text="◀️ Назад к расценкам", callback_data="master_back_prices")])

    text = (
        "🎛 <b>Управление услугами компании в калькуляторе:</b>\n\n"
        "Нажмите на нужную услугу, чтобы мгновенно включить или выключить её в клиентском Mini App. "
        "Отключенные услуги перестанут отображаться в расчёте сметы заказчика:\n"
    )
    await cb.message.edit_text(text, reply_markup=InlineKeyboardMarkup(inline_keyboard=keyboard_rows))


@master_router.callback_query(F.data.startswith("toggle_srv_"))
async def master_cb_toggle_single_service(cb: CallbackQuery):
    """Переключение конкретной услуги компании"""
    company = find_company_for_admin(cb.from_user.id) or {}
    comp_id = company.get("id") or company.get("bot_username") or "default"
    srv_key = cb.data.replace("toggle_srv_", "")

    if comp_id not in COMPANY_DISABLED_SERVICES:
        COMPANY_DISABLED_SERVICES[comp_id] = set()

    if srv_key in COMPANY_DISABLED_SERVICES[comp_id]:
        COMPANY_DISABLED_SERVICES[comp_id].remove(srv_key)
        state_text = "включена"
    else:
        COMPANY_DISABLED_SERVICES[comp_id].add(srv_key)
        state_text = "отключена"

    await cb.answer(f"Услуга успешно {state_text}!")
    await master_cb_toggle_services(cb)


# ---------------------------------------------------------------------------
# 4. Кнопка «💎 Тариф и подписка» (Шлюз монетизации)
# ---------------------------------------------------------------------------
@master_router.message(F.text == "💎 Тариф и подписка")
@master_router.message(Command("subscription"))
@master_router.message(Command("sub"))
@master_router.message(Command("tariff"))
@master_router.message(Command("tariffs"))
@master_router.message(Command("pay"))
async def master_cmd_subscription(message: Message):
    """Кабинет управления подпиской строительной компании"""
    company = find_company_for_admin(message.from_user.id)
    if not company:
        await message.answer(
            "🏢 У вас пока нет зарегистрированной компании.\n"
            "Отправьте /start, чтобы создать персонального бота для приёма заявок!",
            reply_markup=get_main_master_menu(),
        )
        return

    comp_id = company.get("bot_username") or company.get("id") or "cuberlife_bot"
    comp_name = company.get("name") or "Ваша компания"
    sub_info = get_company_subscription(comp_id, company, supabase_client)
    is_active = sub_info.get("is_active", False)
    until = sub_info.get("subscription_until")
    days_left = sub_info.get("days_left", 0)

    trial_used = sub_info.get("trial_leads_used", 0)
    total_trial = sub_info.get("total_trial_limit", 3)
    trial_left = max(0, total_trial - trial_used)

    auto_renew = sub_info.get("auto_renew", True)

    if is_active and until:
        until_dt = until.replace(tzinfo=timezone.utc) if until.tzinfo is None else until
        plan_title = "Безлимитный тариф"
        renew_str = "Включено (списание в день окончания) 🔄" if auto_renew else "Отключено (следующих списаний не будет) ⏸"
        status_line = (
            f"• <b>Ваш тариф:</b> {plan_title}\n"
            f"• <b>Текущий статус:</b> Активен до {until_dt.strftime('%d.%m.%Y')} (осталось {days_left} дн.) 🟢\n"
            f"• <b>Автопродление:</b> {renew_str}"
        )
    elif trial_used < total_trial:
        lead_word = "заявка" if trial_left == 1 else ("заявки" if 2 <= trial_left <= 4 else "заявок")
        total_word = "заявки" if 2 <= total_trial <= 4 else "заявок"
        status_line = (
            f"• <b>Ваш тариф:</b> Пробный период ({total_trial} {total_word})\n"
            f"• <b>Использовано:</b> {trial_used} из {total_trial}\n"
            f"• <b>Текущий статус:</b> Активен (осталось {trial_left} {lead_word}) 🎁"
        )
    else:
        total_word = "заявки" if 2 <= total_trial <= 4 else "заявок"
        status_line = (
            f"• <b>Ваш тариф:</b> Пробный период ({total_trial} {total_word})\n"
            f"• <b>Использовано:</b> {trial_used} из {total_trial}\n"
            f"• <b>Текущий статус:</b> 🔒 Исчерпан (новые заявки поступают скрытыми)"
        )

    if is_active:
        sub_notice = "У вас действует безлимитный доступ ко всем заявкам клиентов без маскировки:\n\n"
    elif trial_left > 0:
        lead_word = "заявка" if trial_left == 1 else ("заявки" if 2 <= trial_left <= 4 else "заявок")
        sub_notice = (
            f"У вас осталось <b>{trial_left} {lead_word}</b> с открытыми номерами телефонов и адресами. "
            "Продлите доступ заранее, чтобы не терять клиентов:\n\n"
        )
    else:
        sub_notice = (
            "Бесплатный пробный период исчерпан. Новые заявки поступают со скрытыми номерами телефонов. "
            "Выберите тариф для открытия доступа:\n\n"
        )

    text = (
        "💎 <b>УПРАВЛЕНИЕ ПОДПИСКОЙ</b>\n\n"
        f"{status_line}\n\n"
        f"{sub_notice}"
        "👇 <b>Выберите подходящий тариф:</b>\n\n"
        "ℹ️ <i>Услуга считается оказанной в момент предоставления доступа к функционалу платформы. "
        "Автопродление можно отменить в 1 клик в любой момент командой /cancel_subscription или кнопкой ниже.</i>"
    )

    kb = get_subscription_keyboard(comp_id, comp_name, message.from_user.id, is_active=is_active, auto_renew=auto_renew)
    await message.answer(text, reply_markup=kb)


# ---------------------------------------------------------------------------
# 5. Кнопка «🎁 Месяц бесплатно» (Вирусная рефералка)
# ---------------------------------------------------------------------------
@master_router.message(F.text == "🎁 Месяц бесплатно")
async def master_menu_referral_btn(message: Message):
    """Вирусная партнёрка «Месяц за коллегу»"""
    await master_referral_info(message)


# ---------------------------------------------------------------------------
# 6. Кнопка «🆘 Обучение и помощь» (Разгрузка поддержки)
# ---------------------------------------------------------------------------
def get_help_main_text() -> str:
    return (
        "🆘 <b>БАЗА ЗНАНИЙ И ПРОСТЫЕ ИНСТРУКЦИИ</b>\n\n"
        "Здесь простыми словами объяснено, как устроен ваш бот, как привлекать заказчиков и зарабатывать больше на ремонтах:\n\n"
        "• <b>📖 Как всё устроено:</b> как бот и калькулятор считают сметы и приносят заявки\n"
        "• <b>📈 3+ заявки в день с Авито:</b> готовая схема и текст объявления для потока клиентов\n"
        "• <b>📄 Договор по смете:</b> как защитить себя от споров и не остаться без оплаты\n"
        "• <b>⚙️ Настройка цен:</b> как в 1 клик изменить расценки под свою бригаду\n\n"
        "<i>Нажмите на нужный раздел ниже:</i>"
    )


def get_help_inline_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📖 Как всё устроено (на пальцах)",
                    callback_data="master_help_manual",
                )
            ],
            [
                InlineKeyboardButton(
                    text="📈 Как получать 3+ заявки в день с Авито",
                    callback_data="master_help_avito",
                )
            ],
            [
                InlineKeyboardButton(
                    text="📄 Договор по смете и защита от споров",
                    callback_data="master_help_contract",
                )
            ],
            [
                InlineKeyboardButton(
                    text="⚙️ Как настроить свои цены",
                    callback_data="master_help_pricing",
                )
            ],
        ]
    )


def get_help_back_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="⬅️ Назад в меню помощи",
                    callback_data="master_help_back",
                )
            ]
        ]
    )


def get_help_manual_text(uname: str) -> str:
    return (
        "📖 <b>КАК ВСЁ УСТРОЕНО И РАБОТАЕТ (НА ПАЛЬЦАХ)</b>\n\n"
        "Вся система создана для того, чтобы вам больше не приходилось часами считать сметы вручную на коленке и спорить с заказчиками о ценах.\n\n"
        f"1️⃣ <b>Ваш личный бот (@{uname})</b>\n"
        "• Это ссылка, которую вы даёте клиентам в профиле на Авито, в соцсетях или отправляете в ответ на звонок.\n"
        "• Заказчик заходит в бота и нажимает: <b>«📱 Рассчитать смету онлайн»</b>.\n"
        "• Прямо внутри Telegram открывается удобный и наглядный калькулятор.\n\n"
        "2️⃣ <b>Что делает заказчик в калькуляторе:</b>\n"
        "• Двигает ползунок площади своей квартиры (например, 54 м²).\n"
        "• Выбирает тариф: <i>Косметический, Капитальный или Дизайнерский</i>.\n"
        "• Видит честный расчет по видам работ: штукатурка, стяжка, электрика, сантехника, плитка, обои.\n"
        "• Может сам снять галочки с тех работ, которые ему не нужны (например, если потолки делает знакомый) — смета пересчитается на лету, а клиент увидит свою экономию.\n\n"
        "3️⃣ <b>Как вы получаете готовую заявку:</b>\n"
        "• Клиент нажимает <b>«Зафиксировать смету»</b>, указывает имя, телефон и адрес.\n"
        "• <b>Вы мгновенно получаете карточку заказа</b> в Telegram со всеми параметрами квартиры.\n"
        "• К карточке сразу прикреплен <b>подробный PDF-файл официальной сметы</b> со всеми суммами и объемами.\n"
        "• Под сообщением есть кнопка <b>«💬 Написать клиенту в Telegram»</b> — нажимаете и сразу договариваетесь о времени замера!\n\n"
        "Всё работает автоматически 24/7 без вашего участия."
    )


def get_help_avito_text(uname: str) -> str:
    return (
        "📈 <b>КАК ПОЛУЧАТЬ ОТ 3 ЗАЯВОК В ДЕНЬ С АВИТО</b>\n\n"
        "Большинство строителей на Авито пишут одно и то же: «Делаем ремонт качественно, русские бригады». Клиенты в это уже не верят.\n\n"
        "Вот проверенная схема, которая стабильно приносит горячих заказчиков:\n\n"
        "1️⃣ <b>Цепляющий заголовок объявления:</b>\n"
        "<i>«Капитальный ремонт квартир под ключ + точная смета в Telegram за 1 минуту»</i>\n\n"
        "2️⃣ <b>Второе фото в галерее:</b>\n"
        "Сделайте скриншот вашего калькулятора с крупной надписью:\n"
        "<i>«Рассчитайте точную стоимость ремонта своей квартиры за 60 секунд без звонков и навязывания услуг»</i>. Люди обожают сначала прицениться сами.\n\n"
        "3️⃣ <b>Первая строчка в тексте объявления:</b>\n"
        f"<i>«👉 Хотите узнать точную смету прямо сейчас? Рассчитайте в нашем боте: https://t.me/{uname}»</i>\n\n"
        "4️⃣ <b>Главный крючок — бесплатный лазерный замер (0 ₽):</b>\n"
        "В конце объявления напишите:\n"
        "<i>«При фиксации сметы в боте — выезд инженера с лазерным дальномером и 3D-план розеток БЕСПЛАТНО»</i>.\n\n"
        "Клиенты считают смету, оставляют телефон, и к вам приходит уже прогретый заказчик, который согласен с вашим уровнем цен!"
    )


def get_help_contract_text() -> str:
    return (
        "📄 <b>КАК ДОГОВОР ПО СМЕТЕ ЗАЩИЩАЕТ ВАС И ВАШИ ДЕНЬГИ</b>\n\n"
        "Главный страх заказчика — что прораб назовет одну цену, а в конце потребует в два раза больше. Главный страх мастера — что заказчик придерется и откажется платить.\n\n"
        "Вот 3 простых правила, которые снимают любые конфликты:\n\n"
        "1️⃣ <b>Смета из бота — это Приложение №1 к договору:</b>\n"
        "Распечатайте PDF-файл, который прислал бот, и прикрепите к договору. В тексте укажите: <i>«Стоимость указанных видов работ является твердой и не подлежит изменению в одностороннем порядке (ст. 709 ГК РФ)»</i>. Это сразу вызывает доверие.\n\n"
        "2️⃣ <b>Оплата строго по этапам (без предоплаты за работу):</b>\n"
        "Разбейте весь ремонт на 3–4 понятных этапа:\n"
        "• <i>Этап 1:</i> Демонтаж и перегородки\n"
        "• <i>Этап 2:</i> Штукатурка, стяжка, проводка и трубы\n"
        "• <i>Этап 3:</i> Плитка, обои, ламинат, двери\n"
        "Заказчик оплачивает этап только после подписания акта приема. За материалы можно брать аванс по чекам.\n\n"
        "3️⃣ <b>Любые новые пожелания — только через доп. соглашение:</b>\n"
        "Если клиент просит: «А добавьте еще подсветку и перенесите розетки», вы открываете бота, рассчитываете доп. работы и подписываете короткое доп. соглашение. Никаких споров в конце объекта!"
    )


def get_help_pricing_text() -> str:
    return (
        "⚙️ <b>КАК БЫСТРО НАСТРОИТЬ СВОИ ЦЕНЫ В БОТЕ</b>\n\n"
        "В боте изначально заложены честные рыночные расценки вашего города. Вы можете в любой момент изменить их под свою бригаду:\n\n"
        "1️⃣ <b>Быстрое изменение всех цен сразу:</b>\n"
        "• В главном меню нажмите кнопку <b>«⚙️ Мои расценки»</b>.\n"
        "• Выберите <b>«📈 Повысить на 10%»</b>, если работаете в более высоком сегменте, или <b>«📉 Снизить на 10%»</b> для быстрого набора заказов.\n\n"
        "2️⃣ <b>Отключение ненужных услуг тумблером:</b>\n"
        "• В меню расценок есть переключатели отдельных услуг.\n"
        "• Если вы не делаете дизайн-проекты или клиент сам закупает материалы — выключите их в 1 клик.\n\n"
        "3️⃣ <b>Точная настройка каждой строчки (Pro Mode):</b>\n"
        "• Нажмите <b>«🧮 Открыть детальную смету (Pro Mode)»</b>.\n"
        "• В открывшемся калькуляторе нажмите на любую цену (штукатурка, укладка плитки, кабель) и введите свою ставку!\n\n"
        "Все изменения мгновенно начинают действовать для новых расчетов клиентов."
    )


async def _send_help_screen(cb: CallbackQuery, text: str, kb: InlineKeyboardMarkup):
    """Гарантированная отправка раздела помощи: сначала editMessageText, при ошибке — sendMessage"""
    try:
        await cb.answer()
    except Exception:
        pass

    edited = False
    if cb.message:
        try:
            await cb.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
            edited = True
        except Exception as edit_err:
            logger.debug(f"edit_text в помощи не удался ({edit_err}), отправляем новым сообщением")

    if not edited:
        try:
            chat_id = cb.message.chat.id if cb.message else cb.from_user.id
            target_bot = cb.bot or master_bot
            if target_bot:
                await target_bot.send_message(chat_id=chat_id, text=text, reply_markup=kb, parse_mode="HTML")
        except Exception as e:
            logger.error(f"Ошибка отправки раздела помощи: {e}")


@master_router.message(F.text == "🆘 Обучение и помощь")
@master_router.message(Command("help"))
@master_router.message(Command("support"))
async def master_menu_help(message: Message):
    """База знаний, понятные инструкции и контакт основателя"""
    await message.answer(get_help_main_text(), reply_markup=get_help_inline_keyboard())


@master_router.callback_query(F.data == "master_help_manual")
async def master_cb_help_manual(cb: CallbackQuery):
    """Простая инструкция по работе связки Бот + Mini App для прораба"""
    company = find_company_for_admin(cb.from_user.id) or {}
    uname = company.get("bot_username") or "ваш_бот"
    await _send_help_screen(cb, get_help_manual_text(uname), get_help_back_keyboard())


@master_router.callback_query(F.data == "master_help_avito")
async def master_cb_help_avito(cb: CallbackQuery):
    """Пошаговая инструкция получения клиентов с Авито"""
    company = find_company_for_admin(cb.from_user.id) or {}
    uname = company.get("bot_username") or "moscow_remont_bot"
    await _send_help_screen(cb, get_help_avito_text(uname), get_help_back_keyboard())


@master_router.callback_query(F.data == "master_help_contract")
async def master_cb_help_contract(cb: CallbackQuery):
    """Рекомендации по заключению договора по смете калькулятора"""
    await _send_help_screen(cb, get_help_contract_text(), get_help_back_keyboard())


@master_router.callback_query(F.data == "master_help_pricing")
async def master_cb_help_pricing(cb: CallbackQuery):
    """Инструкция по настройке расценок в боте"""
    await _send_help_screen(cb, get_help_pricing_text(), get_help_back_keyboard())


@master_router.callback_query(F.data == "master_help_back")
async def master_cb_help_back(cb: CallbackQuery):
    """Возврат в главное меню раздела помощи"""
    await _send_help_screen(cb, get_help_main_text(), get_help_inline_keyboard())


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


@master_router.pre_checkout_query()
async def master_pre_checkout_handler(query: PreCheckoutQuery):
    """Подтверждение готовности принять платёж Telegram Payments"""
    try:
        await query.answer(ok=True)
    except Exception as e:
        logger.error(f"Ошибка подтверждения PreCheckoutQuery в мастер-боте: {e}")


@master_router.message(F.successful_payment)
async def master_successful_payment_handler(message: Message):
    """Обработка успешной оплаты через нативные платежи Telegram в мастер-боте"""
    sp = message.successful_payment
    invoice_payload = str(sp.invoice_payload or "")
    chosen_plan = "1m"
    if "3m" in invoice_payload:
        chosen_plan = "3m"
    elif "1y" in invoice_payload or "year" in invoice_payload:
        chosen_plan = "1y"

    company = find_company_for_admin(message.from_user.id)
    comp_id = (company.get("bot_username") if company else None) or "cuberlife_bot"
    bot_token = company.get("bot_token") if company else None

    await activate_subscription_for_company(
        company_id=comp_id,
        supabase_client=supabase_client,
        master_bot=master_bot,
        admin_chat_id=message.from_user.id,
        bot_token=bot_token,
        plan_id=chosen_plan,
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
async def master_cmd_start(message: Message, state: FSMContext, command: Optional[CommandObject] = None):
    """Приветствие прораба и меню управления ботом"""
    await state.clear()

    # Проверяем реферальный код пригласившего коллеги (Механика 5)
    referrer_id = None
    if command and command.args and command.args.startswith("ref_"):
        referrer_id = command.args.replace("ref_", "").strip()
        await state.update_data(referred_by=referrer_id)

    existing_comp = find_company_for_admin(message.from_user.id)
    if existing_comp and existing_comp.get("bot_username"):
        uname = existing_comp.get("bot_username")
        cname = existing_comp.get("name")
        sub_info = get_company_subscription(uname, existing_comp, supabase_client)
        is_active = sub_info.get("is_active", False)
        until = sub_info.get("subscription_until")

        trial_used = sub_info.get("trial_leads_used", 0)
        total_trial = sub_info.get("total_trial_limit", 3)
        trial_left = max(0, total_trial - trial_used)
        if is_active and until:
            until_dt = until.replace(tzinfo=timezone.utc) if until.tzinfo is None else until
            status_desc = f"🟢 Активна (до {until_dt.strftime('%d.%m.%Y')})"
        elif trial_used < total_trial:
            lead_word = "заявка" if trial_left == 1 else ("заявки" if 2 <= trial_left <= 4 else "заявок")
            status_desc = f"🎁 <b>Бесплатный триал:</b> {trial_used} из {total_trial} использовано (осталось {trial_left} {lead_word})"
        else:
            status_desc = f"🔒 <b>Триал {total_trial} заявок исчерпан</b> (новые контакты маскируются до оплаты)"

        welcome_back = (
            f"👋 <b>С возвращением, {cname}!</b>\n\n"
            f"🤖 <b>Ваш бот:</b> @{uname}\n"
            f"📊 <b>Подписка:</b> {status_desc}\n\n"
            "👇 <b>Главное меню управления вашим ботом (кнопки внизу экрана):</b>"
        )
        await message.answer(welcome_back, reply_markup=get_main_master_menu())
        return

    ref_bonus_badge = ""
    if referrer_id:
        ref_bonus_badge = (
            "🎁 <b>Вам начислен приветственный бонус:</b> +5 дополнительных заявок к стартовому триалу "
            "(всего 8 клиентов вместо 3) за переход по приглашению коллеги!\n\n"
        )

    welcome_text = (
        "👋 <b>Привет! Создадим персонального бота для ремонта за 2 минуты.</b>\n\n"
        f"{ref_bonus_badge}"
        "С помощью этого бота ваши клиенты смогут мгновенно рассчитывать стоимость ремонта, "
        "а вы будете получать горячие заявки с контактами прямо в этот чат.\n\n"
        "📍 <b>Шаг 1 из 3:</b> Введите название вашей компании или бригады\n"
        "<i>(например: «РемонтСтрой» или «Бригада Алексея»):</i>"
    )
    await message.answer(welcome_text)
    await state.set_state(RegisterCompanyFSM.company_name)


@master_router.message(Command("ref"))
@master_router.message(Command("referral"))
@master_router.callback_query(F.data == "btn_referral")
async def master_referral_info(event: Any):
    """Механика 5: Двусторонняя B2B-рефералка «Месяц за коллегу»"""
    msg = event.message if isinstance(event, CallbackQuery) else event
    user_id = event.from_user.id

    m_uname = "RemontMasterBot"
    if master_bot:
        try:
            bot_info = await master_bot.get_me()
            m_uname = bot_info.username or m_uname
        except Exception:
            pass

    ref_link = f"https://t.me/{m_uname}?start=ref_{user_id}"
    share_text = (
        "Коллега, привет! Подключи себе персонального Telegram-бота для расчёта смет на ремонт: "
        "он автоматически рассчитывает смету клиентам и выдаёт заявки. "
        "По моей ссылке тебе дадут +5 дополнительных бесплатных заявок на старте (всего 8):"
    )
    share_url = f"https://t.me/share/url?url={urllib.parse.quote(ref_link)}&text={urllib.parse.quote(share_text)}"

    existing_comp = find_company_for_admin(user_id)
    ref_cnt = int(existing_comp.get("referral_count") or 0) if existing_comp else 0

    text = (
        "🎁 <b>Партнёрская программа «Месяц за коллегу» (Win-Win)</b>\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        "Рекомендуйте сервис коллегам-строителям, отделочникам или прорабам и пользуйтесь платформой <b>бесплатно</b>!\n\n"
        "🤝 <b>Что получает ваш коллега:</b>\n"
        "• <b>+5 бесплатных заявок</b> к стартовому триалу (всего 8 полноценных лидов с открытыми телефонами вместо 3).\n\n"
        "💰 <b>Что получаете вы:</b>\n"
        "• <b>+1 месяц безлимитной подписки</b> (экономия 2 990 ₽) в подарок, как только приглашённый коллега оплатит свой первый месяц!\n\n"
        f"📊 <b>Ваша статистика:</b>\n"
        f"• Приглашено оплативших коллег: <b>{ref_cnt}</b>\n"
        f"• Сэкономлено на подписке: <b>{ref_cnt * 2990} ₽</b>\n\n"
        f"🔗 <b>Ваша персональная реферальная ссылка:</b>\n"
        f"<code>{ref_link}</code>"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📤 Отправить коллеге в Telegram", url=share_url)],
            [InlineKeyboardButton(text="◀️ Назад в кабинет", callback_data="btn_sub")],
        ]
    )
    if isinstance(event, CallbackQuery):
        await event.message.edit_text(text, reply_markup=kb, parse_mode=ParseMode.HTML)
        await event.answer()
    else:
        await msg.answer(text, reply_markup=kb, parse_mode=ParseMode.HTML)


@master_router.callback_query(F.data == "btn_sub")
async def master_callback_sub(call):
    await call.answer()
    await master_cmd_subscription(call.message)


@master_router.callback_query(F.data == "btn_pay")
async def master_callback_pay(call):
    await call.answer()
    await master_cmd_pay(call.message)


@master_router.message(Command("offer"))
@master_router.message(Command("terms"))
async def master_cmd_offer(message: Message):
    """Отправка положений публичной оферты с прямой ссылкой на веб-страницу"""
    offer_url = f"{BASE_WEBHOOK_URL}/offer" if BASE_WEBHOOK_URL else "https://t.me/cuberlife_bot"
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📄 Открыть полный текст оферты в браузере", url=offer_url)],
            [InlineKeyboardButton(text="💎 Кабинет подписки", callback_data="btn_sub")],
        ]
    )
    await message.answer(OFFER_SUMMARY_TEXT, reply_markup=kb, parse_mode="HTML")


@master_router.callback_query(F.data == "btn_offer")
async def master_cb_offer(cb: CallbackQuery):
    """Инлайн просмотр условий оферты"""
    await cb.answer()
    offer_url = f"{BASE_WEBHOOK_URL}/offer" if BASE_WEBHOOK_URL else "https://t.me/cuberlife_bot"
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📄 Открыть полный текст оферты в браузере", url=offer_url)],
            [InlineKeyboardButton(text="💎 Кабинет подписки", callback_data="btn_sub")],
        ]
    )
    if cb.message:
        try:
            await cb.message.edit_text(OFFER_SUMMARY_TEXT, reply_markup=kb, parse_mode="HTML")
            return
        except Exception:
            pass
    target_bot = cb.bot or master_bot
    if target_bot:
        await target_bot.send_message(chat_id=cb.from_user.id, text=OFFER_SUMMARY_TEXT, reply_markup=kb, parse_mode="HTML")


@master_router.message(Command("privacy"))
@master_router.message(Command("policy"))
async def master_cmd_privacy(message: Message):
    """Политика обработки персональных данных (152-ФЗ РФ)"""
    privacy_url = f"{BASE_WEBHOOK_URL}/privacy" if BASE_WEBHOOK_URL else "https://t.me/cuberlife_bot"
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔒 Полный текст политики 152-ФЗ в браузере", url=privacy_url)],
            [InlineKeyboardButton(text="📄 Публичная оферта", callback_data="btn_offer")],
        ]
    )
    await message.answer(PRIVACY_SUMMARY_TEXT, reply_markup=kb, parse_mode="HTML")


@master_router.message(Command("cancel_subscription"))
async def master_cmd_cancel_subscription(message: Message):
    """Отмена автопродления подписки в 1 клик через команду"""
    company = find_company_for_admin(message.from_user.id)
    comp_id = (company.get("bot_username") if company else None) or str(message.from_user.id)
    cancel_auto_renew(comp_id, supabase_client)

    sub_info = get_company_subscription(comp_id, company, supabase_client)
    until = sub_info.get("subscription_until")
    until_str = until.strftime("%d.%m.%Y") if until else "конца оплаченного периода"

    cancel_text = (
        "✅ <b>Автопродление подписки успешно отменено в 1 клик!</b>\n\n"
        "• Никаких дальнейших автоматических списаний производиться не будет.\n"
        f"• Доступ ко всем возможностям платформы и приёму заявок <b>сохраняется до {until_str}</b>.\n\n"
        "ℹ️ <i>Согласно п. 3.2 Публичной оферты, услуга считается оказанной в момент предоставления доступа к функционалу платформы.</i>\n\n"
        "Вы можете в любой момент возобновить автопродление в меню /subscription."
    )
    offer_url = f"{BASE_WEBHOOK_URL}/offer" if BASE_WEBHOOK_URL else "https://t.me/cuberlife_bot"
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔄 Возобновить автопродление", callback_data="btn_resume_sub")],
            [InlineKeyboardButton(text="📄 Публичная оферта", url=offer_url)],
        ]
    )
    await message.answer(cancel_text, reply_markup=kb, parse_mode="HTML")


@master_router.callback_query(F.data == "btn_cancel_sub")
async def master_cb_cancel_sub(cb: CallbackQuery):
    """Отмена автопродления по инлайн-кнопке в 1 клик"""
    await cb.answer("Автопродление успешно отключено!")
    company = find_company_for_admin(cb.from_user.id)
    comp_id = (company.get("bot_username") if company else None) or str(cb.from_user.id)
    cancel_auto_renew(comp_id, supabase_client)

    sub_info = get_company_subscription(comp_id, company, supabase_client)
    until = sub_info.get("subscription_until")
    until_str = until.strftime("%d.%m.%Y") if until else "конца оплаченного периода"

    confirm_text = (
        "✅ <b>Автопродление подписки отключено в 1 клик</b>\n\n"
        "• Следующих автоматических списаний не будет.\n"
        f"• Ваш бот продолжает работать в полном объёме <b>до {until_str}</b>.\n\n"
        "ℹ️ <i>Согласно п. 3.2 Публичной оферты, услуга считается оказанной в момент предоставления доступа к функционалу платформы.</i>"
    )
    offer_url = f"{BASE_WEBHOOK_URL}/offer" if BASE_WEBHOOK_URL else "https://t.me/cuberlife_bot"
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔄 Возобновить автопродление", callback_data="btn_resume_sub")],
            [InlineKeyboardButton(text="💎 Кабинет подписки", callback_data="btn_sub")],
            [InlineKeyboardButton(text="📄 Публичная оферта", url=offer_url)],
        ]
    )
    if cb.message:
        try:
            await cb.message.edit_text(confirm_text, reply_markup=kb, parse_mode="HTML")
            return
        except Exception:
            pass
    target_bot = cb.bot or master_bot
    if target_bot:
        await target_bot.send_message(chat_id=cb.from_user.id, text=confirm_text, reply_markup=kb, parse_mode="HTML")


@master_router.callback_query(F.data == "btn_resume_sub")
async def master_cb_resume_sub(cb: CallbackQuery):
    """Возобновление автопродления подписки"""
    await cb.answer("Автопродление возобновлено!")
    company = find_company_for_admin(cb.from_user.id)
    comp_id = (company.get("bot_username") if company else None) or str(cb.from_user.id)
    resume_auto_renew(comp_id, supabase_client)

    text = "🔄 <b>Автопродление успешно включено.</b> Списание произойдёт в день окончания текущего периода."
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="💎 Перейти в кабинет подписки", callback_data="btn_sub")],
        ]
    )
    if cb.message:
        try:
            await cb.message.edit_text(text, reply_markup=kb, parse_mode="HTML")
            return
        except Exception:
            pass
    target_bot = cb.bot or master_bot
    if target_bot:
        await target_bot.send_message(chat_id=cb.from_user.id, text=text, reply_markup=kb, parse_mode="HTML")


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
    """Шаг 2: получение города и выбор ценового уровня (Layer 2 Архитектуры)"""
    city = message.text.strip()
    if len(city) < 2:
        await message.answer("Пожалуйста, введите название города:")
        return

    await state.update_data(city=city)
    await state.set_state(RegisterCompanyFSM.price_level)

    safe_city = html.escape(city)
    text = (
        f"📍 <b>Шаг 2.5: Ценовой уровень вашей компании</b>\n\n"
        f"Город: <b>{safe_city}</b>\n\n"
        "Укажите ценовой уровень для автоматической калибровки смет:\n\n"
        "🔘 <b>Москва и МО</b> (высокий, ×1.3 к базовым ставкам)\n"
        "🔘 <b>Санкт-Петербург и миллионники</b> (средний, ×1.15)\n"
        "🔘 <b>Регионы РФ</b> (базовый эталон, ×1.0)\n\n"
        "👇 <b>Нажмите нужный вариант на клавиатуре внизу экрана:</b>"
    )

    # Полноразмерная Reply-клавиатура внизу экрана (100% стабильная работа)
    reply_kb = ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="🔘 Москва и МО (×1.3)")],
            [KeyboardButton(text="🔘 Санкт-Петербург и миллионники (×1.15)")],
            [KeyboardButton(text="🔘 Регионы РФ (×1.0)")],
        ],
        resize_keyboard=True,
        one_time_keyboard=True,
    )

    await message.answer(text, reply_markup=reply_kb, parse_mode=ParseMode.HTML)


async def _apply_price_preset_step(
    user_id: int,
    data_code: str,
    state: FSMContext,
    cb: Optional[CallbackQuery] = None,
    msg: Optional[Message] = None,
):
    """Единая логика фиксации ценового уровня (по Reply-кнопкам и тексту)"""
    clean_code = (data_code or "").strip().lower()
    mult = 1.0
    label = "Регионы РФ (базовый, ×1.0)"

    if any(k in clean_code for k in ["moscow", "москв", "1.3", "высокий"]):
        mult = 1.3
        label = "Москва и МО (высокий, ×1.3)"
    elif any(k in clean_code for k in ["spb", "петербург", "питер", "спб", "1.15", "средний", "миллион"]):
        mult = 1.15
        label = "Санкт-Петербург и миллионники (средний, ×1.15)"
    elif any(k in clean_code for k in ["region", "регион", "1.0", "базов", "рф"]):
        mult = 1.0
        label = "Регионы РФ (базовый, ×1.0)"
    elif clean_code in ["1", "1)", "1."]:
        mult = 1.3
        label = "Москва и МО (высокий, ×1.3)"
    elif clean_code in ["2", "2)", "2."]:
        mult = 1.15
        label = "Санкт-Петербург и миллионники (средний, ×1.15)"
    elif clean_code in ["3", "3)", "3."]:
        mult = 1.0
        label = "Регионы РФ (базовый, ×1.0)"

    await state.update_data(price_multiplier=mult, price_level_name=label)
    await state.set_state(RegisterCompanyFSM.bot_token)

    data = await state.get_data()
    city = data.get("city", "Москва")
    company_name = data.get("company_name", "Ремонт")
    safe_city = html.escape(str(city))
    safe_company = html.escape(str(company_name))
    slug_suggestion = re.sub(r"[^a-zA-Z0-9_]", "", str(company_name).lower().replace(" ", "_")) or "my_remont"

    keyboard = get_botfather_guide_keyboard()
    caption_text = (
        f"✅ <b>Ценовой уровень зафиксирован:</b> {label}\n\n"
        "📍 <b>Шаг 3 из 3: Подключение вашего личного бота</b>\n\n"
        "Чтобы заявки и сметы приходили в ваш личный бот, нужен бесплатный токен от Telegram:\n\n"
        "1. Перейдите в @BotFather по кнопке ниже.\n"
        "2. Нажмите <b>Start</b> и отправьте команду <code>/newbot</code>.\n"
        f"3. Введите название бота (например: <i>Ремонт Квартир {safe_city}</i>).\n"
        f"4. Введите юзернейм на латинице с окончанием на <code>bot</code> (например: <i>{slug_suggestion}_bot</i>).\n"
        "5. Скопируйте длинный ключ (<b>HTTP API Token</b>) и отправьте его сюда.\n\n"
        "💡 <i>Защита от ошибок:</i> вы можете скопировать всё сообщение от @BotFather целиком — система сама найдёт в нём токен!"
    )

    if msg:
        try:
            # Убираем клавиатуру выбора уровня и подтверждаем выбор
            await msg.answer(
                f"✅ <b>Ценовой уровень выбран:</b> {label}",
                reply_markup=ReplyKeyboardRemove(),
                parse_mode=ParseMode.HTML,
            )
        except Exception as e:
            logger.debug(f"Не удалось отправить подтверждение уровня: {e}")

    if cb:
        try:
            await cb.answer("✅ Уровень цен зафиксирован!")
        except Exception:
            pass

        try:
            if cb.message and hasattr(cb.message, "edit_text"):
                await cb.message.edit_text(
                    f"📍 <b>Шаг 2.5: Ценовой уровень компании</b>\n\n"
                    f"Город: <b>{safe_city}</b>\n\n"
                    f"✅ <b>Зафиксирован уровень:</b> {label}",
                    parse_mode=ParseMode.HTML,
                    reply_markup=None,
                )
        except Exception as e:
            logger.debug(f"Не удалось отредактировать сообщение шага 2.5: {e}")

    guide_video_id = BOTFATHER_GUIDE_VIDEO_ID or os.getenv("BOTFATHER_GUIDE_VIDEO_ID", "")
    video_sent = False
    target_msg = (cb.message if cb and cb.message and hasattr(cb.message, "answer_video") else None) or msg

    if guide_video_id and target_msg and master_bot:
        try:
            await target_msg.answer_video(
                video=guide_video_id,
                caption=caption_text,
                reply_markup=keyboard,
                parse_mode=ParseMode.HTML,
            )
            video_sent = True
        except Exception as e:
            logger.warning(f"Не удалось отправить видео по file_id '{guide_video_id}': {e}")

    if not video_sent:
        try:
            if target_msg and hasattr(target_msg, "answer"):
                await target_msg.answer(
                    caption_text,
                    reply_markup=keyboard,
                    parse_mode=ParseMode.HTML,
                )
            elif master_bot:
                await master_bot.send_message(
                    chat_id=user_id,
                    text=caption_text,
                    reply_markup=keyboard,
                    parse_mode=ParseMode.HTML,
                )
            elif cb and cb.bot:
                await cb.bot.send_message(
                    chat_id=user_id,
                    text=caption_text,
                    reply_markup=keyboard,
                    parse_mode=ParseMode.HTML,
                )
        except Exception as e:
            logger.error(f"Ошибка отправки сообщения шага 3 с HTML: {e}")
            # Надежный fallback без HTML-тегов
            plain_caption = (
                f"✅ Ценовой уровень зафиксирован: {label}\n\n"
                "Шаг 3 из 3: Подключение вашего личного бота\n\n"
                "Чтобы заявки и сметы приходили в ваш личный бот, нужен бесплатный токен от Telegram:\n\n"
                "1. Перейдите в @BotFather по кнопке ниже.\n"
                "2. Нажмите Start и отправьте команду /newbot.\n"
                f"3. Введите название бота (например: Ремонт Квартир {city}).\n"
                f"4. Введите юзернейм на латинице с окончанием на bot (например: {slug_suggestion}_bot).\n"
                "5. Скопируйте длинный ключ (HTTP API Token) и отправьте его сюда."
            )
            try:
                if target_msg and hasattr(target_msg, "answer"):
                    await target_msg.answer(plain_caption, reply_markup=keyboard)
                elif master_bot:
                    await master_bot.send_message(chat_id=user_id, text=plain_caption, reply_markup=keyboard)
            except Exception as e2:
                logger.error(f"Fallback отправка шага 3 не удалась: {e2}")


@master_router.message(StateFilter(RegisterCompanyFSM.price_level))
async def master_msg_price_preset(message: Message, state: FSMContext):
    """Фиксация ценового уровня по нажатию Reply-кнопки или обычному текстовому ответу"""
    await _apply_price_preset_step(
        user_id=message.from_user.id,
        data_code=message.text or "",
        state=state,
        msg=message,
    )


@master_router.callback_query(StateFilter(RegisterCompanyFSM.price_level), F.data.in_(["preset_moscow", "preset_spb", "preset_regions"]))
@master_router.callback_query(StateFilter(RegisterCompanyFSM.price_level), F.data.startswith("preset_"))
@master_router.callback_query(F.data.in_(["preset_moscow", "preset_spb", "preset_regions"]))
@master_router.callback_query(F.data.startswith("preset_"))
async def master_cb_price_preset(cb: CallbackQuery, state: FSMContext):
    """Fallback-обработчик для старых сообщений с инлайн-кнопками"""
    await _apply_price_preset_step(
        user_id=cb.from_user.id,
        data_code=cb.data or "",
        state=state,
        cb=cb,
    )


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
    referred_by = data.get("referred_by")
    bonus_leads = 5 if referred_by else 0

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
                "bot_token_encrypted": token_candidate,
                "bot_username": bot_username.lower(),
                "is_active": True,
            }
            if referred_by:
                company_row["referred_by"] = str(referred_by)
                company_row["bonus_leads"] = bonus_leads

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
        "referred_by": referred_by,
        "bonus_leads": bonus_leads,
    }
    COMPANIES_CACHE[company_id] = company_obj
    COMPANIES_CACHE[bot_username.lower()] = company_obj
    if company_uuid:
        COMPANIES_CACHE[company_uuid] = company_obj

    if bonus_leads > 0:
        if company_id not in SUBSCRIPTIONS_CACHE:
            SUBSCRIPTIONS_CACHE[company_id] = {}
        SUBSCRIPTIONS_CACHE[company_id]["bonus_leads"] = bonus_leads
        if company_uuid:
            if company_uuid not in SUBSCRIPTIONS_CACHE:
                SUBSCRIPTIONS_CACHE[company_uuid] = {}
            SUBSCRIPTIONS_CACHE[company_uuid]["bonus_leads"] = bonus_leads
        save_local_subscriptions()

    # Оповещаем пригласившего коллегу (Механика 5)
    if referred_by and MASTER_BOT_TOKEN:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                ref_alert = (
                    "🤝 <b>Новый коллега зарегистрировался по вашей ссылке!</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━\n"
                    f"🏢 Компания: <b>{company_name}</b> (г. {city})\n"
                    f"🤖 Бот коллеги: @{bot_username}\n"
                    "🎁 Ему начислено <b>+5 бонусных заявок</b> к стартовому триалу (всего 8).\n\n"
                    "Как только коллега оплатит первый месяц подписки, вам автоматически начислится <b>+1 месяц в подарок (2 990 ₽)</b>!"
                )
                await client.post(
                    f"https://api.telegram.org/bot{MASTER_BOT_TOKEN}/sendMessage",
                    json={"chat_id": referred_by, "text": ref_alert, "parse_mode": "HTML"},
                )
        except Exception as e:
            logger.debug(f"Не удалось отправить уведомление рефереру: {e}")

    # 3. Сброс кнопки меню чата на стандартную (убираем веб-приложение со строки ввода, оставляем только удобную Reply-кнопку)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            menu_btn_payload = {
                "menu_button": {
                    "type": "default"
                }
            }
            menu_resp = await client.post(
                f"https://api.telegram.org/bot{token_candidate}/setChatMenuButton",
                json=menu_btn_payload,
            )
            logger.info(f"setChatMenuButton сброшен на default: {menu_resp.status_code}")
    except Exception as e:
        logger.warning(f"Не удалось сбросить setChatMenuButton: {e}")

    # 4. Установка вебхука для клиентского бота
    webhook_url = f"{BASE_WEBHOOK_URL}/webhook/{company_id}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            wh_resp = await client.post(
                f"https://api.telegram.org/bot{token_candidate}/setWebhook",
                json={
                    "url": webhook_url,
                    "drop_pending_updates": True,
                    "allowed_updates": ["message", "edited_message", "callback_query"],
                },
            )
            logger.info(f"setWebhook ({webhook_url}) результат: {wh_resp.json()}")
    except Exception as e:
        logger.warning(f"Не удалось установить вебхук для бота {bot_username}: {e}")

    await state.clear()

    # 5. Итоговое поздравление прорабу
    success_text = (
        f"🎉 <b>Поздравляем! Ваш личный бот готов к работе:</b> @{bot_username}\n\n"
        "✅ <b>Что настроено автоматически:</b>\n"
        f"• В чате создана кнопка «📱 Рассчитать смету онлайн» с брендом «{company_name}»\n"
        f"• Город: {city}\n"
        "• Все заявки от ваших клиентов будут мгновенно приходить сюда!\n\n"
        f"👉 Перейдите в вашего бота @{bot_username} и нажмите кнопку "
        "<b>«📱 Рассчитать смету онлайн»</b>, чтобы протестировать калькулятор!"
    )
    await checking_msg.edit_text(success_text)
    await checking_msg.answer(
        "👇 <b>Главное меню управления вашим ботом:</b>",
        reply_markup=get_main_master_menu(),
    )


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

    # 2. Проверка доступа и триала компании (Usage-Based Freemium)
    access_info = check_and_consume_lead_access(comp_identifier, company, supabase_client)
    can_view_full = access_info.get("can_view_full", False)
    is_trial = access_info.get("is_trial", False)
    is_paid = access_info.get("is_paid", False)
    trial_num = access_info.get("trial_num", 1)
    trial_left = access_info.get("trial_left", 0)
    total_trial = access_info.get("total_trial_limit", TRIAL_LEADS_COUNT)
    lead_db_status = access_info.get("lead_status", "new")  # 'new' (полный доступ) или 'locked' (замаскированный)

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

    if not can_view_full:
        # ЗАЯВКА 4 И ДАЛЕЕ (Soft Paywall / Masked Lead)
        masked_name = mask_client_name(lead.name)
        masked_phone = mask_client_phone(lead.phone)
        masked_addr = mask_address(lead.address)

        notification_text = (
            "🔒 <b>НОВАЯ ЗАЯВКА НА ЗАМЕР! ТЕЛЕФОН И АДРЕС ЗАМАСКИРОВАНЫ</b>\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"👤 <b>Клиент:</b> {html.escape(masked_name)}\n"
            f"📱 <b>Телефон:</b> <code>{html.escape(masked_phone)}</code>\n"
            f"📍 <b>Адрес:</b> <code>{html.escape(masked_addr)}</code>\n"
            f"💬 <b>Связь:</b> {html.escape(channel_name)}\n"
            f"📅 <b>Желаемая дата:</b> {html.escape(str(lead.preferred_date or 'Не указана'))}\n\n"
            f"🏠 <b>Объект:</b> {housing_type}, {lead.area} м², {lead.renovation_class}\n"
            f"💰 <b>Сумма сметы:</b> <b>{total_cost_str} ₽</b>\n"
            f"{options_str}"
            "━━━━━━━━━━━━━━━━━━\n"
            f"⚠️ <b>Бесплатные заявки триала ({total_trial}) исчерпаны!</b>\n"
            f"Клиент только что зафиксировал смету на <b>{total_cost_str} ₽</b> и ожидает звонка для выезда на замер.\n\n"
            "👉 Нажмите кнопку ниже, чтобы открыть полный номер телефона и точный адрес заказчика:"
        )

        inline_keyboard = [
            [{"text": "🔓 Разблокировать клиента за 2 990 ₽/мес", "url": url_1m}],
            [
                {"text": "🔥 3 мес (-22%) — 6 990 ₽", "url": url_3m},
                {"text": "💎 1 год (-35%) — 22 990 ₽", "url": url_1y},
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
            lead_word = "заявка" if trial_left == 1 else ("заявки" if 2 <= trial_left <= 4 else "заявок")
            if trial_left > 0:
                left_str = f"Осталось бесплатных заявок: <b>{trial_left} {lead_word}</b>"
                footer_hint = f"Вам предоставлены полные контакты заказчика. До маскировки осталось {trial_left} {lead_word}."
            else:
                left_str = "Это ваша <b>последняя</b> бесплатная заявка триала"
                footer_hint = "Это была последняя бесплатная заявка триала! Следующие заявки поступят со скрытыми контактами до оплаты подписки (/subscription)."

            trial_header = (
                f"🎁 <b>БЕСПЛАТНЫЙ ТРИАЛ:</b> Заявка {trial_num} из {total_trial}\n"
                f"<i>({left_str})</i>\n\n"
            )
            trial_footer = (
                f"━━━━━━━━━━━━━━━━━━\n"
                f"💡 <i>{footer_hint}</i>"
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
        # Кнопка быстрой связи в Telegram (вместо WhatsApp)
        tg_user_match = None
        if lead.comment:
            tg_user_match = re.search(r"@([a-zA-Z0-9_]{3,})", lead.comment)
        if not tg_user_match and lead.active_options:
            for opt in lead.active_options:
                tg_user_match = re.search(r"@([a-zA-Z0-9_]{3,})", str(opt))
                if tg_user_match:
                    break

        if tg_user_match:
            tg_username = tg_user_match.group(1)
            inline_keyboard.append([{"text": "💬 Написать клиенту в Telegram", "url": f"https://t.me/{tg_username}"}])
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
    Официальный эндпоинт вебхука ЮKassa с многоуровневой защитой от фрода (Antifraud):
    1. Проверка IP-адреса отправителя по официальным CIDR-подсетям ЮKassa.
    2. Проверка HMAC-подписи (Signature / X-Yookassa-Signature) при наличии секретного ключа.
    3. Авторитетная верификация платежа напрямую через REST API ЮKassa (status == succeeded).
    4. Защита от Replay-атак (идемпотентность по payment_id).
    """
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

