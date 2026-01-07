from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import CallRecord, User
from app.schemas import DashboardSummary, TimeseriesResponse, TimeseriesPoint

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _range_to_dates(range_value: str) -> tuple[datetime, datetime]:
    now = datetime.utcnow()
    if range_value == "today":
        start = datetime(now.year, now.month, now.day)
    elif range_value == "7d":
        start = now - timedelta(days=7)
    else:
        start = now - timedelta(days=30)
    return start, now


@router.get("/summary", response_model=DashboardSummary)
def summary(range: str = Query("today", pattern="^(today|7d|30d)$"), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    start, end = _range_to_dates(range)
    incoming = db.query(func.count(CallRecord.id)).filter(CallRecord.direction == "in", CallRecord.timestamp >= start).scalar() or 0
    missed = db.query(func.count(CallRecord.id)).filter(CallRecord.is_missed.is_(True), CallRecord.timestamp >= start).scalar() or 0
    last_7 = db.query(func.count(CallRecord.id)).filter(CallRecord.timestamp >= datetime.utcnow() - timedelta(days=7)).scalar() or 0
    total_duration = db.query(func.sum(CallRecord.duration)).filter(CallRecord.timestamp >= start).scalar() or 0
    return DashboardSummary(
        total_incoming=incoming,
        total_missed=missed,
        total_last_7_days=last_7,
        total_duration_seconds=total_duration,
    )


@router.get("/timeseries", response_model=TimeseriesResponse)
def timeseries(range: str = Query("7d", pattern="^(7d|30d)$"), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    start, end = _range_to_dates(range)
    rows = (
        db.query(
            func.date(CallRecord.timestamp).label("day"),
            func.count(CallRecord.id).label("total"),
            func.sum(func.case((CallRecord.is_missed.is_(True), 1), else_=0)).label("missed"),
        )
        .filter(CallRecord.timestamp >= start)
        .group_by(func.date(CallRecord.timestamp))
        .order_by(func.date(CallRecord.timestamp))
        .all()
    )
    points = [TimeseriesPoint(date=str(row.day), total=row.total, missed=row.missed or 0) for row in rows]
    return TimeseriesResponse(range=range, points=points)
