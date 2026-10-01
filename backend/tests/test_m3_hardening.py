"""Task 3 (M3 hardening) TDD tests — Backend 安全與正確性.

Covers: industry LIKE escaping, stable paging, merchant id/tax routing,
db timeout/rollback.

TDD: these tests FAIL on pre-fix code, PASS after the fix.

Note (2026-10): auth/itinerary/assistant 已移除（純公開站），
JWT/行程原子性/optimize 相關測試一併刪除。
"""
import inspect
import sqlite3

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
    """)
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
    def _db():
        yield m3_conn

    app.dependency_overrides[get_db] = _db
    yield
    app.dependency_overrides.clear()


def _client():
    return TestClient(app, raise_server_exceptions=False)


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
