import os
import sqlite3
import tempfile
import zipfile
import pytest
from unittest.mock import patch

def test_import_industry_logic():
    # 建立 mock db 並寫入兩筆特約商店
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_import.db")
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("""
            CREATE TABLE merchants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                tax_id TEXT UNIQUE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS merchant_industries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tax_id TEXT NOT NULL,
                industry_code TEXT NOT NULL,
                industry_name TEXT NOT NULL,
                priority INTEGER NOT NULL,
                FOREIGN KEY(tax_id) REFERENCES merchants(tax_id) ON DELETE CASCADE
            )
        """)
        conn.execute("INSERT INTO merchants (name, tax_id) VALUES (?, ?)", ("商店A", "11111111"))
        conn.execute("INSERT INTO merchants (name, tax_id) VALUES (?, ?)", ("商店B", "22222222"))
        conn.commit()
        
        # 模擬一個 CSV 檔案內容
        csv_content = (
            "營業地址,統一編號,總機構統一編號,營業人名稱,資本額,設立日期,組織別名稱,使用統一發票,行業代號,名稱,行業代號1,名稱1,行業代號2,名稱2,行業代號3,名稱3\n"
            "\"台北市大安區\",11111111,,\"商店A\",10000,1000101,公司,Y,561115,餐館業,561116,飲料店業,,,,\n"
            "\"高雄市新興區\",99999999,,\"非特約商店\",20000,1000101,公司,Y,561115,餐館業,,,,,,,\n"
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
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("""
            CREATE TABLE merchants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                tax_id TEXT UNIQUE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS merchant_industries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tax_id TEXT NOT NULL,
                industry_code TEXT NOT NULL,
                industry_name TEXT NOT NULL,
                priority INTEGER NOT NULL,
                FOREIGN KEY(tax_id) REFERENCES merchants(tax_id) ON DELETE CASCADE
            )
        """)
        conn.execute("INSERT INTO merchants (name, tax_id) VALUES (?, ?)", ("商店A", "11111111"))
        conn.execute("INSERT INTO merchants (name, tax_id) VALUES (?, ?)", ("商店C", "33333333"))
        # 舊資料應由完整的官方每日快照取代，即使本地商家未出現在快照中也需清除舊分類。
        conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)",
                     ("11111111", "999999", "舊行業A", 1))
        conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)",
                     ("33333333", "888888", "舊行業C", 1))
        conn.commit()
        
        # 使用 cp950 編碼模擬 CSV 檔案內容
        csv_content = (
            "營業地址,統一編號,總機構統一編號,營業人名稱,資本額,設立日期,組織別名稱,使用統一發票,行業代號,名稱,行業代號1,名稱1,行業代號2,名稱2,行業代號3,名稱3\n"
            "\"台北市大安區\",11111111,,\"商店A\",10000,1000101,公司,Y,561115,餐館業,561116,飲料店業,,,,\n"
        )
        csv_path = os.path.join(tmpdir, "tax_cp950.csv")
        with open(csv_path, "w", encoding="cp950") as f:
            f.write(csv_content)
            
        from scripts.import_industry import import_csv_to_db
        import_csv_to_db(csv_path, db_path)
        
        # 驗證資料庫結果：舊分類及不在新快照中的商店C分類都應被清除。
        res = conn.execute("SELECT tax_id, industry_code, industry_name, priority FROM merchant_industries ORDER BY tax_id, priority").fetchall()
        conn.close()
        
        assert len(res) == 2
        # 商店A (11111111) 新的兩個行業
        assert res[0] == ("11111111", "561115", "餐館業", 1)
        assert res[1] == ("11111111", "561116", "飲料店業", 2)


def test_import_official_zip_and_reject_invalid_snapshot():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_zip.db")
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE merchants (id INTEGER PRIMARY KEY, name TEXT, tax_id TEXT UNIQUE)")
        conn.execute("""
            CREATE TABLE merchant_industries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tax_id TEXT NOT NULL,
                industry_code TEXT NOT NULL,
                industry_name TEXT NOT NULL,
                priority INTEGER NOT NULL,
                FOREIGN KEY(tax_id) REFERENCES merchants(tax_id) ON DELETE CASCADE
            )
        """)
        conn.execute("INSERT INTO merchants VALUES (1, '商店A', '11111111')")
        conn.commit()
        conn.close()

        csv_content = (
            "統一編號,行業代號,名稱,行業代號1,名稱1,行業代號2,名稱2,行業代號3,名稱3\n"
            "11111111,551011,旅館業,,,,,,\n"
        )
        zip_path = os.path.join(tmpdir, "official.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("BGMOPEN1.csv", csv_content.encode("utf-8-sig"))

        from scripts.import_industry import import_csv_to_db
        assert import_csv_to_db(zip_path, db_path) == 1

        invalid_path = os.path.join(tmpdir, "invalid.csv")
        with open(invalid_path, "w", encoding="utf-8") as source:
            source.write("not,the,official,format\n11111111,anything,else\n")
        with pytest.raises(ValueError):
            import_csv_to_db(invalid_path, db_path)

        conn = sqlite3.connect(db_path)
        rows = conn.execute("SELECT tax_id, industry_code FROM merchant_industries").fetchall()
        conn.close()
        assert rows == [("11111111", "551011")]


def test_import_rejects_short_snapshot_without_replacing_existing_rows():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "short_snapshot.db")
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE merchants (id INTEGER PRIMARY KEY, name TEXT, tax_id TEXT UNIQUE)")
        conn.execute("""
            CREATE TABLE merchant_industries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tax_id TEXT NOT NULL, industry_code TEXT NOT NULL,
                industry_name TEXT NOT NULL, priority INTEGER NOT NULL,
                FOREIGN KEY(tax_id) REFERENCES merchants(tax_id) ON DELETE CASCADE
            )
        """)
        conn.execute("INSERT INTO merchants VALUES (1, 'Hotel', '11111111')")
        conn.execute("INSERT INTO merchant_industries(tax_id,industry_code,industry_name,priority) VALUES ('11111111','999999','舊旅宿分類',1)")
        conn.commit()
        conn.close()

        csv_path = os.path.join(tmpdir, "short.csv")
        with open(csv_path, "w", encoding="utf-8") as source:
            source.write("統一編號,行業代號,名稱,行業代號1,名稱1,行業代號2,名稱2,行業代號3,名稱3\n")
            source.write("11111111,551011,旅館業,,,,,,\n")

        from scripts.import_industry import import_csv_to_db
        with pytest.raises(ValueError, match="筆數異常"):
            import_csv_to_db(csv_path, db_path, min_source_rows=2)

        conn = sqlite3.connect(db_path)
        rows = conn.execute("SELECT tax_id,industry_code,industry_name,priority FROM merchant_industries").fetchall()
        conn.close()
        assert rows == [("11111111", "999999", "舊旅宿分類", 1)]


def test_import_rejects_major_coverage_drop_and_keeps_existing_classifications():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "coverage_drop.db")
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE merchants (id INTEGER PRIMARY KEY, name TEXT, tax_id TEXT UNIQUE)")
        conn.execute("""
            CREATE TABLE merchant_industries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tax_id TEXT NOT NULL, industry_code TEXT NOT NULL,
                industry_name TEXT NOT NULL, priority INTEGER NOT NULL,
                FOREIGN KEY(tax_id) REFERENCES merchants(tax_id) ON DELETE CASCADE
            )
        """)
        merchants = [(i, f"Hotel {i}", f"{i:08d}") for i in range(1000, 2000)]
        conn.executemany("INSERT INTO merchants VALUES (?, ?, ?)", merchants)
        conn.executemany(
            "INSERT INTO merchant_industries(tax_id,industry_code,industry_name,priority) VALUES (?, '551011', '旅館業', 1)",
            [(row[2],) for row in merchants],
        )
        conn.commit()
        conn.close()

        csv_path = os.path.join(tmpdir, "partial.csv")
        with open(csv_path, "w", encoding="utf-8") as source:
            source.write("統一編號,行業代號,名稱,行業代號1,名稱1,行業代號2,名稱2,行業代號3,名稱3\n")
            source.write("00001000,551012,旅館服務業,,,,,,\n")

        from scripts.import_industry import import_csv_to_db
        with pytest.raises(ValueError, match="涵蓋率異常"):
            import_csv_to_db(csv_path, db_path)

        conn = sqlite3.connect(db_path)
        assert conn.execute("SELECT COUNT(*) FROM merchant_industries").fetchone()[0] == 1000
        assert conn.execute("SELECT industry_code FROM merchant_industries WHERE tax_id='00001000'").fetchone()[0] == "551011"
        conn.close()


def test_foreign_key_cascade_delete():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_fk.db")
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("""
            CREATE TABLE merchants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                tax_id TEXT UNIQUE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS merchant_industries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tax_id TEXT NOT NULL,
                industry_code TEXT NOT NULL,
                industry_name TEXT NOT NULL,
                priority INTEGER NOT NULL,
                FOREIGN KEY(tax_id) REFERENCES merchants(tax_id) ON DELETE CASCADE
            )
        """)
        conn.execute("INSERT INTO merchants (name, tax_id) VALUES (?, ?)", ("商店A", "11111111"))
        conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)",
                     ("11111111", "561115", "餐館業", 1))
        conn.commit()
        
        # 驗證插入成功
        res = conn.execute("SELECT COUNT(*) FROM merchant_industries").fetchone()[0]
        assert res == 1
        
        # 刪除 merchants 內的資料
        conn.execute("DELETE FROM merchants WHERE tax_id = ?", ("11111111",))
        conn.commit()
        
        # 驗證 ON DELETE CASCADE 發生，merchant_industries 內的資料也被自動刪除
        res = conn.execute("SELECT COUNT(*) FROM merchant_industries").fetchone()[0]
        assert res == 0
        conn.close()
