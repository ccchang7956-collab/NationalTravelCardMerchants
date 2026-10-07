import sqlite3
import pytest
from scheduler.update_data import split_merged
from scripts.repair_merchant_addresses import repair
from shared.search import space_segment

@pytest.mark.parametrize("text,name,address", [
    ("Jolly Brewery+Restau台北市中正區衡陽路60號", "Jolly Brewery+Restau", "台北市中正區衡陽路60號"),
    ("卡多摩臺北市中正區中華路二段77&79號", "卡多摩", "臺北市中正區中華路二段77&79號"),
    ("測試店  桃園市桃園區中正路12號", "測試店", "桃園市桃園區中正路12號"),
    ("台北市中正區1號店台北市大安區和平路2號", "台北市中正區1號店台北市大安區和平路2號", ""),
    ("只有店名", "只有店名", ""),
    ("台北市立旅館", "台北市立旅館", ""),
    ("旅館台北市中正區", "旅館台北市中正區", ""),
])
def test_recover_only_complete_address(text, name, address):
    assert split_merged(text) == (name, address)


def test_repair_is_backed_up_idempotent_and_preserves_relations(tmp_path):
    path = tmp_path / "merchants.db"
    with sqlite3.connect(path) as conn:
        conn.executescript("""
        CREATE TABLE merchants(id INTEGER PRIMARY KEY,name TEXT,address TEXT,lat REAL,lon REAL,coord_source TEXT,coord_accuracy TEXT,geocoded_address TEXT);
        CREATE TABLE app_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE VIRTUAL TABLE merchants_fts USING fts5(name,address);
        CREATE TABLE favorites(merchant_id INTEGER);
        INSERT INTO merchants(id,name,address) VALUES(7,'旅館台北市中正區測試路1號',''),(8,'未提供地址店家',NULL),(9,'正常店','新北市板橋區測試路2號');
        INSERT INTO favorites VALUES(7);
        """)
        for merchant_id, name, address in conn.execute("SELECT id,name,address FROM merchants"):
            conn.execute("INSERT INTO merchants_fts(rowid,name,address) VALUES(?,?,?)", (merchant_id,space_segment(name),space_segment(address)))
    assert repair(path) == {"recoverable": 1, "applied": 0}
    result = repair(path, True)
    assert result["applied"] == 1
    with sqlite3.connect(result["backup"]) as backup:
        assert backup.execute("SELECT address FROM merchants WHERE id=7").fetchone()[0] == ""
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT name,address FROM merchants WHERE id=7").fetchone() == ("旅館", "台北市中正區測試路1號")
        assert conn.execute("SELECT merchant_id FROM favorites").fetchone()[0] == 7
        assert conn.execute("SELECT address FROM merchants WHERE id=8").fetchone()[0] is None
        assert conn.execute("SELECT rowid FROM merchants_fts WHERE merchants_fts MATCH ?", (space_segment("測試路"),)).fetchall()
        assert conn.execute("SELECT value FROM app_metadata WHERE key='dataset_version'").fetchone()[0]
    assert repair(path, True)["applied"] == 0
