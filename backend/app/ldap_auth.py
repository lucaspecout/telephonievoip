import socket
from dataclasses import dataclass
from urllib.parse import urlparse

from ldap3 import ALL, Connection, Server, SUBTREE
from ldap3.core.exceptions import LDAPException
from ldap3.utils.conv import escape_filter_chars

from app.config import settings
from app.models import Role


@dataclass
class LdapUser:
    username: str
    dn: str
    groups: list[str]
    role: Role


class LdapAuthError(Exception):
    pass


class LdapAccessDenied(Exception):
    pass


class LdapService:
    def is_enabled(self) -> bool:
        return settings.ldap_enabled

    def _server(self) -> Server:
        parsed = urlparse(settings.ldap_url)
        host = parsed.hostname or settings.ldap_url
        port = parsed.port or (636 if parsed.scheme == "ldaps" else 389)
        return Server(host, port=port, use_ssl=parsed.scheme == "ldaps", get_info=ALL)

    def _admin_connection(self) -> Connection:
        if not settings.ldap_bind_dn or not settings.ldap_bind_password:
            raise LdapAuthError("LDAP bind settings are incomplete")
        connection = Connection(
            self._server(),
            user=settings.ldap_bind_dn,
            password=settings.ldap_bind_password,
            auto_bind=True,
        )
        return connection

    def _user_filter(self, username: str) -> str:
        escaped_username = escape_filter_chars(username)
        return settings.ldap_user_filter.format(username=escaped_username)

    def _group_filter(self, user_dn: str) -> str:
        escaped_dn = escape_filter_chars(user_dn)
        return settings.ldap_group_filter.format(user_dn=escaped_dn)

    def _role_map(self) -> dict[str, Role]:
        result: dict[str, Role] = {}
        for item in (settings.ldap_group_role_map or "").split(","):
            if ":" not in item:
                continue
            group, role = item.split(":", 1)
            group_name = group.strip()
            role_name = role.strip().upper()
            if not group_name:
                continue
            try:
                result[group_name] = Role(role_name)
            except ValueError:
                continue
        return result

    def find_user(self, connection: Connection, username: str):
        connection.search(
            search_base=settings.ldap_user_base_dn,
            search_filter=self._user_filter(username),
            search_scope=SUBTREE,
            attributes=["uid", "mail", "cn", "display_name"],
            size_limit=2,
        )
        if not connection.entries:
            return None
        return connection.entries[0]

    def list_user_groups(self, connection: Connection, user_dn: str) -> list[str]:
        connection.search(
            search_base=settings.ldap_group_base_dn,
            search_filter=self._group_filter(user_dn),
            search_scope=SUBTREE,
            attributes=[settings.ldap_group_name_attr],
        )
        groups: list[str] = []
        for entry in connection.entries:
            attr = getattr(entry, settings.ldap_group_name_attr, None)
            if attr:
                groups.extend(str(value) for value in attr.values)
        return groups

    def authenticate(self, username: str, password: str) -> LdapUser:
        if not self.is_enabled():
            raise LdapAuthError("LDAP is disabled")
        if not username or not password:
            raise LdapAuthError("Missing LDAP credentials")
        try:
            with self._admin_connection() as admin_connection:
                entry = self.find_user(admin_connection, username)
                if not entry:
                    raise LdapAuthError("LDAP user not found")
                user_dn = str(entry.entry_dn)
                uid_attr = getattr(entry, "uid", None)
                ldap_username = (
                    str(uid_attr.value) if uid_attr and uid_attr.value else username
                )
                with Connection(
                    self._server(), user=user_dn, password=password, auto_bind=True
                ):
                    pass
                groups = self.list_user_groups(admin_connection, user_dn)
        except LdapAccessDenied:
            raise
        except LDAPException as exc:
            raise LdapAuthError("LDAP authentication failed") from exc

        required_group = settings.ldap_group_required
        if required_group and required_group not in groups:
            raise LdapAccessDenied("LDAP user is not in the required group")

        role = self._role_map().get(required_group or "", Role.OPERATEUR)
        return LdapUser(username=ldap_username, dn=user_dn, groups=groups, role=role)

    def diagnose(self, username: str | None = None, password: str | None = None) -> list[dict]:
        checks: list[dict] = []

        def add(name: str, ok: bool, detail: str = "") -> None:
            checks.append({"name": name, "ok": ok, "detail": detail})

        add(
            "LDAP active",
            self.is_enabled(),
            "LDAP_ENABLED=true" if self.is_enabled() else "LDAP disabled",
        )
        parsed = urlparse(settings.ldap_url)
        host = parsed.hostname
        port = parsed.port or (636 if parsed.scheme == "ldaps" else 389)
        try:
            if not host:
                raise OSError("Missing LDAP host")
            with socket.create_connection((host, port), timeout=5):
                pass
            add("URL/port TCP", True, f"{host}:{port}")
        except OSError as exc:
            add("URL/port TCP", False, str(exc))

        try:
            with self._admin_connection() as connection:
                add("Bind admin", True, settings.ldap_bind_dn or "")

                connection.search(
                    settings.ldap_user_base_dn,
                    "(objectClass=*)",
                    SUBTREE,
                    size_limit=1,
                )
                add(
                    "Users base DN",
                    bool(connection.entries),
                    settings.ldap_user_base_dn or "",
                )

                connection.search(
                    settings.ldap_group_base_dn,
                    "(objectClass=*)",
                    SUBTREE,
                    size_limit=1,
                )
                add(
                    "Groups base DN",
                    bool(connection.entries),
                    settings.ldap_group_base_dn or "",
                )

                group_filter = (
                    f"({settings.ldap_group_name_attr}="
                    f"{escape_filter_chars(settings.ldap_group_required or '')})"
                )
                connection.search(
                    settings.ldap_group_base_dn,
                    group_filter,
                    SUBTREE,
                    size_limit=1,
                )
                add(
                    "Required group",
                    bool(connection.entries),
                    settings.ldap_group_required or "",
                )
        except (LDAPException, LdapAuthError) as exc:
            add("Bind admin", False, str(exc))
            add("Users base DN", False, "Skipped")
            add("Groups base DN", False, "Skipped")
            add("Required group", False, "Skipped")

        if username or password:
            try:
                if not username or not password:
                    raise LdapAuthError("Username and password are both required")
                user = self.authenticate(username, password)
                add("LDAP user test", True, f"{user.username} / {', '.join(user.groups)}")
            except (LdapAuthError, LdapAccessDenied) as exc:
                add("LDAP user test", False, str(exc))
        else:
            add("LDAP user test", False, "No username/password provided")

        return checks


ldap_service = LdapService()
