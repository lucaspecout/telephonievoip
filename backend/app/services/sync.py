from datetime import datetime
import time
from sqlalchemy.orm import Session
from app.models import CallRecord, OVHSettings
from app.services.ovh_client import OVHClient


def compute_is_missed(payload: dict) -> bool:
    direction = payload.get("direction") or payload.get("way")
    status = payload.get("status")
    duration = payload.get("duration") or 0
    if direction == "in" and (status in {"missed", "no_answer"} or duration == 0):
        return True
    return False


def sync_calls(db: Session, settings: OVHSettings, max_pages: int = 5) -> int:
    client = OVHClient(settings)
    inserted = 0
    for service_name in client.iter_service_names():
        consumption_ids = client.list_consumption_ids(service_name)
        for consumption_id in consumption_ids[: max_pages * 100]:
            exists = db.query(CallRecord).filter_by(ovh_consumption_id=str(consumption_id)).first()
            if exists:
                continue
            payload = client.get_consumption_detail(service_name, consumption_id)
            start_date = payload["startDate"]
            if isinstance(start_date, str) and start_date.endswith("Z"):
                start_date = start_date.replace("Z", "+00:00")
            record = CallRecord(
                ovh_consumption_id=str(consumption_id),
                timestamp=datetime.fromisoformat(start_date),
                direction=payload.get("direction") or payload.get("way", "unknown"),
                calling_number=payload.get("callingNumber"),
                called_number=payload.get("calledNumber"),
                duration=payload.get("duration") or 0,
                status=payload.get("status"),
                nature=payload.get("nature"),
                is_missed=compute_is_missed(payload),
                raw_payload=payload,
            )
            db.add(record)
            inserted += 1
        db.commit()
        time.sleep(0.2)
    return inserted
