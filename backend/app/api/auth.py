from datetime import datetime, timezone
import hashlib
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token, verify_password, decode_token
from app.models import RefreshToken, User
from app.schemas import LoginRequest, TokenPair, RefreshRequest, LogoutRequest
from app.services.audit import log_event
from app.services.rate_limit import RateLimiter

router = APIRouter(prefix="/auth", tags=["auth"])
rate_limiter = RateLimiter()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/login", response_model=TokenPair)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    client_key = request.client.host if request.client else payload.username
    if not rate_limiter.hit(client_key):
        log_event(db, "login", "blocked", "rate limited")
        raise HTTPException(status_code=429, detail="Too many attempts")
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        log_event(db, "login", "failed", "invalid credentials", user_id=user.id if user else None)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User inactive")
    access_token = create_access_token(user.username)
    refresh_token, expires_at = create_refresh_token(user.username)
    refresh_entry = RefreshToken(
        user_id=user.id,
        token_hash=_hash_token(refresh_token),
        expires_at=expires_at,
    )
    db.add(refresh_entry)
    db.commit()
    log_event(db, "login", "success", user_id=user.id)
    rate_limiter.reset(client_key)
    return TokenPair(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload_request: RefreshRequest, db: Session = Depends(get_db)):
    payload = decode_token(payload_request.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=400, detail="Invalid refresh token")
    token_hash = _hash_token(payload_request.refresh_token)
    stored = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if not stored or stored.revoked_at or stored.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token expired")
    stored.revoked_at = datetime.now(timezone.utc)
    user = db.query(User).filter(User.username == payload.get("sub")).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    access_token = create_access_token(user.username)
    new_refresh_token, expires_at = create_refresh_token(user.username)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=_hash_token(new_refresh_token),
            expires_at=expires_at,
        )
    )
    db.commit()
    return TokenPair(access_token=access_token, refresh_token=new_refresh_token)


@router.post("/logout")
def logout(payload_request: LogoutRequest, db: Session = Depends(get_db)):
    token_hash = _hash_token(payload_request.refresh_token)
    stored = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if stored:
        stored.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return {"status": "ok"}
