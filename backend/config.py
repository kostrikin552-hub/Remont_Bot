import os
from dotenv import load_dotenv

# Загружаем переменные из .env файла
load_dotenv()


def normalize_url(url: str, default: str) -> str:
    val = (url or default).strip().rstrip("/")
    if val and not val.startswith("http://") and not val.startswith("https://"):
        val = f"https://{val}"
    return val


def sanitize_supabase_url(url: str | None) -> str:
    default_url = "https://zwitgykmplbtirmslzem.supabase.co"
    val = (url or default_url).strip().strip('"').strip("'").rstrip("/")
    if val.endswith(".supabase.com"):
        val = val[:-4]  # replace .com with .co
    elif "supabase.com" in val:
        val = val.replace("supabase.com", "supabase.co")
    if not val.startswith("http://") and not val.startswith("https://"):
        val = f"https://{val}"
    return val


# Supabase
SUPABASE_URL: str = sanitize_supabase_url(
    os.getenv("SUPABASE_URL")
    or os.getenv("VITE_SUPABASE_URL")
    or "https://zwitgykmplbtirmslzem.supabase.co"
)

SUPABASE_SERVICE_ROLE_KEY: str = (
    os.getenv(
        "SUPABASE_SERVICE_ROLE_KEY",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3aXRneWttcGxidGlybXNsemVtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDMxODM3NiwiZXhwIjoyMTA1ODk0Mzc2fQ.K4YooPUUwdUDl7jSabZHdAV8DmlRhYlNJ4dVd_HOHWs",
    )
    or os.getenv("SUPABASE_ANON_KEY", "sb_publishable_Lgt9Xc9gq2pgJ71JRfsL2g_d43evJqj")
).strip().strip('"').strip("'")

# Telegram Master Bot
MASTER_BOT_TOKEN: str = os.getenv(
    "MASTER_BOT_TOKEN", "8669689967:AAFRdKTEAWRvA1yMERFB0hiPpZzs39E1Po4"
).strip()

# Платёжные шлюзы (YooKassa / Telegram Payments)
TELEGRAM_PAYMENT_PROVIDER_TOKEN: str = os.getenv(
    "TELEGRAM_PAYMENT_PROVIDER_TOKEN", "390540012:LIVE:102909"
).strip()

YOOKASSA_SHOP_ID: str = os.getenv("YOOKASSA_SHOP_ID", "1413258").strip()

# URLs монолита на Render.com
BASE_WEBHOOK_URL: str = normalize_url(
    os.getenv("BASE_WEBHOOK_URL", ""), "https://remont-backend-exr3.onrender.com"
)

MINI_APP_URL: str = normalize_url(
    os.getenv("MINI_APP_URL", ""), "https://remont-backend-exr3.onrender.com"
)

PORT: int = int(os.getenv("PORT", "10000"))
HOST: str = os.getenv("HOST", "0.0.0.0")
