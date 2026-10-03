import sqlite3

from backend.database import init_db
from scheduler.update_data import fill_missing_coords, migrate_coords, transactional_sync_db
from shared.postal import zipcode_coords
from shared.schema import set_metadata


def test_old_coordinates_are_migrated_without_claiming_precision(tmp_path):
    conn = sqlite3.connect(tmp_path / "old.db")
    conn.execute("CREATE TABLE merchants(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,address TEXT,zip_code TEXT,tax_id TEXT UNIQUE,website TEXT,lat REAL,lon REAL)")
    conn.execute("INSERT INTO merchants(id,name,address,lat,lon) VALUES(42,'商店','台北市',25,121)")
    conn.commit()
    init_db(conn)
    assert conn.execute("SELECT id,coord_source,coord_accuracy,geocoded_address FROM merchants").fetchone() == (42,"legacy_unknown","unknown","台北市")
    conn.close()


def test_postal_fallback_is_stable_and_has_provenance(tmp_path):
    path = str(tmp_path / "incoming.db")
    conn = sqlite3.connect(path)
    init_db(conn)
    conn.execute("INSERT INTO merchants(name,address,zip_code) VALUES('商店','台北市中正區','100')")
    conn.commit()
    assert fill_missing_coords(path) == 1
    first = conn.execute("SELECT lat,lon,coord_source,coord_accuracy,geocoded_address FROM merchants").fetchone()
    assert first == (*zipcode_coords("100"),"postal_estimate","estimated","台北市中正區")
    conn.execute("UPDATE merchants SET lat=NULL,lon=NULL")
    conn.commit()
    assert fill_missing_coords(path) == 1
    assert conn.execute("SELECT lat,lon,coord_source,coord_accuracy,geocoded_address FROM merchants").fetchone() == first
    conn.close()


def test_stale_geocoded_address_is_not_preserved_on_sync(tmp_path):
    target, incoming = str(tmp_path / "live.db"), str(tmp_path / "incoming.db")
    for path in (target,incoming):
        conn = sqlite3.connect(path)
        init_db(conn)
        conn.execute("INSERT INTO merchants(id,name,address,tax_id) VALUES(42,'商店','高雄市','12345678')")
        if path == target:
            conn.execute("UPDATE merchants SET lat=25,lon=121,coord_source='address_geocode',coord_accuracy='estimated',geocoded_address='台北市'")
        conn.commit()
        conn.close()
    assert migrate_coords(target,incoming) == 0
    transactional_sync_db(incoming,target)
    with sqlite3.connect(target) as conn:
        assert conn.execute("SELECT id,lat,lon,coord_source FROM merchants").fetchone() == (42,None,None,None)
