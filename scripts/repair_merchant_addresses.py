"""Recover addresses already embedded in imported merchant names; never geocode or guess.

Run with --db PATH for a read-only report; --apply makes a backed-up transaction.
"""
import argparse
import json
import sqlite3
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scheduler.update_data import split_merged, MERGED_ADDRESS_PATTERN
from shared.backups import backup_database
from shared.locking import database_lock
from shared.schema import bump_dataset_version, set_metadata
from shared.search import space_segment


def candidates(conn):
    changes = []
    for merchant_id, original in conn.execute("SELECT id,name FROM merchants WHERE address IS NULL OR trim(address)='' ORDER BY id"):
        name, address = split_merged(original)
        if name and address and MERGED_ADDRESS_PATTERN.match(address):
            changes.append((merchant_id, original, name, address))
    return changes


def repair(database_path, apply=False):
    path = str(Path(database_path).resolve())
    if not apply:
        with sqlite3.connect(Path(path).as_uri() + "?mode=ro", uri=True) as conn:
            return {"recoverable": len(candidates(conn)), "applied": 0}
    with database_lock(path), sqlite3.connect(path, timeout=30) as conn:
        changes = candidates(conn)
        if not changes:
            return {"recoverable": 0, "applied": 0}
        backup = backup_database(conn, path)
        try:
            conn.execute("BEGIN IMMEDIATE")
            changed = 0
            for merchant_id, original, name, address in changes:
                result = conn.execute("UPDATE merchants SET name=?,address=? WHERE id=? AND name=? AND (address IS NULL OR trim(address)='')", (name, address, merchant_id, original))
                if result.rowcount:
                    # Only update the corrected rows; preserve IDs and all user relations.
                    conn.execute("DELETE FROM merchants_fts WHERE rowid=?", (merchant_id,))
                    conn.execute("INSERT INTO merchants_fts(rowid,name,address) VALUES(?,?,?)", (merchant_id, space_segment(name), space_segment(address)))
                    # A previously missing address cannot support a precise geocode.
                    conn.execute("UPDATE merchants SET lat=NULL,lon=NULL,coord_source=NULL,coord_accuracy=NULL,geocoded_address=NULL WHERE id=? AND (coord_accuracy IS NULL OR coord_accuracy <> 'estimated')", (merchant_id,))
                    changed += 1
            if changed:
                bump_dataset_version(conn)
                set_metadata(conn, "dataset_updated_at", datetime.now(timezone(timedelta(hours=8))).isoformat())
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        return {"recoverable": len(changes), "applied": changed, "backup": backup}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    print(json.dumps(repair(args.db, args.apply), ensure_ascii=False))
