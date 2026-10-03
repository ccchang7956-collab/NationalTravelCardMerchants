import logging
import sqlite3
import uuid

from shared.backups import backup_database
from shared.search import FTS_VERSION, space_segment
from shared.locking import database_lock

COORD_VERSION = "1"
COORD_COLUMNS = {"coord_source": "TEXT", "coord_accuracy": "TEXT", "geocoded_address": "TEXT"}


def metadata_value(conn, key):
    if not conn.execute("SELECT 1 FROM sqlite_master WHERE name='app_metadata'").fetchone():
        return None
    row = conn.execute("SELECT value FROM app_metadata WHERE key=?", (key,)).fetchone()
    return row[0] if row else None


def set_metadata(conn, key, value):
    conn.execute("INSERT INTO app_metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))


def ensure_schema(conn):
    """Add compatible columns inside the caller's write transaction."""
    conn.execute("CREATE TABLE IF NOT EXISTS app_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    columns = {row[1] for row in conn.execute("PRAGMA table_info(merchants)")}
    for name, kind in {"lat": "REAL", "lon": "REAL", **COORD_COLUMNS}.items():
        if name not in columns:
            conn.execute(f"ALTER TABLE merchants ADD COLUMN {name} {kind}")
    if metadata_value(conn, "coordinates_version") != COORD_VERSION:
        conn.execute("UPDATE merchants SET lat=NULL,lon=NULL,coord_source=NULL,coord_accuracy=NULL,geocoded_address=NULL WHERE (lat IS NOT NULL OR lon IS NOT NULL) AND (lat IS NULL OR lon IS NULL OR lat NOT BETWEEN -90 AND 90 OR lon NOT BETWEEN -180 AND 180)")
        conn.execute("UPDATE merchants SET coord_source='legacy_unknown', coord_accuracy='unknown', geocoded_address=address WHERE lat IS NOT NULL AND lon IS NOT NULL AND coord_source IS NULL")
        set_metadata(conn, "coordinates_version", COORD_VERSION)
    if not metadata_value(conn, "dataset_version"):
        bump_dataset_version(conn)


def bump_dataset_version(conn):
    version = uuid.uuid4().hex
    set_metadata(conn, "dataset_version", version)
    return version


def rebuild_search_index(conn):
    definition = conn.execute("SELECT sql FROM sqlite_master WHERE name='merchants_fts'").fetchone()
    if definition and ("content=" in definition[0].replace(" ", "").lower() or "trigram" in definition[0].lower()):
        conn.execute("DROP TABLE merchants_fts")
    conn.execute('CREATE VIRTUAL TABLE IF NOT EXISTS merchants_fts USING fts5(name, address, tokenize="unicode61")')
    conn.execute("DELETE FROM merchants_fts")
    rows = conn.execute("SELECT id,name,address FROM merchants").fetchall()
    conn.executemany("INSERT INTO merchants_fts(rowid,name,address) VALUES(?,?,?)", ((row[0], space_segment(row[1]), space_segment(row[2])) for row in rows))
    set_metadata(conn, "fts_version", FTS_VERSION)


def schema_needs_migration(conn):
    if metadata_value(conn, "fts_version") != FTS_VERSION or metadata_value(conn, "coordinates_version") != COORD_VERSION:
        return True
    try:
        count = conn.execute("SELECT COUNT(*) FROM merchants").fetchone()[0]
        indexed = conn.execute("SELECT COUNT(*) FROM merchants_fts").fetchone()[0]
        if count != indexed:
            logging.warning("FTS mismatch merchants=%s fts=%s, rebuilding", count, indexed)
            return True
    except sqlite3.DatabaseError:
        return True
    return False


def migrate_database(conn, backup=True):
    path = conn.execute("PRAGMA database_list").fetchone()[2]
    with database_lock(path):
        return _migrate_database(conn, path, backup)


def _migrate_database(conn, path, backup):
    """Versioned migration preserving merchant IDs and relationships."""
    if not schema_needs_migration(conn):
        return False
    if conn.in_transaction:
        raise RuntimeError("Migration requires a connection without pending writes")
    if backup and path:
        backup_database(conn, path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        if schema_needs_migration(conn):
            ensure_schema(conn)
            rebuild_search_index(conn)
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        raise
