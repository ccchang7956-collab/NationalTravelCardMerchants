"""Phase 4 Task 2: stats city prefix buckets (TDD).

Note (2026-10): 登入限流功能已隨 auth 移除，僅保留 stats 測試。
"""
import inspect
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
    # stats 種子：2x 台北市 / 1x 高雄市 / 1x 彰化縣 / 1x 未知 -> 其他
    conn.executemany(
        "INSERT INTO merchants (name, address, zip_code, tax_id, website) VALUES (?, ?, ?, ?, ?)",
        [
            ("店A", "台北市大安區新生南路1段", "106", "90000001", None),
            ("店B", "台北市信義區松仁路2號", "110", "90000002", None),
            ("店C", "高雄市苓雅區五福路1號", "802", "90000003", None),
            ("店D", "彰化縣彰化市中山路1號", "500", "90000004", None),
            ("店E", "火星市 crater 99", "999", "90000005", None),
        ],
    )
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
        yield test_client
    app.dependency_overrides.clear()


def test_stats_cities_are_known():
    from backend.routers.merchants import TAIWAN_CITIES

    assert "台北市" in TAIWAN_CITIES
    assert len(TAIWAN_CITIES) == 22


def test_stats_prefix_buckets(client):
    r = client.get("/api/stats")
    assert r.status_code == 200
    data = r.json()
    by_city = {c["city"]: c["count"] for c in data["cities"]}
    assert by_city.get("台北市") == 2
    assert by_city.get("高雄市") == 1
    assert by_city.get("彰化縣") == 1
    # 未命中城市表前綴 -> 其他
    assert by_city.get("其他") == 1
    # 所有 bucket 名稱必須是已知城市或「其他」，不得出現 SUBSTR 雜訊
    from backend.routers.merchants import TAIWAN_CITIES

    for name in by_city:
        assert name in set(TAIWAN_CITIES) | {"其他"}, f"unexpected bucket {name}"


def test_stats_no_substr_truncation():
    from backend.routers import merchants as m

    src = inspect.getsource(m.get_stats)
    assert "SUBSTR" not in src
