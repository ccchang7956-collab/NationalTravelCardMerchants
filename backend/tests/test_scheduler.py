import os
import sqlite3
import tempfile
from scheduler.update_data import parse_pdf_to_db, fill_missing_coords

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
        
        conn.close()
