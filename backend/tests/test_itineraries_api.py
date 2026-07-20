import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import init_db, get_db
import sqlite3

client = TestClient(app)

def test_itinerary_crud(tmp_path, monkeypatch):
    test_db = str(tmp_path / "test_itineraries.db")
    monkeypatch.setattr("backend.database.DB_PATH", test_db)
    init_db()

    conn = sqlite3.connect(test_db)
    conn.execute("INSERT INTO users (id, email, hashed_password, name) VALUES (1, 'test@example.com', 'hash', 'Test User')")
    conn.commit()
    conn.close()

    # Override get_current_user dependency
    from backend.auth_utils import get_current_user
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "username": "testuser"}

    # 1. Create itinerary
    payload = {
        "title": "宜蘭觀光熱線",
        "start_date": "2026-08-01",
        "notes": "記得帶防曬",
        "items": [
            {
                "custom_name": "宜蘭特店飯店",
                "lat": 24.757,
                "lon": 121.753,
                "estimated_cost": 3000,
                "quota_category": "觀光旅遊"
            }
        ]
    }
    response = client.post("/api/itineraries", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "宜蘭觀光熱線"
    assert len(data["items"]) == 1
    itinerary_id = data["id"]

    # 2. Get list
    response = client.get("/api/itineraries")
    assert response.status_code == 200
    assert len(response.json()) == 1

    # 3. Get single
    response = client.get(f"/api/itineraries/{itinerary_id}")
    assert response.status_code == 200
    assert response.json()["id"] == itinerary_id

    # 3.5 Update itinerary
    update_payload = {
        "title": "宜蘭觀光熱線 (已更新)",
        "notes": "記得帶雨傘"
    }
    response = client.put(f"/api/itineraries/{itinerary_id}", json=update_payload)
    assert response.status_code == 200
    assert response.json()["title"] == "宜蘭觀光熱線 (已更新)"
    assert response.json()["notes"] == "記得帶雨傘"

    # 4. Delete
    response = client.delete(f"/api/itineraries/{itinerary_id}")
    assert response.status_code == 200

    # 5. Get deleted should return 404
    response = client.get(f"/api/itineraries/{itinerary_id}")
    assert response.status_code == 404

    app.dependency_overrides.clear()

def test_optimize_itinerary_endpoint(tmp_path, monkeypatch):
    test_db = str(tmp_path / "test_itineraries_opt.db")
    monkeypatch.setattr("backend.database.DB_PATH", test_db)
    init_db()

    from backend.auth_utils import get_current_user
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "username": "testuser"}

    payload = {
        "points": [
            {"id": 1, "lat": 25.0339, "lon": 121.5645, "name": "Taipei 101"},
            {"id": 2, "lat": 22.6273, "lon": 120.3014, "name": "Kaohsiung"},
            {"id": 3, "lat": 25.0478, "lon": 121.5170, "name": "Taipei Main"}
        ]
    }
    response = client.post("/api/itineraries/optimize", json=payload)
    assert response.status_code == 200
    res_data = response.json()
    assert "points" in res_data
    assert "total_distance_km" in res_data
    assert [p["id"] for p in res_data["points"]] == [1, 3, 2]

    app.dependency_overrides.clear()
