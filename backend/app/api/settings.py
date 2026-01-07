from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import require_admin
from app.models import OVHSettings, User
from app.schemas import OVHSettingsPayload, OVHSettingsResponse
from app.services.audit import log_event
from app.services.ovh_client import OVHClient

router = APIRouter(prefix="/settings/ovh", tags=["settings"])


@router.get("", response_model=OVHSettingsResponse | None)
def get_settings(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return db.query(OVHSettings).first()


@router.put("", response_model=OVHSettingsResponse)
def update_settings(payload: OVHSettingsPayload, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    settings = db.query(OVHSettings).first()
    if not settings:
        settings = OVHSettings()
        db.add(settings)
    settings.billing_account = payload.billing_account
    settings.service_names = payload.service_names
    settings.app_key = payload.app_key
    settings.app_secret = payload.app_secret
    settings.consumer_key = payload.consumer_key
    settings.monitored_numbers = payload.monitored_numbers
    db.commit()
    log_event(db, "update_ovh_settings", "success", user_id=admin.id)
    return settings


@router.post("/test")
def test_settings(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    settings = db.query(OVHSettings).first()
    if not settings:
        return {"status": "missing"}
    client = OVHClient(settings)
    client.test_connection()
    log_event(db, "test_ovh_settings", "success", user_id=admin.id)
    return {"status": "ok"}
