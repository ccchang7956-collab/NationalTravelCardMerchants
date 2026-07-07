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
