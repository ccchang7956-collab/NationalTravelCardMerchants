from backend.routers.merchants import haversine
import math
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

# ── 1. Nearby Distance Edge Cases ──────────────────────────────────────────────

def test_haversine_distance_lat_zero():
    """Verify that lat=0.0 and lon=0.0 are calculated properly without errors."""
    dist = haversine(0.0, 0.0, 0.0, 1.0)
    assert math.isclose(dist, 111.19, abs_tol=1.0)

def test_haversine_distance_float_clamp():
    """Verify floating point clamping for extreme / precision edge cases."""
    # Same point should be exactly 0.0
    dist_same = haversine(25.0, 121.5, 25.0, 121.5)
    assert dist_same == 0.0

    # Opposite sides of earth (approx 20015 km)
    dist_opposite = haversine(90.0, 0.0, -90.0, 0.0)
    assert math.isclose(dist_opposite, 20015.08, abs_tol=10.0)


# ── 2. FTS Search Edge Cases & Punctuation Cleaning ─────────────────────────────

def test_api_search_special_punctuation():
    """Verify searching with special characters (*, :, -, ', ", parens) returns 200 without 500 error."""
    special_queries = [
        "*",
        ":::",
        "---",
        "'",
        '"',
        '""',
        "()",
        "AND OR NOT NEAR",
        "台北市-美食*",
        "7-11 : 門市",
        "路易'莎 (咖啡)",
        "!@#$%^&*()_+="
    ]
    for q in special_queries:
        response = client.get(f"/api/merchants?q={q}")
        assert response.status_code == 200, f"Query '{q}' failed with status {response.status_code}: {response.text}"
        data = response.json()
        assert "total" in data
        assert "items" in data

def test_api_search_empty_and_spaces():
    """Verify empty search query parameters return normal list."""
    response = client.get("/api/merchants?q=")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data


# ── 3. Nearby Endpoint Poles & Extreme Coordinates ──────────────────────────────

def test_api_nearby_poles():
    """Verify nearby search at poles (lat=90.0 or -90.0) returns 200 OK without ZeroDivisionError."""
    # North pole
    resp_north = client.get("/api/merchants/nearby?lat=90.0&lon=0.0")
    assert resp_north.status_code == 200
    assert isinstance(resp_north.json(), list)

    # South pole
    resp_south = client.get("/api/merchants/nearby?lat=-90.0&lon=0.0")
    assert resp_south.status_code == 200
    assert isinstance(resp_south.json(), list)

def test_api_nearby_out_of_bounds_coords():
    """Verify invalid latitude or longitude (> 90 or < -90) returns HTTP 400 Bad Request."""
    invalid_cases = [
        {"lat": 95.0, "lon": 121.5},
        {"lat": -91.0, "lon": 121.5},
        {"lat": 25.0, "lon": 185.0},
        {"lat": 25.0, "lon": -200.0},
    ]
    for case in invalid_cases:
        resp = client.get(f"/api/merchants/nearby?lat={case['lat']}&lon={case['lon']}")
        assert resp.status_code == 400, f"Expected 400 for {case}, got {resp.status_code}: {resp.text}"
        assert "detail" in resp.json()

def test_api_nearby_normal():
    """Verify normal nearby search works correctly."""
    resp = client.get("/api/merchants/nearby?lat=25.0413&lon=121.5226&radius_km=5.0")
    assert resp.status_code == 200
    items = resp.json()
    assert isinstance(items, list)
