import pytest
import sqlite3
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_db
from backend.routers.merchants import space_segment


# 建立測試資料庫（沿用 test_search_api.py 結構）
@pytest.fixture(name="db_conn")
def fixture_db_conn():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE merchants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT,
            zip_code TEXT,
            tax_id TEXT UNIQUE,
            website TEXT,
            lat REAL,
            lon REAL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS merchant_industries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tax_id TEXT NOT NULL,
            industry_code TEXT NOT NULL,
            industry_name TEXT NOT NULL,
            priority INTEGER NOT NULL,
            FOREIGN KEY(tax_id) REFERENCES merchants(tax_id) ON DELETE CASCADE
        )
    """)
    conn.execute("""
        CREATE VIRTUAL TABLE merchants_fts USING fts5(
            name,
            address,
            tokenize="unicode61"
        )
    """)
    conn.execute(
        "INSERT INTO merchants VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (1, "台北測試店", "台北市信義區路一段", "110", "99999999", None, 25.03, 121.56),
    )
    conn.execute(
        "INSERT INTO merchants_fts (rowid, name, address) VALUES (?, ?, ?)",
        (1, space_segment("台北測試店"), space_segment("台北市信義區路一段")),
    )
    conn.commit()
    yield conn
    conn.close()


@pytest.fixture(autouse=True)
def override_db(db_conn):
    def override_get_db():
        yield db_conn
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()


def test_stats_includes_last_updated_key():
    """GET /api/stats 含 last_updated（允許 null 但 key 必存在）。"""
    client = TestClient(app)
    response = client.get("/api/stats")
    assert response.status_code == 200
    data = response.json()
    assert "last_updated" in data
    assert "total_merchants" in data
    assert "has_website" in data
    assert "cities" in data
