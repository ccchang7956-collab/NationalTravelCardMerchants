import math
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.services.route_optimizer import optimize_route, haversine_distance, _extract_coord
from backend.routers.merchants import haversine, parse_search_query

client = TestClient(app)

# ── 1. Lat = 0.0 and Equator Coordinates ─────────────────────────────────────

def test_lat_zero_haversine_direct():
    """Verify haversine distance calculations at lat=0.0 and lon=0.0."""
    dist_zero = haversine_distance(0.0, 0.0, 0.0, 0.0)
    assert dist_zero == 0.0

    dist_1deg_lon = haversine_distance(0.0, 0.0, 0.0, 1.0)
    assert math.isclose(dist_1deg_lon, 111.19, abs_tol=1.0)

    dist_1deg_lat = haversine_distance(0.0, 0.0, 1.0, 0.0)
    assert math.isclose(dist_1deg_lat, 111.19, abs_tol=1.0)

    dist_merchants_func = haversine(0.0, 0.0, 0.0, 1.0)
    assert math.isclose(dist_merchants_func, 111.19, abs_tol=1.0)


def test_extract_coord_zero_and_falsy():
    """Verify _extract_coord properly handles 0.0 as float vs None / empty / invalid."""
    assert _extract_coord({"lat": 0.0}, "lat") == 0.0
    assert _extract_coord({"lat": 0}, "lat") == 0.0
    assert _extract_coord({"lat": "0.0"}, "lat") == 0.0
    assert _extract_coord({"lat": None}, "lat") == 0.0
    assert _extract_coord({"lat": "invalid"}, "lat") == 0.0
    assert _extract_coord({}, "lat") == 0.0
    assert _extract_coord(None, "lat") == 0.0


def test_route_optimizer_equator_points():
    """Verify route optimization with points at lat=0.0."""
    pts = [
        {"id": "A", "lat": 0.0, "lon": 0.0},
        {"id": "B", "lat": 0.0, "lon": 2.0},
        {"id": "C", "lat": 0.0, "lon": 1.0},
    ]
    res = optimize_route(pts)
    assert len(res["points"]) == 3
    assert math.isclose(res["total_distance_km"], 222.38, abs_tol=5.0)


def test_api_nearby_lat_zero():
    """Verify /merchants/nearby endpoint with lat=0.0, lon=0.0."""
    resp = client.get("/api/merchants/nearby?lat=0.0&lon=0.0&radius_km=10.0")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# ── 2. Haversine Float Overflow / Underflow / Domain Boundary ────────────────

def test_haversine_extreme_precision():
    """Verify clamping handles floating point precision issues near identical or antipodal coordinates."""
    # Identical points
    assert haversine_distance(25.041300000000001, 121.5226, 25.041300000000001, 121.5226) == 0.0
    assert haversine(25.041300000000001, 121.5226, 25.041300000000001, 121.5226) == 0.0

    # Antipodal points (exact opposite sides of Earth)
    dist_anti = haversine_distance(90.0, 0.0, -90.0, 0.0)
    assert math.isclose(dist_anti, 20015.08, abs_tol=10.0)

    dist_anti2 = haversine(0.0, 0.0, 0.0, 180.0)
    assert math.isclose(dist_anti2, 20015.08, abs_tol=10.0)

    # Near antipodal points causing potential float precision > 1.0 in `a`
    dist_near_anti = haversine_distance(89.999999999999, 179.999999999999, -89.999999999999, -0.000000000001)
    assert isinstance(dist_near_anti, float)
    assert not math.isnan(dist_near_anti)


def test_haversine_nan_and_inf_inputs():
    """Verify haversine function handles NaN and Infinity inputs gracefully without crashing."""
    assert haversine(float("nan"), 121.5, 25.0, 121.5) == 0.0
    assert haversine(25.0, float("inf"), 25.0, 121.5) == 0.0
    assert haversine_distance(float("nan"), 121.5, 25.0, 121.5) == 0.0
    assert haversine_distance(25.0, float("-inf"), 25.0, 121.5) == 0.0


# ── 3. FTS Search Edge Cases & Special Punctuation ───────────────────────────

def test_parse_search_query_adversarial():
    """Verify parse_search_query produces safe FTS queries without syntax errors."""
    adversarial_inputs = [
        "SELECT * FROM merchants",
        "DROP TABLE merchants; --",
        "'; DROP TABLE merchants; --",
        '"" OR 1=1 --',
        "***:::---'''\"\"\"()",
        "NEAR/5 (foo BAR)",
        "台北市！@＃＄％＾＆＊（）——＋",
        "A" * 5000, # Long input
        "   ",
        "\t\n\r",
        "100%&+=test",
        "AND OR NOT NEAR MATCH ESCAPE",
        "\"\"\"'''::--**",
        "7-11 : 門市 (信義店)",
        "路易'莎"
    ]
    for inp in adversarial_inputs:
        parsed = parse_search_query(inp)
        if parsed is not None:
            assert isinstance(parsed, str)


def test_api_search_adversarial_queries():
    """Verify /merchants endpoint under heavy adversarial search inputs."""
    adversarial_queries = [
        "DROP TABLE merchants;",
        "1' OR '1'='1",
        "***:::---",
        "()",
        "[]{}",
        "\\\\\\",
        "NEAR/5",
        "MATCH",
        "AND OR NOT",
        "台北市123!@#$%^&*()_+~`",
        "台",
        "7-11 : 門市",
        "路易'莎"
    ]
    for q in adversarial_queries:
        resp = client.get(f"/api/merchants?q={q}")
        assert resp.status_code == 200, f"Query '{q}' failed with status {resp.status_code}"
        data = resp.json()
        assert "items" in data
        assert "total" in data


# ── 4. Pole Coordinates & Boundary Validation ────────────────────────────────

def test_api_nearby_poles_extreme():
    """Verify /merchants/nearby at exact poles and boundary longitudes."""
    poles = [
        {"lat": 90.0, "lon": 0.0},
        {"lat": -90.0, "lon": 0.0},
        {"lat": 90.0, "lon": 180.0},
        {"lat": -90.0, "lon": -180.0},
        {"lat": 0.0, "lon": 180.0},
        {"lat": 0.0, "lon": -180.0},
        {"lat": 89.999999, "lon": 45.0},
        {"lat": -89.999999, "lon": -45.0},
    ]
    for p in poles:
        resp = client.get(f"/api/merchants/nearby?lat={p['lat']}&lon={p['lon']}&radius_km=20.0")
        assert resp.status_code == 200, f"Pole check failed for {p}: {resp.status_code}"
        assert isinstance(resp.json(), list)


def test_api_nearby_out_of_bounds_validation():
    """Verify out of bounds latitude and longitude return HTTP 400 Bad Request."""
    invalid_cases = [
        {"lat": 90.0001, "lon": 0.0},
        {"lat": -90.0001, "lon": 0.0},
        {"lat": 0.0, "lon": 180.0001},
        {"lat": 0.0, "lon": -180.0001},
        {"lat": 999.0, "lon": 0.0},
        {"lat": 0.0, "lon": -999.0},
    ]
    for c in invalid_cases:
        resp = client.get(f"/api/merchants/nearby?lat={c['lat']}&lon={c['lon']}")
        assert resp.status_code == 400, f"Expected 400 for {c}, got {resp.status_code}"
        assert resp.json()["detail"] is not None


def test_api_nearby_nan_inf_validation():
    """Verify NaN and Infinity inputs return HTTP 400 or 422 Bad Request."""
    for val in ["nan", "NaN", "NAN", "inf", "-inf", "Infinity", "-Infinity"]:
        resp_lat = client.get(f"/api/merchants/nearby?lat={val}&lon=0.0")
        assert resp_lat.status_code in [400, 422], f"Expected 400/422 for lat={val}, got {resp_lat.status_code}"

        resp_lon = client.get(f"/api/merchants/nearby?lat=0.0&lon={val}")
        assert resp_lon.status_code in [400, 422], f"Expected 400/422 for lon={val}, got {resp_lon.status_code}"
