from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "secours_calls",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks"],
)

celery_app.conf.beat_schedule = {
    "sync-calls-every-60s": {
        "task": "app.tasks.sync_ovh_calls",
        "schedule": 60.0,
    }
}
