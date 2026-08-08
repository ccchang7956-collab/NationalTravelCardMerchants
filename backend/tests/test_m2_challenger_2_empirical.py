import math
import time
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.services.route_optimizer import optimize_route, haversine_distance, _extract_coord
from backend.routers.merchants import haversine

client = TestClient(app)

# ── 1. Comprehensive Extreme Coordinates & Polar Tests ───────────────────────

def test_polar_coordinates_exact_and_near():
    """Stress test nearby endpoint and haversine functions with exact and near pole coordinates."""
    polar_coords = [
        (90.0, 0.0),
        (-90.0, 0.0),
        (90.0, 180.0),
        (-90.0, -180.0),
        (89.9999999, 179.9999999),
        (-89.9999999, -179.9999999),
        (0.0, 180.0),
        (0.0, -180.0),
        (0.0, 0.0)
    ]
    for lat, lon in polar_coords:
        # 1. Direct haversine call
        d1 = haversine(lat, lon, 25.0, 121.5)
        d2 = haversine_distance(lat, lon, 25.0, 121.5)
        assert isinstance(d1, float) and not math.isnan(d1)
        assert isinstance(d2, float) and not math.isnan(d2)

        # 2. Nearby endpoint API call
        resp = client.get(f"/api/merchants/nearby?lat={lat}&lon={lon}&radius_km=20.0&limit=50")
        assert resp.status_code == 200, f"Failed for lat={lat}, lon={lon}: status={resp.status_code}"
        data = resp.json()
        assert isinstance(data, list)


def test_route_optimizer_polar_and_antipodal():
    """Verify route optimizer with polar and antipodal points."""
    pts = [
        {"id": "NorthPole", "lat": 90.0, "lon": 0.0},
        {"id": "SouthPole", "lat": -90.0, "lon": 0.0},
        {"id": "Equator1", "lat": 0.0, "lon": 0.0},
        {"id": "Equator2", "lat": 0.0, "lon": 180.0},
        {"id": "Taiwan", "lat": 25.03, "lon": 121.56}
    ]
    res = optimize_route(pts)
    assert len(res["points"]) == 5
    assert res["total_distance_km"] > 0.0
    assert not math.isnan(res["total_distance_km"])


# ── 2. Route Optimizer Performance & Complexity Stress Test ──────────────────

def test_route_optimizer_performance_scaling():
    """Empirically measure route optimizer execution time across scaling input sizes."""
    sizes = [10, 50, 100, 200, 500]
    durations = {}

    for n in sizes:
        pts = [{"id": f"pt_{i}", "lat": 20.0 + (i * 0.01), "lon": 120.0 + (i * 0.01)} for i in range(n)]
        start = time.perf_counter()
        res = optimize_route(pts)
        elapsed = time.perf_counter() - start
        durations[n] = elapsed

        assert len(res["points"]) == n
        assert isinstance(res["total_distance_km"], float)
        # Verify execution is under 1 second even for 500 points
        assert elapsed < 1.0, f"N={n} took too long: {elapsed:.4f}s"

    print("\nRoute Optimizer Performance Timings:")
    for n, t in durations.items():
        print(f"  N={n:3d}: {t*1000:6.2f} ms")


def test_route_optimizer_edge_cases_and_robustness():
    """Test extreme edge cases in route optimizer."""
    # Empty list
    assert optimize_route([]) == {"points": [], "total_distance_km": 0.0}
    # Non-list input
    assert optimize_route(None) == {"points": [], "total_distance_km": 0.0}
    assert optimize_route("invalid") == {"points": [], "total_distance_km": 0.0}
    # Single point
    single = [{"lat": 25.0, "lon": 121.5}]
    assert optimize_route(single) == {"points": single, "total_distance_km": 0.0}
    # Two points
    two = [{"lat": 25.0, "lon": 121.5}, {"lat": 25.1, "lon": 121.5}]
    res_two = optimize_route(two)
    assert len(res_two["points"]) == 2
    assert math.isclose(res_two["total_distance_km"], 11.12, abs_tol=0.5)

    # Malformed / Missing fields in list elements
    malformed_pts = [
        {"lat": 25.0, "lon": 121.5},
        {"lat": None, "lon": None},
        {"lat": "invalid", "lon": "invalid"},
        {},
        {"lat": float("nan"), "lon": float("inf")},
        {"lat": 90.0, "lon": 180.0}
    ]
    res_malformed = optimize_route(malformed_pts)
    assert len(res_malformed["points"]) == len(malformed_pts)
    assert not math.isnan(res_malformed["total_distance_km"])


# ── 3. High Concurrent / Repetitive Load Test ────────────────────────────────

def test_api_nearby_high_load_polar_requests():
    """Execute high-frequency requests to /merchants/nearby with varying polar/extreme parameters."""
    for i in range(100):
        lat = 90.0 if i % 2 == 0 else -90.0
        lon = (i * 3.6) - 180.0
        radius = 0.1 + (i % 20)
        resp = client.get(f"/api/merchants/nearby?lat={lat}&lon={lon}&radius_km={radius}")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
