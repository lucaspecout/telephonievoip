import typer
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import User

app = typer.Typer()


@app.command()
def create_admin(username: str = "admin", password: str = "admin"):
    db: Session = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            typer.echo("Admin already exists")
            return
        user = User(
            username=username,
            hashed_password=hash_password(password),
            role="ADMIN",
            must_change_password=True,
        )
        db.add(user)
        db.commit()
        typer.echo("Admin created")
    finally:
        db.close()


if __name__ == "__main__":
    app()
