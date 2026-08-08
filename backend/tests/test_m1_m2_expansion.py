import sqlite3
import pytest
import math
from fastapi.testclient import TestClient
from backend.main import app
from scheduler.update_data import normalize_tax_id, transactional_sync_db
from backend.database import init_db
from backend.services.route_optimizer import optimize_route, haversine_distance, _extract_coord
from backend.routers.merchants import parse_search_query

client = TestClient(app)

# ── M1 Expansion Tests ─────────────────────────────────────────────────────────

def test_normalize_tax_id_full_width_space():
    """Verify \u3000 (CHAR 12288) and ascii spaces are stripped properly."""
    assert normalize_tax_id("1234\u30005678") == "12345678"
    assert normalize_tax_id("  \u3000 87654321 \u3000 ") == "87654321"
    assert normalize_tax_id("\u3000\u3000") is None
    assert normalize_tax_id("") is None
    assert normalize_tax_id(None) is None

def test_transactional_sync_preserves_user_tables_and_filters_orphan_fk(tmp_path):
    """Verify transactional_sync_db preserves users table and ignores orphan industry tax_ids."""
    db_file = str(tmp_path / "test_sync_m1.db")
    conn = sqlite3.connect(db_file)
    conn.execute("PRAGMA foreign_keys = ON;")
    init_db(conn)
    
    # Insert user data
    conn.execute("INSERT INTO users (email, hashed_password, name) VALUES ('user1@example.com', 'hash123', 'User One')")
    conn.commit()
    conn.close()

    # Perform transactional sync with valid merchants and one orphan industry
    temp_db_file = str(tmp_path / "temp_sync_source.db")
    temp_conn = sqlite3.connect(temp_db_file)
    temp_conn.row_factory = sqlite3.Row
    temp_conn.execute("""
        CREATE TABLE merchants (
            id INTEGER PRIMARY KEY,
            name TEXT,
            address TEXT,
            zip_code TEXT,
            tax_id TEXT,
            website TEXT,
            lat REAL,
            lon REAL
        )
    """)
    temp_conn.execute("""
        CREATE TABLE merchant_industries (
            id INTEGER PRIMARY KEY,
            tax_id TEXT,
            industry_code TEXT,
            industry_name TEXT,
            priority INTEGER
        )
    """)
    # Merchant with tax_id 11112222
    temp_conn.execute("INSERT INTO merchants (name, address, zip_code, tax_id, website, lat, lon) VALUES ('測試商家', '台北市中山區', '104', '11112222\u3000', 'https://example.com', 25.0, 121.5)")
    # Valid industry FK
    temp_conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES ('11112222', 'IND01', '餐飲業', 1)")
    # Orphan industry FK (tax_id 99999999 does not exist in merchants)
    temp_conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES ('99999999\u3000', 'IND02', '零售業', 1)")
    temp_conn.commit()
    temp_conn.close()

    # Sync into target DB
    transactional_sync_db(temp_db_file, db_file)

    # Verify target DB state
    res_conn = sqlite3.connect(db_file)
    res_conn.row_factory = sqlite3.Row

    # User table intact
    user = res_conn.execute("SELECT * FROM users WHERE email = 'user1@example.com'").fetchone()
    assert user is not None
    assert user["name"] == "User One"

    # Merchant normalized tax_id
    m = res_conn.execute("SELECT * FROM merchants WHERE tax_id = '11112222'").fetchone()
    assert m is not None

    # Orphan industry filtered out, valid industry kept
    ind_rows = res_conn.execute("SELECT * FROM merchant_industries").fetchall()
    assert len(ind_rows) == 1
    assert ind_rows[0]["tax_id"] == "11112222"
    res_conn.close()


# ── M2 Expansion Tests ─────────────────────────────────────────────────────────

def test_route_optimizer_lat_zero_validity():
    """Verify lat=0.0 coordinate is treated as valid number, not falsy/missing."""
    pt0 = {"id": 1, "lat": 0.0, "lon": 0.0}
    pt1 = {"id": 2, "lat": 0.0, "lon": 1.0}
    
    assert _extract_coord(pt0, "lat") == 0.0
    assert _extract_coord(pt0, "lon") == 0.0
    
    route_res = optimize_route([pt0, pt1])
    assert len(route_res["points"]) == 2
    assert route_res["total_distance_km"] > 100.0

def test_haversine_clamped_acos_extreme_precision():
    """Verify haversine distance clamping for exact opposite or identical points."""
    # Identical points
    assert haversine_distance(25.0413, 121.5226, 25.0413, 121.5226) == 0.0
    
    # Antipodal points
    d_anti = haversine_distance(90.0, 0.0, -90.0, 0.0)
    assert math.isclose(d_anti, 20015.08, abs_tol=10.0)

def test_fts_query_fullwidth_and_special_punctuation():
    """Verify parse_search_query safely handles fullwidth spaces, quotes, and punctuation."""
    q1 = parse_search_query("台北\u3000美食")
    assert q1 is not None
    assert "台北" in q1 and "美食" in q1

    q2 = parse_search_query(':::*** "NOT A VALID SQL"')
    # Should not cause exception and produce safe query or None
    assert q2 is None or isinstance(q2, str)

def test_polar_and_boundary_coordinates_api():
    """Verify nearby search endpoint handles extreme polar and boundary coordinates without crashing."""
    r_north = client.get("/api/merchants/nearby?lat=90.0&lon=0.0&radius_km=10.0")
    assert r_north.status_code == 200
    
    r_south = client.get("/api/merchants/nearby?lat=-90.0&lon=0.0&radius_km=10.0")
    assert r_south.status_code == 200

    r_dateline = client.get("/api/merchants/nearby?lat=0.0&lon=180.0&radius_km=10.0")
    assert r_dateline.status_code == 200
