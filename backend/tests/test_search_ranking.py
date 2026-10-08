import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend.database import get_db, init_db
from backend.main import app
from shared.schema import rebuild_search_index


@pytest.fixture
def ranked_client():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    init_db(conn)
    conn.executemany("INSERT INTO merchants(id,name,address,website) VALUES(?,?,?,?)", [
        (1, "其他商店", "台北市咖啡路", None),
        (2, "老街咖啡", "台北市", None),
        (3, "咖啡分店", "台北市", "https://example.test"),
        (4, "咖啡", "台北市", "https://example.test"),
        (5, "咖啡", "台北市", "https://example.test"),
        (6, "臺北CHIC", "高雄市", None),
    ])
    rebuild_search_index(conn)
    conn.commit()
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = lambda: conn
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
        conn.close()


def ids(client, **params):
    response = client.get("/api/merchants", params=params)
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["items"]]


def test_exact_then_prefix_then_name_then_address(ranked_client):
    assert ids(ranked_client, q="咖啡") == [4, 5, 3, 2, 1]


def test_ranked_pagination_has_no_duplicates_or_gaps(ranked_client):
    assert sum((ids(ranked_client, q="咖啡", page=page, per_page=2) for page in range(1, 4)), []) == [4, 5, 3, 2, 1]
    assert ids(ranked_client, q="咖啡") == ids(ranked_client, q="咖啡")


def test_ranking_preserves_filters_and_normalization(ranked_client):
    assert ids(ranked_client, q="咖啡", city="臺北市", has_website=True) == [4, 5, 3]
    assert ids(ranked_client, q="台北ｃｈｉｃ") == [6]


def test_browse_and_empty_query_keep_id_order(ranked_client):
    assert ids(ranked_client) == [1, 2, 3, 4, 5, 6]
    assert ids(ranked_client, q=" ") == [1, 2, 3, 4, 5, 6]


def test_initialization_keeps_existing_legacy_data():
    from backend.tests.legacy_schema import init_legacy_db
    conn = sqlite3.connect(":memory:")
    init_legacy_db(conn)
    conn.execute("INSERT INTO users(id,email,hashed_password,name) VALUES(7,'u@example.test','hash','歷史使用者')")
    conn.execute("INSERT INTO user_itineraries(id,user_id,title) VALUES(8,7,'歷史行程')")
    conn.commit()
    init_db(conn)
    assert conn.execute("SELECT name FROM users WHERE id=7").fetchone() == ("歷史使用者",)
    assert conn.execute("SELECT title FROM user_itineraries WHERE id=8").fetchone() == ("歷史行程",)
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    conn.close()
