import sqlite3
from typing import Generator
import os

# Docker 環境中由 DB_PATH 環境變數指定（預設 /data/merchants.db）
# 本地開發時 fallback 到同目錄的 merchants.db
_default_db = os.path.join(os.path.dirname(os.path.abspath(__file__)), "merchants.db")
DB_PATH = os.environ.get("DB_PATH", _default_db)

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.row_factory = sqlite3.Row
    return conn

def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = get_db_connection()
    try:
        yield conn
    finally:
        conn.close()
