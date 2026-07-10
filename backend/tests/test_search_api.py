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
        CREATE TABLE merchant_industries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tax_id TEXT NOT NULL,
            industry_code TEXT NOT NULL,
            industry_name TEXT NOT NULL,
            priority INTEGER NOT NULL,
            FOREIGN KEY(tax_id) REFERENCES merchants(tax_id) ON DELETE CASCADE
        )
    """)
    conn.execute("CREATE INDEX idx_merchant_industries_tax_id ON merchant_industries(tax_id)")
    conn.execute("CREATE INDEX idx_merchant_industries_code ON merchant_industries(industry_code)")
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
    conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)", ("11111111", "561115", "餐館業", 1))
    conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)", ("11111111", "561116", "飲料店業", 2))
    conn.execute("INSERT INTO merchants_fts(merchants_fts) VALUES('rebuild')")
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

def test_get_merchants_hybrid_search():
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

    # 4. 測試超短關鍵字 (Fallback LIKE) - 1字詞 "彰" 走 LIKE
    response = client.get("/api/merchants?q=彰")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "彰化大飯店"

def test_get_nearby_merchants_hybrid_search():
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

    # 4. 測試超短關鍵字 (Fallback LIKE) - 1字詞 "彰" 走 LIKE
    response = client.get("/api/merchants/nearby?lat=24.08&lon=120.53&radius_km=5&q=彰")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "彰化大飯店"

def test_get_stats():
    client = TestClient(app)
    response = client.get("/api/stats")
    assert response.status_code == 200
    data = response.json()
    assert "total_merchants" in data
    assert "has_website" in data
    assert "cities" in data
    # 我們的測試資料包含：台北市、高雄市、彰化縣
    cities = data["cities"]
    assert len(cities) == 3
    city_names = [c["city"] for c in cities]
    assert "台北市" in city_names
    assert "高雄市" in city_names
    assert "彰化縣" in city_names


def test_get_merchant_by_id_includes_industries(db_conn):
    client = TestClient(app)
    response = client.get("/api/merchants/11111111")
    assert response.status_code == 200
    data = response.json()
    assert "industries" in data
    assert len(data["industries"]) == 2
    assert data["industries"][0]["industry_name"] == "餐館業"
    assert data["industries"][0]["priority"] == 1
    assert data["industries"][1]["industry_name"] == "飲料店業"
    assert data["industries"][1]["priority"] == 2

