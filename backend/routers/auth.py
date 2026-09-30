from fastapi import APIRouter, Depends, HTTPException, status
import sqlite3
from backend.database import get_db
from backend.models import UserCreate, UserLogin, Token, UserResponse
from backend.auth_utils import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter()

@router.post("/auth/register", response_model=Token)
def register(user_in: UserCreate, db: sqlite3.Connection = Depends(get_db)):
    email_norm = user_in.email.strip().lower()
    cursor = db.cursor()
    cursor.execute("SELECT id FROM users WHERE email = ?", (email_norm,))
    if cursor.fetchone():
        raise HTTPException(status_code=400, detail="Email is already registered")

    try:
        hashed_pwd = hash_password(user_in.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        cursor.execute(
            "INSERT INTO users (email, hashed_password, name) VALUES (?, ?, ?)",
            (email_norm, hashed_pwd, user_in.name)
        )
    except sqlite3.IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Email already registered")
    db.commit()
    user_id = cursor.lastrowid
    token = create_access_token(user_id, email_norm)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user_id, "email": email_norm, "name": user_in.name}
    }

@router.post("/auth/login", response_model=Token)
def login(user_in: UserLogin, db: sqlite3.Connection = Depends(get_db)):
    email_norm = user_in.email.strip().lower()
    cursor = db.cursor()
    cursor.execute("SELECT id, email, hashed_password, name FROM users WHERE email = ?", (email_norm,))
    user = cursor.fetchone()
    if not user or not verify_password(user_in.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    token = create_access_token(user["id"], user["email"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user["id"], "email": user["email"], "name": user["name"]}
    }

@router.get("/auth/me", response_model=UserResponse)
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user
