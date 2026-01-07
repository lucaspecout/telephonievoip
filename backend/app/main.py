from fastapi import FastAPI
import secrets
from app.core.config import settings
from app.api import auth, users, settings as ovh_settings, calls, dashboard, health
from fastapi import Depends
from app.core.database import Base, SessionLocal, engine
from app.core.deps import get_current_user
from app.core.security import hash_password
from app.models import User
from app.schemas import UserBase
from pathlib import Path
from starlette.staticfiles import StaticFiles

app = FastAPI(title=settings.app_name)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(ovh_settings.router)
app.include_router(calls.router)
app.include_router(dashboard.router)
app.include_router(health.router)

STATIC_DIR = Path(__file__).resolve().parent / "static"
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


def ensure_default_admin() -> None:
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == "admin").first()
        if existing:
            return
        generated_password = secrets.token_urlsafe(12)
        user = User(
            username="admin",
            hashed_password=hash_password(generated_password),
            role="ADMIN",
            must_change_password=True,
        )
        db.add(user)
        db.commit()
        print(f"Default admin created. Username: admin Password: {generated_password}")
    finally:
        db.close()


@app.on_event("startup")
def startup_event() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_default_admin()


@app.get("/me", response_model=UserBase)
def me(user: User = Depends(get_current_user)):
    return user
