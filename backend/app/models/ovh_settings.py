from sqlalchemy import Column, DateTime, Integer, JSON, String
from sqlalchemy.sql import func
from app.core.database import Base


class OVHSettings(Base):
    __tablename__ = "ovh_settings"

    id = Column(Integer, primary_key=True)
    billing_account = Column(String(64))
    service_names = Column(JSON, default=list)
    app_key = Column(String(128))
    app_secret = Column(String(128))
    consumer_key = Column(String(128))
    monitored_numbers = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
