import os


def get_env(name: str, default: str | None = None) -> str | None:
    return os.getenv(name, default)


def get_bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


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
        self.ldap_enabled = get_bool_env("LDAP_ENABLED", False)
        self.ldap_url = get_env("LDAP_URL", "ldap://lldap:3890")
        self.ldap_bind_dn = get_env(
            "LDAP_BIND_DN", "uid=admin,ou=people,dc=apc38,dc=local"
        )
        self.ldap_bind_password = get_env("LDAP_BIND_PASSWORD")
        self.ldap_user_base_dn = get_env(
            "LDAP_USER_BASE_DN", "ou=people,dc=apc38,dc=local"
        )
        self.ldap_user_filter = get_env(
            "LDAP_USER_FILTER", "(|(uid={username})(mail={username}))"
        )
        self.ldap_group_base_dn = get_env(
            "LDAP_GROUP_BASE_DN", "ou=groups,dc=apc38,dc=local"
        )
        self.ldap_group_filter = get_env("LDAP_GROUP_FILTER", "(member={user_dn})")
        self.ldap_group_name_attr = get_env("LDAP_GROUP_NAME_ATTR", "cn")
        self.ldap_group_required = get_env("LDAP_GROUP_REQUIRED", "telephonie")
        self.ldap_group_role_map = get_env(
            "LDAP_GROUP_ROLE_MAP", "telephonie:OPERATEUR"
        )


settings = Settings()
