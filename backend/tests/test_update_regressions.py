import sqlite3

import pytest

from backend.database import init_db
from scheduler import update_data


def make_database(path, address="台北市中正區", lat=25.04, lon=121.52):
    conn = sqlite3.connect(path)
    init_db(conn)
    conn.execute(
        "INSERT INTO merchants(id, name, address, tax_id, lat, lon) VALUES(1, '商店', ?, '12345678', ?, ?)",
        (address, lat, lon),
    )
    conn.commit()
    return conn


def test_backup_includes_committed_wal_and_relationships(tmp_path):
    target, incoming = tmp_path / "live.db", tmp_path / "incoming.db"
    live = make_database(target)
    try:
        live.execute("PRAGMA wal_autocheckpoint=0")
        live.execute("INSERT INTO users(id,email,hashed_password,name) VALUES(1,'a@test','hash','甲')")
        live.execute("INSERT INTO user_favorites(user_id,merchant_id) VALUES(1,1)")
        live.commit()
        make_database(incoming).close()
        update_data.transactional_sync_db(str(incoming), str(target))
        backup = next(tmp_path.glob("live.db.*.bak"))
        with sqlite3.connect(backup) as restored:
            assert restored.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            assert restored.execute("SELECT COUNT(*) FROM merchants").fetchone()[0] == 1
            assert restored.execute("SELECT COUNT(*) FROM user_favorites").fetchone()[0] == 1
    finally:
        live.close()


def test_backup_failure_aborts_without_changing_merchants(tmp_path, monkeypatch):
    target, incoming = tmp_path / "live.db", tmp_path / "incoming.db"
    make_database(target).close()
    make_database(incoming, "高雄市新興區", None, None).close()

    def fail_backup(*args, **kwargs):
        raise OSError("backup disk full")

    monkeypatch.setattr(update_data, "backup_database", fail_backup, raising=False)
    with pytest.raises(OSError, match="disk full"):
        update_data.transactional_sync_db(str(incoming), str(target))
    with sqlite3.connect(target) as conn:
        assert conn.execute("SELECT address FROM merchants").fetchone()[0] == "台北市中正區"


@pytest.mark.parametrize("migrate_first", [True, False])
def test_relocated_merchant_never_inherits_old_coordinates(tmp_path, migrate_first):
    target, incoming = tmp_path / "live.db", tmp_path / "incoming.db"
    make_database(target).close()
    make_database(incoming, "高雄市新興區", None, None).close()
    if migrate_first:
        assert update_data.migrate_coords(str(target), str(incoming)) == 0
    update_data.transactional_sync_db(str(incoming), str(target))
    with sqlite3.connect(target) as conn:
        assert conn.execute("SELECT id,lat,lon FROM merchants").fetchone() == (1, None, None)


def test_equivalent_address_keeps_complete_coordinate_pair(tmp_path):
    target, incoming = tmp_path / "live.db", tmp_path / "incoming.db"
    make_database(target).close()
    make_database(incoming, "臺北市 中正區", None, 120.0).close()
    update_data.transactional_sync_db(str(incoming), str(target))
    with sqlite3.connect(target) as conn:
        assert conn.execute("SELECT id,lat,lon FROM merchants").fetchone() == (1, 25.04, 121.52)


def test_empty_dataset_is_rejected_even_for_small_database(tmp_path):
    target, incoming = tmp_path / "live.db", tmp_path / "incoming.db"
    make_database(target).close()
    conn = sqlite3.connect(incoming)
    init_db(conn)
    conn.close()
    with pytest.raises(RuntimeError,match="empty"):
        update_data.transactional_sync_db(str(incoming),str(target))
    with sqlite3.connect(target) as conn:
        assert conn.execute("SELECT COUNT(*) FROM merchants").fetchone()[0] == 1
