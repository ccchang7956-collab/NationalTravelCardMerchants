import logging
import sqlite3
import uuid

from shared.backups import backup_database
from shared.search import FTS_VERSION, space_segment
from shared.locking import database_lock

COORD_VERSION = "1"
MERCHANT_IDENTITY_VERSION = "2"
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


def _merchant_identity_schema_current(conn):
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if not {"merchants", "merchant_tax_ids", "merchant_industries"}.issubset(tables):
        return False

    for index in conn.execute("PRAGMA index_list(merchants)"):
        if not index[2]:
            continue
        columns = [row[2] for row in conn.execute(f'PRAGMA index_info("{index[1]}")')]
        if columns == ["tax_id"]:
            return False

    foreign_keys = conn.execute("PRAGMA foreign_key_list(merchant_industries)").fetchall()
    return any(row[2] == "merchant_tax_ids" and row[3] == "tax_id" and row[4] == "tax_id" for row in foreign_keys)


def _migrate_merchant_identity_schema(conn):
    """Allow multiple locations per tax ID and move industry ownership to tax IDs."""
    merchant_columns = {row[1] for row in conn.execute("PRAGMA table_info(merchants)")}
    fields = (
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT"),
        ("name", "TEXT NOT NULL"),
        ("address", "TEXT"),
        ("zip_code", "TEXT"),
        ("tax_id", "TEXT"),
        ("website", "TEXT"),
        ("lat", "REAL"),
        ("lon", "REAL"),
        ("coord_source", "TEXT"),
        ("coord_accuracy", "TEXT"),
        ("geocoded_address", "TEXT"),
    )
    conn.execute("CREATE TABLE merchants_new (" + ",".join(f'"{name}" {kind}' for name, kind in fields) + ")")
    copied = [name for name, _ in fields if name in merchant_columns]
    column_sql = ",".join(f'"{name}"' for name in copied)
    conn.execute(f"INSERT INTO merchants_new ({column_sql}) SELECT {column_sql} FROM merchants")
    conn.execute("DROP TABLE merchants")
    conn.execute("ALTER TABLE merchants_new RENAME TO merchants")

    conn.execute("CREATE TABLE IF NOT EXISTS merchant_tax_ids (tax_id TEXT PRIMARY KEY)")
    conn.execute("INSERT OR IGNORE INTO merchant_tax_ids(tax_id) SELECT DISTINCT tax_id FROM merchants WHERE tax_id IS NOT NULL AND tax_id <> ''")

    industry_tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    industry_rows = []
    if "merchant_industries" in industry_tables:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(merchant_industries)")}
        if {"tax_id", "industry_code", "industry_name", "priority"}.issubset(columns):
            id_expr = "id" if "id" in columns else "NULL"
            industry_rows = conn.execute(
                f"SELECT {id_expr}, tax_id, industry_code, industry_name, priority FROM merchant_industries"
            ).fetchall()
        conn.execute("DROP TABLE merchant_industries")

    conn.execute("""
        CREATE TABLE merchant_industries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tax_id TEXT NOT NULL,
            industry_code TEXT NOT NULL,
            industry_name TEXT NOT NULL,
            priority INTEGER NOT NULL,
            FOREIGN KEY(tax_id) REFERENCES merchant_tax_ids(tax_id) ON DELETE CASCADE
        )
    """)
    valid_tax_ids = {row[0] for row in conn.execute("SELECT tax_id FROM merchant_tax_ids")}
    for row in industry_rows:
        tax_id, code, name, priority = row[1:]
        if tax_id and tax_id in valid_tax_ids:
            if row[0] is None:
                conn.execute(
                    "INSERT INTO merchant_industries(tax_id,industry_code,industry_name,priority) VALUES(?,?,?,?)",
                    (tax_id, code, name, priority),
                )
            else:
                conn.execute(
                    "INSERT INTO merchant_industries(id,tax_id,industry_code,industry_name,priority) VALUES(?,?,?,?,?)",
                    row,
                )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_merchants_tax_id ON merchants(tax_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_merchants_zip_code ON merchants(zip_code)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_merchants_lat_lon ON merchants(lat, lon)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_merchants_address ON merchants(address)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_merchant_industries_tax_id ON merchant_industries(tax_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_merchant_industries_code ON merchant_industries(industry_code)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_merchant_industries_tax_prio_code ON merchant_industries(tax_id, priority, industry_code)")


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
    if (
        metadata_value(conn, "fts_version") != FTS_VERSION
        or metadata_value(conn, "coordinates_version") != COORD_VERSION
        or metadata_value(conn, "merchant_identity_version") != MERCHANT_IDENTITY_VERSION
        or not _merchant_identity_schema_current(conn)
    ):
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
    original_foreign_keys = conn.execute("PRAGMA foreign_keys").fetchone()[0]
    identity_migration = not _merchant_identity_schema_current(conn)
    if identity_migration and original_foreign_keys:
        conn.execute("PRAGMA foreign_keys=OFF")
    try:
        conn.execute("BEGIN IMMEDIATE")
        if schema_needs_migration(conn):
            ensure_schema(conn)
            if identity_migration:
                _migrate_merchant_identity_schema(conn)
            set_metadata(conn, "merchant_identity_version", MERCHANT_IDENTITY_VERSION)
            rebuild_search_index(conn)
        violations = conn.execute("PRAGMA foreign_key_check").fetchall()
        if violations:
            raise RuntimeError(f"Foreign key check failed after migration: {violations[:5]}")
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        raise
    finally:
        if original_foreign_keys:
            conn.execute("PRAGMA foreign_keys=ON")
