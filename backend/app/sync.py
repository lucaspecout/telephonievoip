import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.config import settings
from app.models import CallRecord, CallDirection, OvhSettings
from app.ovh_client import OVHClient


def extract_status(payload: dict) -> Optional[str]:
    for key in ("status", "nature", "callStatus", "callType", "type"):
        value = payload.get(key)
        if value:
            return str(value)
    return None


def infer_direction(payload: dict) -> CallDirection:
    direction = payload.get("direction") or payload.get("way") or "IN"
    if str(direction).lower().startswith("out"):
        return CallDirection.OUTBOUND
    return CallDirection.INBOUND


def infer_missed(payload: dict) -> bool:
    status = (extract_status(payload) or "").lower()
    duration = payload.get("duration") or 0
    if "missed" in status or "unanswered" in status:
        return True
    return duration == 0


def parse_datetime(value: str) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def map_payload_to_record(payload: dict, consumption_id: Optional[str] = None) -> CallRecord:
    ovh_id = payload.get("id") or payload.get("consumptionId") or consumption_id
    if not ovh_id:
        raise ValueError("Missing OVH consumption id")
    return CallRecord(
        ovh_consumption_id=str(ovh_id),
        started_at=parse_datetime(payload.get("creationDatetime") or payload.get("startDate")),
        direction=infer_direction(payload),
        calling_number=payload.get("calling"),
        called_number=payload.get("called"),
        duration=int(payload.get("duration") or 0),
        status=extract_status(payload),
        is_missed=infer_missed(payload),
        raw_payload=payload,
    )


def get_settings(db: Session) -> Optional[OvhSettings]:
    return db.query(OvhSettings).first()


def get_sync_range(
    settings_row: OvhSettings, range_days: Optional[int] = None
) -> Tuple[datetime, datetime, str]:
    range_end = datetime.utcnow()
    if range_days is not None:
        range_start = range_end - timedelta(days=range_days)
        return range_start, range_end, "override"
    if settings_row.last_sync_at:
        range_start = settings_row.last_sync_at - timedelta(minutes=10)
        return range_start, range_end, "delta"
    range_start = range_end - timedelta(days=7)
    return range_start, range_end, "default"


async def sync_consumptions(db: Session, publish, range_days: Optional[int] = None) -> int:
    settings_row = get_settings(db)
    if not settings_row or not settings_row.billing_account:
        return 0
    client = OVHClient(settings_row, settings.ovh_endpoint)
    logger = logging.getLogger(__name__)
    try:
        range_start, range_end, _ = get_sync_range(settings_row, range_days=range_days)
        consumptions = client.list_consumptions(range_start, range_end)
        new_count = 0
        errors: list[str] = []
        for service_name, consumption_id in consumptions:
            existing = (
                db.query(CallRecord)
                .filter(CallRecord.ovh_consumption_id == str(consumption_id))
                .first()
            )
            if existing:
                continue
            try:
                payload = client.get_consumption_detail(service_name, consumption_id)
                record = map_payload_to_record(payload, consumption_id=str(consumption_id))
                db.add(record)
                db.commit()
                db.refresh(record)
                new_count += 1
                await publish({"type": "new_call", "payload": {"id": record.id}})
            except Exception as exc:
                db.rollback()
                message = f"{consumption_id}: {type(exc).__name__}: {exc}"
                errors.append(message)
                logger.exception("Failed to sync consumption %s", consumption_id)
                await publish(
                    {
                        "type": "sync_item_error",
                        "payload": {"id": str(consumption_id), "message": message},
                    }
                )
        settings_row.last_sync_at = datetime.utcnow()
        if errors:
            settings_row.last_error = (
                f"Sync completed with {len(errors)} error(s). Example: {errors[0]}"
            )
        else:
            settings_row.last_error = None
        db.commit()
        await publish(
            {
                "type": "sync_complete",
                "payload": {"new_count": new_count, "error_count": len(errors)},
            }
        )
        if new_count:
            await publish({"type": "summary_updated"})
        return new_count
    except Exception as exc:
        settings_row.last_error = str(exc)
        db.commit()
        await publish({"type": "sync_error", "payload": {"message": str(exc)}})
        return 0


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
