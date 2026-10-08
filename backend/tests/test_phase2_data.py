"""Phase2 Task 2: P1 資料正確 — FTS/保留/閘門 (TDD).

Note (2026-10): auth/assistant/itineraries 已移除，依賴登入的測試一併刪除，
僅保留公開 API 相關。
"""
import sqlite3

import pytest

from backend.database import init_db


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
