import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Role(enum.Enum):
    ADMIN = "ADMIN"
    OPERATEUR = "OPERATEUR"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(Role), nullable=False, default=Role.OPERATEUR)
    must_change_password = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class OvhSettings(Base):
    __tablename__ = "ovh_settings"

    id = Column(Integer, primary_key=True)
    billing_account = Column(String(255), nullable=True)
    service_names = Column(String(1024), nullable=True)
    admin_phone_number = Column(String(64), nullable=True)
    app_key = Column(String(255), nullable=True)
    app_secret = Column(String(255), nullable=True)
    consumer_key = Column(String(255), nullable=True)
    last_sync_at = Column(DateTime, nullable=True)
    last_error = Column(String(1024), nullable=True)


class CallDirection(enum.Enum):
    INBOUND = "INBOUND"
    OUTBOUND = "OUTBOUND"


class CallRecord(Base):
    __tablename__ = "call_records"
    __table_args__ = (UniqueConstraint("ovh_consumption_id"),)

    id = Column(Integer, primary_key=True, index=True)
    ovh_consumption_id = Column(String(128), nullable=False, unique=True)
    started_at = Column(DateTime, nullable=False, index=True)
    direction = Column(Enum(CallDirection), nullable=False)
    calling_number = Column(String(64), nullable=True, index=True)
    called_number = Column(String(64), nullable=True, index=True)
    duration = Column(Integer, default=0)
    status = Column(String(64), nullable=True)
    is_missed = Column(Boolean, default=False, index=True)
    raw_payload = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
