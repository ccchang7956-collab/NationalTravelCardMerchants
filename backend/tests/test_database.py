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
    
    assert "merchants" in tables
    assert "merchant_industries" in tables
    assert "merchants_fts" in tables
    assert "users" in tables
    assert "user_expenses" in tables
    assert "user_favorites" in tables
    assert "user_itineraries" in tables
    assert "itinerary_items" in tables

def test_init_db_creates_indexes():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    init_db(conn)

    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='index';")
    indexes = {row["name"] for row in cursor.fetchall()}

    assert "idx_merchants_tax_id" in indexes
    assert "idx_merchants_zip_code" in indexes
    assert "idx_merchants_lat_lon" in indexes
    assert "idx_merchants_address" in indexes
    assert "idx_merchant_industries_tax_id" in indexes
    assert "idx_merchant_industries_code" in indexes
    assert "idx_user_expenses_user" in indexes
    assert "idx_user_favorites_user" in indexes
    assert "idx_user_itineraries_user" in indexes

def test_init_db_tax_id_unique():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    init_db(conn)

    cursor = conn.cursor()
    cursor.execute("INSERT INTO merchants (name, tax_id) VALUES ('Merchant A', '12345678')")
    conn.commit()

    with pytest.raises(sqlite3.IntegrityError):
        cursor.execute("INSERT INTO merchants (name, tax_id) VALUES ('Merchant B', '12345678')")
        conn.commit()

