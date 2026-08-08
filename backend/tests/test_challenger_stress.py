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

# ── Stress / Bug Test 1: Orphan Industry tax_id Foreign Key Failure ───────────
def test_orphan_industry_tax_id_fk_failure():
    with tempfile.TemporaryDirectory() as tmpdir:
        target_db = os.path.join(tmpdir, "target.db")
        temp_db = os.path.join(tmpdir, "temp.db")
        
        create_mock_target_db(target_db)
        
        temp_merchants = [
            {"name": "Valid Merchant", "address": "Addr 1", "zip_code": "100", "tax_id": "11111111", "lat": 25.0, "lon": 121.5}
        ]
        # Industry has an orphan tax_id "99999999" not present in temp_merchants or target_db
        temp_industries = [
            {"tax_id": "11111111", "industry_code": "01", "industry_name": "Food", "priority": 1},
            {"tax_id": "99999999", "industry_code": "02", "industry_name": "Hotel", "priority": 1}
        ]
        create_mock_temp_db(temp_db, temp_merchants, temp_industries)
        
        # Test whether sync handles or crashes on orphan industry foreign keys
        try:
            transactional_sync_db(temp_db, target_db)
        except sqlite3.IntegrityError as e:
            pytest.fail(f"transactional_sync_db failed with FK IntegrityError due to orphan industry tax_id: {e}")

# ── Stress / Bug Test 2: Unicode Fullwidth Whitespace tax_id Normalization ───
def test_unicode_whitespace_tax_id_crash():
    with tempfile.TemporaryDirectory() as tmpdir:
        target_db = os.path.join(tmpdir, "target.db")
        temp_db = os.path.join(tmpdir, "temp.db")
        
        create_mock_target_db(target_db)
        
        # Two merchants with fullwidth space tax_id "\u3000"
        temp_merchants = [
            {"name": "Merchant Fullwidth 1", "address": "Addr 1", "zip_code": "100", "tax_id": "\u3000", "lat": 25.0, "lon": 121.5},
            {"name": "Merchant Fullwidth 2", "address": "Addr 2", "zip_code": "100", "tax_id": "  \u3000  ", "lat": 25.0, "lon": 121.5},
        ]
        create_mock_temp_db(temp_db, temp_merchants)
        
        try:
            transactional_sync_db(temp_db, target_db)
        except sqlite3.IntegrityError as e:
            pytest.fail(f"transactional_sync_db failed with IntegrityError on fullwidth space tax_id: {e}")
            
        conn = sqlite3.connect(target_db)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        m1 = c.execute("SELECT * FROM merchants WHERE name = 'Merchant Fullwidth 1'").fetchall()
        m2 = c.execute("SELECT * FROM merchants WHERE name = 'Merchant Fullwidth 2'").fetchall()
        conn.close()
        
        assert len(m1) == 1 and m1[0]["tax_id"] is None, f"Expected NULL tax_id for m1, got {m1}"
        assert len(m2) == 1 and m2[0]["tax_id"] is None, f"Expected NULL tax_id for m2, got {m2}"

# ── Stress / Bug Test 3: Concurrent Write Lock Escalation / Deadlock ───────────
def test_concurrent_api_write_during_sync():
    with tempfile.TemporaryDirectory() as tmpdir:
        target_db = os.path.join(tmpdir, "target.db")
        temp_db = os.path.join(tmpdir, "temp.db")
        
        create_mock_target_db(target_db)
        
        temp_merchants = [
            {"name": "Merchant 1", "address": "Addr 1", "zip_code": "100", "tax_id": "11111111", "lat": 25.0, "lon": 121.5}
        ] + [
            {"name": f"Sync Merchant {i}", "address": f"Addr {i}", "zip_code": "100", "tax_id": f"S{i:07d}", "lat": 25.0, "lon": 121.5}
            for i in range(50)
        ]
        create_mock_temp_db(temp_db, temp_merchants)
        
        write_errors = []
        sync_errors = []
        stop_flag = False
        
        def api_writer_thread():
            conn = sqlite3.connect(target_db, check_same_thread=False)
            conn.execute("PRAGMA foreign_keys = ON;")
            conn.execute("PRAGMA busy_timeout = 5000;")
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA synchronous = NORMAL;")
            
            i = 0
            while not stop_flag:
                try:
                    conn.execute("BEGIN IMMEDIATE")
                    # Read first (simulating endpoint checking user or merchant)
                    c = conn.cursor()
                    c.execute("SELECT COUNT(*) FROM merchants")
                    # Then write (simulating adding expense or favorite)
                    c.execute("INSERT INTO user_expenses (user_id, merchant_id, merchant_name, amount, category, expense_date) VALUES (1, 1, 'Merchant 1', ?, '觀光旅遊', '2026-08-07')", (10 + (i % 100),))
                    conn.commit()
                except Exception as e:
                    write_errors.append(str(e))
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                i += 1
                time.sleep(0.001)
            conn.close()

        threads = [threading.Thread(target=api_writer_thread) for _ in range(5)]
        for t in threads:
            t.start()
            
        for _ in range(5):
            try:
                transactional_sync_db(temp_db, target_db)
            except Exception as e:
                sync_errors.append(str(e))
            time.sleep(0.01)
            
        stop_flag = True
        for t in threads:
            t.join()
            
        assert len(sync_errors) == 0, f"Sync errors under concurrent API write: {sync_errors}"
        assert len(write_errors) == 0, f"API write errors during DB sync: {write_errors[:5]}"

# ── Stress Test 4: Off-Shelf Merchant Cascade & Set-Null Behavior ─────────────
def test_off_shelf_merchant_cascades():
    with tempfile.TemporaryDirectory() as tmpdir:
        target_db = os.path.join(tmpdir, "target.db")
        temp_db = os.path.join(tmpdir, "temp.db")
        
        create_mock_target_db(target_db)
        
        # Temp DB only contains Merchant 2 (Merchant 1 is off-shelved)
        temp_merchants = [
            {"name": "Merchant 2", "address": "Addr 2", "zip_code": "100", "tax_id": "22222222", "lat": 25.1, "lon": 121.6}
        ]
        create_mock_temp_db(temp_db, temp_merchants)
        
        transactional_sync_db(temp_db, target_db)
        
        conn = sqlite3.connect(target_db)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        # Check merchant 1 is gone
        m1 = c.execute("SELECT * FROM merchants WHERE id = 1").fetchone()
        assert m1 is None, "Merchant 1 should have been deleted"
        
        # Check user_favorites for merchant 1 was CASCADE deleted
        fav = c.execute("SELECT * FROM user_favorites WHERE merchant_id = 1").fetchall()
        assert len(fav) == 0, "user_favorites should be cascade deleted"
        
        # Check user_expenses for merchant 1 has merchant_id SET NULL
        exp = c.execute("SELECT * FROM user_expenses WHERE user_id = 1").fetchall()
        assert len(exp) == 1
        assert exp[0]["merchant_id"] is None, "user_expenses.merchant_id should be SET NULL"
        assert exp[0]["merchant_name"] == "Merchant 1", "user_expenses.merchant_name preserved"
        
        # Check itinerary_items for merchant 1 has merchant_id SET NULL
        itin = c.execute("SELECT * FROM itinerary_items WHERE id = 1").fetchall()
        assert len(itin) == 1
        assert itin[0]["merchant_id"] is None, "itinerary_items.merchant_id should be SET NULL"
        
        conn.close()

# ── Stress Test 5: FTS Integrity after Multiple Sync Operations ──────────────
def test_fts_integrity_after_sync():
    with tempfile.TemporaryDirectory() as tmpdir:
        target_db = os.path.join(tmpdir, "target.db")
        temp_db = os.path.join(tmpdir, "temp.db")
        
        create_mock_target_db(target_db)
        
        temp_merchants = [
            {"name": "Super Coffee Shop", "address": "Taipei Xinyi Rd", "zip_code": "110", "tax_id": "88888888", "lat": 25.03, "lon": 121.56}
        ]
        create_mock_temp_db(temp_db, temp_merchants)
        
        transactional_sync_db(temp_db, target_db)
        
        conn = sqlite3.connect(target_db)
        c = conn.cursor()
        
        # Query FTS
        fts_res = c.execute("SELECT rowid, name, address FROM merchants_fts WHERE merchants_fts MATCH 'Super'").fetchall()
        assert len(fts_res) == 1
        
        # Query merchants table for that id
        m_res = c.execute("SELECT id, name FROM merchants WHERE name = 'Super Coffee Shop'").fetchone()
        assert fts_res[0][0] == m_res[0], f"FTS rowid {fts_res[0][0]} does not match merchant id {m_res[0]}"
        
        conn.close()
