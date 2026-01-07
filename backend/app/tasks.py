from celery import shared_task
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models import OVHSettings
from app.services.sync import sync_calls


@shared_task(name="app.tasks.sync_ovh_calls", bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 5})
def sync_ovh_calls(self):
    db: Session = SessionLocal()
    try:
        settings = db.query(OVHSettings).first()
        if not settings:
            return 0
        return sync_calls(db, settings)
    finally:
        db.close()
