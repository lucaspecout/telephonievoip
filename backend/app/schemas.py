from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models import Role, CallDirection


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserCreate(BaseModel):
    username: str
    password: str
    role: Role


class UserUpdate(BaseModel):
    role: Optional[Role] = None
    must_change_password: Optional[bool] = None


class UserOut(BaseModel):
    id: int
    username: str
    role: Role
    must_change_password: bool

    class Config:
        from_attributes = True


class MeResponse(UserOut):
    pass


class OvhSettingsIn(BaseModel):
    billing_account: Optional[str] = None
    service_names: Optional[str] = None
    app_key: Optional[str] = None
    app_secret: Optional[str] = None
    consumer_key: Optional[str] = None


class OvhSettingsOut(OvhSettingsIn):
    last_sync_at: Optional[datetime] = None
    last_error: Optional[str] = None

    class Config:
        from_attributes = True


class CallRecordOut(BaseModel):
    id: int
    ovh_consumption_id: str
    started_at: datetime
    direction: CallDirection
    calling_number: Optional[str]
    called_number: Optional[str]
    duration: int
    status: Optional[str]
    is_missed: bool

    class Config:
        from_attributes = True


class DashboardSummary(BaseModel):
    today_total: int
    today_missed: int
    week_total: int
    week_missed: int


class TimeseriesPoint(BaseModel):
    date: str
    total: int
    missed: int
