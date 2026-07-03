from datetime import datetime, timedelta
from jose import jwt, JWTError
import bcrypt
from sqlalchemy.orm import Session
from app.models import User
from app.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def get_user_from_token(token: str, db: Session) -> User | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None
    return db.query(User).filter(User.id == user_id).first()
