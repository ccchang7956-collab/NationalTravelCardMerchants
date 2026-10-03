import pytest
import sqlite3
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_db
from backend.routers.merchants import space_segment

# 建立測試資料庫
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
    conn.execute("CREATE INDEX idx_merchant_industries_tax_id ON merchant_industries(tax_id)")
    conn.execute("CREATE INDEX idx_merchant_industries_code ON merchant_industries(industry_code)")
    conn.execute("""
        CREATE VIRTUAL TABLE merchants_fts USING fts5(
            name,
            address,
            tokenize="unicode61"
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
    conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)", ("33333333", "551011", "旅館業", 1))
    conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)", ("22222222", "451010", "農產品批發市場經營業", 1))
    
    # 手動將分詞後的資料寫入 merchants_fts，對應 id 欄位
    for m_id, name, address, _, _, _, _, _ in test_merchants:
        conn.execute(
            "INSERT INTO merchants_fts (rowid, name, address) VALUES (?, ?, ?)",
            (m_id, space_segment(name), space_segment(address))
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

def test_empty_punctuation_search_query():
    client = TestClient(app)
    # 輸入純標點符號/無效字元，parse_search_query 回傳 None 時應傳回空結果，而不是全表掃描
    response = client.get("/api/merchants?q=!!!")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []

    response = client.get("/api/merchants/nearby?lat=25.03&lon=121.56&radius_km=5&q=!!!")
    assert response.status_code == 200
    data = response.json()
    assert data == []


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


def test_get_merchant_empty_tax_id(db_conn):
    # 插入一筆 tax_id 為空值（或 None）的商家
    cursor = db_conn.cursor()
    cursor.execute(
        "INSERT INTO merchants (name, address, zip_code, tax_id, website) VALUES (?, ?, ?, ?, ?)",
        ("無統編商店", "台北市信義區路一段", "110", None, None)
    )
    db_conn.commit()
    inserted_id = cursor.lastrowid

    # 模擬 API 呼叫
    client = TestClient(app)
    response = client.get(f"/api/merchants/{inserted_id}")
    assert response.status_code == 200
    data = response.json()
    assert "industries" in data
    assert data["industries"] == []


def test_get_industries_api(db_conn):
    client = TestClient(app)
    response = client.get("/api/industries")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 4
    assert [item["industry_code"] for item in data] == ["451010", "551011", "561115", "561116"]
    accommodation = next(item for item in data if item["industry_code"] == "551011")
    assert accommodation["industry_name"] == "旅館業"
    assert accommodation["industry_group_code"] == "55"
    assert accommodation["industry_group_name"] == "住宿業"


def test_city_filter_range_and_normalization():
    client = TestClient(app)
    # 範圍查詢：前綴命中
    r = client.get("/api/merchants", params={"city": "台北市"})
    assert r.status_code == 200
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["name"] == "台北大安咖啡店"
    # 臺→台正規化（寫入側早有）
    r = client.get("/api/merchants", params={"city": "臺北市"})
    assert r.status_code == 200
    assert r.json()["total"] == 1
    # 範圍寫法天然免疫 LIKE 萬用字元（舊 LIKE 需 ESCAPE，新寫法直接無效）
    assert client.get("/api/merchants", params={"city": "%"}).json()["total"] == 0
    assert client.get("/api/merchants", params={"city": "_"}).json()["total"] == 0


def test_stats_empty_db():
    from backend.database import init_db

    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row
    init_db(conn)

    def _empty_db():
        yield conn

    app.dependency_overrides[get_db] = _empty_db
    try:
        client = TestClient(app)
        r = client.get("/api/stats")
        assert r.status_code == 200
        data = r.json()
        assert data["total_merchants"] == 0
        assert data["has_website"] == 0
        assert data["cities"] == []
    finally:
        conn.close()


def test_merchants_filter_by_industry(db_conn):
    client = TestClient(app)
    # 1. 測試精確子類別代碼 (551011)
    response = client.get("/api/merchants?industry_code=551011")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "彰化大飯店"

    # 2. 測試大類別前綴模糊匹配 (56) - 應該匹配到台北大安咖啡店
    response = client.get("/api/merchants?industry_code=56")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "台北大安咖啡店"

    # 次要行業也可命中，批發大類同時涵蓋 45、46 開頭的分類
    response = client.get("/api/merchants?industry_code=561116")
    assert response.status_code == 200
    assert [item["name"] for item in response.json()["items"]] == ["台北大安咖啡店"]

    response = client.get("/api/merchants?industry_code=45-46")
    assert response.status_code == 200
    assert [item["name"] for item in response.json()["items"]] == ["高雄大安咖啡店"]


def test_nearby_merchants_filter_by_industry(db_conn):
    client = TestClient(app)
    # 搜尋台北 (25.03, 121.56) 附近的商店，半徑 5km，應有台北大安咖啡店
    # 1. 搜尋行業別為 56 (咖啡店/餐飲飲料)
    response = client.get("/api/merchants/nearby?lat=25.03&lon=121.56&radius_km=5&industry_code=56")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "台北大安咖啡店"

    # 2. 搜尋行業別為 55 (旅館)，應該查不到台北大安咖啡店
    response = client.get("/api/merchants/nearby?lat=25.03&lon=121.56&radius_km=5&industry_code=55")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 0


