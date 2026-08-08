import os
import sqlite3
import tempfile
import threading
import time
import pytest
from scheduler.update_data import transactional_sync_db
from backend.database import init_db

def create_mock_target_db(db_path):
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    conn.execute("PRAGMA journal_mode = WAL;")
    init_db(conn)
    cursor = conn.cursor()
    cursor.execute("INSERT INTO merchants (id, name, address, zip_code, tax_id, lat, lon) VALUES (1, 'Merchant 1', 'Addr 1', '100', '11111111', 25.0, 121.5)")
    cursor.execute("INSERT INTO merchants (id, name, address, zip_code, tax_id, lat, lon) VALUES (2, 'Merchant 2', 'Addr 2', '100', '22222222', 25.1, 121.6)")
    
    cursor.execute("INSERT INTO users (id, email, hashed_password, name) VALUES (1, 'u1@test.com', 'pass', 'User 1')")
    cursor.execute("INSERT INTO user_favorites (user_id, merchant_id) VALUES (1, 1)")
    cursor.execute("INSERT INTO user_expenses (user_id, merchant_id, merchant_name, amount, category, expense_date) VALUES (1, 1, 'Merchant 1', 100, '觀光旅遊', '2026-08-07')")
    cursor.execute("INSERT INTO user_itineraries (id, user_id, title) VALUES (1, 1, 'Trip 1')")
    cursor.execute("INSERT INTO itinerary_items (itinerary_id, merchant_id, custom_name, order_index) VALUES (1, 1, 'Stop 1', 0)")
    
    cursor.execute("DELETE FROM merchants_fts")
    cursor.execute("INSERT INTO merchants_fts (rowid, name, address) VALUES (1, 'Merchant 1', 'Addr 1')")
    cursor.execute("INSERT INTO merchants_fts (rowid, name, address) VALUES (2, 'Merchant 2', 'Addr 2')")
    conn.commit()
    conn.close()

def create_mock_temp_db(db_path, merchants_list, industries_list=None):
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON;")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE merchants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT,
            zip_code TEXT,
            tax_id TEXT UNIQUE,
            website TEXT,
            lat REAL,
            lon REAL
        )
    """)
    cursor.execute("""
        CREATE TABLE merchant_industries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tax_id TEXT NOT NULL,
            industry_code TEXT NOT NULL,
            industry_name TEXT NOT NULL,
            priority INTEGER NOT NULL
        )
    """)
    for m in merchants_list:
        cursor.execute(
            "INSERT INTO merchants (name, address, zip_code, tax_id, website, lat, lon) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (m.get("name"), m.get("address"), m.get("zip_code"), m.get("tax_id"), m.get("website"), m.get("lat"), m.get("lon"))
        )
    if industries_list:
        for ind in industries_list:
            cursor.execute(
                "INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)",
                (ind.get("tax_id"), ind.get("industry_code"), ind.get("industry_name"), ind.get("priority"))
            )
    conn.commit()
    conn.close()

# ── Stress Test 1: Concurrency under WAL Mode ─────────────────────────────────
def test_concurrency_stress_wal():
    with tempfile.TemporaryDirectory() as tmpdir:
        target_db = os.path.join(tmpdir, "target.db")
        temp_db = os.path.join(tmpdir, "temp.db")
        
        create_mock_target_db(target_db)
        
        temp_merchants = [
            {"name": f"New Merchant {i}", "address": f"New Addr {i}", "zip_code": "100", "tax_id": f"T{i:07d}", "website": None, "lat": 25.0 + i*0.001, "lon": 121.5 + i*0.001}
            for i in range(100)
        ]
        create_mock_temp_db(temp_db, temp_merchants)
        
        stop_flag = False
        read_errors = []
        read_counts = [0]
        
        def reader_thread():
            conn = sqlite3.connect(target_db, check_same_thread=False)
            conn.execute("PRAGMA busy_timeout = 5000;")
            conn.execute("PRAGMA journal_mode = WAL;")
            while not stop_flag:
                try:
                    c = conn.cursor()
                    res = c.execute("SELECT COUNT(*) FROM merchants").fetchone()
                    assert res[0] >= 0
                    read_counts[0] += 1
                except Exception as e:
                    read_errors.append(str(e))
                time.sleep(0.001)
            conn.close()

        threads = [threading.Thread(target=reader_thread) for _ in range(10)]
        for t in threads:
            t.start()
            
        for _ in range(3):
            transactional_sync_db(temp_db, target_db)
            time.sleep(0.05)
            
        stop_flag = True
        for t in threads:
            t.join()
            
        assert len(read_errors) == 0, f"Concurrent read errors encountered: {read_errors[:5]}"
        assert read_counts[0] > 0

# ── Vulnerability Bug Test A: Empty String tax_id Crash Bug Fix Verification ──
def test_empty_string_tax_id_crash_bug():
    """
    Verifies that when temp_db contains a merchant with tax_id = '' or whitespace,
    running transactional_sync_db repeatedly does NOT crash with IntegrityError,
    normalizes tax_id to NULL, and does not duplicate records.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        target_db = os.path.join(tmpdir, "target.db")
        temp_db = os.path.join(tmpdir, "temp.db")
        
        create_mock_target_db(target_db)
        
        temp_merchants = [
            {"name": "Merchant EmptyTaxID", "address": "Addr Empty", "zip_code": "100", "tax_id": "", "lat": 25.0, "lon": 121.5},
            {"name": "Merchant SpacesTaxID", "address": "Addr Spaces", "zip_code": "100", "tax_id": "   ", "lat": 25.0, "lon": 121.5},
        ]
        create_mock_temp_db(temp_db, temp_merchants)
        
        # First sync succeeds
        transactional_sync_db(temp_db, target_db)
        
        # Second sync with same temp_db must also succeed without IntegrityError
        transactional_sync_db(temp_db, target_db)
        
        conn = sqlite3.connect(target_db)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        empty_m = c.execute("SELECT * FROM merchants WHERE name = 'Merchant EmptyTaxID'").fetchall()
        spaces_m = c.execute("SELECT * FROM merchants WHERE name = 'Merchant SpacesTaxID'").fetchall()
        conn.close()
        
        assert len(empty_m) == 1, f"Expected 1 record for Merchant EmptyTaxID, got {len(empty_m)}"
        assert empty_m[0]["tax_id"] is None, f"Expected NULL tax_id, got {empty_m[0]['tax_id']!r}"
        
        assert len(spaces_m) == 1, f"Expected 1 record for Merchant SpacesTaxID, got {len(spaces_m)}"
        assert spaces_m[0]["tax_id"] is None, f"Expected NULL tax_id, got {spaces_m[0]['tax_id']!r}"

# ── Vulnerability Bug Test B: NULL tax_id Unbounded Duplication & Off-Shelf Cleanup Fix Verification ──
def test_null_tax_id_unbounded_duplication():
    """
    Verifies that when temp_db contains a merchant with tax_id IS NULL,
    running transactional_sync_db repeatedly does NOT insert duplicate rows (count == 1),
    and step 3 DELETE statement correctly cleans it up if removed from temp_db.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        target_db = os.path.join(tmpdir, "target.db")
        temp_db = os.path.join(tmpdir, "temp.db")
        
        create_mock_target_db(target_db)
        
        temp_merchants = [
            {"name": "Merchant NullTaxID", "address": "Addr Null", "zip_code": "100", "tax_id": None, "lat": 25.0, "lon": 121.5},
        ]
        create_mock_temp_db(temp_db, temp_merchants)
        
        # Perform sync 3 times
        transactional_sync_db(temp_db, target_db)
        transactional_sync_db(temp_db, target_db)
        transactional_sync_db(temp_db, target_db)
        
        conn = sqlite3.connect(target_db)
        c = conn.cursor()
        null_count = c.execute("SELECT COUNT(*) FROM merchants WHERE name = 'Merchant NullTaxID'").fetchone()[0]
        conn.close()
        
        # Count must be exactly 1, confirming no duplicate accumulation
        assert null_count == 1, f"Expected exactly 1 record for NULL tax_id after multiple syncs, got {null_count}"
        
        # Test off-shelf cleanup (removal from temp_db)
        empty_temp_db = os.path.join(tmpdir, "empty_temp.db")
        create_mock_temp_db(empty_temp_db, [])
        transactional_sync_db(empty_temp_db, target_db)
        
        conn = sqlite3.connect(target_db)
        c = conn.cursor()
        cleaned_count = c.execute("SELECT COUNT(*) FROM merchants WHERE name = 'Merchant NullTaxID'").fetchone()[0]
        conn.close()
        
        assert cleaned_count == 0, f"Expected NULL tax_id merchant to be deleted after off-shelf removal, got {cleaned_count}"

# ── Stress Test 3: Transaction Rollback Integrity ─────────────────────────────
def test_transaction_rollback_on_failure():
    with tempfile.TemporaryDirectory() as tmpdir:
        target_db = os.path.join(tmpdir, "target.db")
        temp_db = os.path.join(tmpdir, "temp.db")
        
        create_mock_target_db(target_db)
        
        conn = sqlite3.connect(temp_db)
        conn.execute("CREATE TABLE merchants (tax_id TEXT);")
        conn.commit()
        conn.close()
        
        with pytest.raises(Exception):
            transactional_sync_db(temp_db, target_db)
            
        conn = sqlite3.connect(target_db)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        m_count = c.execute("SELECT COUNT(*) FROM merchants").fetchone()[0]
        u_count = c.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        conn.close()
        
        assert m_count == 2
        assert u_count == 1
