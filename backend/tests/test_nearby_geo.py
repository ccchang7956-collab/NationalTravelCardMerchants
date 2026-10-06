"""Nearby 地理正確性：半徑過濾、距離排序、換日線包裹。

用自建 in-memory 庫（不碰 DB_PATH），FTS 不需要（無 q 時不 JOIN）。
"""
import math
import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import get_db
from scheduler.update_data import zipcode_coords, TAIWAN_ZIPCODES


def _haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


@pytest.fixture(name="geo_db")
def fixture_geo_db():
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
    rows = [
        ("台北A", "台北市", "106", "90000001", None, 25.0339, 121.5645),
        ("台北B", "台北市", "106", "90000002", None, 25.0340, 121.5646),
        ("台北C", "台北市", "106", "90000003", None, 25.0345, 121.5650),
        ("高雄D", "高雄市", "802", "90000004", None, 22.6273, 120.3014),
        ("日界東", "太平洋", None, "90000005", None, 0.0, 179.9),
        ("日界西", "太平洋", None, "90000006", None, 0.0, -179.9),
    ]
    conn.executemany(
        "INSERT INTO merchants (name, address, zip_code, tax_id, website, lat, lon)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        rows,
    )
    conn.commit()
    yield conn
    conn.close()


@pytest.fixture(autouse=True)
def override_geo_db(geo_db):
    def _db():
        yield geo_db

    app.dependency_overrides[get_db] = _db
    yield
    app.dependency_overrides.clear()


def test_nearby_radius_filters_and_sorts():
    client = TestClient(app)
    r = client.get("/api/merchants/nearby", params={"lat": 25.0339, "lon": 121.5645, "radius_km": 5})
    assert r.status_code == 200
    data = r.json()
    assert [m["name"] for m in data] == ["台北A", "台北B", "台北C"]
    dists = [m["distance_km"] for m in data]
    assert dists[0] == 0.0
    assert dists == sorted(dists)


def test_nearby_limit_returns_nearest():
    client = TestClient(app)
    r = client.get("/api/merchants/nearby", params={"lat": 25.0339, "lon": 121.5645, "radius_km": 5, "limit": 1})
    assert r.status_code == 200
    assert [m["name"] for m in r.json()] == ["台北A"]


def test_nearby_pagination_returns_complete_stable_pages_and_counts():
    client = TestClient(app)
    params = {"lat": 25.0339, "lon": 121.5645, "radius_km": 5, "limit": 2}

    first = client.get("/api/merchants/nearby", params={**params, "offset": 0})
    second = client.get("/api/merchants/nearby", params={**params, "offset": 2})
    empty = client.get("/api/merchants/nearby", params={**params, "offset": 4})

    assert first.status_code == second.status_code == empty.status_code == 200
    assert [m["name"] for m in first.json()] == ["台北A", "台北B"]
    assert [m["name"] for m in second.json()] == ["台北C"]
    assert empty.json() == []
    assert first.headers["X-Total-Count"] == second.headers["X-Total-Count"] == "3"
    assert first.headers["X-Has-More"] == "true"
    assert second.headers["X-Has-More"] == "false"


def test_nearby_dateline_wrap():
    client = TestClient(app)
    r = client.get("/api/merchants/nearby", params={"lat": 0.0, "lon": 179.95, "radius_km": 20})
    assert r.status_code == 200
    names = sorted(m["name"] for m in r.json())
    # max_lon 超過 180，-179.9 那側不能被 BETWEEN 漏掉
    assert names == ["日界東", "日界西"]


def test_zipcode_coords_within_radius_and_unknown_none():
    clat, clon, radius = TAIWAN_ZIPCODES["100"]
    lat, lon = zipcode_coords("100")
    assert _haversine(clat, clon, lat, lon) <= radius
    assert zipcode_coords("999") is None
    assert zipcode_coords(None) is None
