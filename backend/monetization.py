"""
Модуль монетизации и управления подписками для строительных компаний.
Правила монетизации:
1. Без триала (0 бесплатных заявок). Бот работает только при оплаченной подписке.
2. Если подписка истекла — бот компании полностью останавливает работу и приём заявок.
3. 3 тарифных плана: 1 месяц (30 дней), 3 месяца (90 дней) и 1 год (365 дней).
"""

import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

try:
    from backend.config import (
        BASE_WEBHOOK_URL,
        MASTER_BOT_TOKEN,
        YOOKASSA_SHOP_ID,
    )
except ImportError:
    from config import (
        BASE_WEBHOOK_URL,
        MASTER_BOT_TOKEN,
        YOOKASSA_SHOP_ID,
    )

logger = logging.getLogger("monetization")

# ---------------------------------------------------------------------------
# Тарифные планы подписки
# ---------------------------------------------------------------------------
SUBSCRIPTION_PLANS: Dict[str, Dict[str, Any]] = {
    "1m": {
        "id": "1m",
        "name": "1 месяц",
        "duration_days": 30,
        "price": 2990,
        "title": "Подписка на 1 месяц",
        "label": "1 месяц — 2 990 ₽",
        "badge": "Базовый",
        "description": "30 дней безлимитной работы бота и приёма заявок",
        "discount_text": "",
    },
    "3m": {
        "id": "3m",
        "name": "3 месяца",
        "duration_days": 90,
        "price": 7990,
        "title": "Подписка на 3 месяца",
        "label": "3 месяца — 7 990 ₽ (-11%)",
        "badge": "Популярный (скидка 11%)",
        "description": "90 дней работы бота (экономия 980 ₽)",
        "discount_text": "Выгода 11%",
    },
    "1y": {
        "id": "1y",
        "name": "1 год",
        "duration_days": 365,
        "price": 24990,
        "title": "Подписка на 1 год",
        "label": "1 год — 24 990 ₽ (-30%)",
        "badge": "Максимальная выгода (-30%)",
        "description": "365 дней работы бота (всего ~2 080 ₽/мес, экономия 10 890 ₽)",
        "discount_text": "Выгода 30%",
    },
}

DEFAULT_PLAN_ID: str = "1m"
SUBSCRIPTION_PRICE: int = SUBSCRIPTION_PLANS["1m"]["price"]
TRIAL_LEADS_COUNT: int = 0  # Триала нет! 0 бесплатных заявок

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
SUBS_FILE = os.path.join(DATA_DIR, "subscriptions.json")

# In-memory кэш подписок
SUBSCRIPTIONS_CACHE: Dict[str, Dict[str, Any]] = {}


def get_plan(plan_id: Optional[str]) -> Dict[str, Any]:
    """Возвращает информацию о тарифе по id (1m, 3m, 1y). По умолчанию 1m."""
    if not plan_id or plan_id not in SUBSCRIPTION_PLANS:
        return SUBSCRIPTION_PLANS[DEFAULT_PLAN_ID]
    return SUBSCRIPTION_PLANS[plan_id]


def _ensure_data_dir():
    if not os.path.exists(DATA_DIR):
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
        except Exception as e:
            logger.warning(f"Не удалось создать директорию {DATA_DIR}: {e}")


def load_local_subscriptions():
    """Загружает локально сохранённые статусы подписок"""
    global SUBSCRIPTIONS_CACHE
    _ensure_data_dir()
    if os.path.exists(SUBS_FILE):
        try:
            with open(SUBS_FILE, "r", encoding="utf-8") as f:
                SUBSCRIPTIONS_CACHE = json.load(f)
        except Exception as e:
            logger.error(f"Ошибка загрузки {SUBS_FILE}: {e}")
            SUBSCRIPTIONS_CACHE = {}

    # Демо-компания remont-pro всегда имеет активную тестовую подписку для бесшовного превью
    if "remont-pro" not in SUBSCRIPTIONS_CACHE:
        demo_until = datetime.now(timezone.utc) + timedelta(days=365)
        SUBSCRIPTIONS_CACHE["remont-pro"] = {
            "trial_leads_left": 0,
            "subscription_status": "active",
            "subscription_until": demo_until.isoformat(),
            "plan_id": "1y",
        }


def save_local_subscriptions():
    """Сохраняет кэш подписок на диск"""
    _ensure_data_dir()
    try:
        with open(SUBS_FILE, "w", encoding="utf-8") as f:
            json.dump(SUBSCRIPTIONS_CACHE, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Ошибка сохранения {SUBS_FILE}: {e}")


# Загружаем при старте модуля
load_local_subscriptions()


def parse_iso_datetime(dt_str: Optional[str]) -> Optional[datetime]:
    if not dt_str:
        return None
    try:
        cleaned = str(dt_str).replace("Z", "+00:00")
        return datetime.fromisoformat(cleaned)
    except Exception:
        return None


def get_company_subscription(
    company_identifier: str, company: Optional[Dict[str, Any]] = None, supabase_client: Any = None
) -> Dict[str, Any]:
    """
    Возвращает актуальное состояние подписки компании:
    - is_active: bool (True если подписка активна и срок не истек)
    - subscription_status: 'active' | 'expired'
    - subscription_until: datetime или None
    - days_left: int (количество оставшихся дней)
    - plan_id: str
    - trial_leads_left: 0 (триала нет)
    """
    key = str(company_identifier).lower()
    comp_uuid = None
    if company:
        comp_uuid = str(company.get("uuid") or company.get("id") or "").lower()

    sub_data: Dict[str, Any] = {
        "trial_leads_left": 0,
        "subscription_status": "expired",
        "subscription_until": None,
        "plan_id": "1m",
        "is_active": False,
        "days_left": 0,
    }

    # 1. Проверяем в объекте компании (если Supabase вернул эти поля)
    if company:
        if "subscription_status" in company and company["subscription_status"]:
            sub_data["subscription_status"] = company["subscription_status"]
        if "subscription_until" in company and company["subscription_until"]:
            sub_data["subscription_until"] = parse_iso_datetime(company["subscription_until"])
        if "plan_id" in company and company["plan_id"]:
            sub_data["plan_id"] = company["plan_id"]

    # 2. Проверяем локальный кэш
    for search_key in (key, comp_uuid):
        if search_key and search_key in SUBSCRIPTIONS_CACHE:
            cached = SUBSCRIPTIONS_CACHE[search_key]
            if "subscription_status" in cached:
                sub_data["subscription_status"] = cached["subscription_status"]
            if "subscription_until" in cached and cached["subscription_until"]:
                sub_data["subscription_until"] = parse_iso_datetime(cached["subscription_until"])
            if "plan_id" in cached:
                sub_data["plan_id"] = cached["plan_id"]
            break

    # 3. Валидируем активность по дате
    now = datetime.now(timezone.utc)
    until = sub_data.get("subscription_until")
    if until:
        if until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        if until > now:
            sub_data["subscription_status"] = "active"
            sub_data["is_active"] = True
            delta = until - now
            sub_data["days_left"] = max(1, delta.days)
        else:
            sub_data["subscription_status"] = "expired"
            sub_data["is_active"] = False
            sub_data["days_left"] = 0
    else:
        sub_data["subscription_status"] = "expired"
        sub_data["is_active"] = False
        sub_data["days_left"] = 0

    return sub_data


def save_company_subscription(
    company_identifier: str,
    sub_data: Dict[str, Any],
    company_uuid: Optional[str] = None,
    supabase_client: Any = None,
):
    """
    Сохраняет данные подписки в локальный кэш и синхронизирует с Supabase.
    """
    key = str(company_identifier).lower()
    serialized = {
        "trial_leads_left": 0,
        "subscription_status": sub_data.get("subscription_status", "expired"),
        "subscription_until": (
            sub_data["subscription_until"].isoformat()
            if isinstance(sub_data.get("subscription_until"), datetime)
            else sub_data.get("subscription_until")
        ),
        "plan_id": sub_data.get("plan_id", "1m"),
    }

    SUBSCRIPTIONS_CACHE[key] = serialized
    if company_uuid:
        SUBSCRIPTIONS_CACHE[str(company_uuid).lower()] = serialized
    save_local_subscriptions()

    # Синхронизация с Supabase (если в таблице companies есть соответствующие колонки)
    if supabase_client and company_uuid:
        try:
            update_payload = {
                "trial_leads_left": 0,
                "subscription_status": serialized["subscription_status"],
                "subscription_until": serialized["subscription_until"],
            }
            supabase_client.table("companies").update(update_payload).eq("id", company_uuid).execute()
        except Exception as e:
            logger.debug(f"Синхронизация подписки с Supabase: {e}")


def mask_client_name(name: str) -> str:
    """Маскирует имя клиента: Алексей -> Алек***"""
    name = (name or "").strip()
    if not name:
        return "Клиент"
    if len(name) <= 3:
        return name[0] + "***"
    return name[:3] + "***"


def mask_client_phone(phone: str) -> str:
    """Маскирует номер телефона: +7 999 123-45-89 -> +7 999 ***-**-89"""
    clean = re.sub(r"[^\d+]", "", phone)
    if clean.startswith("8") and len(clean) == 11:
        clean = "+7" + clean[1:]
    elif not clean.startswith("+") and len(clean) >= 10:
        clean = "+" + clean

    if len(clean) >= 10:
        prefix = clean[:6]  # например +7 999
        suffix = clean[-2:]  # например 89
        return f"{prefix} ***-**-{suffix}"
    return "+7 *** ***-**-**"


def create_payment_url(
    company_id: str, company_name: str, admin_chat_id: int, plan_id: str = "1m"
) -> Tuple[str, str]:
    """
    Генерирует ссылку на оплату выбранного тарифа (1 месяц, 3 месяца, 1 год).
    Если задан ЮKassa Secret Key — создает платёж через API ЮKassa.
    В противном случае — создает защищенную тестовую страницу оплаты.
    """
    plan = get_plan(plan_id)
    payment_id = f"pay_{uuid.uuid4().hex[:16]}"
    secret_key = os.getenv("YOOKASSA_SECRET_KEY", "").strip()

    # Если есть реальный секретный ключ ЮKassa
    if secret_key and YOOKASSA_SHOP_ID:
        try:
            yoo_url = "https://api.yookassa.ru/v3/payments"
            auth = (YOOKASSA_SHOP_ID, secret_key)
            payload = {
                "amount": {"value": f"{plan['price']}.00", "currency": "RUB"},
                "capture": True,
                "confirmation": {
                    "type": "redirect",
                    "return_url": "https://t.me/cuberlife_bot",
                },
                "description": f"Подписка РемонтПро {plan['name']} ({company_name})",
                "metadata": {
                    "payment_id": payment_id,
                    "company_id": company_id,
                    "admin_chat_id": str(admin_chat_id),
                    "plan_id": plan["id"],
                    "days": str(plan["duration_days"]),
                },
            }
            resp = httpx.post(
                yoo_url,
                json=payload,
                auth=auth,
                headers={"Idempotence-Key": payment_id},
                timeout=10.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                conf = data.get("confirmation", {})
                redirect_url = conf.get("confirmation_url")
                if redirect_url:
                    return payment_id, redirect_url
        except Exception as e:
            logger.error(f"Ошибка создания платежа в ЮKassa: {e}")

    # Fallback: встроенная защищенная страница оплаты с выбором тарифа
    checkout_url = (
        f"{BASE_WEBHOOK_URL}/pay/{payment_id}?"
        f"company_id={company_id}&admin_chat_id={admin_chat_id}&plan={plan['id']}"
    )
    return payment_id, checkout_url


async def activate_subscription_for_company(
    company_id: str,
    supabase_client: Any,
    master_bot: Any,
    admin_chat_id: Optional[int] = None,
    bot_token: Optional[str] = None,
    days: Optional[int] = None,
    plan_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Активирует или продлевает подписку на выбранный период (30, 90 или 365 дней),
    возобновляет работу остановленного бота, поздравляет прораба в Telegram
    и мгновенно разблокирует все скрытые лиды!
    """
    plan = get_plan(plan_id) if plan_id else None
    if days is None:
        days = plan["duration_days"] if plan else 30
    actual_plan_id = plan_id or ("1y" if days >= 365 else ("3m" if days >= 90 else "1m"))
    plan_info = get_plan(actual_plan_id)

    # Проверяем текущее окончание: если еще действует, продлеваем от него
    current_sub = get_company_subscription(company_id, supabase_client=supabase_client)
    now = datetime.now(timezone.utc)
    current_until = current_sub.get("subscription_until")

    if current_until and current_sub.get("is_active"):
        if current_until.tzinfo is None:
            current_until = current_until.replace(tzinfo=timezone.utc)
        new_until = current_until + timedelta(days=days)
    else:
        new_until = now + timedelta(days=days)

    sub_data = {
        "trial_leads_left": 0,
        "subscription_status": "active",
        "subscription_until": new_until,
        "plan_id": actual_plan_id,
        "is_active": True,
    }

    # Находим компанию для получения UUID, названия и токена бота
    comp_uuid = None
    company_name = "Ваша компания"
    if supabase_client:
        try:
            res = (
                supabase_client.table("companies")
                .select("*")
                .or_(f"bot_username.eq.{company_id.lower()},id.eq.{company_id}")
                .maybe_single()
                .execute()
            )
            if res and res.data:
                comp_uuid = str(res.data.get("id"))
                company_name = res.data.get("name") or company_name
                if not admin_chat_id:
                    admin_chat_id = res.data.get("admin_chat_id")
                if not bot_token:
                    bot_token = res.data.get("bot_token")
        except Exception as e:
            logger.error(f"Ошибка поиска компании при активации: {e}")

    save_company_subscription(company_id, sub_data, company_uuid=comp_uuid, supabase_client=supabase_client)

    until_str = new_until.strftime("%d.%m.%Y")
    congrats_text = (
        f"🎉 <b>ПОДПИСКА УСПЕШНО АКТИВИРОВАНА НА {plan_info['name'].upper()}!</b>\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"🏢 <b>Компания:</b> {company_name}\n"
        f"📦 <b>Тариф:</b> {plan_info['label']}\n"
        f"📅 <b>Срок действия:</b> до {until_str}\n"
        "🚀 <b>Статус бота:</b> РАБОТАЕТ (приём заявок активен)\n\n"
        "Спасибо за оплату! Все клиенты с калькулятора поступают вам моментально и в полном объёме."
    )

    # 1. Отправляем поздравление в Telegram прорабу
    target_token = bot_token or MASTER_BOT_TOKEN
    target_chat = admin_chat_id
    if target_token and target_chat:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{target_token}/sendMessage",
                    json={
                        "chat_id": target_chat,
                        "text": congrats_text,
                        "parse_mode": "HTML",
                    },
                )
        except Exception as e:
            logger.error(f"Не удалось отправить поздравление прорабу: {e}")

    # 2. Мгновенная разблокировка скрытых лидов (paywall_locked -> unlocked)
    unlocked_count = 0
    if supabase_client and comp_uuid:
        try:
            locked_leads_res = (
                supabase_client.table("leads")
                .select("*")
                .eq("company_id", comp_uuid)
                .eq("status", "paywall_locked")
                .execute()
            )
            locked_leads = locked_leads_res.data or []

            if locked_leads:
                for lead in locked_leads:
                    lead_id = lead.get("id")
                    # Обновляем статус в базе
                    supabase_client.table("leads").update({"status": "unlocked"}).eq("id", lead_id).execute()

                    # Отправляем полную карточку прорабу
                    client_name = lead.get("client_name") or "Клиент"
                    client_phone = lead.get("client_phone") or ""
                    clean_phone = re.sub(r"[^0-9+]", "", client_phone)
                    digits = re.sub(r"[^0-9]", "", clean_phone)

                    min_c = lead.get("min_cost", 0) or 0
                    max_c = lead.get("max_cost", 0) or 0

                    card_text = (
                        "🔓 <b>РАЗБЛОКИРОВАННАЯ ЗАЯВКА:</b>\n"
                        "━━━━━━━━━━━━━━━━━━\n"
                        f"👤 <b>Клиент:</b> {client_name}\n"
                        f"📱 <b>Телефон:</b> <code>{client_phone}</code>\n"
                        f"💬 <b>Канал связи:</b> {lead.get('contact_channel', 'Telegram')}\n"
                        f"📅 <b>Дата:</b> {lead.get('preferred_date', 'Не указана')}\n\n"
                        f"🏠 <b>Объект:</b> {lead.get('housing_type', 'Квартира')}, {lead.get('area_m2', 0)} м², {lead.get('repair_type', '')}\n"
                        f"💰 <b>Смета:</b> от {min_c:,.0f} до {max_c:,.0f} ₽\n"
                        "━━━━━━━━━━━━━━━━━━\n"
                        "✅ <i>Контакты открыты после оплаты подписки! Бот снова в строю.</i>"
                    ).replace(",", " ")

                    ik = []
                    if digits:
                        ik.append([{"text": "💬 Написать в WhatsApp", "url": f"https://wa.me/{digits}"}])

                    if target_token and target_chat:
                        try:
                            async with httpx.AsyncClient(timeout=10.0) as client:
                                await client.post(
                                    f"https://api.telegram.org/bot{target_token}/sendMessage",
                                    json={
                                        "chat_id": target_chat,
                                        "text": card_text,
                                        "parse_mode": "HTML",
                                        "reply_markup": {"inline_keyboard": ik} if ik else None,
                                    },
                                )
                        except Exception as e:
                            logger.error(f"Ошибка отправки разблокированного лида {lead_id}: {e}")

                unlocked_count = len(locked_leads)
                logger.info(f"Разблокировано {unlocked_count} лидов для компании {company_id}")
        except Exception as e:
            logger.error(f"Ошибка выборки заблокированных лидов: {e}")

    return {
        "success": True,
        "subscription_until": until_str,
        "unlocked_leads": unlocked_count,
        "plan_name": plan_info["name"],
        "plan_id": actual_plan_id,
    }
