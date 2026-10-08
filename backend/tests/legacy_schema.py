"""Fixtures for preserving historical user data; never part of app initialization."""
from backend.database import init_db


LEGACY_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        hashed_password TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

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

CREATE TABLE IF NOT EXISTS user_favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        merchant_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
        UNIQUE(user_id, merchant_id)
    );

CREATE TABLE IF NOT EXISTS user_itineraries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            start_date TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        );

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
        );

CREATE INDEX IF NOT EXISTS idx_user_expenses_user ON user_expenses(user_id);

CREATE INDEX IF NOT EXISTS idx_user_expenses_merchant ON user_expenses(merchant_id);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_id);

CREATE INDEX IF NOT EXISTS idx_user_favorites_merchant ON user_favorites(merchant_id);

CREATE INDEX IF NOT EXISTS idx_user_itineraries_user ON user_itineraries(user_id);

CREATE INDEX IF NOT EXISTS idx_itinerary_items_itinerary ON itinerary_items(itinerary_id);

CREATE INDEX IF NOT EXISTS idx_itinerary_items_merchant ON itinerary_items(merchant_id);
"""


def init_legacy_db(conn):
    init_db(conn)
    conn.executescript(LEGACY_SCHEMA)
