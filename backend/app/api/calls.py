from datetime import datetime
import csv
from io import StringIO
from fastapi import APIRouter, Depends, Query, Response, HTTPException, status
from sqlalchemy import and_
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.config import settings
from app.models import CallRecord, User
from app.schemas import PaginatedCalls

router = APIRouter(prefix="/calls", tags=["calls"])


@router.get("", response_model=PaginatedCalls)
def list_calls(
    from_date: datetime | None = Query(default=None, alias="from"),
    to_date: datetime | None = Query(default=None, alias="to"),
    missed: bool | None = None,
    direction: str | None = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(CallRecord)
    filters = []
    if from_date:
        filters.append(CallRecord.timestamp >= from_date)
    if to_date:
        filters.append(CallRecord.timestamp <= to_date)
    if missed is not None:
        filters.append(CallRecord.is_missed == missed)
    if direction:
        filters.append(CallRecord.direction == direction)
    if filters:
        query = query.filter(and_(*filters))
    total = query.count()
    items = query.order_by(CallRecord.timestamp.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedCalls(items=items, total=total, page=page, page_size=page_size)


@router.get("/export")
def export_calls(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "ADMIN" and not settings.allow_csv_export_for_operators:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Export not allowed")
    records = db.query(CallRecord).order_by(CallRecord.timestamp.desc()).all()
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "timestamp",
            "direction",
            "calling_number",
            "called_number",
            "duration",
            "status",
            "nature",
            "is_missed",
        ]
    )
    for record in records:
        writer.writerow(
            [
                record.timestamp.isoformat(),
                record.direction,
                record.calling_number,
                record.called_number,
                record.duration,
                record.status,
                record.nature,
                record.is_missed,
            ]
        )
    return Response(content=output.getvalue(), media_type="text/csv")
