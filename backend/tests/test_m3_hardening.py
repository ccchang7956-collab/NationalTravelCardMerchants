"""Task 3 (M3 hardening) TDD tests — Backend 安全與正確性.

Covers: JWT guard, itinerary txn atomicity, optimize limits/validation,
industry LIKE escaping, stable paging, merchant id/tax routing, db timeout/rollback.

TDD: these tests FAIL on pre-fix code, PASS after the fix.
"""
import inspect
import os
import pathlib
import sqlite3
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import get_db
from backend.routers.merchants import space_segment


@pytest.fixture()
def m3_conn():
    """Shared in-memory DB (FK ON) seeding users/merchants/industries/fts/itineraries."""
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row
    conn.executescript("""
        CREATE TABLE merchants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT,
            zip_code TEXT,
            tax_id TEXT UNIQUE,
            website TEXT,
            lat REAL,
            lon REAL
        );
        CREATE TABLE merchant_industries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tax_id TEXT NOT NULL,
            industry_code TEXT NOT NULL,
            industry_name TEXT NOT NULL,
            priority INTEGER NOT NULL,
            FOREIGN KEY(tax_id) REFERENCES merchants(tax_id) ON DELETE CASCADE
        );
        CREATE VIRTUAL TABLE merchants_fts USING fts5(name, address, tokenize="unicode61");
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE user_itineraries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            start_date TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        );
        CREATE TABLE itinerary_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itinerary_id INTEGER NOT NULL,
            merchant_id INTEGER,
            custom_name TEXT NOT NULL,
            address TEXT,
            lat REAL,
            lon REAL,
            order_index INTEGER NOT NULL,
            estimated_cost REAL DEFAULT 0,
            quota_category TEXT DEFAULT '一般消費',
            stay_minutes INTEGER DEFAULT 60,
            FOREIGN KEY (itinerary_id) REFERENCES user_itineraries (id) ON DELETE CASCADE,
            FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE SET NULL
        );
    """)
    conn.execute(
        "INSERT INTO users (id, email, hashed_password, name) VALUES (1, 'test@example.com', 'hash', 'Test User')"
    )
    merchants = [
        (1, "台北 Shop A", "台北市大安區新生南路1段", "106", "11111111", None, 25.0339, 121.5645),
        (2, "台北 Shop B", "台北市信義區松仁路2號", "110", "22222222", None, 25.0340, 121.5646),
        (3, "台北 Shop C", "台北市中山區南京東路3段", "104", "33333333", None, 25.0341, 121.5647),
        (4, "台北 Shop D", "台北市萬華區西門町4號", "108", "44444444", None, 25.0342, 121.5648),
        (5, "台北 Shop E", "台北市內湖區瑞光路5號", "114", "AB123", None, 25.0343, 121.5649),
    ]
    conn.executemany("INSERT INTO merchants VALUES (?, ?, ?, ?, ?, ?, ?, ?)", merchants)
    conn.execute(
        "INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority)"
        " VALUES ('11111111', '561115', '餐館業', 1)"
    )
    conn.execute(
        "INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority)"
        " VALUES ('22222222', '551011', '旅館業', 1)"
    )
    for m_id, name, address, *_ in merchants:
        conn.execute(
            "INSERT INTO merchants_fts (rowid, name, address) VALUES (?, ?, ?)",
            (m_id, space_segment(name), space_segment(address)),
        )
    conn.commit()
    yield conn
    conn.close()


@pytest.fixture(autouse=True)
def _override_deps(m3_conn):
    from backend.auth_utils import get_current_user

    def _user():
        return {"id": 1, "username": "testuser"}

    def _db():
        yield m3_conn

    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_db] = _db
    yield
    app.dependency_overrides.clear()


def _client():
    return TestClient(app, raise_server_exceptions=False)


# 1. JWT: 無 env secret 即啟動失敗
def test_jwt_no_default_secret():
    env = dict(os.environ)
    env.pop("JWT_SECRET_KEY", None)
    repo_root = str(pathlib.Path(__file__).resolve().parents[2])
    proc = subprocess.run(
        [sys.executable, "-c", "import backend.auth_utils"],
        cwd=repo_root,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert proc.returncode != 0, "import backend.auth_utils 無 JWT_SECRET_KEY 時應啟動失敗"
    assert "RuntimeError" in proc.stderr
    assert "JWT_SECRET_KEY" in proc.stderr


# 2. itinerary create 原子性：部分 item 非法 -> 整筆 rollback
def test_itinerary_create_atomic():
    client = _client()
    payload = {
        "title": "原子性測試",
        "items": [
            {"custom_name": "合法店", "merchant_id": 1, "estimated_cost": 100},
            {"custom_name": "幽靈店", "merchant_id": 999999, "estimated_cost": 100},
        ],
    }
    res = client.post("/api/itineraries", json=payload)
    assert res.status_code == 500
    res = client.get("/api/itineraries")
    assert res.status_code == 200
    assert res.json() == [], "create 失敗後不應殘留半成品行程"


# 3. itinerary update 原子性：帶非法 item 失敗後舊 items 仍在
def test_itinerary_update_atomic():
    client = _client()
    res = client.post(
        "/api/itineraries",
        json={"title": "原始行程", "items": [{"custom_name": "原始店", "merchant_id": 1}]},
    )
    assert res.status_code == 200
    itin_id = res.json()["id"]

    bad = {
        "title": "被污染的標題",
        "items": [
            {"custom_name": "新店", "merchant_id": 1},
            {"custom_name": "幽靈店", "merchant_id": 999999},
        ],
    }
    res = client.put(f"/api/itineraries/{itin_id}", json=bad)
    assert res.status_code == 500

    res = client.get(f"/api/itineraries/{itin_id}")
    assert res.status_code == 200
    data = res.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["custom_name"] == "原始店"
    assert data["title"] == "原始行程"


# 4. optimize：points 限 1..100，超限 400
def test_optimize_rejects_huge_points():
    client = _client()
    pts = [{"lat": 25.0 + i * 0.0001, "lon": 121.5} for i in range(500)]
    res = client.post("/api/itineraries/optimize", json={"points": pts})
    assert res.status_code == 400
    assert "1..100" in res.json()["detail"]

    res = client.post("/api/itineraries/optimize", json={"points": []})
    assert res.status_code == 400

    ok = [
        {"id": 1, "lat": 25.0339, "lon": 121.5645},
        {"id": 2, "lat": 25.0478, "lon": 121.5170},
    ]
    res = client.post("/api/itineraries/optimize", json={"points": ok})
    assert res.status_code == 200


# 5. optimize：座標範圍驗證 400
def test_optimize_rejects_invalid_coordinate():
    client = _client()
    res = client.post(
        "/api/itineraries/optimize", json={"points": [{"lat": 999.0, "lon": 121.5}]}
    )
    assert res.status_code == 400

    res = client.post(
        "/api/itineraries/optimize", json={"points": [{"lat": 25.0, "lon": 999.0}]}
    )
    assert res.status_code == 400

    res = client.post(
        "/api/itineraries/optimize", json={"points": [{"lon": 121.5}]}
    )
    assert res.status_code == 400


# 6. industry LIKE 跳脫：industry_code="%" 不應回傳全表
def test_industry_like_escape():
    client = _client()
    res = client.get("/api/merchants", params={"industry_code": "%"})
    assert res.status_code == 200
    assert res.json()["total"] == 0

    res = client.get("/api/merchants", params={"industry_code": "_"})
    assert res.status_code == 200
    assert res.json()["total"] == 0

    # regression：正常前綴仍可查到
    res = client.get("/api/merchants", params={"industry_code": "56"})
    assert res.status_code == 200
    assert res.json()["total"] == 1

    # nearby 同樣跳脫
    res = client.get(
        "/api/merchants/nearby",
        params={"lat": 25.0339, "lon": 121.5645, "radius_km": 5, "industry_code": "%"},
    )
    assert res.status_code == 200
    assert res.json() == []


# 7. 分頁穩定：ORDER BY m.id ASC，無重疊
def test_merchants_order_stable():
    import backend.routers.merchants as mmod

    src = inspect.getsource(mmod.get_merchants)
    assert "ORDER BY m.id ASC" in src

    client = _client()
    seen: list[int] = []
    for page in (1, 2, 3):
        res = client.get("/api/merchants", params={"page": page, "per_page": 2})
        assert res.status_code == 200
        seen.extend(i["id"] for i in res.json()["items"])
    assert len(seen) == len(set(seen)) == 5
    assert seen == sorted(seen)


# 8. get_merchant：純數字查 id，否則查 tax_id
def test_get_merchant_numeric_routing():
    import backend.routers.merchants as mmod

    assert "isdigit" in inspect.getsource(mmod.get_merchant)

    client = _client()
    res = client.get("/api/merchants/1")
    assert res.status_code == 200
    assert res.json()["id"] == 1

    # 純數字 tax_id 經 id  miss 後 fallback 仍找得到
    res = client.get("/api/merchants/11111111")
    assert res.status_code == 200
    assert res.json()["tax_id"] == "11111111"

    res = client.get("/api/merchants/AB123")
    assert res.status_code == 200
    assert res.json()["tax_id"] == "AB123"

    res = client.get("/api/merchants/不存在的店")
    assert res.status_code == 404


# 9. database：connect timeout=10 + get_db rollback
def test_database_timeout_and_rollback(tmp_path, monkeypatch):
    import backend.database as dbmod

    assert "timeout=10" in inspect.getsource(dbmod.get_db_connection)
    assert "rollback" in inspect.getsource(dbmod.get_db)

    db_file = str(tmp_path / "rb.db")
    monkeypatch.setattr(dbmod, "DB_PATH", db_file)
    dbmod.init_db()

    gen = dbmod.get_db()
    conn = next(gen)
    conn.execute("INSERT INTO merchants (name) VALUES ('rollback-probe')")
    with pytest.raises(RuntimeError, match="boom"):
        gen.throw(RuntimeError("boom"))

    check = sqlite3.connect(db_file)
    rows = check.execute("SELECT * FROM merchants WHERE name='rollback-probe'").fetchall()
    check.close()
    assert rows == []
