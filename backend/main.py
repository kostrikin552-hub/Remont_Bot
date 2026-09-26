"""
Бэкенд платформа на FastAPI + aiogram 3 для обслуживания Мастер-бота
и автоматического подключения ботов строительных компаний.
"""

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
from pydantic import BaseModel, Field
from supabase import Client, create_client

try:
    from backend.config import (
        BASE_WEBHOOK_URL,
        MASTER_BOT_TOKEN,
        MINI_APP_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_URL,
    )
except ImportError:
    from config import (
        BASE_WEBHOOK_URL,
        MASTER_BOT_TOKEN,
        MINI_APP_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_URL,
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
# Хэндлеры Мастер-бота (FSM)
# ---------------------------------------------------------------------------
@master_router.message(CommandStart())
async def master_cmd_start(message: Message, state: FSMContext):
    """Приветствие прораба и старт регистрации бота"""
    await state.clear()
    welcome_text = (
        "👋 <b>Привет! Создадим персонального бота для ремонта за 2 минуты.</b>\n\n"
        "С помощью этого бота ваши клиенты смогут мгновенно рассчитывать стоимость ремонта, "
        "а вы будете получать горячие заявки с контактами прямо в этот чат.\n\n"
        "📍 <b>Шаг 1 из 3:</b> Введите название вашей компании или бригады\n"
        "<i>(например: «РемонтСтрой» или «Бригада Алексея»):</i>"
    )
    await message.answer(welcome_text)
    await state.set_state(RegisterCompanyFSM.company_name)


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
    """Шаг 2: получение города"""
    city = message.text.strip()
    if len(city) < 2:
        await message.answer("Пожалуйста, введите название города:")
        return

    await state.update_data(city=city)
    await state.set_state(RegisterCompanyFSM.bot_token)

    guide_text = (
        "📍 <b>Шаг 3 из 3:</b> Отправьте токен вашего Telegram-бота от <b>@BotFather</b>.\n\n"
        "📖 <b>Как получить токен за 1 минуту:</b>\n"
        "1. Перейдите в диалог с официальным ботом <b>@BotFather</b>\n"
        "2. Отправьте команду <code>/newbot</code>\n"
        "3. Введите название бота (например: <i>Ремонт от Алексея</i>)\n"
        "4. Введите юзернейм на английском, оканчивающийся на <code>bot</code> (например: <i>alex_remont_bot</i>)\n"
        "5. Скопируйте полученный HTTP API токен и пришлите его сюда сообщением."
    )
    await message.answer(guide_text)


@master_router.message(StateFilter(RegisterCompanyFSM.bot_token), F.text)
async def master_process_token(message: Message, state: FSMContext):
    """Шаг 3: валидация токена, создание компании, настройка WebApp кнопки и вебхука"""
    token_candidate = message.text.strip()

    # 1. Валидация токена через Telegram Bot API (getMe)
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
            "Пожалуйста, перепроверьте токен в @BotFather и отправьте его снова:"
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
    При команде /start клиент получает персональное приветствие и кнопку калькулятора.
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

    message = body.get("message")
    if not message:
        return Response(status_code=status.HTTP_200_OK)

    chat_id = message.get("chat", {}).get("id")
    text = (message.get("text") or "").strip()

    # Если клиент нажал /start или написал сообщение в боте компании
    if text.startswith("/start") or text:
        app_url = f"{MINI_APP_URL}?company_id={company_id}"
        greeting_text = (
            "Здравствуйте! Рассчитайте предварительную стоимость ремонта квартиры за 1 минуту 👇"
        )

        reply_markup = {
            "inline_keyboard": [
                [
                    {
                        "text": "📱 Рассчитать стоимость",
                        "web_app": {"url": app_url},
                    }
                ]
            ]
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": greeting_text,
                        "reply_markup": reply_markup,
                    },
                )
        except Exception as e:
            logger.error(f"Ошибка отправки ответа клиенту компании {company_id}: {e}")

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
    сохраняет лид в Supabase и отправляет мгновенное уведомление прорабу.
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

    # 2. Сохранение в Supabase (в точном соответствии с колонками таблицы leads)
    if supabase_client:
        try:
            insert_data = {
                "company_id": company_uuid,
                "client_name": lead.name,
                "client_phone": lead.phone,
                "contact_channel": lead.communication or "telegram",
                "preferred_date": lead.preferred_date,
                "housing_type": "Новостройка" if lead.property_type == "new" else "Вторичка",
                "repair_type": lead.renovation_class,
                "area_m2": float(lead.area),
                "options": lead.active_options or [],
                "min_cost": float(lead.price_min),
                "max_cost": float(lead.price_max),
                "status": "new",
            }
            db_res = supabase_client.table("leads").insert(insert_data).execute()
            if db_res.data and len(db_res.data) > 0:
                lead_id = str(db_res.data[0].get("id", lead_id))
            logger.info(f"Лид {lead_id} успешно записан в Supabase.")
        except Exception as e:
            logger.error(f"Ошибка записи лида в Supabase: {e}")

    admin_chat_id = company.get("admin_chat_id") if company else None
    bot_token = (company.get("bot_token") if company else None) or MASTER_BOT_TOKEN

    # 3. Отправка уведомления прорабу в Telegram
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

    notification_text = (
        "🚨 <b>НОВАЯ ЗАЯВКА НА ЗАМЕР!</b>\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"👤 <b>Клиент:</b> {lead.name}\n"
        f"📱 <b>Телефон:</b> {lead.phone}\n"
        f"💬 <b>Предпочтительная связь:</b> {channel_name}\n"
        f"📅 <b>Желаемая дата замера:</b> {lead.preferred_date}\n\n"
        f"🏠 <b>Объект:</b> {housing_type}, {lead.area} м², {lead.renovation_class}\n"
        f"💰 <b>Оценка:</b> от {min_cost} до {max_cost} ₽\n"
        "━━━━━━━━━━━━━━━━━━"
    )

    # Inline кнопки для быстрой связи
    call_url = f"tel:{clean_phone}"
    digits_only = re.sub(r"[^0-9]", "", clean_phone)
    tg_chat_url = f"https://t.me/+{digits_only}"

    inline_keyboard = [
        [
            {"text": "📞 Позвонить", "url": call_url},
            {"text": "💬 Открыть чат в TG", "url": tg_chat_url},
        ]
    ]

    # Если есть admin_chat_id и рабочий токен бота, отправляем мгновенное push-сообщение
    if admin_chat_id and bot_token:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                send_payload = {
                    "chat_id": admin_chat_id,
                    "text": notification_text,
                    "parse_mode": "HTML",
                    "reply_markup": {"inline_keyboard": inline_keyboard},
                }
                res = await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json=send_payload,
                )
                logger.info(f"Уведомление прорабу отправлено: {res.status_code}")
        except Exception as e:
            logger.error(f"Не удалось отправить уведомление прорабу: {e}")
    else:
        logger.info(
            f"Заявка #{lead_id} принята (admin_chat_id для компании {lead.company_id} не сконфигурирован в Telegram)"
        )

    return {
        "success": True,
        "lead_id": lead_id,
        "message": "Заявка успешно зарегистрирована",
    }


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

