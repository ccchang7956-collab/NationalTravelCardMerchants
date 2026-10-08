"""Seed a disposable database for CI/browser smoke checks; never use the app default."""
import json
import os
from pathlib import Path
import sqlite3
import sys
from datetime import datetime, timezone

sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from backend.database import init_db
from shared.schema import rebuild_search_index, bump_dataset_version, set_metadata


def main():
    path = os.environ.get("DB_PATH")
    if not path or not str(Path(path).resolve()).startswith("/tmp/"):
        raise RuntimeError("Smoke DB_PATH must explicitly point inside /tmp")
    Path(path).parent.mkdir(parents=True,exist_ok=True)
    with sqlite3.connect(path) as conn:
        init_db(conn)
        conn.executemany("INSERT INTO merchants(id,name,address,zip_code,tax_id,website,lat,lon,coord_source,coord_accuracy,geocoded_address) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",[
            (1,"台北咖啡商店","台北市信義區松仁路1號","110","12345678","https://shop.example",25.034,121.565,"postal_estimate","estimated","台北市信義區松仁路1號"),
            (2,"台北無官網商店","台北市信義區松仁路2號","110","23456789",None,25.034,121.566,"legacy_unknown","unknown","台北市信義區松仁路2號"),
            (3,"新北咖啡商店","新北市板橋區文化路1號","220","34567890","https://shop.example",25.034,121.564,"address_geocode","estimated","新北市板橋區文化路1號"),
        ])
        # City pages display 40 rows; seed a second page without changing nearby results.
        conn.executemany("INSERT INTO merchants(id,name,address,zip_code,tax_id) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING", [
            (100 + i, f"分頁測試商店 {i + 1}", f"台北市中正區測試路{i + 1}號", "100", f"9000{i:04d}")
            for i in range(40)
        ])
        conn.execute("INSERT OR IGNORE INTO merchant_tax_ids(tax_id) SELECT DISTINCT tax_id FROM merchants WHERE tax_id IS NOT NULL AND tax_id <> ''")
        conn.executemany("INSERT INTO merchant_industries(tax_id,industry_code,industry_name,priority) SELECT ?,?,?,1 WHERE NOT EXISTS(SELECT 1 FROM merchant_industries WHERE tax_id=?)", [(row[0],"561115","餐館業",row[0]) for row in conn.execute("SELECT tax_id FROM merchant_tax_ids")])
        total = conn.execute("SELECT COUNT(*) FROM merchants").fetchone()[0]
        rebuild_search_index(conn)
        bump_dataset_version(conn)
        now = datetime.now(timezone.utc).isoformat()
        set_metadata(conn,"dataset_updated_at",now)
    Path(path).with_name("update_meta.json").write_text(json.dumps({"last_updated":now,"last_checked":now,"last_successful_check":now,"last_check_result":"updated","total_merchants":total}))


if __name__ == "__main__":
    main()
