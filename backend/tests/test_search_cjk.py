"""CJK 搜尋回歸測試：查詢側必須命中生產索引。

背景：生產 FTS 索引由 scheduler/update_data.space_segment 建立（CJK 逐字
token），查詢側 parse_search_query 曾經整詞包 phrase，導致多字中文
（牛肉麵、台北）永遠 0 筆。此檔用生產側分詞種 FTS，斷言查詢命中，
兩側再分叉會立刻變紅。
"""
import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import get_db
from backend.services.search_service import parse_search_query
from scheduler.update_data import space_segment as prod_segment


def test_parse_search_query_cjk_splits_chars():
    assert parse_search_query("牛肉麵") == '"牛" AND "肉" AND "麵"'
    assert parse_search_query("台北") == '"台" AND "北"'
    # ASCII 維持整詞 phrase
    assert parse_search_query("hotel") == '"hotel"'
    # 混合：ASCII 整詞 + CJK 逐字
    assert parse_search_query("ABC牛肉麵") == '"ABC" AND "牛" AND "肉" AND "麵"'
    # 空/標點 → None（呼叫端回空結果而非全表）
    assert parse_search_query("!!!") is None
    assert parse_search_query("") is None


@pytest.fixture(name="prod_db")
def fixture_prod_db():
    """用生產側分詞（逐字）種 FTS，模擬線上 DB。"""
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
        CREATE VIRTUAL TABLE merchants_fts USING fts5(
            name, address, tokenize="unicode61"
        )
    """)
    rows = [
        (1, "台北牛肉麵大王", "台北市大安區新生南路1段", "106", "11111111", None, 25.0339, 121.5645),
        (2, "高雄牛肉麵老店", "高雄市苓雅區五福路", "802", "22222222", None, 22.6273, 120.3014),
        (3, "彰化大飯店", "彰化縣彰化市中山路", "500", "33333333", None, 24.0800, 120.5378),
    ]
    conn.executemany("INSERT INTO merchants VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows)
    for m_id, name, address, *_ in rows:
        conn.execute(
            "INSERT INTO merchants_fts (rowid, name, address) VALUES (?, ?, ?)",
            (m_id, prod_segment(name), prod_segment(address)),
        )
    conn.commit()
    yield conn
    conn.close()


@pytest.fixture(autouse=True)
def override_prod_db(prod_db):
    def _db():
        yield prod_db

    app.dependency_overrides[get_db] = _db
    yield
    app.dependency_overrides.clear()


def test_cjk_multi_char_hits_prod_index():
    client = TestClient(app)
    r = client.get("/api/merchants", params={"q": "牛肉麵"})
    assert r.status_code == 200
    assert r.json()["total"] == 2

    r = client.get("/api/merchants", params={"q": "台北"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "台北牛肉麵大王"


def test_city_traditional_char_normalized():
    client = TestClient(app)
    simplified = client.get("/api/merchants", params={"city": "台北市", "per_page": 1})
    traditional = client.get("/api/merchants", params={"city": "臺北市", "per_page": 1})
    assert simplified.status_code == 200 and traditional.status_code == 200
    assert traditional.json()["total"] == simplified.json()["total"] > 0
