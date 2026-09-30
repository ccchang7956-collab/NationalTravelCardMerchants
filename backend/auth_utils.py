import bcrypt

# Passlib compatibility shim for bcrypt >= 4.0.0:
# 1. `__about__` attribute was removed in bcrypt 4; passlib reads it for
#    version detection, so restore it.
# 2. passlib's backend self-test (`detect_wrap_bug`) hashes a >72B probe
#    secret; bcrypt>=4 raises ValueError instead of wrapping, which would
#    break backend init. Truncate here ONLY for that internal probe path.
# Public API enforces the 72B limit explicitly (fail-fast, no silent
# truncation): see hash_password / verify_password below.
if not hasattr(bcrypt, "__about__"):
    bcrypt.__about__ = type("about", (), {"__version__": getattr(bcrypt, "__version__", "4.0.0")})

_orig_hashpw = bcrypt.hashpw
def _safe_hashpw(password, salt):
    if isinstance(password, bytes) and len(password) > 72:
        password = password[:72]
    elif isinstance(password, str) and len(password.encode("utf-8")) > 72:
        password = password.encode("utf-8")[:72]
    return _orig_hashpw(password, salt)

bcrypt.hashpw = _safe_hashpw

import os
import jwt
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import sqlite3
from backend.database import get_db

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY must be set in production")
ALGORITHM = "HS256"

MAX_PASSWORD_BYTES = 72

try:
    ACCESS_TOKEN_EXPIRE_HOURS = float(os.environ.get("JWT_EXPIRE_HOURS", "24"))
except (ValueError, TypeError):
    ACCESS_TOKEN_EXPIRE_HOURS = 24.0

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

def hash_password(password: str) -> str:
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError("Password too long (max 72 bytes)")
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if len(plain_password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        return False
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(user_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {"sub": str(user_id), "email": email, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: sqlite3.Connection = Depends(get_db)
) -> dict:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (jwt.PyJWTError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token"
        )
    
    cursor = db.cursor()
    cursor.execute("SELECT id, email, name FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return dict(user)
