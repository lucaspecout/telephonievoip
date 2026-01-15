import asyncio
import csv
import io
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

import redis.asyncio as redis
from alembic import command
from alembic.config import Config
from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from jose import JWTError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, inspect, or_, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.auth import auth_service, get_current_user, require_role
from app.config import settings
from app.database import Base, SessionLocal, engine, get_db
from app.models import (
    CallRecord,
    Role,
    User,
    OvhSettings,
    CallDirection,
    TeamLead,
    TeamLeadCategory,
)
from app.schemas import (
    CallRecordOut,
    ChangePasswordRequest,
    DashboardSummary,
    HourlyPoint,
    LoginRequest,
    MeResponse,
    OvhSettingsIn,
    OvhSettingsOut,
    TeamLeadIn,
    TeamLeadCategoryIn,
    TeamLeadCategoryOut,
    TeamLeadCategoryUpdate,
    TeamLeadOut,
    TeamLeadUpdate,
    TimeseriesPoint,
    TokenResponse,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.sync import SyncWorker, extract_status, get_settings, get_sync_range, sync_consumptions

app = FastAPI(title="Secours Calls Dashboard")

logger = logging.getLogger(__name__)

redis_client: Optional[redis.Redis] = None
queue: asyncio.Queue = asyncio.Queue()
worker: Optional[SyncWorker] = None
scheduler_task: Optional[asyncio.Task] = None
worker_task: Optional[asyncio.Task] = None


@app.on_event("startup")
async def on_startup() -> None:
    await wait_for_database()
    run_migrations()
    Base.metadata.create_all(bind=engine)
    bootstrap_admin()
    global redis_client, worker, scheduler_task, worker_task
    redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    worker = SyncWorker(queue, SessionLocal, publish_event)
    worker_task = asyncio.create_task(worker.run())
    scheduler_task = asyncio.create_task(run_scheduler())


@app.on_event("shutdown")
async def on_shutdown() -> None:
    global redis_client, worker, scheduler_task, worker_task
    if scheduler_task:
        scheduler_task.cancel()
    if worker:
        worker.stop()
    if worker_task:
        worker_task.cancel()
    if redis_client:
        await redis_client.close()


async def wait_for_database(max_attempts: int = 8, delay_seconds: float = 1.5) -> None:
    attempt = 0
    delay = delay_seconds
    while attempt < max_attempts:
        attempt += 1
        try:
            with engine.connect():
                return
        except OperationalError as exc:
            if attempt >= max_attempts:
                logger.error(
                    "Database connection failed after %s attempts.",
                    attempt,
                    exc_info=exc,
                )
                raise
            logger.warning(
                "Database not ready (attempt %s/%s). Retrying in %.1fs.",
                attempt,
                max_attempts,
                delay,
            )
            await asyncio.sleep(delay)
            delay = min(delay * 1.5, 10.0)


def bootstrap_admin() -> None:
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == "admin").first()
        if not existing:
            admin = User(
                username="admin",
                password_hash=auth_service.hash_password("admin"),
                role=Role.ADMIN,
                must_change_password=True,
            )
            db.add(admin)
            db.commit()
    finally:
        db.close()


def run_migrations() -> None:
    alembic_ini = Path(__file__).resolve().parents[1] / "alembic.ini"
    config = Config(str(alembic_ini))
    config.set_main_option("sqlalchemy.url", settings.database_url)
    ovh_columns: set[str] = set()
    with engine.connect() as connection:
        inspector = inspect(connection)
        tables = inspector.get_table_names()
        if "ovh_settings" in tables:
            ovh_columns = {column["name"] for column in inspector.get_columns("ovh_settings")}
    if tables and "alembic_version" not in tables:
        logger.warning(
            "Existing tables detected without alembic version; stamping baseline."
        )
        if "ovh_settings" in tables and "admin_phone_number" not in ovh_columns:
            logger.warning(
                "OVH settings table missing admin_phone_number; stamping 0001 then upgrading."
            )
            command.stamp(config, "0001")
            command.upgrade(config, "head")
            return
        command.stamp(config, "head")
        return
    command.upgrade(config, "head")
    ensure_ovh_settings_schema()


def ensure_ovh_settings_schema() -> None:
    with engine.connect() as connection:
        inspector = inspect(connection)
        tables = inspector.get_table_names()
        if "ovh_settings" not in tables:
            return
        columns = {column["name"] for column in inspector.get_columns("ovh_settings")}
        if "admin_phone_number" not in columns:
            logger.warning(
                "OVH settings table missing admin_phone_number; applying emergency ALTER."
            )
            connection.execute(
                text(
                    "ALTER TABLE ovh_settings "
                    "ADD COLUMN admin_phone_number VARCHAR(64)"
                )
            )
            connection.commit()


async def publish_event(payload: dict) -> None:
    if redis_client:
        await redis_client.publish("events", JSONResponse(content=payload).body.decode())


async def run_scheduler() -> None:
    while True:
        await queue.put("sync")
        await asyncio.sleep(settings.sync_interval_seconds)


@app.post("/auth/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not auth_service.verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = auth_service.create_access_token(user.username, user.role.value)
    return TokenResponse(access_token=token)


@app.post("/auth/change-password", response_model=MeResponse)
def change_password(
    data: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeResponse:
    if not auth_service.verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Invalid current password")
    user.password_hash = auth_service.hash_password(data.new_password)
    user.must_change_password = False
    db.commit()
    db.refresh(user)
    return MeResponse.model_validate(user)


@app.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse.model_validate(user)


def build_number_search_patterns(value: str) -> List[str]:
    digits = "".join(char for char in value if char.isdigit())
    if not digits:
        return []
    patterns = {digits}
    trimmed = digits.lstrip("0")
    if trimmed:
        patterns.add(trimmed)
        patterns.add(f"33{trimmed}")
        patterns.add(f"0033{trimmed}")
    if digits.startswith("33") and not digits.startswith("0033") and len(digits) > 2:
        rest = digits[2:]
        patterns.add(f"0{rest}")
        patterns.add(f"0033{rest}")
    if digits.startswith("0033") and len(digits) > 4:
        rest = digits[4:]
        patterns.add(f"0{rest}")
        patterns.add(f"33{rest}")
    return sorted(patterns, key=len, reverse=True)


def build_number_variants(value: Optional[str]) -> List[str]:
    if not value:
        return []
    digits = "".join(char for char in value if char.isdigit())
    if not digits:
        return []
    variants = set(build_number_search_patterns(digits))
    variants.add(digits)
    return sorted(variants, key=len, reverse=True)


def build_team_lead_index(leads: List[TeamLead]) -> dict:
    index: dict[str, TeamLead] = {}
    for lead in leads:
        for variant in build_number_variants(lead.phone):
            index.setdefault(variant, lead)
    return index


def match_team_lead(number: Optional[str], index: dict) -> Optional[TeamLead]:
    for variant in build_number_variants(number):
        lead = index.get(variant)
        if lead:
            return lead
    return None


@app.get("/calls", response_model=List[CallRecordOut])
def list_calls(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    direction: Optional[CallDirection] = None,
    missed: Optional[bool] = None,
    number: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    export: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(CallRecord)
    if direction:
        query = query.filter(CallRecord.direction == direction)
    if missed is not None:
        query = query.filter(CallRecord.is_missed == missed)
    if number:
        patterns = build_number_search_patterns(number)
        if patterns:
            normalized_calling = func.regexp_replace(CallRecord.calling_number, r"\D", "", "g")
            normalized_called = func.regexp_replace(CallRecord.called_number, r"\D", "", "g")
            conditions = []
            for pattern in patterns:
                conditions.append(normalized_calling.like(f"%{pattern}%"))
                conditions.append(normalized_called.like(f"%{pattern}%"))
            query = query.filter(or_(*conditions))
        else:
            query = query.filter(
                (CallRecord.calling_number.ilike(f"%{number}%"))
                | (CallRecord.called_number.ilike(f"%{number}%"))
            )
    if start_date:
        query = query.filter(CallRecord.started_at >= parse_date_input(start_date))
    if end_date:
        query = query.filter(CallRecord.started_at <= parse_date_input(end_date, end_of_day=True))
    query = query.order_by(CallRecord.started_at.desc())
    if export == "csv":
        if user.role != Role.ADMIN:
            raise HTTPException(status_code=403, detail="Not authorized")
        return export_calls_csv(query)
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    leads = db.query(TeamLead).all()
    lead_index = build_team_lead_index(leads)
    enriched_calls = []
    for item in items:
        calling_lead = match_team_lead(item.calling_number, lead_index)
        called_lead = match_team_lead(item.called_number, lead_index)
        payload = CallRecordOut.model_validate(item).model_dump()
        if calling_lead:
            payload.update(
                {
                    "calling_team_name": calling_lead.team_name,
                    "calling_leader_first_name": calling_lead.leader_first_name,
                }
            )
        if called_lead:
            payload.update(
                {
                    "called_team_name": called_lead.team_name,
                    "called_leader_first_name": called_lead.leader_first_name,
                }
            )
        enriched_calls.append(CallRecordOut(**payload))
    return enriched_calls


def export_calls_csv(query):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "started_at",
            "direction",
            "calling_number",
            "called_number",
            "duration",
            "status",
            "is_missed",
        ]
    )
    for record in query.all():
        writer.writerow(
            [
                record.started_at.isoformat(),
                record.direction.value,
                record.calling_number,
                record.called_number,
                record.duration,
                record.status,
                record.is_missed,
            ]
        )
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=calls.csv"},
    )


def parse_date_input(value: str, end_of_day: bool = False) -> datetime:
    if len(value) == 10:
        date_value = datetime.fromisoformat(value)
        if end_of_day:
            return date_value + timedelta(hours=23, minutes=59, seconds=59)
        return date_value
    return datetime.fromisoformat(value)


@app.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> DashboardSummary:
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = datetime.utcnow() - timedelta(days=7)
    today_base_query = db.query(CallRecord).filter(CallRecord.started_at >= today_start)
    week_base_query = db.query(CallRecord).filter(CallRecord.started_at >= week_start)
    today_total = (
        today_base_query.with_entities(func.count(CallRecord.id)).scalar()
    )
    today_missed = (
        today_base_query.with_entities(func.count(CallRecord.id))
        .filter(CallRecord.is_missed.is_(True))
        .scalar()
    )
    week_total = (
        week_base_query.with_entities(func.count(CallRecord.id)).scalar()
    )
    week_missed = (
        week_base_query.with_entities(func.count(CallRecord.id))
        .filter(CallRecord.is_missed.is_(True))
        .scalar()
    )
    today_inbound = (
        today_base_query.with_entities(func.count(CallRecord.id))
        .filter(CallRecord.direction == CallDirection.INBOUND)
        .scalar()
    )
    today_outbound = (
        today_base_query.with_entities(func.count(CallRecord.id))
        .filter(CallRecord.direction == CallDirection.OUTBOUND)
        .scalar()
    )
    week_inbound = (
        week_base_query.with_entities(func.count(CallRecord.id))
        .filter(CallRecord.direction == CallDirection.INBOUND)
        .scalar()
    )
    week_outbound = (
        week_base_query.with_entities(func.count(CallRecord.id))
        .filter(CallRecord.direction == CallDirection.OUTBOUND)
        .scalar()
    )
    today_avg_duration = today_base_query.with_entities(func.avg(CallRecord.duration)).scalar()
    week_avg_duration = week_base_query.with_entities(func.avg(CallRecord.duration)).scalar()
    return DashboardSummary(
        today_total=today_total or 0,
        today_missed=today_missed or 0,
        week_total=week_total or 0,
        week_missed=week_missed or 0,
        today_inbound=today_inbound or 0,
        today_outbound=today_outbound or 0,
        week_inbound=week_inbound or 0,
        week_outbound=week_outbound or 0,
        today_avg_duration=int(round(today_avg_duration or 0)),
        week_avg_duration=int(round(week_avg_duration or 0)),
    )


@app.get("/dashboard/timeseries", response_model=List[TimeseriesPoint])
def dashboard_timeseries(
    days: int = Query(7, ge=1, le=30),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    start_date = (datetime.utcnow() - timedelta(days=days - 1)).date()
    start = datetime.combine(start_date, datetime.min.time())
    results = (
        db.query(func.date(CallRecord.started_at), func.count(CallRecord.id))
        .filter(CallRecord.started_at >= start)
        .group_by(func.date(CallRecord.started_at))
        .all()
    )
    missed = (
        db.query(func.date(CallRecord.started_at), func.count(CallRecord.id))
        .filter(CallRecord.started_at >= start, CallRecord.is_missed.is_(True))
        .group_by(func.date(CallRecord.started_at))
        .all()
    )
    totals = {str(row[0]): row[1] for row in results}
    missed_map = {str(row[0]): row[1] for row in missed}
    points = []
    for i in range(days):
        date_value = start_date + timedelta(days=i)
        key = str(date_value)
        points.append(
            TimeseriesPoint(
                date=key, total=totals.get(key, 0), missed=missed_map.get(key, 0)
            )
        )
    return points


@app.get("/dashboard/hourly", response_model=List[HourlyPoint])
def dashboard_hourly(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> List[HourlyPoint]:
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_start = today_start + timedelta(days=1)
    results = (
        db.query(func.extract("hour", CallRecord.started_at), func.count(CallRecord.id))
        .filter(CallRecord.started_at >= today_start, CallRecord.started_at < tomorrow_start)
        .group_by(func.extract("hour", CallRecord.started_at))
        .all()
    )
    totals = {int(row[0]): row[1] for row in results}
    return [HourlyPoint(hour=hour, total=totals.get(hour, 0)) for hour in range(24)]


@app.get("/team-leads", response_model=List[TeamLeadOut])
def list_team_leads(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> List[TeamLeadOut]:
    leads = db.query(TeamLead).order_by(TeamLead.team_name, TeamLead.leader_last_name).all()
    return [TeamLeadOut.model_validate(lead) for lead in leads]


@app.get("/team-lead-categories", response_model=List[TeamLeadCategoryOut])
def list_team_lead_categories(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> List[TeamLeadCategoryOut]:
    categories = (
        db.query(TeamLeadCategory)
        .order_by(TeamLeadCategory.position, TeamLeadCategory.name)
        .all()
    )
    return [TeamLeadCategoryOut.model_validate(category) for category in categories]


@app.post("/team-lead-categories", response_model=TeamLeadCategoryOut)
async def create_team_lead_category(
    data: TeamLeadCategoryIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> TeamLeadCategoryOut:
    existing = (
        db.query(TeamLeadCategory).filter(TeamLeadCategory.name == data.name).first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    if data.position is None:
        max_position = db.query(func.max(TeamLeadCategory.position)).scalar()
        position = (max_position or 0) + 1
    else:
        position = data.position
    category = TeamLeadCategory(name=data.name, position=position)
    db.add(category)
    db.commit()
    db.refresh(category)
    await publish_event({"type": "team_lead_categories_updated"})
    return TeamLeadCategoryOut.model_validate(category)


@app.patch("/team-lead-categories/{category_id}", response_model=TeamLeadCategoryOut)
async def update_team_lead_category(
    category_id: int,
    data: TeamLeadCategoryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamLeadCategoryOut:
    category = db.query(TeamLeadCategory).filter(TeamLeadCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    updates = data.model_dump(exclude_unset=True)
    old_name = category.name
    new_name = updates.get("name")
    if new_name and new_name != old_name:
        duplicate = (
            db.query(TeamLeadCategory)
            .filter(TeamLeadCategory.name == new_name, TeamLeadCategory.id != category_id)
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=400, detail="Category already exists")
    for field, value in updates.items():
        setattr(category, field, value)
    if new_name and new_name != old_name:
        db.query(TeamLead).filter(TeamLead.status == old_name).update(
            {TeamLead.status: new_name}, synchronize_session=False
        )
    db.commit()
    db.refresh(category)
    await publish_event({"type": "team_lead_categories_updated"})
    return TeamLeadCategoryOut.model_validate(category)


@app.delete("/team-lead-categories/{category_id}")
async def delete_team_lead_category(
    category_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    category = db.query(TeamLeadCategory).filter(TeamLeadCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    leads_with_category = (
        db.query(TeamLead).filter(TeamLead.status == category.name).count()
    )
    if leads_with_category:
        raise HTTPException(
            status_code=400,
            detail="Impossible de supprimer une catégorie utilisée par un chef d'équipe.",
        )
    db.delete(category)
    db.commit()
    await publish_event({"type": "team_lead_categories_updated"})
    return {"status": "deleted"}


@app.post("/team-leads", response_model=TeamLeadOut)
async def create_team_lead(
    data: TeamLeadIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> TeamLeadOut:
    lead = TeamLead(
        team_name=data.team_name,
        leader_first_name=data.leader_first_name,
        leader_last_name=data.leader_last_name,
        phone=data.phone,
        status=data.status,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    await publish_event({"type": "team_leads_updated"})
    return TeamLeadOut.model_validate(lead)


@app.patch("/team-leads/{lead_id}", response_model=TeamLeadOut)
async def update_team_lead(
    lead_id: int,
    data: TeamLeadUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamLeadOut:
    lead = db.query(TeamLead).filter(TeamLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Team lead not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(lead, field, value)
    db.commit()
    db.refresh(lead)
    await publish_event({"type": "team_leads_updated"})
    return TeamLeadOut.model_validate(lead)


@app.delete("/team-leads/{lead_id}")
async def delete_team_lead(
    lead_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    lead = db.query(TeamLead).filter(TeamLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Team lead not found")
    db.delete(lead)
    db.commit()
    await publish_event({"type": "team_leads_updated"})
    return {"status": "deleted"}


@app.get("/users", response_model=List[UserOut], dependencies=[Depends(require_role(Role.ADMIN))])
def list_users(db: Session = Depends(get_db)) -> List[UserOut]:
    users = db.query(User).order_by(User.username).all()
    return [UserOut.model_validate(user) for user in users]


@app.post("/users", response_model=UserOut, dependencies=[Depends(require_role(Role.ADMIN))])
def create_user(data: UserCreate, db: Session = Depends(get_db)) -> UserOut:
    existing = db.query(User).filter(User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    user = User(
        username=data.username,
        password_hash=auth_service.hash_password(data.password),
        role=data.role,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@app.patch(
    "/users/{user_id}", response_model=UserOut, dependencies=[Depends(require_role(Role.ADMIN))]
)
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db)) -> UserOut:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.role is not None:
        user.role = data.role
    if data.must_change_password is not None:
        user.must_change_password = data.must_change_password
    if data.password:
        user.password_hash = auth_service.hash_password(data.password)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@app.get(
    "/settings/ovh",
    response_model=OvhSettingsOut,
    dependencies=[Depends(require_role(Role.ADMIN))],
)
def get_ovh_settings(db: Session = Depends(get_db)) -> OvhSettingsOut:
    settings_row = db.query(OvhSettings).first()
    if not settings_row:
        settings_row = OvhSettings()
        db.add(settings_row)
        db.commit()
        db.refresh(settings_row)
    return OvhSettingsOut.model_validate(settings_row)


@app.put(
    "/settings/ovh",
    response_model=OvhSettingsOut,
    dependencies=[Depends(require_role(Role.ADMIN))],
)
def update_ovh_settings(data: OvhSettingsIn, db: Session = Depends(get_db)) -> OvhSettingsOut:
    settings_row = db.query(OvhSettings).first()
    if not settings_row:
        settings_row = OvhSettings()
        db.add(settings_row)
    for field, value in data.model_dump().items():
        setattr(settings_row, field, value)
    settings_row.last_error = None
    db.commit()
    db.refresh(settings_row)
    return OvhSettingsOut.model_validate(settings_row)


@app.post(
    "/settings/ovh/test",
    dependencies=[Depends(require_role(Role.ADMIN))],
)
def test_ovh_settings(db: Session = Depends(get_db)) -> dict:
    from app.ovh_client import OVHClient

    logs: list[str] = []

    def log(message: str) -> None:
        logs.append(message)

    log("Démarrage du test de connexion OVH.")
    settings_row = get_settings(db)
    if not settings_row:
        log("Aucun paramétrage OVH trouvé en base.")
        raise HTTPException(
            status_code=400,
            detail={"message": "Settings not configured", "logs": logs},
        )
    missing_fields = [
        field
        for field in ("billing_account", "app_key", "app_secret", "consumer_key")
        if not getattr(settings_row, field)
    ]
    if missing_fields:
        log(f"Champs manquants: {', '.join(missing_fields)}")
        settings_row.last_error = f"Missing OVH settings: {', '.join(missing_fields)}"
        db.commit()
        raise HTTPException(
            status_code=400,
            detail={
                "message": f"Missing OVH settings: {', '.join(missing_fields)}",
                "logs": logs,
            },
        )
    try:
        log(f"Endpoint OVH: {settings.ovh_endpoint}")
        log(f"Billing account: {settings_row.billing_account}")
        log(
            "Services: "
            + (settings_row.service_names or "(aucun service spécifié)")
        )
        client = OVHClient(settings_row, settings.ovh_endpoint)
        log("Client OVH initialisé.")
        log("Vérification des identifiants via /me.")
        client.get_me()
        log("Réponse /me reçue.")
        log("Récupération des consommations téléphonie.")
        client.list_consumption_ids()
        log("Liste des consommations récupérée.")
        settings_row.last_error = None
        db.commit()
        return {"status": "ok", "logs": logs}
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        log(f"Erreur: {message}")
        settings_row.last_error = message
        db.commit()
        raise HTTPException(
            status_code=400,
            detail={"message": message, "logs": logs},
        ) from exc


@app.post("/sync/debug", dependencies=[Depends(require_role(Role.ADMIN))])
async def debug_sync(
    days: Optional[int] = Query(None, ge=1, le=90),
    mode: str = Query("dry_run"),
    db: Session = Depends(get_db),
) -> dict:
    from app.ovh_client import OVHClient

    logs: list[str] = []

    def log(message: str) -> None:
        logs.append(message)

    log("Démarrage du diagnostic de synchronisation.")
    if mode not in {"dry_run", "force_sync"}:
        log(f"Mode invalide reçu: {mode}")
        raise HTTPException(
            status_code=400,
            detail={"message": "Invalid mode", "logs": logs},
        )
    settings_row = get_settings(db)
    if not settings_row:
        log("Aucun paramétrage OVH trouvé en base.")
        raise HTTPException(
            status_code=400,
            detail={"message": "Settings not configured", "logs": logs},
        )
    missing_fields = [
        field
        for field in ("billing_account", "app_key", "app_secret", "consumer_key")
        if not getattr(settings_row, field)
    ]
    if missing_fields:
        log(f"Champs manquants: {', '.join(missing_fields)}")
        settings_row.last_error = f"Missing OVH settings: {', '.join(missing_fields)}"
        db.commit()
        raise HTTPException(
            status_code=400,
            detail={
                "message": f"Missing OVH settings: {', '.join(missing_fields)}",
                "logs": logs,
            },
        )
    try:
        range_start, range_end, reason = get_sync_range(settings_row, range_days=days)
        db_count = (
            db.query(func.count(CallRecord.id))
            .filter(CallRecord.started_at >= range_start, CallRecord.started_at <= range_end)
            .scalar()
            or 0
        )
        db_missed_count = (
            db.query(func.count(CallRecord.id))
            .filter(
                CallRecord.started_at >= range_start,
                CallRecord.started_at <= range_end,
                CallRecord.is_missed.is_(True),
            )
            .scalar()
            or 0
        )
        log(
            "Fenêtre de synchronisation "
            f"({reason}): {range_start.isoformat()} → {range_end.isoformat()}"
        )
        log(f"Appels en base sur la fenêtre: {db_count}")
        log(f"Manqués en base sur la fenêtre: {db_missed_count}")
        if settings_row.last_sync_at:
            log(f"Dernière synchro en base: {settings_row.last_sync_at.isoformat()}")
        else:
            log("Aucune date de synchro en base.")
        if days is not None:
            log(f"Override de période: {days} jours")
        log(f"Endpoint OVH: {settings.ovh_endpoint}")
        log(f"Billing account: {settings_row.billing_account}")
        log(f"Services configurés: {settings_row.service_names or '(aucun)'}")

        client = OVHClient(settings_row, settings.ovh_endpoint)
        log("Client OVH initialisé.")
        log("Test des identifiants /me.")
        client.get_me()
        log("Réponse /me OK.")
        if not settings_row.service_names:
            services = client.list_services()
            log(f"Services détectés: {len(services)}")
        consumptions = client.list_consumptions(range_start, range_end)
        log(f"Consommations trouvées: {len(consumptions)}")

        summary = {
            "consumption_count": len(consumptions),
            "range_start": range_start.isoformat(),
            "range_end": range_end.isoformat(),
            "db_count": db_count,
            "db_missed_count": db_missed_count,
        }
        if consumptions:
            ids = [consumption_id for _, consumption_id in consumptions]
            existing_ids = {
                row[0]
                for row in db.query(CallRecord.ovh_consumption_id)
                .filter(CallRecord.ovh_consumption_id.in_(ids))
                .all()
            }
            new_ids = [cid for cid in ids if cid not in existing_ids]
            log(f"Déjà en base: {len(existing_ids)}")
            log(f"Nouveaux potentiels: {len(new_ids)}")
            summary["existing_count"] = len(existing_ids)
            summary["new_count"] = len(new_ids)
            service_map = {}
            for service_name, consumption_id in consumptions:
                service_map.setdefault(consumption_id, service_name)
            for sample_id in new_ids[:3]:
                service_name = service_map.get(sample_id)
                log(f"Exemple nouveau ID: {sample_id} (service {service_name})")
                try:
                    detail = client.get_consumption_detail(service_name, sample_id)
                    log(
                        "Détail: "
                        f"statut={extract_status(detail)}, "
                        f"durée={detail.get('duration')}, "
                        f"date={detail.get('creationDatetime') or detail.get('startDate')}"
                    )
                except Exception as exc:
                    log(f"Erreur lecture détail {sample_id}: {type(exc).__name__}: {exc}")
        else:
            log("Aucune consommation trouvée sur la période.")

        if mode == "force_sync":
            log("Lancement d'une synchronisation forcée.")

            async def debug_publish(payload: dict) -> None:
                log(f"Événement: {payload.get('type')}")

            new_count = await sync_consumptions(db, debug_publish, range_days=days)
            summary["sync_new_count"] = new_count
            log(f"Synchronisation forcée terminée. Nouveaux: {new_count}")
        return {"status": "ok", "logs": logs, "summary": summary}
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        log(f"Erreur: {message}")
        settings_row.last_error = message
        db.commit()
        raise HTTPException(
            status_code=400,
            detail={"message": message, "logs": logs},
        ) from exc


@app.post("/sync", dependencies=[Depends(require_role(Role.ADMIN))])
async def trigger_sync() -> dict:
    await queue.put("sync")
    return {"status": "queued"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return
    try:
        payload = auth_service.decode_token(token)
    except JWTError:
        await websocket.close(code=1008)
        return
    username = payload.get("sub")
    if not username:
        await websocket.close(code=1008)
        return
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            await websocket.close(code=1008)
            return
    finally:
        db.close()
    await websocket.accept()
    pubsub = redis_client.pubsub() if redis_client else None
    if pubsub:
        await pubsub.subscribe("events")
    try:
        while True:
            if pubsub:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message.get("data"):
                    await websocket.send_text(message["data"])
            await asyncio.sleep(0.2)
    except WebSocketDisconnect:
        if pubsub:
            await pubsub.unsubscribe("events")
            await pubsub.close()


app.mount("/", StaticFiles(directory="/app/static", html=True), name="static")


@app.get("/")
def index() -> HTMLResponse:
    return FileResponse("/app/static/index.html")
