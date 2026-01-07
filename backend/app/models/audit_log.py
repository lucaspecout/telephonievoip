from sqlalchemy import Column, DateTime, Integer, String, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    action = Column(String(120), nullable=False)
    status = Column(String(20), nullable=False)
    message = Column(String(255))
    metadata = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
