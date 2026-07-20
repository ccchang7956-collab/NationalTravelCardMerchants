import sqlite3
import pytest
from backend.database import init_db

def test_init_db_creates_user_tables():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    init_db(conn)
    
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = {row["name"] for row in cursor.fetchall()}
    
    assert "users" in tables
    assert "user_expenses" in tables
    assert "user_favorites" in tables
