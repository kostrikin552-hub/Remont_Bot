"""
Модуль монетизации и управления подписками для строительных компаний.

Продуктовая механика: Usage-Based Freemium с механизмом замаскированного лида (Masked Lead / Soft Paywall).
1. ТРИАЛ: 3 первые заявки передаются прорабу БЕСПЛАТНО и в ПОЛНОМ ОБЪЁМЕ (Aha-Moment).
   Прораб видит имя, прямой телефон, адрес, канал связи и детальную смету.
2. ЗАЯВКА 4 И ДАЛЕЕ (если подписка не оплачена):
   - Клиент (B2C) в Mini App НЕ видит ошибок и получает полноценный экран успеха.
   - Заявка сохраняется в Supabase со статусом 'locked'.
   - Прораб получает в Telegram «замаскированную» карточку:
     телефон: +7 (999) ***-**-42, адрес скрыт, но сумма сметы видна полностью!
   - Кнопка разблокировки: «🔓 Разблокировать клиента за 2 990 ₽/мес».
3. ПРИ ОПЛАТЕ ПОДПИСКИ:
   - Все скрытые заявки мгновенно разблокируются и высылаются прорабу с открытыми контактами.
"""

import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

try:
    import httpx
except ImportError:
    httpx = None

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

try:
    from backend.security import decrypt_payload, ENCRYPTED_PLACEHOLDER
except ImportError:
    try:
        from security import decrypt_payload, ENCRYPTED_PLACEHOLDER
    except ImportError:
        decrypt_payload = None
        ENCRYPTED_PLACEHOLDER = "[ENCRYPTED_AES256]"

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
        "price": 6990,
        "title": "Подписка на 3 месяца",
        "label": "3 месяца — 6 990 ₽ (Скидка 22%) 🔥",
        "badge": "Популярный (скидка 22%)",
        "description": "90 дней работы бота (экономия 1 980 ₽)",
        "discount_text": "Выгода 22%",
    },
    "1y": {
        "id": "1y",
        "name": "1 год",
        "duration_days": 365,
        "price": 22990,
        "title": "Подписка на 1 год",
        "label": "1 год — 22 990 ₽ (Экономия 12 890 ₽)",
        "badge": "Максимальная выгода",
        "description": "365 дней работы бота (всего ~1 915 ₽/мес, экономия 12 890 ₽)",
        "discount_text": "Экономия 12 890 ₽",
    },
}

DEFAULT_PLAN_ID: str = "1m"
SUBSCRIPTION_PRICE: int = SUBSCRIPTION_PLANS["1m"]["price"]
TRIAL_LEADS_COUNT: int = 3  # 3 бесплатные заявки в рамках Usage-Based Freemium!

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
SUBS_FILE = os.path.join(DATA_DIR, "subscriptions.json")

# In-memory кэш подписок и использованных триал-лидов
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
            "trial_leads_used": 0,
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
    Возвращает актуальное состояние подписки и триала компании:
    - is_active: bool (True если подписка оплачена и активна)
    - subscription_status: 'trial' | 'active' | 'expired'
    - subscription_until: datetime или None
    - days_left: int
    - plan_id: str
    - trial_leads_used: int (количество использованных заявок из 3)
    - trial_leads_left: int (сколько бесплатных заявок осталось)
    - can_receive_unmasked: bool (True если подписка активна или действует триал)
    """
    key = str(company_identifier).lower()
    comp_uuid = None
    if company:
        comp_uuid = str(company.get("uuid") or company.get("id") or "").lower()

    sub_data: Dict[str, Any] = {
        "trial_leads_used": 0,
        "trial_leads_left": TRIAL_LEADS_COUNT,
        "subscription_status": "trial",
        "subscription_until": None,
        "plan_id": "1m",
        "is_active": False,
        "days_left": 0,
        "can_receive_unmasked": True,
        "auto_renew": True,
    }

    # 1. Проверяем в объекте компании (если Supabase вернул эти поля)
    if company:
        if "subscription_status" in company and company["subscription_status"]:
            sub_data["subscription_status"] = company["subscription_status"]
        if "subscription_until" in company and company["subscription_until"]:
            sub_data["subscription_until"] = parse_iso_datetime(company["subscription_until"])
        if "current_plan_id" in company and company["current_plan_id"]:
            sub_data["plan_id"] = company["current_plan_id"]
        elif "plan_id" in company and company["plan_id"]:
            sub_data["plan_id"] = company["plan_id"]
        if "trial_leads_used" in company and company["trial_leads_used"] is not None:
            sub_data["trial_leads_used"] = int(company["trial_leads_used"])

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
            if "trial_leads_used" in cached:
                sub_data["trial_leads_used"] = max(sub_data["trial_leads_used"], int(cached["trial_leads_used"]))
            break

    # 3. Валидируем активность платной подписки по дате
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
            sub_data["can_receive_unmasked"] = True
            return sub_data

    # 4. Если платной подписки нет — смотрим статус триала (3 базовые заявки + бонусы за рефералов)
    sub_data["is_active"] = False
    sub_data["days_left"] = 0
    trial_used = sub_data["trial_leads_used"]
    bonus_leads = 0
    if company and "bonus_leads" in company and company["bonus_leads"]:
        try:
            bonus_leads = int(company["bonus_leads"])
        except (ValueError, TypeError):
            bonus_leads = 0
    for search_key in (key, comp_uuid):
        if search_key and search_key in SUBSCRIPTIONS_CACHE:
            if "bonus_leads" in SUBSCRIPTIONS_CACHE[search_key]:
                bonus_leads = max(bonus_leads, int(SUBSCRIPTIONS_CACHE[search_key]["bonus_leads"]))

    total_trial_limit = TRIAL_LEADS_COUNT + bonus_leads
    trial_left = max(0, total_trial_limit - trial_used)
    sub_data["bonus_leads"] = bonus_leads
    sub_data["total_trial_limit"] = total_trial_limit
    sub_data["trial_leads_left"] = trial_left

    if trial_used < total_trial_limit:
        sub_data["subscription_status"] = "trial"
        sub_data["can_receive_unmasked"] = True
    else:
        sub_data["subscription_status"] = "expired"
        sub_data["can_receive_unmasked"] = False

    return sub_data


def check_and_consume_lead_access(
    company_identifier: str,
    company: Optional[Dict[str, Any]] = None,
    supabase_client: Any = None,
) -> Dict[str, Any]:
    """
    Проверяет права на получение полной заявки:
    - Если подписка активна -> full access
    - Если триал не исчерпан (заявки 1, 2, 3) -> full access + инкрементирует счётчик триала
    - Если триал исчерпан и нет оплаты -> masked access (Soft Paywall)
    """
    key = str(company_identifier).lower()
    comp_uuid = None
    if company:
        comp_uuid = str(company.get("uuid") or company.get("id") or "").lower()

    sub_info = get_company_subscription(company_identifier, company, supabase_client)

    # Вариант А: Оплаченная подписка активна
    if sub_info.get("is_active"):
        return {
            "can_view_full": True,
            "is_paid": True,
            "is_trial": False,
            "lead_status": "new",
            "trial_num": 0,
            "trial_left": 0,
            "subscription_until": sub_info.get("subscription_until"),
        }

    # Вариант Б: Бесплатный триал (базовые заявки + реферальные бонусы)
    trial_used = sub_info.get("trial_leads_used", 0)
    total_limit = sub_info.get("total_trial_limit", TRIAL_LEADS_COUNT)
    if trial_used < total_limit:
        new_used = trial_used + 1
        new_left = max(0, total_limit - new_used)

        # Обновляем кэш
        if key not in SUBSCRIPTIONS_CACHE:
            SUBSCRIPTIONS_CACHE[key] = {}
        SUBSCRIPTIONS_CACHE[key]["trial_leads_used"] = new_used
        if comp_uuid:
            if comp_uuid not in SUBSCRIPTIONS_CACHE:
                SUBSCRIPTIONS_CACHE[comp_uuid] = {}
            SUBSCRIPTIONS_CACHE[comp_uuid]["trial_leads_used"] = new_used
        save_local_subscriptions()

        # Сохраняем использование в кэше и файле (в companies нет колонки trial_leads_used)
        return {
            "can_view_full": True,
            "is_paid": False,
            "is_trial": True,
            "trial_num": new_used,
            "trial_left": new_left,
            "lead_status": "new",
            "subscription_until": None,
        }

    # Вариант В: Триал исчерпан, подписка не оплачена -> Замаскированный лид (Soft Paywall)
    return {
        "can_view_full": False,
        "is_paid": False,
        "is_trial": False,
        "trial_num": trial_used,
        "trial_left": 0,
        "lead_status": "locked",
        "subscription_until": None,
    }


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
    existing = SUBSCRIPTIONS_CACHE.get(key, {})
    serialized = {
        "trial_leads_used": sub_data.get("trial_leads_used", existing.get("trial_leads_used", 0)),
        "subscription_status": sub_data.get("subscription_status", "expired"),
        "subscription_until": (
            sub_data["subscription_until"].isoformat()
            if isinstance(sub_data.get("subscription_until"), datetime)
            else sub_data.get("subscription_until")
        ),
        "plan_id": sub_data.get("plan_id", "1m"),
        "auto_renew": sub_data.get("auto_renew", existing.get("auto_renew", True)),
    }

    SUBSCRIPTIONS_CACHE[key] = serialized
    if company_uuid:
        SUBSCRIPTIONS_CACHE[str(company_uuid).lower()] = serialized
    save_local_subscriptions()

    # Синхронизация с Supabase
    if supabase_client and company_uuid:
        try:
            update_payload = {
                "subscription_status": serialized["subscription_status"],
                "subscription_until": serialized["subscription_until"],
                "is_active": True if serialized["subscription_status"] == "active" else False,
                "current_plan_id": serialized.get("plan_id", "1m"),
            }
            supabase_client.table("companies").update(update_payload).eq("id", company_uuid).execute()
        except Exception as e:
            logger.debug(f"Синхронизация подписки с Supabase: {e}")


def is_auto_renew_enabled(company_identifier: str) -> bool:
    """Проверяет статус автопродления подписки (по умолчанию True)"""
    key = str(company_identifier).lower()
    cached = SUBSCRIPTIONS_CACHE.get(key, {})
    return cached.get("auto_renew", True)


def cancel_auto_renew(company_identifier: str, supabase_client: Any = None) -> bool:
    """
    Отмена подписки (автопродления) в 1 клик.
    Отключает автоматические рекуррентные списания на следующий период.
    Доступ сохраняется до конца текущего оплаченного расчетного периода.
    """
    key = str(company_identifier).lower()
    if key in SUBSCRIPTIONS_CACHE:
        SUBSCRIPTIONS_CACHE[key]["auto_renew"] = False
    else:
        SUBSCRIPTIONS_CACHE[key] = {"auto_renew": False}
    save_local_subscriptions()

    if supabase_client:
        try:
            supabase_client.table("companies").update({"auto_renew": False}).eq("bot_username", key).execute()
        except Exception as e:
            logger.debug(f"Не удалось обновить auto_renew в Supabase: {e}")
    return True


def resume_auto_renew(company_identifier: str, supabase_client: Any = None) -> bool:
    """Возобновление автопродления подписки"""
    key = str(company_identifier).lower()
    if key in SUBSCRIPTIONS_CACHE:
        SUBSCRIPTIONS_CACHE[key]["auto_renew"] = True
    else:
        SUBSCRIPTIONS_CACHE[key] = {"auto_renew": True}
    save_local_subscriptions()

    if supabase_client:
        try:
            supabase_client.table("companies").update({"auto_renew": True}).eq("bot_username", key).execute()
        except Exception as e:
            logger.debug(f"Не удалось возобновить auto_renew в Supabase: {e}")
    return True


def mask_client_name(name: str) -> str:
    """Маскирует имя клиента: Алексей -> Алек***, Иван Иванов -> Иван И.***"""
    name = (name or "").strip()
    if not name:
        return "Клиент"
    parts = name.split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[1][0]}.***"
    if len(name) <= 3:
        return name[0] + "***"
    return name[:3] + "***"


def mask_client_phone(phone: str) -> str:
    """Маскирует номер телефона строго по формату: +7 (999) ***-**-42"""
    clean = re.sub(r"[^\d]", "", phone or "")
    if clean.startswith("8") and len(clean) == 11:
        clean = "7" + clean[1:]
    elif len(clean) == 10:
        clean = "7" + clean

    if len(clean) == 11 and clean.startswith("7"):
        code = clean[1:4]
        suffix = clean[-2:]
        return f"+7 ({code}) ***-**-{suffix}"
    elif len(clean) >= 6:
        return f"+{clean[:3]} ***-**-{clean[-2:]}"
    return "+7 (999) ***-**-**"


def mask_address(address: Optional[str], default_city: str = "г. Москва") -> str:
    """
    Маскирует адрес для заблокированных заявок (начиная с 4-й заявки триала).
    Полностью скрывает улицу, дом, корпус, ЖК и номер квартиры.
    Оставляет только город/регион и индикатор блокировки до оплаты подписки.
    """
    addr = (address or "").strip()
    if not addr or addr == "[ENCRYPTED_AES256]":
        return f"{default_city}, [🔒 точный адрес и дом скрыты до оплаты подписки]"

    # Если адрес начинается со служебных приставок ЖК, ул, д, пер и т.д. — подставляем город
    if re.match(r"^(жк|ул|ул\.|улица|пер|пер\.|проезд|пр-т|проспект|д\.|дом)\b", addr, re.IGNORECASE):
        city = default_city
    else:
        city_match = re.match(
            r"^(г\.\s*[A-Za-zА-Яа-яЁё\-]+|[A-Za-zА-Яа-яЁё\-]+(?:\s+обл|\s+область|\s+край)?)",
            addr,
            re.IGNORECASE,
        )
        city = city_match.group(1).strip() if city_match else default_city

    return f"{city}, [🔒 точный адрес и дом скрыты до оплаты подписки]"


def create_payment_url(
    company_id: str, company_name: str, admin_chat_id: int, plan_id: str = "1m"
) -> Tuple[str, str]:
    """
    Генерирует ссылку на оплату выбранного тарифа (1 месяц, 3 месяца, 1 год).
    Если задан ЮKassa Secret Key — создает платёж через API ЮKassa.
    В противном случае — создает защищенную страницу оплаты.
    """
    plan = get_plan(plan_id)
    payment_id = f"pay_{uuid.uuid4().hex[:16]}"
    secret_key = os.getenv("YOOKASSA_SECRET_KEY", "").strip()

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

    # Fallback: защищенная внутренняя страница оплаты
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
    поздравляет прораба в Telegram и мгновенно РАЗБЛОКИРУЕТ ВСЕ СКРЫТЫЕ ЛИДЫ (locked -> unlocked)!
    """
    plan = get_plan(plan_id) if plan_id else None
    if days is None:
        days = plan["duration_days"] if plan else 30
    actual_plan_id = plan_id or ("1y" if days >= 365 else ("3m" if days >= 90 else "1m"))
    plan_info = get_plan(actual_plan_id)

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
        "trial_leads_used": current_sub.get("trial_leads_used", TRIAL_LEADS_COUNT),
        "subscription_status": "active",
        "subscription_until": new_until,
        "plan_id": actual_plan_id,
        "is_active": True,
    }

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
                    bot_token = res.data.get("bot_token_encrypted") or res.data.get("bot_token")
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
        "🚀 <b>Статус:</b> ПОЛНЫЙ ДОСТУП (безлимитный приём заявок с открытыми контактами)\n\n"
        "Спасибо за оплату! Все новые клиенты будут поступать вам моментально с полными номерами телефонов."
    )

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

    # Начисление бонуса пригласившему по реферальной программе (Механика 5)
    referred_by = res.data.get("referred_by") if (res and res.data) else None
    if referred_by and supabase_client:
        try:
            ref_res = (
                supabase_client.table("companies")
                .select("*")
                .or_(f"id.eq.{referred_by},admin_chat_id.eq.{referred_by}")
                .maybe_single()
                .execute()
            )
            if ref_res and ref_res.data:
                ref_comp = ref_res.data
                ref_comp_id = str(ref_comp.get("id"))
                ref_chat_id = ref_comp.get("admin_chat_id")
                ref_sub = get_company_subscription(ref_comp_id, ref_comp, supabase_client)
                ref_until = ref_sub.get("subscription_until")
                ref_new_until = (ref_until if ref_until and ref_until > now else now) + timedelta(days=30)
                save_company_subscription(
                    ref_comp_id,
                    {
                        "subscription_status": "active",
                        "subscription_until": ref_new_until,
                        "plan_id": ref_sub.get("plan_id", "1m"),
                        "is_active": True,
                    },
                    company_uuid=ref_comp_id,
                    supabase_client=supabase_client,
                )
                try:
                    cur_ref_cnt = int(ref_comp.get("referral_count") or 0) + 1
                    supabase_client.table("companies").update({"referral_count": cur_ref_cnt}).eq("id", ref_comp_id).execute()
                except Exception:
                    pass

                if ref_chat_id and MASTER_BOT_TOKEN:
                    ref_congrats = (
                        "🎁 <b>ВАМ НАЧИСЛЕН +1 МЕСЯЦ БЕСПЛАТНОЙ ПОДПИСКИ!</b>\n"
                        "━━━━━━━━━━━━━━━━━━━━\n"
                        f"🤝 Коллега из компании «{company_name}» оплатил подписку по вашей реферальной ссылке.\n\n"
                        f"🎉 Ваша подписка продлена на <b>30 дней</b> (экономия 2 990 ₽) до <b>{ref_new_until.strftime('%d.%m.%Y')}</b>!\n"
                        "Продолжайте рекомендовать сервис коллегам и пользуйтесь Remont_Bot бесплатно."
                    )
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        await client.post(
                            f"https://api.telegram.org/bot{MASTER_BOT_TOKEN}/sendMessage",
                            json={"chat_id": ref_chat_id, "text": ref_congrats, "parse_mode": "HTML"},
                        )
        except Exception as e:
            logger.error(f"Ошибка начисления бонуса за реферала: {e}")

    # МГНОВЕННАЯ РАЗБЛОКИРОВКА И РАСШИФРОВКА ВСЕХ ЗАЯВОК В SUPABASE ПРИ ОПЛАТЕ ПОДПИСКИ
    unlocked_count = unlock_all_company_leads(
        company_id=company_id,
        comp_uuid=comp_uuid,
        supabase_client=supabase_client,
        target_token=target_token,
        target_chat=target_chat,
    )

    return {
        "success": True,
        "subscription_until": until_str,
        "unlocked_leads": unlocked_count,
        "plan_name": plan_info["name"],
        "plan_id": actual_plan_id,
    }


def unlock_all_company_leads(
    company_id: str,
    comp_uuid: Optional[str] = None,
    supabase_client: Any = None,
    target_token: Optional[str] = None,
    target_chat: Optional[int] = None,
) -> int:
    """
    При оплате подписки делает ВСЕ ранее зашифрованные заявки компании в Supabase ОТКРЫТЫМИ:
    1. Находит все заявки компании (locked, paywall_locked или содержащие [ENCRYPTED_AES256]).
    2. Расшифровывает данные из encrypted_payload (мастер-ключом AES-256).
    3. Записывает открытые client_name, client_phone, address прямо в Supabase (leads) и ставит status='unlocked'.
    4. Если указаны target_token и target_chat — высылает в Telegram прорабу разблокированные карточки.
    """
    if not supabase_client:
        return 0

    unlocked_count = 0
    try:
        target_ids = []
        if comp_uuid:
            target_ids.append(f"company_id.eq.{comp_uuid}")
        if company_id:
            target_ids.append(f"company_id.eq.{company_id.lower()}")
        or_filter = ",".join(target_ids) if target_ids else f"company_id.eq.{company_id}"

        leads_res = (
            supabase_client.table("leads")
            .select("*")
            .or_(or_filter)
            .execute()
        )
        leads = leads_res.data or []

        for lead in leads:
            lead_id = lead.get("id")
            status = lead.get("status")
            enc_payload = lead.get("encrypted_payload")
            raw_phone = lead.get("client_phone") or lead.get("phone") or ""
            raw_name = lead.get("client_name") or lead.get("name") or ""
            raw_addr = lead.get("address") or ""

            is_locked_or_encrypted = (
                status in ["locked", "paywall_locked"]
                or raw_phone == "[ENCRYPTED_AES256]"
                or raw_name == "[ENCRYPTED_AES256]"
                or raw_addr == "[ENCRYPTED_AES256]"
            )

            # Если заявка зашифрована или заблокирована — открываем её
            if is_locked_or_encrypted:
                client_name = raw_name if raw_name != "[ENCRYPTED_AES256]" else "Клиент"
                client_phone = raw_phone if raw_phone != "[ENCRYPTED_AES256]" else ""
                client_address = raw_addr if raw_addr != "[ENCRYPTED_AES256]" else "г. Москва"
                client_comment = lead.get("comment") or ""

                if enc_payload and decrypt_payload:
                    try:
                        decrypted = decrypt_payload(enc_payload)
                        if decrypted:
                            if decrypted.get("client_name"):
                                client_name = decrypted["client_name"]
                            if decrypted.get("client_phone"):
                                client_phone = decrypted["client_phone"]
                            if decrypted.get("address"):
                                client_address = decrypted["address"]
                            if decrypted.get("comment"):
                                client_comment = decrypted["comment"]
                    except Exception as dec_err:
                        logger.error(f"Ошибка расшифровки лида #{lead_id}: {dec_err}")

                # Лид помечается как unlocked (все ПДн надёжно зашифрованы в encrypted_payload по 152-ФЗ РФ)
                update_data = {
                    "status": "unlocked",
                }

                try:
                    supabase_client.table("leads").update(update_data).eq("id", lead_id).execute()
                    unlocked_count += 1
                    logger.info(f"Лид #{lead_id} успешно открыт и разблокирован в Supabase!")
                except Exception as upd_err:
                    logger.error(f"Не удалось обновить статус лида #{lead_id} в Supabase: {upd_err}")

                # Отправляем карточку разблокированного клиента в Telegram
                if target_token and target_chat:
                    clean_phone = re.sub(r"[^0-9+]", "", client_phone)
                    digits = re.sub(r"[^0-9]", "", clean_phone)

                    min_c = lead.get("min_cost") or lead.get("price_min", 0) or 0
                    max_c = lead.get("max_cost") or lead.get("price_max", 0) or 0
                    tot_c = lead.get("total_base_cost") or max_c or min_c
                    tot_formatted = f"{tot_c:,.0f}".replace(",", " ")

                    card_text = (
                        "🔓 <b>РАЗБЛОКИРОВАННЫЙ КЛИЕНТ!</b>\n"
                        "━━━━━━━━━━━━━━━━━━\n"
                        f"👤 <b>Клиент:</b> {html.escape(client_name)}\n"
                        f"📱 <b>Телефон:</b> <code>{html.escape(client_phone)}</code>\n"
                        f"📍 <b>Адрес:</b> {html.escape(client_address)}\n"
                        f"💬 <b>Связь:</b> {html.escape(lead.get('contact_channel') or lead.get('communication') or 'Telegram')}\n"
                        f"📅 <b>Дата:</b> {html.escape(str(lead.get('preferred_date', 'Не указана')))}\n\n"
                        f"🏠 <b>Объект:</b> {lead.get('housing_type', 'Квартира')}, {lead.get('area_m2') or lead.get('area', 0)} м², {lead.get('repair_type') or lead.get('renovation_class', '')}\n"
                        f"💰 <b>Смета:</b> <b>{tot_formatted} ₽</b>\n"
                        "━━━━━━━━━━━━━━━━━━\n"
                        "✅ <i>Контакты и точный адрес открыты после оплаты подписки! Вы можете связаться с клиентом прямо сейчас.</i>"
                    )

                    ik = []
                    if digits:
                        ik.append([{"text": "💬 Написать клиенту в Telegram", "url": f"https://t.me/+{digits}"}])

                    try:
                        import urllib.request
                        req_data = json.dumps({
                            "chat_id": target_chat,
                            "text": card_text,
                            "parse_mode": "HTML",
                            "reply_markup": {"inline_keyboard": ik} if ik else None,
                        }).encode("utf-8")
                        req = urllib.request.Request(
                            f"https://api.telegram.org/bot{target_token}/sendMessage",
                            data=req_data,
                            headers={"Content-Type": "application/json"},
                        )
                        urllib.request.urlopen(req, timeout=8)
                    except Exception as e:
                        logger.error(f"Ошибка отправки разблокированного лида {lead_id} в Telegram: {e}")

        logger.info(f"Всего открыто {unlocked_count} заявок для компании {company_id} в Supabase")
    except Exception as e:
        logger.error(f"Ошибка в unlock_all_company_leads: {e}")

    return unlocked_count
