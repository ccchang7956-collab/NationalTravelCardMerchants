import math
import time
import pytest
from fastapi.testclient import TestClient
from backend.main import app
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
        assert isinstance(d1, float) and not math.isnan(d1)

        # 2. Nearby endpoint API call
        resp = client.get(f"/api/merchants/nearby?lat={lat}&lon={lon}&radius_km=20.0&limit=50")
        assert resp.status_code == 200, f"Failed for lat={lat}, lon={lon}: status={resp.status_code}"
        data = resp.json()
        assert isinstance(data, list)


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
