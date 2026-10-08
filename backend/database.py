import sqlite3
from typing import Generator
import os
from shared.schema import migrate_database

# Docker 環境中由 DB_PATH 環境變數指定（預設 /data/merchants.db）
# 本地開發時 fallback 到同目錄的 merchants.db
_default_db = os.path.join(os.path.dirname(os.path.abspath(__file__)), "merchants.db")
DB_PATH = os.environ.get("DB_PATH", _default_db)

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10.0)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.row_factory = sqlite3.Row
    return conn

def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = get_db_connection()
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db(conn: sqlite3.Connection = None):
    close_after = False
    if conn is None:
        # 與 get_db_connection 同等級：排程 BEGIN IMMEDIATE 大交易期間重啟，
        # 裸連線（預設 timeout 5s、無 WAL）會直接 database is locked 炸掉 lifespan
        conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10.0)
        close_after = True
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    cursor = conn.cursor()
    existed = cursor.execute("SELECT 1 FROM sqlite_master WHERE name='merchants'").fetchone()
    if existed:
        migrate_database(conn)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS merchants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        address TEXT,
        zip_code TEXT,
        tax_id TEXT,
        website TEXT,
        lat REAL,
        lon REAL
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS merchant_tax_ids (
        tax_id TEXT PRIMARY KEY
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS merchant_industries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tax_id TEXT NOT NULL,
        industry_code TEXT NOT NULL,
        industry_name TEXT NOT NULL,
        priority INTEGER NOT NULL,
        FOREIGN KEY(tax_id) REFERENCES merchant_tax_ids(tax_id) ON DELETE CASCADE
    );
    """)

    cursor.execute("""
    CREATE VIRTUAL TABLE IF NOT EXISTS merchants_fts USING fts5(
        name,
        address,
        tokenize="unicode61"
    );
    """)

    # 建立特約商店與索引
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_merchants_tax_id ON merchants(tax_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_merchants_zip_code ON merchants(zip_code);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_merchants_lat_lon ON merchants(lat, lon);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_merchants_address ON merchants(address);")

    # 建立特約商店行業別索引
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_merchant_industries_tax_id ON merchant_industries(tax_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_merchant_industries_code ON merchant_industries(industry_code);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_merchant_industries_tax_prio_code ON merchant_industries(tax_id, priority, industry_code);")

    # FTS 數量一致檢查：merchants 與 merchants_fts 筆數不一致時告警（需重建）
    try:
        c = cursor.execute("SELECT COUNT(*) FROM merchants").fetchone()[0]
        f = cursor.execute("SELECT COUNT(*) FROM merchants_fts").fetchone()[0]
        if c != f:
            import logging; logging.warning(f"FTS mismatch merchants={c} fts={f}, rebuild needed")
    except Exception:
        pass

    conn.commit()
    if not existed:
        migrate_database(conn, backup=False)
    if close_after:
        conn.close()

