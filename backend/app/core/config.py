from pydantic_settings import BaseSettings
from pydantic import AnyUrl
from typing import List


class Settings(BaseSettings):
    app_name: str = "SECours Calls Dashboard"
    environment: str = "development"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    database_url: AnyUrl = "postgresql+psycopg://postgres:postgres@postgres:5432/telephonievoip"
    redis_url: str = "redis://redis:6379/0"
    cors_origins: List[str] = ["http://localhost:5173"]
    allow_csv_export_for_operators: bool = False
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
