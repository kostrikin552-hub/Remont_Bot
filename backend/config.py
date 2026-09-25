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

# URLs
BASE_WEBHOOK_URL: str = os.getenv(
    "BASE_WEBHOOK_URL", "https://remont-backend.onrender.com"
).rstrip("/")

MINI_APP_URL: str = os.getenv(
    "MINI_APP_URL",
    "https://ais-pre-3xeyotanildylb6nzg47ki-97067624345.europe-west1.run.app",
).rstrip("/")

PORT: int = int(os.getenv("PORT", "10000"))
HOST: str = os.getenv("HOST", "0.0.0.0")
