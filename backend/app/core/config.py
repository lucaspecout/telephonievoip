import json
from typing import List

from pydantic import AnyUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        env_parse_json=False,
    )

    @field_validator("cors_origins", mode="before")
    def parse_cors_origins(cls, value: object) -> List[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            cleaned = value.strip()
            if cleaned == "":
                return []
            if cleaned.startswith("["):
                return json.loads(cleaned)
            return [item.strip() for item in cleaned.split(",") if item.strip()]
        return [str(value)]


settings = Settings()
