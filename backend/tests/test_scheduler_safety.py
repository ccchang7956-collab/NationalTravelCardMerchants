"""Task 2: scheduler 資料安全 — TDD 安全閘門 / industries 保留 / 備份 / 原子寫入."""
import glob
import os
import sqlite3

import pytest

from scheduler.update_data import transactional_sync_db


def _init_target(target_db):
    from backend.database import init_db
    conn = sqlite3.connect(target_db)
    conn.execute("PRAGMA foreign_keys = ON;")
    init_db(conn)
    conn.commit()
    conn.close()


def _make_temp(temp_db, merchants, industries=None):
    """merchants: list of (name, address, zip, tax_id, website).
    industries: list of (tax_id, code, name, prio) or None → 不建表 (模擬舊解析產物無表)."""
    conn = sqlite3.connect(temp_db)
    conn.execute("PRAGMA foreign_keys = ON;")
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE merchants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT,
            zip_code TEXT,
            tax_id TEXT UNIQUE,
            website TEXT,
            lat REAL,
            lon REAL
        )
    """)
    for m in merchants:
        cur.execute(
            "INSERT INTO merchants (name, address, zip_code, tax_id, website) VALUES (?, ?, ?, ?, ?)",
            m,
        )
    if industries is not None:
        cur.execute("""
            CREATE TABLE merchant_industries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tax_id TEXT NOT NULL,
                industry_code TEXT NOT NULL,
                industry_name TEXT NOT NULL,
                priority INTEGER NOT NULL
            )
        """)
        for ind in industries:
            cur.execute(
                "INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)",
                ind,
            )
    conn.commit()
    conn.close()


def test_skip_industries_when_temp_empty(tmp_path):
    target_db = str(tmp_path / "target.db")
    temp_db = str(tmp_path / "temp.db")
    _init_target(target_db)

    conn = sqlite3.connect(target_db)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("INSERT INTO merchants (name, tax_id) VALUES ('A', '11111111')")
    conn.execute(
        "INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES ('11111111', '561115', '餐館業', 1)"
    )
    conn.commit()
    conn.close()

    # temp 有同一個商家，但完全沒有 industries 表 → 應跳過 industries 同步
    _make_temp(temp_db, [("A new", "addr", "100", "11111111", None)], industries=None)

    transactional_sync_db(temp_db, target_db)

    conn = sqlite3.connect(target_db)
    rows = conn.execute("SELECT COUNT(*) FROM merchant_industries").fetchone()[0]
    conn.close()
    assert rows > 0, "temp 無 industries 時應保留 target 既有 industries，不可清空"


def test_skip_industries_when_temp_table_empty(tmp_path):
    """temp 有空 industries 表（有表但 0 筆）→ 同樣應跳過，不清空 target。"""
    target_db = str(tmp_path / "target.db")
    temp_db = str(tmp_path / "temp.db")
    _init_target(target_db)

    conn = sqlite3.connect(target_db)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("INSERT INTO merchants (name, tax_id) VALUES ('A', '11111111')")
    conn.execute(
        "INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES ('11111111', '561115', '餐館業', 1)"
    )
    conn.commit()
    conn.close()

    _make_temp(temp_db, [("A new", "addr", "100", "11111111", None)], industries=[])

    transactional_sync_db(temp_db, target_db)

    conn = sqlite3.connect(target_db)
    rows = conn.execute("SELECT COUNT(*) FROM merchant_industries").fetchone()[0]
    conn.close()
    assert rows > 0, "temp industries 為空表時應保留 target 既有資料"


def test_abort_on_mass_delete(tmp_path):
    target_db = str(tmp_path / "target.db")
    temp_db = str(tmp_path / "temp.db")
    _init_target(target_db)

    conn = sqlite3.connect(target_db)
    conn.execute("PRAGMA foreign_keys = ON;")
    for i in range(150):
        conn.execute(
            "INSERT INTO merchants (name, tax_id) VALUES (?, ?)",
            (f"M{i}", f"{10000000 + i}"),
        )
    conn.commit()
    conn.close()

    # temp 只有 10 筆 (< 50% of 150) → 應 abort
    small = [(f"M{i}", "addr", "100", f"{10000000 + i}", None) for i in range(10)]
    _make_temp(temp_db, small, industries=[])

    with pytest.raises(RuntimeError, match="Abort"):
        transactional_sync_db(temp_db, target_db)

    conn = sqlite3.connect(target_db)
    count = conn.execute("SELECT COUNT(*) FROM merchants").fetchone()[0]
    conn.close()
    assert count == 150, "abort 後 target 筆數應保持不變"


def test_backup_created_before_sync(tmp_path):
    target_db = str(tmp_path / "target.db")
    temp_db = str(tmp_path / "temp.db")
    _init_target(target_db)

    conn = sqlite3.connect(target_db)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("INSERT INTO merchants (name, tax_id) VALUES ('A', '11111111')")
    conn.commit()
    conn.close()

    _make_temp(temp_db, [("A new", "addr", "100", "11111111", None)], industries=[])

    transactional_sync_db(temp_db, target_db)

    baks = glob.glob(target_db + ".*.bak")
    assert len(baks) >= 1, "同步前應產生 timestamped 備份檔"


def test_atomic_meta_write(tmp_path):
    from scheduler.update_data import atomic_write_text

    p = str(tmp_path / "meta.json")
    atomic_write_text(p, '{"a": 1}')
    with open(p, encoding="utf-8") as f:
        assert f.read() == '{"a": 1}'

    # 覆寫既有檔亦應原子完成且內容正確
    atomic_write_text(p, '{"a": 2}')
    with open(p, encoding="utf-8") as f:
        assert f.read() == '{"a": 2}'

    # 不應留下 mkstemp 暫存檔
    leftovers = [f for f in os.listdir(str(tmp_path)) if f.startswith("tmp")]
    assert leftovers == []


def test_favorites_affected_logged(tmp_path, caplog):
    """刪除下架商家前應統計受影響 favorites 並記入 log（不改 FK schema）。"""
    import logging

    target_db = str(tmp_path / "target.db")
    temp_db = str(tmp_path / "temp.db")
    _init_target(target_db)

    conn = sqlite3.connect(target_db)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("INSERT INTO merchants (id, name, tax_id) VALUES (1, 'Keep', '11111111')")
    conn.execute("INSERT INTO merchants (id, name, tax_id) VALUES (2, 'Gone', '22222222')")
    conn.execute(
        "INSERT INTO users (id, email, hashed_password, name) VALUES (1, 'u@t.com', 'h', 'U')"
    )
    conn.execute("INSERT INTO user_favorites (user_id, merchant_id) VALUES (1, 2)")
    conn.commit()
    conn.close()

    # temp 只剩 Keep → Gone 會被刪除，其 favorites 應被統計並 log
    _make_temp(temp_db, [("Keep new", "addr", "100", "11111111", None)], industries=[])

    with caplog.at_level(logging.WARNING):
        transactional_sync_db(temp_db, target_db)

    assert any("favorite" in r.message.lower() for r in caplog.records), (
        "刪除前應 log 受影響 favorites 筆數"
    )
