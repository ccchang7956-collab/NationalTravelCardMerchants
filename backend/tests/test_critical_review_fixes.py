"""Critical review fixes - Task1 backend correctness (TDD RED)."""
import math
import sqlite3

from fastapi.testclient import TestClient

from backend.routers.merchants import haversine
from backend.main import app
from backend.database import get_db


def _make_conn():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # minimal schema for merchants endpoints used here
    conn.execute("""CREATE TABLE merchants (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        address TEXT, zip_code TEXT, tax_id TEXT, website TEXT, lat REAL, lon REAL)""")
    conn.execute("""CREATE VIRTUAL TABLE merchants_fts USING fts5(name, address, tokenize="unicode61")""")
    conn.execute("""CREATE TABLE merchant_industries (
        id INTEGER PRIMARY KEY AUTOINCREMENT, tax_id TEXT NOT NULL,
        industry_code TEXT NOT NULL, industry_name TEXT NOT NULL, priority INTEGER NOT NULL)""")
    conn.execute("CREATE TABLE merchant_tax_ids (tax_id TEXT PRIMARY KEY)")
    return conn


def test_haversine_missing_returns_inf():
    assert math.isinf(haversine(25.0, 121.0, None, 121.0))
    assert math.isinf(haversine(None, None, None, None))
    assert math.isinf(haversine(25.0, 121.0, float("nan"), 121.0))


def test_nearby_excludes_lon_null_and_handles_response_none():
    # lon NULL row must never appear, even though lat is valid
    conn = _make_conn()
    conn.execute("INSERT INTO merchants (name,address,tax_id,lat,lon) VALUES (?,?,?,?,?)",
                 ("OK店", "台北市中正區", "11111111", 25.0339, 121.5645))
    conn.execute("INSERT INTO merchants (name,address,tax_id,lat,lon) VALUES (?,?,?,?,?)",
                 ("壞座標店", "台北市中正區", "22222222", 25.0339, None))
    conn.commit()

    def _db():
        yield conn
    app.dependency_overrides[get_db] = _db
    try:
        client = TestClient(app)
        r = client.get("/api/merchants/nearby", params={"lat": 25.0339, "lon": 121.5645, "radius_km": 5})
        assert r.status_code == 200
        names = [m["name"] for m in r.json()]
        assert "OK店" in names
        assert "壞座標店" not in names

        # direct call with response=None and unparsable q must not AttributeError
        from backend.routers.merchants import get_nearby_merchants
        result = get_nearby_merchants(lat=25.0339, lon=121.5645, radius_km=2.0,
                                      q="!!!", city=None, has_website=None,
                                      industry_code=None, limit=100, offset=0,
                                      db=conn, response=None)
        assert result == []
    finally:
        app.dependency_overrides.clear()
        conn.close()


def test_tax_id_duplicate_deterministic():
    conn = _make_conn()
    conn.execute("INSERT INTO merchants (id,name,address,tax_id) VALUES (101,?,?,?)",
                 ("North", "台北市", "12345678"))
    conn.execute("INSERT INTO merchants (id,name,address,tax_id) VALUES (102,?,?,?)",
                 ("South", "高雄市", "12345678"))
    conn.commit()

    def _db():
        yield conn
    app.dependency_overrides[get_db] = _db
    try:
        client = TestClient(app)
        r1 = client.get("/api/merchants/12345678")
        r2 = client.get("/api/merchants/12345678")
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["id"] == 101
        assert r2.json()["id"] == 101
    finally:
        app.dependency_overrides.clear()
        conn.close()


def test_stats_normalizes_tai_variant():
    conn = _make_conn()
    conn.execute("INSERT INTO merchants (name,address) VALUES (?,?)", ("A", "台北市中正區"))
    conn.execute("INSERT INTO merchants (name,address) VALUES (?,?)", ("B", "臺北市大安區"))
    conn.commit()

    def _db():
        yield conn
    app.dependency_overrides[get_db] = _db
    try:
        client = TestClient(app)
        r = client.get("/api/stats")
        assert r.status_code == 200
        cities = {c["city"]: c["count"] for c in r.json()["cities"]}
        assert cities.get("台北市") == 2
        assert "其他" not in cities
    finally:
        app.dependency_overrides.clear()
        conn.close()


def test_get_merchant_locked_db_returns_503():
    class LockedConn:
        def cursor(self):
            raise sqlite3.OperationalError("database is locked")
    def _db():
        yield LockedConn()
    app.dependency_overrides[get_db] = _db
    try:
        client = TestClient(app, raise_server_exceptions=False)
        r = client.get("/api/merchants/101")
        assert r.status_code == 503
    finally:
        app.dependency_overrides.clear()


def test_merchants_page_upper_bound():
    conn = _make_conn()
    def _db():
        yield conn
    app.dependency_overrides[get_db] = _db
    try:
        client = TestClient(app)
        r = client.get("/api/merchants", params={"page": 20000})
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()
        conn.close()
