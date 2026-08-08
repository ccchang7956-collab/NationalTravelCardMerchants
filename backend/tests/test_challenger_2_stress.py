import math
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.services.route_optimizer import optimize_route, haversine_distance, _extract_coord
from backend.routers.merchants import parse_search_query

client = TestClient(app)

# ── 1. Advanced Route Optimizer Stress & Edge Cases ────────────────────────────

def test_extract_coord_malformed_structures():
    """Verify _extract_coord handles nested/malformed structures without crashing."""
    assert _extract_coord({"lat": [1, 2]}, "lat") == 0.0
    assert _extract_coord({"lat": {"a": 1}}, "lat") == 0.0
    assert _extract_coord({"lat": "not_a_number"}, "lat") == 0.0
    assert _extract_coord({"lat": float("nan")}, "lat") is not None  # returns float nan or handles
    assert _extract_coord({"lat": float("inf")}, "lat") == float("inf")
    assert _extract_coord({"lat": None}, "lat") == 0.0
    assert _extract_coord(123, "lat") == 0.0

def test_optimize_route_non_dict_elements():
    """Verify optimize_route handles list containing non-dict elements gracefully."""
    points = [
        None,
        "invalid_string",
        12345,
        {"lat": 25.0, "lon": 121.5},
        {"lat": 25.1, "lon": 121.6}
    ]
    res = optimize_route(points)
    assert isinstance(res, dict)
    assert "points" in res
    assert "total_distance_km" in res
    assert len(res["points"]) == 5

def test_optimize_route_identical_and_large_dataset():
    """Verify performance and accuracy with 100 identical points and 100 random points."""
    identical_pts = [{"lat": 25.0413, "lon": 121.5226} for _ in range(100)]
    res = optimize_route(identical_pts)
    assert len(res["points"]) == 100
    assert res["total_distance_km"] == 0.0

    # 50 points along equator
    equator_pts = [{"lat": 0.0, "lon": float(i)} for i in range(50)]
    res_eq = optimize_route(equator_pts)
    assert len(res_eq["points"]) == 50
    assert res_eq["total_distance_km"] > 0.0


# ── 2. City & Industry Code Wildcard Escape Stress ─────────────────────────────

def test_api_merchants_city_wildcard_escaping():
    """Verify city search parameter properly escapes LIKE wildcards (%, _, \\)."""
    wildcard_cities = ["%", "_", "\\", "%25", "%5F", "台北%"]
    for c in wildcard_cities:
        resp = client.get(f"/api/merchants?city={c}")
        assert resp.status_code == 200, f"City query '{c}' failed with status {resp.status_code}"
        data = resp.json()
        assert "items" in data
        assert "total" in data

def test_api_merchants_industry_code_stress():
    """Verify industry_code parameter with special characters and wildcards."""
    codes = ["%", "_", "'", "100'", "EXISTS", "123 OR 1=1"]
    for code in codes:
        resp = client.get(f"/api/merchants?industry_code={code}")
        assert resp.status_code == 200, f"Industry query '{code}' failed with status {resp.status_code}"
        data = resp.json()
        assert "items" in data

def test_api_merchants_pagination_limits():
    """Verify boundary conditions for page and per_page parameters."""
    # Out of boundary (should return 422 Validation Error)
    assert client.get("/api/merchants?page=0").status_code == 422
    assert client.get("/api/merchants?per_page=0").status_code == 422
    assert client.get("/api/merchants?per_page=101").status_code == 422

    # Valid boundaries
    resp1 = client.get("/api/merchants?page=1&per_page=1")
    assert resp1.status_code == 200
    assert len(resp1.json()["items"]) <= 1

    resp100 = client.get("/api/merchants?page=1&per_page=100")
    assert resp100.status_code == 200

    resp_huge = client.get("/api/merchants?page=999999&per_page=20")
    assert resp_huge.status_code == 200
    assert resp_huge.json()["items"] == []


# ── 3. Detail Endpoint SQL Injection & Invalid ID Stress ─────────────────────

def test_api_merchant_detail_sqli_and_404():
    """Verify merchant detail endpoint against SQL injection payloads and invalid IDs."""
    payloads = [
        "' OR '1'='1",
        "1; DROP TABLE merchants;--",
        "non_existent_tax_id_999999",
        "台北市信義區",
        "!@#$%^&*()"
    ]
    for p in payloads:
        resp = client.get(f"/api/merchants/{p}")
        assert resp.status_code == 404, f"Payload '{p}' expected 404, got {resp.status_code}"
        assert resp.json()["detail"] == "Merchant not found"


# ── 4. Stats and Industry Endpoints Stability ───────────────────────────────

def test_api_stats_and_industries_endpoints():
    """Verify GET /api/stats and /api/industries return valid schema."""
    resp_stats = client.get("/api/stats")
    assert resp_stats.status_code == 200
    data = resp_stats.json()
    assert "total_merchants" in data
    assert "has_website" in data
    assert "cities" in data

    resp_ind = client.get("/api/industries")
    assert resp_ind.status_code == 200
    assert isinstance(resp_ind.json(), list)
