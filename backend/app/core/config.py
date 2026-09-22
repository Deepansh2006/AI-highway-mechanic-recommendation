import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

settings = Settings()
