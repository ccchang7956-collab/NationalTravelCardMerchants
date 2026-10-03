import sqlite3
import time

import pytest
from fastapi.testclient import TestClient
from backend.database import get_db, init_db
from backend.main import app
from shared.schema import bump_dataset_version


@pytest.fixture
def export_database(tmp_path):
    conn = sqlite3.connect(tmp_path / "merchants.db", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    init_db(conn)
    conn.executemany("INSERT INTO merchants(id,name,tax_id) VALUES(?,?,?)", ((i*3,"商店",str(10000000+i)) for i in range(1,60002)))
    bump_dataset_version(conn)
    conn.commit()
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = lambda: conn
    yield conn, TestClient(app)
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)
    conn.close()


def test_dynamic_manifest_and_batches_cover_more_than_sixty_thousand_gapped_ids(export_database):
    conn, client = export_database
    start = time.perf_counter()
    manifest = client.get("/api/sitemaps/manifest").json()
    assert manifest["total"] == 60001
    assert len(manifest["shards"]) == 7
    assert manifest["shards"][-1]["count"] == 1
    collected = []
    requests = 0
    for shard in manifest["shards"]:
        cursor = 0
        while True:
            response = client.get("/api/sitemaps/merchants", params={"version":manifest["version"],"min_id":shard["min_id"],"max_id":shard["max_id"],"after_id":cursor})
            assert response.status_code == 200
            batch = response.json()
            requests += 1
            assert len(batch["items"]) <= 5000
            assert all(set(item) == {"id","tax_id"} for item in batch["items"])
            collected.extend(item["id"] for item in batch["items"])
            if batch["next_cursor"] is None:
                break
            cursor = batch["next_cursor"]
    assert collected == [i*3 for i in range(1,60002)]
    assert requests == 13
    plan = conn.execute("EXPLAIN QUERY PLAN SELECT id,tax_id FROM merchants WHERE id>=? AND id<=? AND id>? ORDER BY id LIMIT 5000", (1,30000,0)).fetchall()
    assert any("INTEGER PRIMARY KEY" in row[3] for row in plan)
    print(f"sitemap: 60001 rows, 7 shards, 13 batch requests, {time.perf_counter()-start:.3f}s")


def test_export_rejects_stale_version_and_discovers_new_data(export_database):
    conn, client = export_database
    original = client.get("/api/sitemaps/manifest").json()
    conn.execute("INSERT INTO merchants(id,name) VALUES(999999,'新商店')")
    bump_dataset_version(conn)
    conn.commit()
    updated = client.get("/api/sitemaps/manifest").json()
    assert updated["total"] == 60002
    assert updated["version"] != original["version"]
    assert client.get("/api/sitemaps/merchants",params={"version":original["version"],"min_id":1,"max_id":30000}).status_code == 409


def test_batch_limit_cannot_exceed_five_thousand(export_database):
    _, client = export_database
    assert client.get("/api/sitemaps/merchants", params={"version":"a"*32,"min_id":1,"max_id":30000,"limit":5001}).status_code == 422
