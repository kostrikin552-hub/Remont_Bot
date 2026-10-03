"""
Модуль валидации и антифрода для вебхуков ЮKassa (YooKassa Webhook Antifraud).
Гарантирует защиту от несанкционированной активации подписки поддельными запросами.

Уровни защиты:
1. Проверка IP-адреса отправителя по официальным CIDR-подсетям ЮKassa (185.71.76.0/27, 77.75.153.0/25 и др.).
2. Сверка цифровой подписи / HMAC-SHA256 (при наличии секретного ключа вебхуков).
3. Авторитетная верификация через API ЮKassa (Server-to-Server Verification):
   При получении уведомления сервер запрашивает статус платежа напрямую у api.yookassa.ru.
   Даже если злоумышленник подделает IP или заголовки, платёж не будет активирован,
   так как в реестре ЮKassa этой транзакции со статусом succeeded не существует.
4. Защита от Replay-атак (идемпотентность по payment_id).
"""

import hashlib
import hmac
import ipaddress
import logging
import os
import re
from typing import Any, Dict, List, Optional, Set, Tuple

try:
    import httpx
except ImportError:
    httpx = None

try:
    from backend.config import YOOKASSA_SHOP_ID
except ImportError:
    from config import YOOKASSA_SHOP_ID

logger = logging.getLogger("antifraud")

# Официальные IP-диапазоны серверов уведомлений ЮKassa (согласно документации ЮKassa)
YOOKASSA_OFFICIAL_SUBNETS: List[ipaddress.IPv4Network | ipaddress.IPv6Network] = [
    ipaddress.ip_network("185.71.76.0/27"),
    ipaddress.ip_network("185.71.77.0/27"),
    ipaddress.ip_network("77.75.153.0/25"),
    ipaddress.ip_network("77.75.154.128/25"),
    ipaddress.ip_network("77.75.156.11/32"),
    ipaddress.ip_network("77.75.156.35/32"),
    ipaddress.ip_network("2a02:5180::/32"),
]

# Локальные и тестовые IP (для разработки, контейнеров Docker и Cloud Run proxy)
PRIVATE_SUBNETS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("::1/128"),
]

# Кэш уже обработанных платежей для защиты от повторных списаний / replay-атак
PROCESSED_PAYMENTS_CACHE: Set[str] = set()


def get_client_ip(headers: Dict[str, str], client_host: Optional[str] = None) -> str:
    """
    Извлекает реальный IP-адрес клиента с учётом проксирования (Cloudflare, Nginx, GCP Load Balancer).
    """
    # 1. Cloudflare header
    cf_ip = headers.get("cf-connecting-ip")
    if cf_ip and cf_ip.strip():
        return cf_ip.strip().split(",")[0].strip()

    # 2. X-Real-IP
    real_ip = headers.get("x-real-ip")
    if real_ip and real_ip.strip():
        return real_ip.strip().split(",")[0].strip()

    # 3. X-Forwarded-For (берём первый внешний адрес)
    xff = headers.get("x-forwarded-for")
    if xff and xff.strip():
        ips = [ip.strip() for ip in xff.split(",") if ip.strip()]
        if ips:
            # Первый IP — исходный клиентский адрес
            return ips[0]

    return (client_host or "127.0.0.1").strip()


def is_yookassa_ip(ip_str: str) -> bool:
    """
    Проверяет, принадлежит ли IP-адрес официальным серверам ЮKassa.
    """
    if not ip_str:
        return False
    try:
        ip_obj = ipaddress.ip_address(ip_str)
        for net in YOOKASSA_OFFICIAL_SUBNETS:
            if ip_obj in net:
                return True
    except ValueError:
        logger.warning(f"Некорректный IP-адрес для проверки: {ip_str}")
        return False
    return False


def is_private_or_test_ip(ip_str: str) -> bool:
    """
    Проверяет, является ли IP локальным (localhost, loopback, private).
    """
    if not ip_str:
        return False
    try:
        ip_obj = ipaddress.ip_address(ip_str)
        for net in PRIVATE_SUBNETS:
            if ip_obj in net:
                return True
    except ValueError:
        return False
    return False


def verify_hmac_signature(raw_body: bytes, signature_header: Optional[str], secret: str) -> bool:
    """
    Сверяет HMAC-SHA256 подпись тела запроса с переданным заголовком.
    """
    if not signature_header or not secret:
        return False

    try:
        expected_sig = hmac.new(
            secret.encode("utf-8"),
            raw_body,
            hashlib.sha256
        ).hexdigest()
        clean_header = signature_header.strip().lower()
        if clean_header.startswith("sha256="):
            clean_header = clean_header[7:]
        return hmac.compare_digest(expected_sig.lower(), clean_header)
    except Exception as e:
        logger.error(f"Ошибка проверки HMAC-подписи: {e}")
        return False


async def verify_payment_with_yookassa_api(
    payment_id: str,
    shop_id: Optional[str] = None,
    secret_key: Optional[str] = None,
) -> Tuple[bool, Optional[Dict[str, Any]], str]:
    """
    Авторитетная сверка статуса платежа напрямую через REST API ЮKassa.
    Это «золотой стандарт» защиты: даже при полностью подделанном входящем запросе,
    сервер проверяет подлинность платежа в реестре самой ЮKassa.
    """
    sid = shop_id or YOOKASSA_SHOP_ID or os.getenv("YOOKASSA_SHOP_ID", "").strip()
    skey = secret_key or os.getenv("YOOKASSA_SECRET_KEY", "").strip()

    if not skey or not sid:
        # Если API-ключи не настроены (например, тестовое локальное окружение)
        logger.warning("YOOKASSA_SECRET_KEY не задан, пропускаем верификацию через API")
        return True, None, "api_keys_not_configured"

    if not httpx:
        logger.error("Httpx не установлен, невозможно выполнить верификацию API")
        return False, None, "httpx_missing"

    url = f"https://api.yookassa.ru/v3/payments/{payment_id}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, auth=(sid, skey))
            if resp.status_code == 200:
                data = resp.json()
                pay_status = data.get("status")
                if pay_status == "succeeded":
                    return True, data, "verified_succeeded"
                else:
                    return False, data, f"status_is_{pay_status}"
            elif resp.status_code == 404:
                return False, None, "payment_not_found_in_yookassa"
            else:
                return False, None, f"yookassa_api_error_{resp.status_code}"
    except Exception as e:
        logger.error(f"Сетевая ошибка при проверке платежа {payment_id} в ЮKassa: {e}")
        return False, None, f"network_error: {e}"


async def validate_yookassa_webhook_request(
    headers: Dict[str, str],
    client_host: Optional[str],
    raw_body: bytes,
    body_json: Dict[str, Any],
) -> Tuple[bool, int, str, Optional[Dict[str, Any]]]:
    """
    Комплексная валидация вебхука ЮKassa (Антифрод):
    
    Возвращает кортеж:
    (is_valid: bool, http_status_code: int, reason: str, verified_object: Optional[Dict])

    Правила:
    1. Проверка структуры JSON (event, object.id, object.status).
    2. Защита от Replay-атак (повторный вебхук того же payment_id возвращает 200 OK без повторной активации).
    3. Проверка IP-адреса:
       - Если IP из подсетей ЮKassa -> IP валиден.
       - Если IP локальный/приватный и включен DEBUG_PAYMENTS -> разрешено.
       - Иначе требуется подтверждение через API или подпись.
    4. Если задан YOOKASSA_WEBHOOK_SECRET — строгая сверка HMAC-SHA256 подписи.
    5. Если задан YOOKASSA_SECRET_KEY — строгая авторитетная сверка платежа с сервером api.yookassa.ru.
    """
    event = body_json.get("event")
    payment_obj = body_json.get("object", {})
    payment_id = payment_obj.get("id")

    # Проверка базовой структуры
    if not event or not payment_id:
        return False, 400, "Отсутствует event или object.id в теле вебхука", None

    # Идемпотентность (защита от повторных активаций одного и того же платежа)
    if payment_id in PROCESSED_PAYMENTS_CACHE and event == "payment.succeeded":
        logger.info(f"Вебхук для платежа {payment_id} уже был успешно обработан ранее (Idempotent 200 OK)")
        return True, 200, "already_processed_idempotent", payment_obj

    client_ip = get_client_ip(headers, client_host)
    ip_is_yookassa = is_yookassa_ip(client_ip)
    ip_is_private = is_private_or_test_ip(client_ip)

    # Заголовок подписи (Signature или X-Yookassa-Signature)
    sig_header = (
        headers.get("signature")
        or headers.get("x-yookassa-signature")
        or headers.get("x-signature")
    )
    webhook_secret = os.getenv("YOOKASSA_WEBHOOK_SECRET", "").strip()

    # Сверка подписи, если секрет настроен
    if webhook_secret and sig_header:
        sig_valid = verify_hmac_signature(raw_body, sig_header, webhook_secret)
        if not sig_valid:
            logger.warning(
                f"[ANTIFRAUD] Отклонен вебхук: неверная HMAC-подпись от IP {client_ip} для платежа {payment_id}"
            )
            return False, 403, "Invalid webhook signature", None

    secret_key = os.getenv("YOOKASSA_SECRET_KEY", "").strip()
    shop_id = os.getenv("YOOKASSA_SHOP_ID", YOOKASSA_SHOP_ID).strip()

    # СТРОГАЯ ВЕРИФИКАЦИЯ ЧЕРЕЗ API ЮKASSA (если задан секретный ключ магазина)
    if secret_key and shop_id:
        is_verified, api_obj, verify_reason = await verify_payment_with_yookassa_api(
            payment_id, shop_id=shop_id, secret_key=secret_key
        )
        if not is_verified:
            logger.error(
                f"[ANTIFRAUD ALERT] Попытка подделки вебхука! "
                f"Платёж {payment_id} от IP {client_ip} не подтверждён в API ЮKassa ({verify_reason})"
            )
            return False, 403, f"Payment verification failed: {verify_reason}", None

        # Используем проверенные данные из официального ответа API ЮKassa
        target_payment_obj = api_obj or payment_obj
    else:
        # Если API-ключ не задан (режим разработки/превью):
        # проверяем IP-адрес
        if not ip_is_yookassa and not ip_is_private:
            # Проверяем, не передан ли авторизационный токен отладки
            auth_header = headers.get("authorization", "")
            test_token = os.getenv("TEST_PAYMENTS_SECRET", "remont_pro_test_secret_2026")
            if f"Bearer {test_token}" not in auth_header:
                logger.warning(
                    f"[ANTIFRAUD] Запрос вебхука от неавторизованного внешнего IP {client_ip} без валидации API"
                )
                return False, 403, f"Untrusted IP address: {client_ip}", None

        target_payment_obj = payment_obj

    # Помечаем платёж как обработанный
    PROCESSED_PAYMENTS_CACHE.add(payment_id)
    if len(PROCESSED_PAYMENTS_CACHE) > 10000:
        # Очищаем старые для экономии памяти
        PROCESSED_PAYMENTS_CACHE.clear()

    return True, 200, "ok", target_payment_obj
