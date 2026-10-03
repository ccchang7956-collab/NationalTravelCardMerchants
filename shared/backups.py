"""Publish standalone SQLite snapshots, including committed WAL transactions."""
import os
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def backup_database(source: sqlite3.Connection, database_path: str) -> str:
    if source.in_transaction:
        raise RuntimeError("SQLite backup must run before the write transaction")
    target = Path(database_path)
    descriptor, staging = tempfile.mkstemp(prefix=target.name + ".", suffix=".backup.tmp", dir=target.parent)
    os.close(descriptor)
    try:
        destination = sqlite3.connect(staging)
        try:
            source.backup(destination, pages=256)
            if destination.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise RuntimeError("SQLite backup failed integrity validation")
            destination.execute("SELECT COUNT(*) FROM merchants").fetchone()
        finally:
            destination.close()
        with open(staging, "rb") as snapshot:
            os.fsync(snapshot.fileno())
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
        published = f"{database_path}.{stamp}-{Path(staging).stem.rsplit('.', 1)[-1]}.bak"
        os.replace(staging, published)
        return published
    finally:
        if os.path.exists(staging):
            os.unlink(staging)
