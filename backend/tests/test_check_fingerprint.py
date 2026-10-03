"""排程檢查指紋：每次執行（成功/跳過/失敗）都要留下 last_checked。

背景：過去只有資料異動才寫 meta，「今日已檢查但無新資料」與
「排程根本沒跑」長得一樣。此檔鎖定 record_check 與 health/data-info 的新行為。
"""
import json
import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import backend.main as main_module
from backend.main import app


@pytest.fixture(name="meta_dir")
def fixture_meta_dir(tmp_path, monkeypatch):
    import scheduler.update_data as ud

    monkeypatch.setattr(ud, "META_FILE", str(tmp_path / "update_meta.json"))
    monkeypatch.setattr(main_module, "DB_PATH", str(tmp_path / "merchants.db"))
    return tmp_path


def test_record_check_writes_and_preserves(meta_dir):
    import scheduler.update_data as ud

    # 既有欄位要保留（更新時間不能被檢查記錄洗掉）
    with open(ud.META_FILE, "w", encoding="utf-8") as f:
        json.dump({"last_updated": "2026-10-01T00:00:00+08:00", "total_merchants": 5}, f)
    ud.record_check("skipped_no_change")
    with open(ud.META_FILE, encoding="utf-8") as f:
        meta = json.load(f)
    assert meta["last_updated"] == "2026-10-01T00:00:00+08:00"
    assert meta["total_merchants"] == 5
    assert meta["last_check_result"] == "skipped_no_change"
    assert isinstance(meta["last_checked"], str) and meta["last_checked"]


def test_record_check_failed_keeps_note(meta_dir):
    import scheduler.update_data as ud

    ud.record_check("failed", "download")
    with open(ud.META_FILE, encoding="utf-8") as f:
        meta = json.load(f)
    assert meta["last_check_result"] == "failed"
    assert meta["last_check_note"] == "download"


def test_health_ok_when_checked_today_despite_old_data(meta_dir):
    import scheduler.update_data as ud
    import sqlite3
    from backend.database import init_db
    conn = sqlite3.connect(meta_dir / "merchants.db")
    init_db(conn)
    conn.close()

    old = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    with open(ud.META_FILE, "w", encoding="utf-8") as f:
        json.dump({"last_updated": old, "last_checked": datetime.now(timezone.utc).isoformat(),
                   "last_check_result": "skipped_no_change"}, f)
    r = TestClient(app).get("/api/health")
    assert r.status_code == 200
    data = r.json()
    # 資料 10 天沒變，但管線每天都有檢查 → 不告警
    assert data["stale"] is False
    assert data["last_check_result"] == "skipped_no_change"


def test_health_stale_when_never_checked(meta_dir):
    import scheduler.update_data as ud

    old = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    with open(ud.META_FILE, "w", encoding="utf-8") as f:
        json.dump({"last_updated": old}, f)
    r = TestClient(app).get("/api/health")
    assert r.json()["stale"] is True


def test_data_info_exposes_check_fields(meta_dir):
    import scheduler.update_data as ud

    with open(ud.META_FILE, "w", encoding="utf-8") as f:
        json.dump({"total_merchants": 7, "last_checked": "X", "last_check_result": "updated"}, f)
    # DB 不存在時數量未知，不能將過期的 metadata 偽裝為即時資料。
    assert not os.path.exists(str(meta_dir / "merchants.db"))
    r = TestClient(app).get("/api/data-info")
    assert r.status_code == 200
    data = r.json()
    assert data["total_merchants"] is None
    assert data["database_ready"] is False
    assert data["last_checked"] == "X"
    assert data["last_check_result"] == "updated"
