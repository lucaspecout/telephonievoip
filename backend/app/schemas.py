from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=150)
    password: str = Field(min_length=5, max_length=128)


class UserBase(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    must_change_password: bool

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=150)
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(pattern="^(ADMIN|OPERATEUR)$")


class UserUpdate(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[str] = Field(default=None, pattern="^(ADMIN|OPERATEUR)$")
    must_change_password: Optional[bool] = None


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


class OVHSettingsPayload(BaseModel):
    billing_account: str
    service_names: List[str]
    app_key: str
    app_secret: str
    consumer_key: str
    monitored_numbers: List[str]


class OVHSettingsResponse(OVHSettingsPayload):
    id: int

    class Config:
        from_attributes = True


class CallRecordOut(BaseModel):
    id: int
    timestamp: datetime
    direction: str
    calling_number: Optional[str]
    called_number: Optional[str]
    duration: int
    status: Optional[str]
    nature: Optional[str]
    is_missed: bool

    class Config:
        from_attributes = True


class PaginatedCalls(BaseModel):
    items: List[CallRecordOut]
    total: int
    page: int
    page_size: int


class DashboardSummary(BaseModel):
    total_incoming: int
    total_missed: int
    total_last_7_days: int
    total_duration_seconds: int


class TimeseriesPoint(BaseModel):
    date: str
    total: int
    missed: int


class TimeseriesResponse(BaseModel):
    range: str
    points: List[TimeseriesPoint]
