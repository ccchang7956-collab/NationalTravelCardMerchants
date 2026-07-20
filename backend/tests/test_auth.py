import sqlite3
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_db, init_db

@pytest.fixture
def client(tmp_path):
    db_file = str(tmp_path / "test.db")
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

def test_register_login_me_flow(client):
    # Register
    res = client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "password123",
        "name": "Test User"
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "test@example.com"
    token = data["access_token"]

    # Duplicate register
    res_dup = client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "password123",
        "name": "Test User 2"
    })
    assert res_dup.status_code == 400

    # Login
    res_login = client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": "password123"
    })
    assert res_login.status_code == 200

    # Login wrong password
    res_wrong = client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": "wrongpassword"
    })
    assert res_wrong.status_code == 401

    # Me endpoint
    res_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res_me.status_code == 200
    assert res_me.json()["email"] == "test@example.com"
