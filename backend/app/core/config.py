import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")
    JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
    OTP_DEMO_MODE = os.getenv("OTP_DEMO_MODE", "true").lower() == "true"

settings = Settings()
