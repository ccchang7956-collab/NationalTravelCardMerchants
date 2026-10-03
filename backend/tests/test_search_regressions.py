import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend.database import get_db, init_db
from backend.main import app
from scheduler.update_data import space_segment as scheduler_segment
from scheduler import update_data
from shared import schema
from shared.search import FTS_VERSION, parse_search_query, space_segment


@pytest.fixture
def search_db():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    init_db(conn)
    documents = [
        ("咖啡", "台北市中正區", "https://test"),
        ("商店", "台中市北區", None),
        ("北台商店", "高雄市", None),
        ("台商店", "北區", None),
        ("哈哈屋", "台北市", None),
        ("哈屋", "台北市", None),
        ("CHIC古亭7-11", "臺北市", None),
    ]
    conn.executemany("INSERT INTO merchants(name,address,website,lat,lon) VALUES(?,?,?,25,121)", documents)
    schema.rebuild_search_index(conn)
    conn.commit()
    yield conn
    conn.close()


@pytest.mark.parametrize("query,expected", [("台北", {1,5,6,7}), ("台北 咖啡", {1}), ("哈哈", {5}), ("CHIC古亭", {7}), ("7-11", {7}), ("臺北", {1,5,6,7}), ("ＣＨＩＣ古亭", {7}), ("北台", {3})])
def test_ordered_phrases_match_only_adjacent_tokens_in_one_field(search_db, query, expected):
    rows = search_db.execute("SELECT rowid FROM merchants_fts WHERE merchants_fts MATCH ?", (parse_search_query(query),))
    assert {row[0] for row in rows} == expected
    assert scheduler_segment(query) == space_segment(query)


def test_nearby_city_and_website_filters(search_db):
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = lambda: search_db
    try:
        client = TestClient(app)
        response = client.get("/api/merchants/nearby", params={"lat":25,"lon":121,"city":"臺北市","has_website":True})
        assert response.status_code == 200
        assert [item["id"] for item in response.json()] == [1]
        response = client.get("/api/merchants/nearby", params={"lat":25,"lon":121,"city":"台北市","has_website":False})
        assert {item["id"] for item in response.json()} == {5,6,7}
        response = client.get("/api/merchants", params={"city":"臺北市","has_website":False})
        assert {item["id"] for item in response.json()["items"]} == {5,6,7}
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


def test_old_index_migrates_atomically_and_preserves_ids(tmp_path):
    path = tmp_path / "old.db"
    conn = sqlite3.connect(path)
    init_db(conn)
    conn.execute("INSERT INTO merchants(id,name,address,tax_id) VALUES(42,'咖啡','台北市','12345678')")
    conn.execute("INSERT INTO users(id,email,hashed_password,name) VALUES(1,'a@test','hash','甲')")
    conn.execute("INSERT INTO user_favorites(user_id,merchant_id) VALUES(1,42)")
    schema.set_metadata(conn, "fts_version", "old")
    conn.commit()
    assert schema.migrate_database(conn)
    assert not schema.migrate_database(conn)
    assert schema.metadata_value(conn, "fts_version") == FTS_VERSION
    assert conn.execute("SELECT rowid FROM merchants_fts WHERE merchants_fts MATCH ?", (parse_search_query("台北 咖啡"),)).fetchone() == (42,)
    assert conn.execute("SELECT merchant_id FROM user_favorites").fetchone() == (42,)
    assert len(list(tmp_path.glob("old.db.*.bak"))) == 1
    conn.close()


def test_failed_rebuild_rolls_back_old_index_and_version(tmp_path, monkeypatch):
    conn = sqlite3.connect(tmp_path / "db")
    init_db(conn)
    schema.set_metadata(conn, "fts_version", "old")
    conn.commit()
    def fail(conn):
        conn.execute("DELETE FROM merchants_fts")
        raise RuntimeError("simulated rebuild failure")
    monkeypatch.setattr(schema, "rebuild_search_index", fail)
    with pytest.raises(RuntimeError):
        schema.migrate_database(conn)
    assert schema.metadata_value(conn, "fts_version") == "old"
    assert not conn.in_transaction
    conn.close()


def test_unchanged_pdf_still_migrates_local_index(tmp_path, monkeypatch):
    path = tmp_path / "merchants.db"
    with sqlite3.connect(path) as conn:
        init_db(conn)
        conn.execute("INSERT INTO merchants(id,name,address,tax_id) VALUES(42,'咖啡','台北市','12345678')")
        schema.set_metadata(conn, "fts_version", "old")
    (tmp_path / "hash.txt").write_text("same-hash")
    monkeypatch.setattr(update_data, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(update_data, "DB_PATH", str(path))
    monkeypatch.setattr(update_data, "HASH_FILE", str(tmp_path / "hash.txt"))
    monkeypatch.setattr(update_data, "META_FILE", str(tmp_path / "update_meta.json"))
    monkeypatch.setattr(update_data, "download_zip", lambda _: True)
    monkeypatch.setattr(update_data, "extract_pdf", lambda *_: True)
    monkeypatch.setattr(update_data, "sha256_file", lambda _: "same-hash")
    monkeypatch.setattr(update_data, "notify", lambda *_: pytest.fail("Unchanged data must not send notifications"))
    monkeypatch.setattr(update_data, "parse_pdf_to_db", lambda *_: pytest.fail("Unchanged data must not be parsed again"))
    assert update_data.main() is None
    with sqlite3.connect(path) as conn:
        assert schema.metadata_value(conn, "fts_version") == FTS_VERSION
        assert conn.execute("SELECT rowid FROM merchants_fts WHERE merchants_fts MATCH ?", (parse_search_query("台北 咖啡"),)).fetchone() == (42,)
    meta = json.loads((tmp_path / "update_meta.json").read_text())
    assert meta["last_check_result"] == "skipped_no_change"
    assert meta["last_successful_check"]
    assert (tmp_path / "hash.txt").read_text() == "same-hash"
