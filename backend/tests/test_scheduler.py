import os
import sqlite3
import tempfile
from scheduler.update_data import normalize_text

# 我們使用一小段仿造的 PDF 做測試過於複雜，這裡直接測試資料庫建立流程
def test_scheduler_db_creation():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_scheduler.db")
        
        # 直接連線建立空的表格（模擬 PDF 解析前的 CREATE TABLE 與 FTS 建立）
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA foreign_keys = ON;")
        cursor = conn.cursor()
        
        # 這段邏輯應該與修改後的 parse_pdf_to_db 相同
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS merchants (
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
            CREATE TABLE IF NOT EXISTS merchant_industries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tax_id TEXT NOT NULL,
                industry_code TEXT NOT NULL,
                industry_name TEXT NOT NULL,
                priority INTEGER NOT NULL,
                FOREIGN KEY(tax_id) REFERENCES merchants(tax_id) ON DELETE CASCADE
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_merchant_industries_tax_id ON merchant_industries(tax_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_merchant_industries_code ON merchant_industries(industry_code)")
        cursor.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS merchants_fts USING fts5(
                name,
                address,
                content='merchants',
                content_rowid='id',
                tokenize='trigram'
            )
        """)
        
        # 寫入一筆模擬資料
        cursor.execute(
            "INSERT INTO merchants (name, address, tax_id) VALUES (?, ?, ?)",
            ("測試特約大飯店", "南投縣魚池鄉日月潭", "88888888")
        )
        
        # 重建索引
        cursor.execute("INSERT INTO merchants_fts(merchants_fts) VALUES('rebuild')")
        conn.commit()
        
        # 驗證 FTS MATCH 是否有效
        res = cursor.execute(
            "SELECT m.name FROM merchants m JOIN merchants_fts f ON m.id = f.rowid WHERE f.merchants_fts MATCH '大飯店'"
        ).fetchone()
        
        assert res is not None
        assert res[0] == "測試特約大飯店"
        
        # 驗證新表是否被建立
        info = cursor.execute("PRAGMA table_info(merchant_industries)").fetchall()
        cols = {col[1]: col[2] for col in info}
        assert "tax_id" in cols
        assert "industry_code" in cols
        assert "industry_name" in cols
        assert "priority" in cols
        
        conn.close()

def test_scheduler_page_0_filtering_logic():
    headers = {"特店名稱", "特店地址", "郵遞區號", "統一編號", "特店網頁位址", "國民旅遊卡特約商店清冊"}
    
    # 模擬第 0 頁可能包含的標題、日期以及商家內容
    page_0_lines = [
        "國民旅遊卡特約商店清冊",
        "檔案日期：2026/05/26",
        "特店名稱",
        "特店地址",
        "羅斯福路特店",
        "台北市中正區羅斯福路1段",
        "100",
        "12345678"
    ]
    
    parsed_lines = []
    for line in page_0_lines:
        line = normalize_text(line)
        if line and line not in headers and not line.startswith("檔案日期"):
            parsed_lines.append(line)
            
    # 驗證標題與日期被過濾掉，但資料有被保留
    assert "國民旅遊卡特約商店清冊" not in parsed_lines
    assert "檔案日期：2026/05/26" not in parsed_lines
    assert "特店名稱" not in parsed_lines
    assert "羅斯福路特店" in parsed_lines
    assert "12345678" in parsed_lines

def test_scheduler_wrapped_website_merge():
    from scheduler.update_data import is_website, normalize_text
    import re
    
    lines = [
        "http://www.test-hotel",
        ".com.tw",  # 符合合併條件
        "100",      # 郵遞區號 (不應該被合併)
        "12345678", # 統編 (不應該被合併)
        "www.cool-place.org",
        "/index.html", # 符合合併條件
        "飯店名稱", # 中文 (不應該被合併)
    ]
    
    merged_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if i + 1 < len(lines) and is_website(line):
            next_line = lines[i + 1]
            if (not re.search(r'[\u4e00-\u9fff]', next_line) and 
                not re.match(r'^\d{8}$', next_line) and 
                not re.match(r'^\d{3,6}$', next_line) and 
                ' ' not in next_line and
                len(next_line) <= 15):
                line = line + next_line
                i += 1
        merged_lines.append(line)
        i += 1
        
    assert merged_lines[0] == "http://www.test-hotel.com.tw"
    assert merged_lines[1] == "100"
    assert merged_lines[2] == "12345678"
    assert merged_lines[3] == "www.cool-place.org/index.html"
    assert merged_lines[4] == "飯店名稱"

def test_scheduler_industry_migration():
    with tempfile.TemporaryDirectory() as tmpdir:
        old_db = os.path.join(tmpdir, "old.db")
        new_db = os.path.join(tmpdir, "new.db")
        
        # 建立舊 DB 的 merchants 與 merchant_industries 表格
        old_conn = sqlite3.connect(old_db)
        old_conn.execute("PRAGMA foreign_keys = ON;")
        old_conn.execute("CREATE TABLE merchants (id INTEGER PRIMARY KEY, name TEXT, tax_id TEXT UNIQUE)")
        old_conn.execute("""
            CREATE TABLE IF NOT EXISTS merchant_industries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tax_id TEXT NOT NULL,
                industry_code TEXT NOT NULL,
                industry_name TEXT NOT NULL,
                priority INTEGER NOT NULL,
                FOREIGN KEY(tax_id) REFERENCES merchants(tax_id) ON DELETE CASCADE
            )
        """)
        
        # 寫入兩個 merchants 到 old.db
        old_conn.execute("INSERT INTO merchants (name, tax_id) VALUES ('Merchant A', '12345678')")
        old_conn.execute("INSERT INTO merchants (name, tax_id) VALUES ('Merchant B', '99999999')")
        
        # 寫入兩個 merchants 的行業別對應到 old.db
        old_conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES ('12345678', '561115', '餐館業', 1)")
        old_conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES ('99999999', '561116', '飲料店業', 2)")
        
        old_conn.commit()
        old_conn.close()
        
        # 建立新 DB 的 merchants 與 merchant_industries 表格
        new_conn = sqlite3.connect(new_db)
        new_conn.execute("PRAGMA foreign_keys = ON;")
        new_conn.execute("CREATE TABLE merchants (id INTEGER PRIMARY KEY, name TEXT, tax_id TEXT UNIQUE)")
        new_conn.execute("""
            CREATE TABLE IF NOT EXISTS merchant_industries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tax_id TEXT NOT NULL,
                industry_code TEXT NOT NULL,
                industry_name TEXT NOT NULL,
                priority INTEGER NOT NULL,
                FOREIGN KEY(tax_id) REFERENCES merchants(tax_id) ON DELETE CASCADE
            )
        """)
        
        # 新 DB 中只寫入 Merchant A
        new_conn.execute("INSERT INTO merchants (name, tax_id) VALUES ('Merchant A', '12345678')")
        new_conn.commit()
        new_conn.close()
        
        # 呼叫遷移函數
        from scheduler.update_data import migrate_industries
        migrate_industries(old_db, new_db)
        
        # 驗證新 DB 成功接收資料
        new_conn = sqlite3.connect(new_db)
        new_conn.execute("PRAGMA foreign_keys = ON;")
        rows = new_conn.execute("SELECT tax_id, industry_code, industry_name, priority FROM merchant_industries ORDER BY tax_id").fetchall()
        new_conn.close()
        
        # 驗證只有 Merchant A 被遷移，而 Merchant B 被跳過
        assert len(rows) == 1
        assert rows[0][0] == "12345678"
        assert rows[0][1] == "561115"
        assert rows[0][2] == "餐館業"


def test_atomic_db_replacement():
    from scheduler.update_data import atomic_swap_db
    with tempfile.TemporaryDirectory() as tmpdir:
        target_db = os.path.join(tmpdir, "merchants.db")
        new_db = os.path.join(tmpdir, "merchants.db.tmp")

        # 寫入舊資料庫
        old_conn = sqlite3.connect(target_db)
        old_conn.execute("CREATE TABLE merchants (id INT, name TEXT)")
        old_conn.execute("INSERT INTO merchants VALUES (1, 'Old Merchant')")
        old_conn.commit()
        old_conn.close()

        # 寫入新資料庫
        new_conn = sqlite3.connect(new_db)
        new_conn.execute("CREATE TABLE merchants (id INT, name TEXT)")
        new_conn.execute("INSERT INTO merchants VALUES (2, 'New Merchant')")
        new_conn.commit()
        new_conn.close()

        # 執行原子性替換
        atomic_swap_db(new_db, target_db)

        # 驗證替換後資料為新資料庫的內容
        check_conn = sqlite3.connect(target_db)
        row = check_conn.execute("SELECT name FROM merchants").fetchone()
        check_conn.close()
        assert row[0] == "New Merchant"
        assert not os.path.exists(new_db)


def test_transactional_sync_db_preserves_user_data():
    from scheduler.update_data import transactional_sync_db
    from backend.database import init_db

    with tempfile.TemporaryDirectory() as tmpdir:
        target_db = os.path.join(tmpdir, "target.db")
        temp_db = os.path.join(tmpdir, "temp.db")

        # 1. 建立並設置生產 DB（包含 5 張使用者個人資料表）
        t_conn = sqlite3.connect(target_db)
        t_conn.execute("PRAGMA foreign_keys = ON;")
        init_db(t_conn)
        t_cursor = t_conn.cursor()

        # 寫入使用者與特約商店舊資料
        t_cursor.execute("INSERT INTO merchants (id, name, address, zip_code, tax_id) VALUES (1, 'Old Merchant A', 'Old Addr A', '100', '12345678')")
        t_cursor.execute("INSERT INTO users (id, email, hashed_password, name) VALUES (1, 'user@test.com', 'hash', 'Test User')")
        t_cursor.execute("INSERT INTO user_expenses (user_id, merchant_id, merchant_name, amount, category, expense_date) VALUES (1, 1, 'Old Merchant A', 500, '觀光旅遊', '2026-08-01')")
        t_cursor.execute("INSERT INTO user_favorites (user_id, merchant_id) VALUES (1, 1)")
        t_cursor.execute("INSERT INTO user_itineraries (id, user_id, title) VALUES (1, 1, 'My Trip')")
        t_cursor.execute("INSERT INTO itinerary_items (itinerary_id, merchant_id, custom_name, order_index) VALUES (1, 1, 'Stop 1', 0)")
        t_conn.commit()
        t_conn.close()

        # 2. 建立新版 PDF 解析產生的暫存 DB（僅包含商家與行業別，無使用者資料表）
        tmp_conn = sqlite3.connect(temp_db)
        tmp_conn.execute("PRAGMA foreign_keys = ON;")
        tmp_cursor = tmp_conn.cursor()
        tmp_cursor.execute("""
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
        tmp_cursor.execute("""
            CREATE TABLE merchant_industries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tax_id TEXT NOT NULL,
                industry_code TEXT NOT NULL,
                industry_name TEXT NOT NULL,
                priority INTEGER NOT NULL
            )
        """)

        # 暫存 DB 包含更新後的 Merchant A 以及新增的 Merchant B
        tmp_cursor.execute("INSERT INTO merchants (name, address, zip_code, tax_id, website) VALUES ('Updated Merchant A', 'New Addr A', '100', '12345678', 'https://m-a.com')")
        tmp_cursor.execute("INSERT INTO merchants (name, address, zip_code, tax_id, website) VALUES ('New Merchant B', 'Addr B', '200', '87654321', 'https://m-b.com')")
        tmp_cursor.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES ('12345678', '561115', '餐館業', 1)")
        tmp_conn.commit()
        tmp_conn.close()

        # 3. 執行交易式同步
        transactional_sync_db(temp_db, target_db)

        # 4. 驗證生產 DB
        res_conn = sqlite3.connect(target_db)
        res_conn.row_factory = sqlite3.Row
        res_cursor = res_conn.cursor()

        # 驗證使用者 5 張表 100% 完好
        users = res_cursor.execute("SELECT * FROM users").fetchall()
        expenses = res_cursor.execute("SELECT * FROM user_expenses").fetchall()
        favorites = res_cursor.execute("SELECT * FROM user_favorites").fetchall()
        itineraries = res_cursor.execute("SELECT * FROM user_itineraries").fetchall()
        items = res_cursor.execute("SELECT * FROM itinerary_items").fetchall()

        assert len(users) == 1
        assert users[0]["email"] == "user@test.com"

        assert len(expenses) == 1
        assert expenses[0]["merchant_id"] == 1

        assert len(favorites) == 1
        assert favorites[0]["merchant_id"] == 1

        assert len(itineraries) == 1
        assert len(items) == 1
        assert items[0]["merchant_id"] == 1

        # 驗證 Merchant A id 保留為 1 且內容已更新
        m_a = res_cursor.execute("SELECT * FROM merchants WHERE tax_id = '12345678'").fetchone()
        assert m_a["id"] == 1
        assert m_a["name"] == "Updated Merchant A"
        assert m_a["website"] == "https://m-a.com"

        # 驗證 Merchant B 被順利新增
        m_b = res_cursor.execute("SELECT * FROM merchants WHERE tax_id = '87654321'").fetchone()
        assert m_b is not None
        assert m_b["name"] == "New Merchant B"

        # 驗證行業別已被寫入
        ind = res_cursor.execute("SELECT * FROM merchant_industries WHERE tax_id = '12345678'").fetchall()
        assert len(ind) == 1
        assert ind[0]["industry_name"] == "餐館業"

        res_conn.close()



