from fastapi import FastAPI
from app.core.config import settings
from app.api import auth, users, settings as ovh_settings, calls, dashboard, health
from fastapi import Depends
from app.core.deps import get_current_user
from app.models import User
from app.schemas import UserBase

app = FastAPI(title=settings.app_name)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(ovh_settings.router)
app.include_router(calls.router)
app.include_router(dashboard.router)
app.include_router(health.router)


@app.get("/me", response_model=UserBase)
def me(user: User = Depends(get_current_user)):
    return user
