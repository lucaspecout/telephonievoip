from sqlalchemy import Boolean, Column, DateTime, Integer, String, JSON
from app.core.database import Base


class CallRecord(Base):
    __tablename__ = "call_records"

    id = Column(Integer, primary_key=True)
    ovh_consumption_id = Column(String(64), unique=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    direction = Column(String(10), nullable=False)
    calling_number = Column(String(64))
    called_number = Column(String(64))
    duration = Column(Integer, default=0)
    status = Column(String(40))
    nature = Column(String(40))
    is_missed = Column(Boolean, default=False)
    raw_payload = Column(JSON, nullable=False)
