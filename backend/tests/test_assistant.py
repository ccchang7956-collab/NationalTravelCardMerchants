import sqlite3
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_db, init_db

@pytest.fixture
def client_with_user(tmp_path):
    db_file = str(tmp_path / "test_assistant.db")
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    init_db(conn)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS merchants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT,
            zip_code TEXT,
            tax_id TEXT,
            website TEXT,
            lat REAL,
            lon REAL
        );
    """)
    cursor.execute("INSERT INTO merchants (id, name, address, zip_code, tax_id) VALUES (101, '測試特約店', '台北市中山區', '104', '12345678')")
    conn.commit()
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
        reg = test_client.post("/api/auth/register", json={
            "email": "assistant_user@example.com",
            "password": "password123",
            "name": "Assistant User"
        })
        token = reg.json()["access_token"]
        yield test_client, token
    app.dependency_overrides.clear()

def test_assistant_summary_expenses_and_favorites(client_with_user):
    client, token = client_with_user
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Summary initially returns 8000 targets, 0 spent
    res_sum = client.get("/api/assistant/summary", headers=headers)
    assert res_sum.status_code == 200
    sum_data = res_sum.json()
    assert sum_data["tourist_quota"]["target"] == 8000
    assert sum_data["tourist_quota"]["spent"] == 0
    assert sum_data["tourist_quota"]["remaining"] == 8000
    assert sum_data["general_quota"]["target"] == 8000
    assert sum_data["general_quota"]["spent"] == 0
    assert sum_data["general_quota"]["remaining"] == 8000
    assert sum_data["total_spent"] == 0

    # 2. Add Tourist Expense (3000) and General Expense (2000)
    res_exp1 = client.post("/api/assistant/expenses", headers=headers, json={
        "merchant_id": 101,
        "merchant_name": "測試特約店",
        "amount": 3000,
        "category": "觀光旅遊",
        "expense_date": "2026-07-20",
        "note": "飯店住宿"
    })
    assert res_exp1.status_code == 200
    exp1_id = res_exp1.json()["id"]

    res_exp2 = client.post("/api/assistant/expenses", headers=headers, json={
        "merchant_name": "一般商店",
        "amount": 2000,
        "category": "自行運用",
        "expense_date": "2026-07-21"
    })
    assert res_exp2.status_code == 200
    exp2_id = res_exp2.json()["id"]

    # Check expenses list
    res_list = client.get("/api/assistant/expenses", headers=headers)
    assert res_list.status_code == 200
    expenses = res_list.json()
    assert len(expenses) == 2

    # Check Summary updated (tourist spent 3000, remaining 5000; general spent 2000, total 5000)
    res_sum2 = client.get("/api/assistant/summary", headers=headers)
    assert res_sum2.status_code == 200
    sum_data2 = res_sum2.json()
    assert sum_data2["tourist_quota"]["spent"] == 3000
    assert sum_data2["tourist_quota"]["remaining"] == 5000
    assert sum_data2["general_quota"]["spent"] == 2000
    assert sum_data2["general_quota"]["remaining"] == 6000
    assert sum_data2["total_spent"] == 5000

    # 3. Delete Expense
    res_del = client.delete(f"/api/assistant/expenses/{exp1_id}", headers=headers)
    assert res_del.status_code == 200

    res_sum3 = client.get("/api/assistant/summary", headers=headers)
    assert res_sum3.json()["tourist_quota"]["spent"] == 0
    assert res_sum3.json()["total_spent"] == 2000

    # 4. Favorites flow: POST, GET favorites, GET ids, DELETE
    res_fav_add = client.post("/api/assistant/favorites/101", headers=headers)
    assert res_fav_add.status_code == 200

    res_favs = client.get("/api/assistant/favorites", headers=headers)
    assert res_favs.status_code == 200
    favs = res_favs.json()
    assert len(favs) == 1
    assert favs[0]["id"] == 101
    assert favs[0]["name"] == "測試特約店"

    res_ids = client.get("/api/assistant/favorites/ids", headers=headers)
    assert res_ids.status_code == 200
    assert res_ids.json() == [101]

    res_fav_del = client.delete("/api/assistant/favorites/101", headers=headers)
    assert res_fav_del.status_code == 200

    res_ids_after = client.get("/api/assistant/favorites/ids", headers=headers)
    assert res_ids_after.json() == []
