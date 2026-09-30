"""Phase2 Task 2: P1 資料正確 — 分頁/驗證/FTS/保留 (TDD)."""
import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import get_db, init_db


@pytest.fixture
def client_auth(tmp_path):
    db_file = str(tmp_path / "test_phase2_data.db")
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
        reg = test_client.post("/api/auth/register", json={
            "email": "data_user@example.com",
            "password": "password123",
            "name": "Data User",
        })
        assert reg.status_code == 200
        token = reg.json()["access_token"]
        test_client.headers.update({"Authorization": f"Bearer {token}"})
        yield test_client
    app.dependency_overrides.clear()


def _expense(i=0):
    return {
        "merchant_name": f"Store{i}",
        "amount": 100 + i,
        "category": "觀光旅遊",
        "expense_date": f"2026-07-{10 + (i % 15):02d}",
    }


def test_expenses_pagination(client_auth):
    for i in range(8):
        r = client_auth.post("/api/assistant/expenses", json=_expense(i))
        assert r.status_code == 200, r.text
    r = client_auth.get("/api/assistant/expenses?limit=5&offset=0")
    assert r.status_code == 200 and len(r.json()) <= 5
    assert len(r.json()) == 5
    r2 = client_auth.get("/api/assistant/expenses?limit=5&offset=5")
    assert r2.status_code == 200 and len(r2.json()) == 3
    # validation bounds
    assert client_auth.get("/api/assistant/expenses?limit=0").status_code == 422
    assert client_auth.get("/api/assistant/expenses?limit=201").status_code == 422


def test_expense_bad_date_rejected(client_auth):
    r = client_auth.post("/api/assistant/expenses", json={
        "merchant_name": "X", "amount": 100,
        "category": "觀光旅遊", "expense_date": "not-a-date",
    })
    assert r.status_code in (400, 422)


def test_expense_models_validation():
    from backend.models import ExpenseCreate, ItineraryItemCreate
    import pydantic
    with pytest.raises(Exception):
        ExpenseCreate(merchant_name="X", amount=100, category="觀光旅遊", expense_date="not-a-date")
    with pytest.raises(Exception):
        ItineraryItemCreate(custom_name="A", estimated_cost=-1)
    with pytest.raises(Exception):
        ItineraryItemCreate(custom_name="A", lat=100.0)
    with pytest.raises(Exception):
        ItineraryItemCreate(custom_name="A", quota_category="BAD")


def test_itineraries_list_groups_items(client_auth):
    for t in ("T1", "T2"):
        r = client_auth.post("/api/itineraries", json={
            "title": t, "items": [
                {"custom_name": f"{t}-a", "estimated_cost": 100, "quota_category": "觀光旅遊"},
                {"custom_name": f"{t}-b", "estimated_cost": 50, "quota_category": "一般消費"},
            ],
        })
        assert r.status_code == 200, r.text
    r = client_auth.get("/api/itineraries")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    for itin in data:
        assert len(itin["items"]) == 2


def test_fts_mismatch_warns(tmp_path, caplog):
    import logging
    db_file = str(tmp_path / "fts.db")
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    init_db(conn)
    conn.execute("INSERT INTO merchants (name, tax_id) VALUES ('A', '11111111')")
    conn.commit()
    conn.close()
    conn2 = sqlite3.connect(db_file)
    with caplog.at_level(logging.WARNING):
        init_db(conn2)
    conn2.close()
    assert any("FTS mismatch" in rec.message for rec in caplog.records)


def test_bak_retention(tmp_path):
    import os
    from scheduler.update_data import prune_backups
    assert callable(prune_backups)
    target = str(tmp_path / "target.db")
    open(target, "w").close()
    for i in range(10):
        open(f"{target}.2026010{i}-000000.bak", "w").close()
    prune_backups(target, keep=7)
    import glob as _glob
    assert len(_glob.glob(target + ".*.bak")) == 7


def test_mass_gate_env():
    import os
    from scheduler import update_data
    assert hasattr(update_data, "MASS_MIN_OLD")
    assert hasattr(update_data, "MASS_RATIO")
