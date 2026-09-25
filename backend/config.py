import os
from dotenv import load_dotenv

# Загружаем переменные из .env файла
load_dotenv()

# Supabase
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY: str = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv("SUPABASE_ANON_KEY", "")
).strip()

# Telegram Master Bot
MASTER_BOT_TOKEN: str = os.getenv("MASTER_BOT_TOKEN", "").strip()


def normalize_url(url: str, default: str) -> str:
    val = (url or default).strip().rstrip("/")
    if val and not val.startswith("http://") and not val.startswith("https://"):
        val = f"https://{val}"
    return val


# URLs (с авто-добавлением https:// при получении host от Render)
BASE_WEBHOOK_URL: str = normalize_url(
    os.getenv("BASE_WEBHOOK_URL", ""), "https://remont-backend.onrender.com"
)

MINI_APP_URL: str = normalize_url(
    os.getenv("MINI_APP_URL", ""),
    "https://ais-pre-3xeyotanildylb6nzg47ki-97067624345.europe-west1.run.app",
)

PORT: int = int(os.getenv("PORT", "10000"))
HOST: str = os.getenv("HOST", "0.0.0.0")
