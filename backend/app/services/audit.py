from sqlalchemy.orm import Session
from app.models import AuditLog


def log_event(db: Session, action: str, status: str, message: str = "", user_id: int | None = None, metadata: dict | None = None) -> None:
    entry = AuditLog(
        user_id=user_id,
        action=action,
        status=status,
        message=message,
        metadata=metadata or {},
    )
    db.add(entry)
    db.commit()
