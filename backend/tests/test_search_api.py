import pytest
import sqlite3
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_db

# 建立測試資料庫
@pytest.fixture(name="db_conn")
def fixture_db_conn():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
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
        CREATE VIRTUAL TABLE merchants_fts USING fts5(
            name,
            address,
            content='merchants',
            content_rowid='id',
            tokenize='trigram'
        )
    """)
    
    # 寫入測試商店
    test_merchants = [
        (1, "台北大安咖啡店", "台北市大安區新生南路1段", "106", "11111111", "example1.com", 25.0339, 121.5645),
        (2, "高雄大安咖啡店", "高雄市苓雅區五福路", "802", "22222222", "example2.com", 22.6273, 120.3014),
        (3, "彰化大飯店", "彰化縣彰化市中山路", "500", "33333333", None, 24.0800, 120.5378)
    ]
    conn.executemany(
        "INSERT INTO merchants VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        test_merchants
    )
    conn.execute("INSERT INTO merchants_fts(merchants_fts) VALUES('rebuild')")
    conn.commit()
    
    yield conn
    conn.close()

def test_get_merchants_hybrid_search(db_conn):
    # 覆寫 FastAPI 的 DB 依賴為測試記憶體連線
    def override_get_db():
        try:
            yield db_conn
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    
    # 1. 測試長關鍵字 (使用 FTS)
    response = client.get("/api/merchants?q=咖啡店")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert any("台北大安咖啡店" in item["name"] for item in data["items"])
    
    # 2. 測試混合關鍵字 (FTS + LIKE)
    response = client.get("/api/merchants?q=台北 咖啡店")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "台北大安咖啡店"
    
    # 3. 測試短關鍵字 (Fallback LIKE)
    response = client.get("/api/merchants?q=彰化")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "彰化大飯店"

    # 清理依賴覆寫
    app.dependency_overrides.clear()

def test_get_nearby_merchants_hybrid_search(db_conn):
    # 覆寫 FastAPI 的 DB 依賴為測試記憶體連線
    def override_get_db():
        try:
            yield db_conn
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    
    # 1. 測試長關鍵字 (使用 FTS)
    response = client.get("/api/merchants/nearby?lat=25.03&lon=121.56&radius_km=5&q=咖啡店")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "台北大安咖啡店"

    # 2. 測試混合關鍵字 (FTS + LIKE)
    response = client.get("/api/merchants/nearby?lat=25.03&lon=121.56&radius_km=5&q=台北 咖啡店")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "台北大安咖啡店"
    
    # 3. 測試短關鍵字 (Fallback LIKE)
    response = client.get("/api/merchants/nearby?lat=24.08&lon=120.53&radius_km=5&q=彰化")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "彰化大飯店"

    # 清理依賴覆寫
    app.dependency_overrides.clear()
