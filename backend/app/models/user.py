from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(150), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="OPERATEUR")
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
