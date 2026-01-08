import os


def get_env(name: str, default: str | None = None) -> str | None:
    return os.getenv(name, default)


class Settings:
    def __init__(self) -> None:
        self.database_url = get_env(
            "DATABASE_URL",
            "postgresql+psycopg2://telephonie:telephonie@db:5432/telephonie",
        )
        self.redis_url = get_env("REDIS_URL", "redis://redis:6379/0")
        self.jwt_secret = get_env("JWT_SECRET", "change-me")
        self.jwt_algorithm = get_env("JWT_ALGORITHM", "HS256")
        self.access_token_expire_minutes = int(
            get_env("ACCESS_TOKEN_EXPIRE_MINUTES", "480")
        )
        self.sync_interval_seconds = int(get_env("SYNC_INTERVAL_SECONDS", "4"))
        self.ovh_endpoint = get_env("OVH_ENDPOINT", "ovh-eu")


settings = Settings()
