from fastapi import APIRouter, Depends, HTTPException, status
import sqlite3
from backend.database import get_db
from backend.models import UserCreate, UserLogin, Token, UserResponse
from backend.auth_utils import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter()

@router.post("/auth/register", response_model=Token)
def register(user_in: UserCreate, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT id FROM users WHERE email = ?", (user_in.email,))
    if cursor.fetchone():
        raise HTTPException(status_code=400, detail="Email is already registered")
    
    hashed_pwd = hash_password(user_in.password)
    cursor.execute(
        "INSERT INTO users (email, hashed_password, name) VALUES (?, ?, ?)",
        (user_in.email, hashed_pwd, user_in.name)
    )
    db.commit()
    user_id = cursor.lastrowid
    token = create_access_token(user_id, user_in.email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user_id, "email": user_in.email, "name": user_in.name}
    }

@router.post("/auth/login", response_model=Token)
def login(user_in: UserLogin, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT id, email, hashed_password, name FROM users WHERE email = ?", (user_in.email,))
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
