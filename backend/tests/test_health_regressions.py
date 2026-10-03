import json
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
import backend.main as main
from backend.database import init_db
from scheduler import update_data
from shared.config import env_number


@pytest.fixture
def health_environment(tmp_path, monkeypatch):
    path = tmp_path / "merchants.db"
    conn = sqlite3.connect(path)
    init_db(conn)
    conn.close()
    monkeypatch.setattr(main, "DB_PATH", str(path))
    monkeypatch.setattr(update_data, "META_FILE", str(tmp_path / "update_meta.json"))
    return tmp_path, TestClient(main.app)


@pytest.mark.parametrize("result,age,status,code", [("updated",0,"ok",200), ("skipped_no_change",0,"ok",200), ("failed",0,"degraded",503), ("updated",72,"stale",503)])
def test_health_uses_successful_checks_and_reports_failed_attempts(health_environment, result, age, status, code):
    directory, client = health_environment
    (directory / "update_meta.json").write_text(json.dumps({
        "last_updated": "2020-01-01T00:00:00+08:00", "last_checked": datetime.now(timezone.utc).isoformat(),
        "last_successful_check": (datetime.now(timezone.utc)-timedelta(hours=age)).isoformat(),
        "last_check_result": result, "last_check_note": "download" if result == "failed" else None,
    }))
    response = client.get("/api/health")
    assert response.status_code == code
    assert response.json()["status"] == status
    assert client.get("/api/ready").status_code == 200


@pytest.mark.parametrize("metadata", [None, "not json", "[]"])
def test_missing_or_corrupt_metadata_is_stale_but_ready(health_environment, metadata):
    directory, client = health_environment
    if metadata is not None:
        (directory / "update_meta.json").write_text(metadata)
    assert client.get("/api/health").status_code == 503
    assert client.get("/api/health").json()["status"] == "stale"
    assert client.get("/api/ready").status_code == 200
    assert client.get("/api/data-info").json()["total_merchants"] == 0


def test_database_is_actually_queried_for_readiness(health_environment):
    directory, client = health_environment
    (directory / "merchants.db").write_text("not a database")
    assert client.get("/api/ready").status_code == 503
    assert client.get("/api/health").json()["status"] == "unavailable"


def test_failed_check_does_not_advance_last_success(health_environment):
    directory, _ = health_environment
    update_data.record_check("skipped_no_change")
    success = json.loads((directory / "update_meta.json").read_text())["last_successful_check"]
    update_data.record_check("failed", "download")
    assert json.loads((directory / "update_meta.json").read_text())["last_successful_check"] == success


@pytest.mark.parametrize("raw", ["invalid", "nan", "inf", "-1", "0", "999999999"])
def test_invalid_numeric_environment_values_use_consistent_defaults(monkeypatch, raw):
    monkeypatch.setenv("TEST_NUMBER", raw)
    assert env_number("TEST_NUMBER", 0.5, 0.01, 1) == 0.5
