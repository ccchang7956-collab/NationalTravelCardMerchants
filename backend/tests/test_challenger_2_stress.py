import math
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.routers.merchants import parse_search_query

client = TestClient(app)

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
    assert resp_huge.status_code == 422


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
