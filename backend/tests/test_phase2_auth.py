"""Phase2 Task 1: P0 後端 Auth 與 CORS 收緊 (TDD)."""
import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import get_db, init_db


@pytest.fixture
def client(tmp_path):
    db_file = str(tmp_path / "test_phase2.db")
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    init_db(conn)
    conn.close()

    def _get_test_db():
        c = sqlite3.connect(db_file)
        c.row_factory = sqlite3.Row
        try:
            yield c
        finally:
            c.close()

    app.dependency_overrides[get_db] = _get_test_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_register_duplicate_returns_400(client):
    r1 = client.post("/api/auth/register", json={"email": "dup@test.com", "password": "123456", "name": "A"})
    assert r1.status_code == 200
    r2 = client.post("/api/auth/register", json={"email": " dup@test.com ", "password": "123456", "name": "B"})
    assert r2.status_code == 400


def test_password_over_72B_rejected():
    from backend.auth_utils import hash_password
    with pytest.raises(ValueError):
        hash_password("x" * 100)


def test_register_overlong_password_returns_400(client):
    r = client.post(
        "/api/auth/register",
        json={"email": "longpwd@test.com", "password": "x" * 100, "name": "L"},
    )
    assert r.status_code == 400


def test_jwt_expiry_env_default_24h():
    from backend import auth_utils
    assert hasattr(auth_utils, "ACCESS_TOKEN_EXPIRE_HOURS")
    assert float(auth_utils.ACCESS_TOKEN_EXPIRE_HOURS) == 24.0


def test_cors_tightened():
    from fastapi.middleware.cors import CORSMiddleware
    cors = [m for m in app.user_middleware if m.cls is CORSMiddleware]
    assert cors, "CORSMiddleware not configured"
    options = cors[0].kwargs
    assert options.get("allow_methods") != ["*"]
    assert options.get("allow_headers") != ["*"]
    assert "*" not in list(options.get("allow_origins", []))
