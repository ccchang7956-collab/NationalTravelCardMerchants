import os
import sqlite3
import tempfile
import pytest
from unittest.mock import patch

def test_import_industry_logic():
    # 建立 mock db 並寫入兩筆特約商店
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_import.db")
        conn = sqlite3.connect(db_path)
        conn.execute("""
            CREATE TABLE merchants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                tax_id TEXT UNIQUE
            )
        """)
        conn.execute("""
            CREATE TABLE merchant_industries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tax_id TEXT,
                industry_code TEXT,
                industry_name TEXT,
                priority INTEGER
            )
        """)
        conn.execute("INSERT INTO merchants (name, tax_id) VALUES (?, ?)", ("商店A", "11111111"))
        conn.execute("INSERT INTO merchants (name, tax_id) VALUES (?, ?)", ("商店B", "22222222"))
        conn.commit()
        
        # 模擬一個 CSV 檔案內容
        csv_content = (
            "統一編號,縣市名稱,資本額,設立日期,組織別名稱,使用發票,行業代號1,行業名稱1,行業代號2,行業名稱2\n"
            "11111111,台北市,10000,1000101,公司,Y,561115,餐館業,561116,飲料店業\n"
            "99999999,高雄市,20000,1000101,公司,Y,561115,餐館業,,\n" # 非特約商店，應過濾
        )
        csv_path = os.path.join(tmpdir, "tax.csv")
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write(csv_content)
            
        # 匯入腳本內要被呼叫的實作函數
        from scripts.import_industry import import_csv_to_db
        import_csv_to_db(csv_path, db_path)
        
        # 驗證資料庫結果
        res = conn.execute("SELECT tax_id, industry_code, industry_name, priority FROM merchant_industries ORDER BY priority").fetchall()
        conn.close()
        
        # 商店A 應該有兩筆行業（主與次）
        assert len(res) == 2
        assert res[0] == ("11111111", "561115", "餐館業", 1)
        assert res[1] == ("11111111", "561116", "飲料店業", 2)

def test_import_industry_encoding_and_idempotency():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_import_idempotency.db")
        conn = sqlite3.connect(db_path)
        conn.execute("""
            CREATE TABLE merchants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                tax_id TEXT UNIQUE
            )
        """)
        conn.execute("""
            CREATE TABLE merchant_industries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tax_id TEXT,
                industry_code TEXT,
                industry_name TEXT,
                priority INTEGER
            )
        """)
        conn.execute("INSERT INTO merchants (name, tax_id) VALUES (?, ?)", ("商店A", "11111111"))
        # 先插入一筆舊行業資料，確認匯入時會先被清空
        conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)",
                     ("11111111", "999999", "舊行業", 1))
        conn.commit()
        
        # 使用 cp950 編碼模擬 CSV 檔案內容
        csv_content = (
            "統一編號,縣市名稱,資本額,設立日期,組織別名稱,使用發票,行業代號1,行業名稱1,行業代號2,行業名稱2\n"
            "11111111,台北市,10000,1000101,公司,Y,561115,餐館業,561116,飲料店業\n"
        )
        csv_path = os.path.join(tmpdir, "tax_cp950.csv")
        with open(csv_path, "w", encoding="cp950") as f:
            f.write(csv_content)
            
        from scripts.import_industry import import_csv_to_db
        import_csv_to_db(csv_path, db_path)
        
        # 驗證資料庫結果：舊行業應該被刪除，取而代之的是新的兩個行業
        res = conn.execute("SELECT tax_id, industry_code, industry_name, priority FROM merchant_industries ORDER BY priority").fetchall()
        conn.close()
        
        assert len(res) == 2
        assert res[0] == ("11111111", "561115", "餐館業", 1)
        assert res[1] == ("11111111", "561116", "飲料店業", 2)

