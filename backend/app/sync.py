import asyncio
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models import CallRecord, CallDirection, OvhSettings
from app.ovh_client import OVHClient


def infer_direction(payload: dict) -> CallDirection:
    direction = payload.get("direction") or payload.get("way") or "IN"
    if str(direction).lower().startswith("out"):
        return CallDirection.OUTBOUND
    return CallDirection.INBOUND


def infer_missed(payload: dict) -> bool:
    status = (payload.get("status") or payload.get("nature") or "").lower()
    duration = payload.get("duration") or 0
    if "missed" in status or "unanswered" in status:
        return True
    return duration == 0


def parse_datetime(value: str) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def map_payload_to_record(payload: dict) -> CallRecord:
    return CallRecord(
        ovh_consumption_id=str(payload.get("id")),
        started_at=parse_datetime(payload.get("creationDatetime") or payload.get("startDate")),
        direction=infer_direction(payload),
        calling_number=payload.get("calling"),
        called_number=payload.get("called"),
        duration=int(payload.get("duration") or 0),
        status=payload.get("status") or payload.get("nature"),
        is_missed=infer_missed(payload),
        raw_payload=payload,
    )


def get_settings(db: Session) -> Optional[OvhSettings]:
    return db.query(OvhSettings).first()


async def sync_consumptions(db: Session, publish) -> None:
    settings_row = get_settings(db)
    if not settings_row or not settings_row.billing_account:
        return
    client = OVHClient(settings_row, settings.ovh_endpoint)
    try:
        range_end = datetime.utcnow()
        if settings_row.last_sync_at:
            range_start = settings_row.last_sync_at - timedelta(minutes=10)
        else:
            range_start = range_end - timedelta(days=7)
        consumptions = client.list_consumptions(range_start, range_end)
        new_count = 0
        for service_name, consumption_id in consumptions:
            existing = (
                db.query(CallRecord)
                .filter(CallRecord.ovh_consumption_id == str(consumption_id))
                .first()
            )
            if existing:
                continue
            payload = client.get_consumption_detail(service_name, consumption_id)
            record = map_payload_to_record(payload)
            db.add(record)
            db.commit()
            db.refresh(record)
            new_count += 1
            await publish({"type": "new_call", "payload": {"id": record.id}})
        settings_row.last_sync_at = datetime.utcnow()
        settings_row.last_error = None
        db.commit()
        await publish({"type": "sync_complete", "payload": {"new_count": new_count}})
        if new_count:
            await publish({"type": "summary_updated"})
    except Exception as exc:
        settings_row.last_error = str(exc)
        db.commit()
        await publish({"type": "sync_error", "payload": {"message": str(exc)}})


class SyncWorker:
    def __init__(self, queue: asyncio.Queue, db_factory, publish):
        self.queue = queue
        self.db_factory = db_factory
        self.publish = publish
        self._running = True

    async def run(self) -> None:
        while self._running:
            task = await self.queue.get()
            if task == "sync":
                db = self.db_factory()
                try:
                    await sync_consumptions(db, self.publish)
                finally:
                    db.close()
            self.queue.task_done()

    def stop(self) -> None:
        self._running = False
