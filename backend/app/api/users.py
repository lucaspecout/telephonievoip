from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.core.security import hash_password
from app.models import User
from app.schemas import UserBase, UserCreate, UserUpdate, ResetPasswordRequest
from app.services.audit import log_event

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserBase)
def get_me(user: User = Depends(get_current_user)):
    return user


@router.post("", response_model=UserBase)
def create_user(payload: UserCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    user = User(
        username=payload.username,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    log_event(db, "create_user", "success", user_id=admin.id, metadata={"username": user.username})
    return user


@router.get("", response_model=list[UserBase])
def list_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return db.query(User).all()


@router.patch("/{user_id}", response_model=UserBase)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.role is not None:
        user.role = payload.role
    if payload.must_change_password is not None:
        user.must_change_password = payload.must_change_password
    db.commit()
    log_event(db, "update_user", "success", user_id=admin.id, metadata={"target": user.username})
    return user


@router.post("/{user_id}/reset-password")
def reset_password(user_id: int, payload: ResetPasswordRequest, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = hash_password(payload.new_password)
    user.must_change_password = True
    db.commit()
    log_event(db, "reset_password", "success", user_id=admin.id, metadata={"target": user.username})
    return {"status": "ok"}


@router.post("/me/change-password")
def change_password(payload: ResetPasswordRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    user.hashed_password = hash_password(payload.new_password)
    user.must_change_password = False
    db.commit()
    log_event(db, "change_password", "success", user_id=user.id)
    return {"status": "ok"}
