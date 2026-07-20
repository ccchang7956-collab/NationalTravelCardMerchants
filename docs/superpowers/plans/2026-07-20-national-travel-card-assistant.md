# 國民旅遊卡個人助手 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為國民旅遊卡特約商店平台實作會員系統、觀光旅遊與自行運用雙額度統計助手、刷卡記帳明細，以及商店愛心收藏功能。

**Architecture:** 後端採用 FastAPI + SQLite（`merchants.db`）擴充 `users`, `user_expenses`, `user_favorites` 資料表，使用 bcrypt 與 JWT 進行身分驗證；前端採用 Next.js 15 React Context（`AuthContext`）維護登入狀態，建立 `/dashboard` 主頁面、記帳對話框與全站商店愛心連動。

**Tech Stack:** FastAPI, Python `pyjwt`, `passlib[bcrypt]`, SQLite, Pytest, Next.js 15, React, Tailwind CSS, Lucide Icons.

## Global Constraints

- Python dependencies: `pyjwt>=2.8.0`, `passlib[bcrypt]>=1.7.4`, `bcrypt>=4.0.0`
- Quota defaults: 觀光旅遊額度 8,000 元，自行運用額度 8,000 元
- JWT Expiry: 7 天 (604800 秒)
- All user data must be isolated by `user_id` authenticated via JWT token.

---

### Task 1: Backend Dependencies & DB Schema Migration

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/database.py`
- Modify: `backend/models.py`
- Test: `backend/tests/test_database.py`

**Interfaces:**
- Consumes: Existing SQLite connection `get_db` in `backend/database.py`.
- Produces: `init_db()` creates `users`, `user_expenses`, `user_favorites` tables; Pydantic models `UserCreate`, `UserLogin`, `UserResponse`, `Token`, `ExpenseCreate`, `ExpenseResponse`, `QuotaSummary`, `AssistantSummary`.

- [ ] **Step 1: Write failing test for database table initialization**

Create `backend/tests/test_database.py`:

```python
import sqlite3
import pytest
from backend.database import init_db

def test_init_db_creates_user_tables():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    init_db(conn)
    
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = {row["name"] for row in cursor.fetchall()}
    
    assert "users" in tables
    assert "user_expenses" in tables
    assert "user_favorites" in tables
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_database.py`
Expected: FAIL with missing tables.

- [ ] **Step 3: Update requirements.txt, database.py and models.py**

Modify `backend/requirements.txt`:
```
fastapi>=0.100.0
uvicorn>=0.20.0
pymupdf>=1.23.0
httpx>=0.24.0
pytest>=7.0.0
pyjwt>=2.8.0
passlib[bcrypt]>=1.7.4
bcrypt>=4.0.0
```

Modify `backend/database.py`:
```python
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "merchants.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db(conn: sqlite3.Connection = None):
    close_after = False
    if conn is None:
        conn = sqlite3.connect(DB_PATH)
        close_after = True
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        hashed_password TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        merchant_id INTEGER,
        merchant_name TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount > 0),
        category TEXT NOT NULL CHECK (category IN ('觀光旅遊', '自行運用')),
        expense_date TEXT NOT NULL,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE SET NULL
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_expenses_user ON user_expenses(user_id);")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        merchant_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
        UNIQUE(user_id, merchant_id)
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_id);")

    conn.commit()
    if close_after:
        conn.close()
```

Modify `backend/models.py`: append Pydantic models:
```python
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=1)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    name: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class ExpenseCreate(BaseModel):
    merchant_id: Optional[int] = None
    merchant_name: str
    amount: int = Field(..., gt=0)
    category: str = Field(..., pattern="^(觀光旅遊|自行運用)$")
    expense_date: str
    note: Optional[str] = None

class ExpenseResponse(BaseModel):
    id: int
    user_id: int
    merchant_id: Optional[int] = None
    merchant_name: str
    amount: int
    category: str
    expense_date: str
    note: Optional[str] = None
    created_at: str

class QuotaDetail(BaseModel):
    target: int = 8000
    spent: int
    remaining: int
    percentage: float

class AssistantSummary(BaseModel):
    tourist_quota: QuotaDetail
    general_quota: QuotaDetail
    total_spent: int
    favorites_count: int
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_database.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/database.py backend/models.py backend/tests/test_database.py
git commit -m "feat: add user auth and assistant database schemas & models"
```

---

### Task 2: Backend Auth Router (`backend/routers/auth.py`)

**Files:**
- Create: `backend/auth_utils.py`
- Create: `backend/routers/auth.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `get_db` from `backend.database`, `UserCreate`, `UserLogin`, `Token`, `UserResponse` from `backend.models`.
- Produces: `get_current_user` FastAPI dependency, `/api/auth/register`, `/api/auth/login`, `/api/auth/me`.

- [ ] **Step 1: Write failing test for auth router**

Create `backend/tests/test_auth.py`:

```python
import sqlite3
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_db, init_db

@pytest.fixture
def client(tmp_path):
    db_file = str(tmp_path / "test.db")
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    init_db(conn)
    conn.close()

    def _get_test_db():
        c = sqlite3.connect(db_file)
        c.row_factory = sqlite3.Row
        try:
            yield c
        finally:
            c.close()

    app.dependency_overrides[get_db] = _get_test_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

def test_register_login_me_flow(client):
    # Register
    res = client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "password123",
        "name": "Test User"
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "test@example.com"
    token = data["access_token"]

    # Duplicate register
    res_dup = client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "password123",
        "name": "Test User 2"
    })
    assert res_dup.status_code == 400

    # Login
    res_login = client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": "password123"
    })
    assert res_login.status_code == 200

    # Login wrong password
    res_wrong = client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": "wrongpassword"
    })
    assert res_wrong.status_code == 401

    # Me endpoint
    res_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res_me.status_code == 200
    assert res_me.json()["email"] == "test@example.com"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_auth.py`
Expected: FAIL (routes not found).

- [ ] **Step 3: Implement auth_utils.py and routers/auth.py**

Create `backend/auth_utils.py`:
```python
import jwt
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import sqlite3
from backend.database import get_db

SECRET_KEY = "national-travel-card-secret-key-change-in-prod"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(user_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
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
```

Create `backend/routers/auth.py`:
```python
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
```

Register auth router in `backend/main.py` and call `init_db()` on startup:
Add:
```python
from backend.routers import merchants, auth
from backend.database import init_db

# Initialize database schema tables on startup
init_db()

app.include_router(auth.router, prefix="/api", tags=["auth"])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_auth.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/auth_utils.py backend/routers/auth.py backend/main.py backend/tests/test_auth.py
git commit -m "feat: add user authentication router and JWT token handling"
```

---

### Task 3: Backend Assistant Router (`backend/routers/assistant.py`)

**Files:**
- Create: `backend/routers/assistant.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_assistant.py`

**Interfaces:**
- Consumes: `get_current_user` dependency, `get_db`, models `ExpenseCreate`, `ExpenseResponse`, `AssistantSummary`.
- Produces: `/api/assistant/summary`, `/api/assistant/expenses`, `/api/assistant/favorites`.

- [ ] **Step 1: Write failing test for assistant router**

Create `backend/tests/test_assistant.py`:

```python
import sqlite3
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_db, init_db

@pytest.fixture
def client_with_user(tmp_path):
    db_file = str(tmp_path / "test_assistant.db")
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    init_db(conn)
    cursor = conn.cursor()
    cursor.execute("INSERT INTO merchants (id, name, address, zip_code, tax_id) VALUES (101, '測試特約店', '台北市中山區', '104', '12345678')")
    conn.commit()
    conn.close()

    def _get_test_db():
        c = sqlite3.connect(db_file)
        c.row_factory = sqlite3.Row
        try:
            yield c
        finally:
            c.close()

    app.dependency_overrides[get_db] = _get_test_db
    with TestClient(app) as test_client:
        reg = test_client.post("/api/auth/register", json={
            "email": "user@example.com",
            "password": "password123",
            "name": "User 1"
        })
        token = reg.json()["access_token"]
        yield test_client, token
    app.dependency_overrides.clear()

def test_expenses_and_summary_flow(client_with_user):
    client, token = client_with_user
    headers = {"Authorization": f"Bearer {token}"}

    # Summary initially 0
    res_sum = client.get("/api/assistant/summary", headers=headers)
    assert res_sum.status_code == 200
    assert res_sum.json()["tourist_quota"]["spent"] == 0

    # Add Tourist Expense
    res_exp1 = client.post("/api/assistant/expenses", headers=headers, json={
        "merchant_id": 101,
        "merchant_name": "測試特約店",
        "amount": 3000,
        "category": "觀光旅遊",
        "expense_date": "2026-07-20",
        "note": "飯店住宿"
    })
    assert res_exp1.status_code == 200
    exp1_id = res_exp1.json()["id"]

    # Add General Expense
    res_exp2 = client.post("/api/assistant/expenses", headers=headers, json={
        "merchant_name": "一般商店",
        "amount": 2000,
        "category": "自行運用",
        "expense_date": "2026-07-21"
    })
    assert res_exp2.status_code == 200

    # Check Summary updated
    res_sum2 = client.get("/api/assistant/summary", headers=headers)
    data = res_sum2.json()
    assert data["tourist_quota"]["spent"] == 3000
    assert data["tourist_quota"]["remaining"] == 5000
    assert data["general_quota"]["spent"] == 2000
    assert data["total_spent"] == 5000

    # Add Favorite
    res_fav = client.post("/api/assistant/favorites/101", headers=headers)
    assert res_fav.status_code == 200

    # Check Favorite List & IDs
    res_favs = client.get("/api/assistant/favorites", headers=headers)
    assert len(res_favs.json()) == 1
    assert res_favs.json()[0]["id"] == 101

    res_ids = client.get("/api/assistant/favorites/ids", headers=headers)
    assert res_ids.json() == [101]

    # Delete Expense
    res_del = client.delete(f"/api/assistant/expenses/{exp1_id}", headers=headers)
    assert res_del.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_assistant.py`
Expected: FAIL (endpoints not found).

- [ ] **Step 3: Implement backend/routers/assistant.py**

Create `backend/routers/assistant.py`:
```python
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
import sqlite3
from backend.database import get_db
from backend.models import ExpenseCreate, ExpenseResponse, AssistantSummary, QuotaDetail, MerchantListItem
from backend.auth_utils import get_current_user

router = APIRouter()

@router.get("/assistant/summary", response_model=AssistantSummary)
def get_assistant_summary(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    user_id = current_user["id"]
    cursor = db.cursor()

    cursor.execute("""
        SELECT category, SUM(amount) as total
        FROM user_expenses
        WHERE user_id = ?
        GROUP BY category
    """, (user_id,))
    rows = cursor.fetchall()
    
    tourist_spent = 0
    general_spent = 0
    for row in rows:
        if row["category"] == "觀光旅遊":
            tourist_spent = row["total"] or 0
        elif row["category"] == "自行運用":
            general_spent = row["total"] or 0

    cursor.execute("SELECT COUNT(*) FROM user_favorites WHERE user_id = ?", (user_id,))
    favorites_count = cursor.fetchone()[0]

    tourist_target = 8000
    general_target = 8000

    return {
        "tourist_quota": {
            "target": tourist_target,
            "spent": tourist_spent,
            "remaining": max(0, tourist_target - tourist_spent),
            "percentage": round(min(100.0, (tourist_spent / tourist_target) * 100), 2)
        },
        "general_quota": {
            "target": general_target,
            "spent": general_spent,
            "remaining": max(0, general_target - general_spent),
            "percentage": round(min(100.0, (general_spent / general_target) * 100), 2)
        },
        "total_spent": tourist_spent + general_spent,
        "favorites_count": favorites_count
    }

@router.get("/assistant/expenses", response_model=List[ExpenseResponse])
def get_expenses(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("""
        SELECT id, user_id, merchant_id, merchant_name, amount, category, expense_date, note, created_at
        FROM user_expenses
        WHERE user_id = ?
        ORDER BY expense_date DESC, id DESC
    """, (current_user["id"],))
    return [dict(row) for row in cursor.fetchall()]

@router.post("/assistant/expenses", response_model=ExpenseResponse)
def create_expense(
    expense_in: ExpenseCreate,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO user_expenses (user_id, merchant_id, merchant_name, amount, category, expense_date, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        current_user["id"],
        expense_in.merchant_id,
        expense_in.merchant_name,
        expense_in.amount,
        expense_in.category,
        expense_in.expense_date,
        expense_in.note
    ))
    db.commit()
    expense_id = cursor.lastrowid

    cursor.execute("SELECT * FROM user_expenses WHERE id = ?", (expense_id,))
    return dict(cursor.fetchone())

@router.delete("/assistant/expenses/{expense_id}")
def delete_expense(
    expense_id: int,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("DELETE FROM user_expenses WHERE id = ? AND user_id = ?", (expense_id, current_user["id"]))
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Expense item not found")
    db.commit()
    return {"message": "Expense deleted successfully"}

@router.get("/assistant/favorites", response_model=List[MerchantListItem])
def get_favorites(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("""
        SELECT m.* FROM merchants m
        JOIN user_favorites f ON m.id = f.merchant_id
        WHERE f.user_id = ?
        ORDER BY f.created_at DESC
    """, (current_user["id"],))
    return [dict(row) for row in cursor.fetchall()]

@router.get("/assistant/favorites/ids", response_model=List[int])
def get_favorite_ids(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("SELECT merchant_id FROM user_favorites WHERE user_id = ?", (current_user["id"],))
    return [row["merchant_id"] for row in cursor.fetchall()]

@router.post("/assistant/favorites/{merchant_id}")
def add_favorite(
    merchant_id: int,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("SELECT id FROM merchants WHERE id = ?", (merchant_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Merchant not found")

    try:
        cursor.execute(
            "INSERT INTO user_favorites (user_id, merchant_id) VALUES (?, ?)",
            (current_user["id"], merchant_id)
        )
        db.commit()
    except sqlite3.IntegrityError:
        pass # Already favorited
    return {"message": "Merchant favorited successfully"}

@router.delete("/assistant/favorites/{merchant_id}")
def remove_favorite(
    merchant_id: int,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("DELETE FROM user_favorites WHERE user_id = ? AND merchant_id = ?", (current_user["id"], merchant_id))
    db.commit()
    return {"message": "Merchant unfavorited successfully"}
```

Include `assistant` router in `backend/main.py`:
```python
from backend.routers import merchants, auth, assistant

app.include_router(assistant.router, prefix="/api", tags=["assistant"])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_assistant.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/assistant.py backend/main.py backend/tests/test_assistant.py
git commit -m "feat: add assistant router for quotas, expenses and favorites"
```

---

### Task 4: Frontend Auth Context & API Helpers (`frontend/src/`)

**Files:**
- Create: `frontend/src/utils/api.ts`
- Create: `frontend/src/context/AuthContext.tsx`
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Consumes: Backend `/api/auth/*` and `/api/assistant/*`.
- Produces: `useAuth()` hook providing `user`, `token`, `login`, `register`, `logout`, `favoriteIds`, `toggleFavorite`.

- [ ] **Step 1: Create frontend/src/utils/api.ts**

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ntc_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ntc_token');
    }
  }
  return res;
}
```

- [ ] **Step 2: Create frontend/src/context/AuthContext.tsx**

```tsx
'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchWithAuth } from '@/utils/api';

export interface User {
  id: number;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  favoriteIds: number[];
  refreshFavorites: () => Promise<void>;
  toggleFavorite: (merchantId: number) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  login: () => {},
  logout: () => {},
  favoriteIds: [],
  refreshFavorites: async () => {},
  toggleFavorite: async () => false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);

  const refreshFavorites = async () => {
    const t = localStorage.getItem('ntc_token');
    if (!t) {
      setFavoriteIds([]);
      return;
    }
    try {
      const res = await fetchWithAuth('/api/assistant/favorites/ids');
      if (res.ok) {
        const data = await res.json();
        setFavoriteIds(data);
      }
    } catch {
      // ignore error
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('ntc_token');
    if (storedToken) {
      setToken(storedToken);
      fetchWithAuth('/api/auth/me')
        .then((res) => (res.ok ? res.json() : null))
        .then((userData) => {
          if (userData) {
            setUser(userData);
            refreshFavorites();
          } else {
            localStorage.removeItem('ntc_token');
            setToken(null);
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('ntc_token', newToken);
    setToken(newToken);
    setUser(newUser);
    refreshFavorites();
  };

  const logout = () => {
    localStorage.removeItem('ntc_token');
    setToken(null);
    setUser(null);
    setFavoriteIds([]);
  };

  const toggleFavorite = async (merchantId: number): Promise<boolean> => {
    if (!user) return false;
    const isFav = favoriteIds.includes(merchantId);
    const method = isFav ? 'DELETE' : 'POST';
    const res = await fetchWithAuth(`/api/assistant/favorites/${merchantId}`, { method });
    if (res.ok) {
      if (isFav) {
        setFavoriteIds((prev) => prev.filter((id) => id !== merchantId));
      } else {
        setFavoriteIds((prev) => [...prev, merchantId]);
      }
      return true;
    }
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        favoriteIds,
        refreshFavorites,
        toggleFavorite,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
```

- [ ] **Step 3: Wrap layout.tsx with AuthProvider**

Modify `frontend/src/app/layout.tsx`:
Import `AuthProvider` from `@/context/AuthContext` and wrap `{children}` inside `<body><AuthProvider>{children}</AuthProvider></body>`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/api.ts frontend/src/context/AuthContext.tsx frontend/src/app/layout.tsx
git commit -m "feat: add frontend auth context and API helpers"
```

---

### Task 5: Auth Modals, Navbar Integration & Merchant Card Action Buttons

**Files:**
- Create: `frontend/src/components/AuthModal.tsx`
- Create: `frontend/src/components/AddExpenseModal.tsx`
- Modify: `frontend/src/components/Navbar.tsx`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/merchant/[id]/page.tsx`

**Interfaces:**
- Consumes: `useAuth()` hook.
- Produces: Interactive login/register dialogs, favorite hearts on cards, quick expense logging.

- [ ] **Step 1: Create AuthModal.tsx**

Create `frontend/src/components/AuthModal.tsx` with tabs for Login and Register, form inputs for Email, Password, and Name, calling `/api/auth/login` and `/api/auth/register` via `fetchWithAuth` and `login(data.access_token, data.user)`.

- [ ] **Step 2: Create AddExpenseModal.tsx**

Create `frontend/src/components/AddExpenseModal.tsx` taking optional default `merchant_id` and `merchant_name`, amount, category dropdown ("觀光旅遊" | "自行運用"), expense_date (defaults to today `YYYY-MM-DD`), and note. Calls `POST /api/assistant/expenses`.

- [ ] **Step 3: Update Navbar.tsx**

Update `frontend/src/components/Navbar.tsx` to include Login/Register button when `user` is null, or User Avatar with link to `/dashboard` (國旅卡助手) and Logout button when logged in.

- [ ] **Step 4: Add Favorite and Quick Expense buttons on Merchant list items and Detail Page**

Modify `frontend/src/app/page.tsx` and `frontend/src/app/merchant/[id]/page.tsx` to render heart icon (filled red if `favoriteIds.includes(merchant.id)`) and "記帳" button.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AuthModal.tsx frontend/src/components/AddExpenseModal.tsx frontend/src/components/Navbar.tsx frontend/src/app/page.tsx frontend/src/app/merchant/[id]/page.tsx
git commit -m "feat: integrate auth modal, navbar user status, favorite hearts & quick expense modals"
```

---

### Task 6: Frontend Dashboard Page (`frontend/src/app/dashboard/page.tsx`)

**Files:**
- Create: `frontend/src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `/api/assistant/summary`, `/api/assistant/expenses`, `/api/assistant/favorites`, `useAuth()`.
- Produces: Responsive Dashboard UI with 2 quota progress bars, expense history table, and favorited merchants grid/map.

- [ ] **Step 1: Implement frontend/src/app/dashboard/page.tsx**

Create `/dashboard/page.tsx` with:
1. Quota Summary Cards (觀光旅遊: 8,000 元 progress bar, 自行運用: 8,000 元 progress bar).
2. Tab switcher: "💳 記帳明細" vs "❤️ 我的收藏".
3. Expenses section: summary cards, add expense button, expense history table with category badges, amounts, dates, and delete action.
4. Favorites section: list of favorited stores with direct link to details and unfavorite button.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/dashboard/page.tsx
git commit -m "feat: add user dashboard page for travel card quotas, expenses and favorites"
```

---

### Task 7: End-to-End Verification & Build Checks

**Files:**
- None (verification phase)

- [ ] **Step 1: Run backend pytest suite**

Run: `pytest backend/tests/`
Expected: 100% PASS across all backend tests.

- [ ] **Step 2: Run frontend linter and build**

Run: `cd frontend && npm run lint && npm run build`
Expected: Zero build errors or TypeScript failures.

- [ ] **Step 3: Commit final verification status**

```bash
git commit --allow-empty -m "chore: verify National Travel Card Assistant feature complete and tests passing"
```
