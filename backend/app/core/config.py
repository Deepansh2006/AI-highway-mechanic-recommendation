import os
import re
from dotenv import load_dotenv

load_dotenv()
class Settings:
    _raw_db = os.getenv("SQLALCHEMY_DATABASE_URL") or os.getenv("DATABASE_URL") or "postgresql://postgres:postgres@localhost:5432/postgres"
    DATABASE_URL = _raw_db.replace("postgres://", "postgresql://", 1) if _raw_db.startswith("postgres://") else _raw_db
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")
    JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
    OTP_DEMO_MODE = os.getenv("OTP_DEMO_MODE", "true").lower() == "true"

    def get_gemini_api_keys(self) -> list[str]:
        keys = []
        # Check GEMINI_API_KEYS (comma, semicolon, or newline separated)
        raw_multi = os.getenv("GEMINI_API_KEYS", "")
        if raw_multi:
            for k in re.split(r"[,;\n\r]+", raw_multi):
                k = k.strip().strip("'\"")
                if k and k not in keys:
                    keys.append(k)

        # Check single GEMINI_API_KEY (supports single key or comma-separated list)
        raw_single = os.getenv("GEMINI_API_KEY", "")
        if raw_single:
            for k in re.split(r"[,;\n\r]+", raw_single):
                k = k.strip().strip("'\"")
                if k and k not in keys:
                    keys.append(k)

        # Check numbered keys GEMINI_API_KEY_1 or GEMINI_API_KEY1 through 20
        for i in range(1, 21):
            k = (os.getenv(f"GEMINI_API_KEY_{i}") or os.getenv(f"GEMINI_API_KEY{i}") or "").strip().strip("'\"")
            if k and k not in keys:
                keys.append(k)

        return keys

settings = Settings()

