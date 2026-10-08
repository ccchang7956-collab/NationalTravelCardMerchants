from concurrent.futures import ThreadPoolExecutor
import sqlite3
from unittest.mock import Mock

from fastapi.testclient import TestClient
import pytest
import requests

from backend.main import app
from backend.routers import geocoding


@pytest.fixture
def proxy(monkeypatch, tmp_path):
    path = tmp_path / "addresses.db"
    monkeypatch.setenv("ADDRESS_SEARCH_CACHE_PATH", str(path))
    monkeypatch.setenv("ADDRESS_SEARCH_URL", "https://geocoder.example/search")
    upstream = Mock(return_value=Mock(status_code=200, json=lambda: [
        {"place_id": 123, "lat": "25.03", "lon": "121.56", "display_name": "台北市信義路"},
    ]))
    monkeypatch.setattr(geocoding.requests, "get", upstream)
    return TestClient(app), upstream, path


def test_cache_survives_new_client_and_budget_is_shared(proxy):
    client, upstream, _ = proxy
    first = client.get("/api/geocoding/search", params={"q": "台北市 信義路"})
    cached = TestClient(app).get("/api/geocoding/search", params={"q": " 台北市   信義路 "})
    blocked = client.get("/api/geocoding/search", params={"q": "高雄市中山路"})
    assert first.status_code == cached.status_code == 200
    assert first.json() == cached.json()
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1
    upstream.assert_called_once()
    assert upstream.call_args.args[0] == "https://geocoder.example/search"
    assert "NationalTravelCardMerchants" in upstream.call_args.kwargs["headers"]["User-Agent"]


def test_simultaneous_cache_misses_make_only_one_upstream_request(proxy):
    client, upstream, path = proxy
    # Initialize schema without spending the shared upstream budget.
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE searches (key TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at REAL NOT NULL)")
    conn.execute("CREATE TABLE upstream_budget (id INTEGER PRIMARY KEY CHECK(id=1), last_attempt REAL NOT NULL)")
    conn.close()
    with ThreadPoolExecutor(max_workers=4) as pool:
        replies = list(pool.map(lambda i: client.get("/api/geocoding/search", params={"q": f"台北市信義路{i}"}), range(4)))
    assert sorted(reply.status_code for reply in replies) == [200, 429, 429, 429]
    upstream.assert_called_once()


@pytest.mark.parametrize("query", ["", "a", "   ", "x" * 201])
def test_rejects_invalid_query_without_calling_provider(proxy, query):
    client, upstream, _ = proxy
    assert client.get("/api/geocoding/search", params={"q": query}).status_code == 422
    upstream.assert_not_called()


def test_provider_failure_is_not_cached(proxy):
    client, upstream, path = proxy
    upstream.side_effect = requests.Timeout("provider timeout")
    assert client.get("/api/geocoding/search", params={"q": "台北市"}).status_code == 502
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM searches").fetchone()[0] == 0


def test_provider_rate_limit_starts_shared_cooldown(proxy):
    client, upstream, path = proxy
    upstream.return_value = Mock(status_code=429, headers={"Retry-After": "120"})
    assert client.get("/api/geocoding/search", params={"q": "台北市"}).status_code == 429
    with sqlite3.connect(path) as conn:
        last = conn.execute("SELECT last_attempt FROM upstream_budget").fetchone()[0]
    assert last > geocoding.time.time() + 110
    assert client.get("/api/geocoding/search", params={"q": "高雄市"}).status_code == 429
    upstream.assert_called_once()


def test_invalid_provider_coordinates_are_not_cached(proxy):
    client, upstream, path = proxy
    upstream.return_value.json = lambda: [{"place_id": 1, "lat": "nan", "lon": "121", "display_name": "invalid"}]
    assert client.get("/api/geocoding/search", params={"q": "台北市"}).status_code == 502
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM searches").fetchone()[0] == 0
