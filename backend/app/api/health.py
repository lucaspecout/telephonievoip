from fastapi import APIRouter
from sqlalchemy import text
from app.core.database import SessionLocal
from app.core.config import settings
import redis

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/ready")
def ready():
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
    finally:
        db.close()
    redis_client = redis.Redis.from_url(settings.redis_url)
    redis_client.ping()
    return {"status": "ready"}
