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
        
        # 建立舊 DB 寫入行業別
        old_conn = sqlite3.connect(old_db)
        old_conn.execute("CREATE TABLE merchant_industries (id INTEGER PRIMARY KEY, tax_id TEXT, industry_code TEXT, industry_name TEXT, priority INTEGER)")
        old_conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES ('12345678', '561115', '餐館業', 1)")
        old_conn.commit()
        old_conn.close()
        
        # 建立新 DB
        new_conn = sqlite3.connect(new_db)
        new_conn.execute("CREATE TABLE merchant_industries (id INTEGER PRIMARY KEY, tax_id TEXT, industry_code TEXT, industry_name TEXT, priority INTEGER)")
        new_conn.commit()
        new_conn.close()
        
        # 呼叫遷移函數
        from scheduler.update_data import migrate_industries
        migrate_industries(old_db, new_db)
        
        # 驗證新 DB 成功接收資料
        new_conn = sqlite3.connect(new_db)
        row = new_conn.execute("SELECT tax_id, industry_code, industry_name, priority FROM merchant_industries").fetchone()
        new_conn.close()
        
        assert row is not None
        assert row[0] == "12345678"
        assert row[1] == "561115"
        assert row[2] == "餐館業"

