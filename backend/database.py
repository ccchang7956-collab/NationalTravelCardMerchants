import sqlite3
from typing import Generator
import os

# Docker 環境中由 DB_PATH 環境變數指定（預設 /data/merchants.db）
# 本地開發時 fallback 到同目錄的 merchants.db
_default_db = os.path.join(os.path.dirname(os.path.abspath(__file__)), "merchants.db")
DB_PATH = os.environ.get("DB_PATH", _default_db)

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
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
    finally:
        conn.close()

def init_db(conn: sqlite3.Connection = None):
    close_after = False
    if conn is None:
        conn = sqlite3.connect(DB_PATH)
        close_after = True
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        hashed_password TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        merchant_id INTEGER,
        merchant_name TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount > 0),
        category TEXT NOT NULL CHECK (category IN ('觀光旅遊', '自行運用')),
        expense_date TEXT NOT NULL,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE SET NULL
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_expenses_user ON user_expenses(user_id);")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        merchant_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
        UNIQUE(user_id, merchant_id)
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_id);")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_itineraries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            start_date TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS itinerary_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            itinerary_id INTEGER NOT NULL,
            merchant_id INTEGER,
            custom_name TEXT NOT NULL,
            address TEXT,
            lat REAL,
            lon REAL,
            order_index INTEGER NOT NULL,
            estimated_cost REAL DEFAULT 0,
            quota_category TEXT DEFAULT '一般消費',
            stay_minutes INTEGER DEFAULT 60,
            FOREIGN KEY (itinerary_id) REFERENCES user_itineraries (id) ON DELETE CASCADE,
            FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE SET NULL
        )
    """)

    conn.commit()
    if close_after:
        conn.close()


