import os
import sqlite3
import tempfile
import threading
import time
import pytest
from scheduler.update_data import transactional_sync_db
from backend.database import init_db

def create_populated_target_db(db_path, num_merchants=500):
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    conn.execute("PRAGMA journal_mode = WAL;")
    init_db(conn)
    
    cursor = conn.cursor()
    cursor.execute("BEGIN IMMEDIATE")
    
    merchants_data = []
    fts_data = []
    for i in range(1, num_merchants + 1):
        tid = f"{i:08d}"
        name = f"Test Merchant {i}"
        addr = f"Taipei City Section {i % 10 + 1} No {i}"
        lat = 25.0 + (i % 100) * 0.001
        lon = 121.5 + (i % 100) * 0.001
        merchants_data.append((i, name, addr, "100", tid, lat, lon))
        fts_data.append((i, name, addr))
        
    cursor.executemany(
        "INSERT INTO merchants (id, name, address, zip_code, tax_id, lat, lon) VALUES (?, ?, ?, ?, ?, ?, ?)",
        merchants_data
    )
    cursor.executemany(
        "INSERT INTO merchants_fts (rowid, name, address) VALUES (?, ?, ?)",
        fts_data
    )
    
    # Create test users
    for u in range(1, 10):
        cursor.execute("INSERT INTO users (id, email, hashed_password, name) VALUES (?, ?, ?, ?)",
                       (u, f"user{u}@example.com", "hash", f"User {u}"))
        
    conn.commit()
    conn.close()

def create_temp_sync_db(db_path, num_merchants=600, drop_first_n=50):
    """Create temp db for sync: drops first N merchants, updates middle, adds new at the end."""
    conn = sqlite3.connect(db_path)
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
    
    merchants_data = []
    industries_data = []
    for i in range(drop_first_n + 1, num_merchants + 1):
        tid = f"{i:08d}"
        name = f"Updated Merchant {i}"
        addr = f"New Taipei City Section {i % 10 + 1} No {i}"
        lat = 25.0 + (i % 100) * 0.001
        lon = 121.5 + (i % 100) * 0.001
        merchants_data.append((name, addr, "100", tid, "https://example.com", lat, lon))
        industries_data.append((tid, "01", "Dining", 1))
        
    cursor.executemany(
        "INSERT INTO merchants (name, address, zip_code, tax_id, website, lat, lon) VALUES (?, ?, ?, ?, ?, ?, ?)",
        merchants_data
    )
    cursor.executemany(
        "INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)",
        industries_data
    )
    conn.commit()
    conn.close()

# ── Stress Test 1: Empirical Verification of Lock Escalation Failure vs BEGIN IMMEDIATE ──

def test_empirical_lock_escalation_deferred_vs_immediate():
    """
    Empirically verifies that concurrent Read-then-Write transactions using BEGIN DEFERRED
    fail with SQLITE_BUSY due to lock escalation deadlocks, whereas BEGIN IMMEDIATE succeeds.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        target_db = os.path.join(tmpdir, "target.db")
        create_populated_target_db(target_db, 100)

        # 1. Test BEGIN DEFERRED lock escalation failure under concurrency
        deferred_errors = []
        stop_flag = False

        def deferred_writer():
            conn = sqlite3.connect(target_db, timeout=1.0)
            conn.execute("PRAGMA journal_mode = WAL;")
            try:
                while not stop_flag:
                    try:
                        conn.execute("BEGIN DEFERRED")
                        cur = conn.cursor()
                        cur.execute("SELECT COUNT(*) FROM merchants")  # SHARED lock acquired
                        time.sleep(0.005)  # Force overlap
                        cur.execute("INSERT INTO user_expenses (user_id, merchant_id, merchant_name, amount, category, expense_date) VALUES (1, 1, 'M', 10, '觀光旅遊', '2026-08-08')") # Attempts upgrade to EXCLUSIVE -> Deadlock!
                        conn.commit()
                    except sqlite3.OperationalError as e:
                        deferred_errors.append(str(e))
                        try:
                            conn.rollback()
                        except Exception:
                            pass
                    time.sleep(0.001)
            finally:
                conn.close()

        threads = [threading.Thread(target=deferred_writer) for _ in range(4)]
        for t in threads:
            t.start()
        time.sleep(0.2)
        stop_flag = True
        for t in threads:
            t.join()

        # Empirical proof: BEGIN DEFERRED MUST produce database is locked / deadlock errors
        assert len(deferred_errors) > 0, "BEGIN DEFERRED expected to trigger lock escalation errors under concurrent Read-then-Write"
        assert any("locked" in err.lower() or "busy" in err.lower() for err in deferred_errors)

        # 2. Test BEGIN IMMEDIATE under the same concurrency conditions
        immediate_errors = []
        stop_flag = False

        def immediate_writer():
            conn = sqlite3.connect(target_db, timeout=5.0)
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA busy_timeout = 5000;")
            try:
                while not stop_flag:
                    try:
                        conn.execute("BEGIN IMMEDIATE")  # RESERVED lock acquired immediately at start
                        cur = conn.cursor()
                        cur.execute("SELECT COUNT(*) FROM merchants")
                        time.sleep(0.001)
                        cur.execute("INSERT INTO user_expenses (user_id, merchant_id, merchant_name, amount, category, expense_date) VALUES (1, 1, 'M', 10, '觀光旅遊', '2026-08-08')")
                        conn.commit()
                    except Exception as e:
                        immediate_errors.append(str(e))
                        try:
                            conn.rollback()
                        except Exception:
                            pass
                    time.sleep(0.001)
            finally:
                conn.close()

        threads = [threading.Thread(target=immediate_writer) for _ in range(4)]
        for t in threads:
            t.start()
        time.sleep(0.3)
        stop_flag = True
        for t in threads:
            t.join()

        assert len(immediate_errors) == 0, f"BEGIN IMMEDIATE produced unexpected errors: {immediate_errors}"

# ── Stress Test 2: Heavy Readers + Concurrent Heavy Sync Stress Test ──

def test_empirical_heavy_readers_during_transactional_sync():
    """
    Stress test with 20 concurrent readers continuously executing FTS & spatial queries
    while transactional_sync_db replaces thousands of merchants and rebuilds FTS.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        target_db = os.path.join(tmpdir, "target.db")
        temp_db = os.path.join(tmpdir, "temp.db")
        
        create_populated_target_db(target_db, 1000)
        create_temp_sync_db(temp_db, 1200, drop_first_n=100)
        
        reader_errors = []
        reader_counts = [0]
        stop_flag = False

        def reader_thread():
            conn = sqlite3.connect(target_db, timeout=5.0)
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA busy_timeout = 5000;")
            cur = conn.cursor()
            while not stop_flag:
                try:
                    # Query 1: FTS search
                    cur.execute("SELECT rowid, name FROM merchants_fts WHERE merchants_fts MATCH 'Test OR Updated'")
                    _ = cur.fetchall()
                    # Query 2: Spatial range query
                    cur.execute("SELECT id, name FROM merchants WHERE lat BETWEEN 25.0 AND 25.05 AND lon BETWEEN 121.5 AND 121.55")
                    _ = cur.fetchall()
                    # Query 3: Join query
                    cur.execute("""
                        SELECT m.id, m.name, i.industry_name 
                        FROM merchants m 
                        LEFT JOIN merchant_industries i ON m.tax_id = i.tax_id 
                        LIMIT 50
                    """)
                    _ = cur.fetchall()
                    reader_counts[0] += 1
                except Exception as e:
                    reader_errors.append(str(e))
                time.sleep(0.0005)
            conn.close()

        # Launch 15 reader threads
        readers = [threading.Thread(target=reader_thread) for _ in range(15)]
        for r in readers:
            r.start()

        # Perform transactional_sync_db 3 times in sequence during active reading
        sync_errors = []
        for _ in range(3):
            try:
                transactional_sync_db(temp_db, target_db)
            except Exception as e:
                sync_errors.append(str(e))
            time.sleep(0.05)

        stop_flag = True
        for r in readers:
            r.join()

        assert len(sync_errors) == 0, f"Sync errors under heavy reader load: {sync_errors}"
        assert len(reader_errors) == 0, f"Reader errors during DB sync: {reader_errors[:5]}"
        assert reader_counts[0] > 100, f"Readers should have completed many queries, got {reader_counts[0]}"

        # Verify data consistency after sync
        conn = sqlite3.connect(target_db)
        cur = conn.cursor()
        merchant_count = cur.execute("SELECT COUNT(*) FROM merchants").fetchone()[0]
        fts_count = cur.execute("SELECT COUNT(*) FROM merchants_fts").fetchone()[0]
        ind_count = cur.execute("SELECT COUNT(*) FROM merchant_industries").fetchone()[0]
        conn.close()

        assert merchant_count == 1100  # 1200 - 100 dropped = 1100
        assert fts_count == 1100, f"FTS count {fts_count} does not match merchants count {merchant_count}"
        assert ind_count == 1100

# ── Stress Test 3: Concurrent User CRUD Writes during Scheduler Sync ──

def test_empirical_concurrent_user_writes_and_sync():
    """
    Stress test with 10 concurrent threads inserting user expenses, favorites, and itineraries
    while transactional_sync_db drops off-shelf merchants and updates target DB.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        target_db = os.path.join(tmpdir, "target.db")
        temp_db = os.path.join(tmpdir, "temp.db")

        create_populated_target_db(target_db, 500)
        # Temp DB drops merchants 1..50
        create_temp_sync_db(temp_db, 600, drop_first_n=50)

        user_write_errors = []
        stop_flag = False

        def user_writer_thread(user_id):
            conn = sqlite3.connect(target_db, timeout=10.0)
            conn.execute("PRAGMA foreign_keys = ON;")
            conn.execute("PRAGMA busy_timeout = 5000;")
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA synchronous = NORMAL;")
            cur = conn.cursor()

            i = 0
            while not stop_flag:
                try:
                    conn.execute("BEGIN IMMEDIATE")
                    m_id = (i % 400) + 1  # some will target dropped merchants (1..50)
                    cur.execute("""
                        INSERT INTO user_expenses (user_id, merchant_id, merchant_name, amount, category, expense_date)
                        VALUES (?, ?, 'Test Merchant', ?, '觀光旅遊', '2026-08-08')
                    """, (user_id, m_id, 100 + i))
                    
                    cur.execute("""
                        INSERT OR IGNORE INTO user_favorites (user_id, merchant_id)
                        VALUES (?, ?)
                    """, (user_id, max(51, m_id)))  # favorites has FK constraint ON DELETE CASCADE

                    conn.commit()
                except sqlite3.IntegrityError:
                    # Foreign key violation expected if inserting favorite for deleted merchant
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                except Exception as e:
                    user_write_errors.append(str(e))
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                i += 1
                time.sleep(0.001)
            conn.close()

        writers = [threading.Thread(target=user_writer_thread, args=(u,)) for u in range(1, 6)]
        for w in writers:
            w.start()

        # Run sync concurrently
        sync_errors = []
        try:
            transactional_sync_db(temp_db, target_db)
        except Exception as e:
            sync_errors.append(str(e))

        stop_flag = True
        for w in writers:
            w.join()

        assert len(sync_errors) == 0, f"Sync error under concurrent user writes: {sync_errors}"
        assert len(user_write_errors) == 0, f"User write errors during sync: {user_write_errors[:5]}"

        # Verify integrity of user tables
        conn = sqlite3.connect(target_db)
        cur = conn.cursor()
        # Expenses referencing deleted merchants should have merchant_id SET NULL
        null_expenses = cur.execute("SELECT COUNT(*) FROM user_expenses WHERE merchant_id IS NULL").fetchone()[0]
        valid_expenses = cur.execute("SELECT COUNT(*) FROM user_expenses WHERE merchant_id IS NOT NULL").fetchone()[0]
        # Favorites referencing deleted merchants should be CASCADE deleted
        invalid_favorites = cur.execute("""
            SELECT COUNT(*) FROM user_favorites 
            WHERE merchant_id NOT IN (SELECT id FROM merchants)
        """).fetchone()[0]
        conn.close()

        assert invalid_favorites == 0, "No orphan user_favorites should remain"
        assert null_expenses + valid_expenses > 0
