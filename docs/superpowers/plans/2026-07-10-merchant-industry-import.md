# 國旅卡特店導入行業別與關聯 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為國旅卡特約商店導入政府標準的行業別（包含主要與次要行業），透過 CSV 批次匯入並實作自動化排程遷移，最後更新後端 API 及完整的測試驗證。

**Architecture:** 
1. 建立 `merchant_industries` 關聯表，以 `tax_id` 作為關聯鍵。
2. 撰寫 `scripts/import_industry.py` 用於流式（streaming）批次讀取財政部稅籍 CSV 檔案並寫入關聯表。
3. 修改 `scheduler/update_data.py`，在排程更新時將舊資料庫的 `merchant_industries` 資料遷移至新的臨時資料庫。
4. 修改後端 Pydantic Models 與 `GET /api/merchants/{id}` 路由以載入行業別欄位。

**Tech Stack:** Python 3, SQLite, FastAPI, Pydantic, pytest

## Global Constraints
- 資料庫採用 SQLite，所有欄位與索引必須在 `parse_pdf_to_db` 初始化階段同步建立。
- 解析 CSV 檔案必須以串流（chunk/streaming）方式處理以防止 Out of Memory 錯誤。
- 專案中的所有程式碼與測試案例必須嚴格遵守 TDD 流程（先寫失敗測試、驗證失敗、實作程式碼、驗證成功、提交）。

---

### Task 1: 資料庫 Schema 變更與 Table 建立

**Files:**
- Modify: `scheduler/update_data.py:365-385`
- Modify: `backend/tests/test_scheduler.py:15-37`
- Modify: `backend/tests/test_search_api.py:10-33`

**Interfaces:**
- Produces: 新建 `merchant_industries` 資料表及索引 `idx_merchant_industries_tax_id`、`idx_merchant_industries_code`

- [ ] **Step 1: 在 `backend/tests/test_scheduler.py` 中新增驗證 Table 建立的失敗測試**
  
  修改 [backend/tests/test_scheduler.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/tests/test_scheduler.py) 的 `test_scheduler_db_creation` 函數，在結尾加上對 `merchant_industries` 的欄位驗證：
  
  ```python
  # 驗證新表是否被建立
  info = cursor.execute("PRAGMA table_info(merchant_industries)").fetchall()
  cols = {col[1]: col[2] for col in info}
  assert "tax_id" in cols
  assert "industry_code" in cols
  assert "industry_name" in cols
  assert "priority" in cols
  ```

- [ ] **Step 2: 執行測試並驗證它失敗**
  
  Run: `pytest backend/tests/test_scheduler.py::test_scheduler_db_creation -v`
  Expected: FAIL (AssertionError: merchant_industries 表不存在或欄位不符)

- [ ] **Step 3: 實作新表的建立邏輯**
  
  修改 [scheduler/update_data.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/scheduler/update_data.py) 的 `parse_pdf_to_db` 函數，在 `CREATE TABLE merchants` 之後加入 `merchant_industries` 的建立邏輯：
  
  ```python
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
  ```
  
  同時，修改 [backend/tests/test_scheduler.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/tests/test_scheduler.py) 的模擬建立邏輯，以及 [backend/tests/test_search_api.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/tests/test_search_api.py) 的 `fixture_db_conn`，確保測試環境的 SQLite 在記憶體中建立此資料表。

- [ ] **Step 4: 執行測試驗證它通過**
  
  Run: `pytest backend/tests/test_scheduler.py::test_scheduler_db_creation -v`
  Expected: PASS

- [ ] **Step 5: 提交**
  
  ```bash
  git add scheduler/update_data.py backend/tests/test_scheduler.py backend/tests/test_search_api.py
  git commit -m "db: create merchant_industries table and update test schemas"
  ```

---

### Task 2: 撰寫一次性匯入腳本與其單元測試

**Files:**
- Create: `scripts/import_industry.py`
- Create: `backend/tests/test_import_industry.py`

**Interfaces:**
- Produces: `scripts/import_industry.py` 可接受 `--csv` 參數讀取 CSV 檔，過濾非特店統編並匯入行業別。

- [ ] **Step 1: 寫下匯入腳本的核心單元測試**
  
  建立測試檔案 [backend/tests/test_import_industry.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/tests/test_import_industry.py)：
  
  ```python
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
  ```

- [ ] **Step 2: 執行測試並驗證它失敗**
  
  Run: `pytest backend/tests/test_import_industry.py -v`
  Expected: FAIL (ModuleNotFoundError: No module named 'scripts.import_industry')

- [ ] **Step 3: 實作 `scripts/import_industry.py` 匯入功能**
  
  建立檔案 [scripts/import_industry.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/scripts/import_industry.py)：
  
  ```python
  import csv
  import os
  import sqlite3
  import argparse
  import sys
  
  def import_csv_to_db(csv_path: str, db_path: str):
      if not os.path.exists(csv_path):
          print(f"Error: CSV file {csv_path} not found.")
          return
          
      conn = sqlite3.connect(db_path)
      cursor = conn.cursor()
      
      # 讀取現有統編
      cursor.execute("SELECT tax_id FROM merchants WHERE tax_id IS NOT NULL")
      existing_tax_ids = {row[0] for row in cursor.fetchall()}
      
      # 讀取 CSV
      encodings = ["utf-8-sig", "cp950", "utf-8"]
      reader = None
      f = None
      for enc in encodings:
          try:
              f = open(csv_path, mode="r", encoding=enc)
              # 讀取一行測試是否能正常解碼
              f.readline()
              f.seek(0)
              reader = csv.reader(f)
              break
          except Exception:
              if f:
                  f.close()
              continue
              
      if not reader:
          print("Error: Could not decode CSV file with available encodings.")
          conn.close()
          return
          
      try:
          # 跳過 header 行
          header = next(reader)
          
          batch = []
          count = 0
          for row in reader:
              if not row or len(row) < 8:
                  continue
              tax_id = row[0].strip()
              if tax_id in existing_tax_ids:
                  # 先刪除該店家已有的舊行業資料
                  cursor.execute("DELETE FROM merchant_industries WHERE tax_id = ?", (tax_id,))
                  
                  # 解析主次行業 (最多四組)
                  # 欄位 index:
                  # 0: tax_id
                  # 6,7: 主代號, 主名稱
                  # 8,9: 次1代號, 次1名稱
                  # 10,11: 次2代號, 次2名稱
                  # 12,13: 次3代號, 次3名稱
                  for i in range(4):
                      base_idx = 6 + (i * 2)
                      if base_idx + 1 < len(row):
                          code = row[base_idx].strip()
                          name = row[base_idx + 1].strip()
                          if code and name:
                              batch.append((tax_id, code, name, i + 1))
                              
                  if len(batch) >= 1000:
                      cursor.executemany(
                          "INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)",
                          batch
                      )
                      conn.commit()
                      count += len(batch)
                      batch = []
                      
          if batch:
              cursor.executemany(
                  "INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)",
                  batch
              )
              conn.commit()
              count += len(batch)
              
          print(f"Successfully imported {count} industry records.")
      finally:
          f.close()
          conn.close()
  
  if __name__ == "__main__":
      parser = argparse.ArgumentParser(description="Import industry codes to merchants database.")
      parser.add_argument("--csv", required=True, help="Path to the tax registration CSV file.")
      parser.add_argument("--db", default="backend/merchants.db", help="Path to SQLite database.")
      args = parser.parse_args()
      import_csv_to_db(args.csv, args.db)
  ```

- [ ] **Step 4: 執行測試驗證它通過**
  
  Run: `pytest backend/tests/test_import_industry.py -v`
  Expected: PASS

- [ ] **Step 5: 提交**
  
  ```bash
  git add scripts/import_industry.py backend/tests/test_import_industry.py
  git commit -m "feat: add import_industry script and logic tests"
  ```

---

### Task 3: 排程更新遷移邏輯與單元測試

**Files:**
- Modify: `scheduler/update_data.py:518-550` (定義 `migrate_industries` 函數並在 L659 之後呼叫它)
- Modify: `backend/tests/test_scheduler.py` (新增排程器遷移行業別的單元測試)

**Interfaces:**
- Consumes: 舊 DB 檔案路徑與新 DB 檔案路徑
- Produces: `migrate_industries(old_db: str, new_db: str) -> int` 函數，負責在排程器替換 DB 前完成資料遷移。

- [ ] **Step 1: 寫下排程器遷移的失敗測試**
  
  在 [backend/tests/test_scheduler.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/tests/test_scheduler.py) 新增一個測試函數 `test_scheduler_industry_migration`：
  
  ```python
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
  ```

- [ ] **Step 2: 執行測試並驗證它失敗**
  
  Run: `pytest backend/tests/test_scheduler.py::test_scheduler_industry_migration -v`
  Expected: FAIL (ImportError: cannot import name 'migrate_industries')

- [ ] **Step 3: 實作排程器中的 `migrate_industries` 函數與更新流程串接**
  
  修改 [scheduler/update_data.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/scheduler/update_data.py)：
  
  1. 在 `migrate_coords` 函數下方定義 `migrate_industries`：
     ```python
     def migrate_industries(old_db: str, new_db: str) -> int:
         """從舊 DB 遷移行業別資料到新 DB（以 tax_id 對應），回傳遷移筆數。"""
         if not os.path.exists(old_db):
             log.info("ℹ️  無舊 DB，跳過行業別資料遷移")
             return 0
         log.info("🏬  從舊 DB 遷移行業別資料...")
         old_conn = None
         new_conn = None
         try:
             old_conn = sqlite3.connect(old_db)
             old_conn.execute("PRAGMA busy_timeout = 5000;")
             
             # 檢查舊表是否存在
             table_exists = old_conn.execute(
                 "SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_industries'"
             ).fetchone()
             if not table_exists:
                 log.info("   舊 DB 無 merchant_industries 表")
                 return 0
                 
             rows = old_conn.execute(
                 "SELECT tax_id, industry_code, industry_name, priority FROM merchant_industries"
             ).fetchall()
             
             if not rows:
                 log.info("   舊 DB 無行業別資料")
                 return 0
                 
             new_conn = sqlite3.connect(new_db)
             new_conn.execute("PRAGMA busy_timeout = 5000;")
             new_conn.executemany(
                 "INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)",
                 [(tid, code, name, priority) for tid, code, name, priority in rows]
             )
             new_conn.commit()
             log.info(f"✅ 行業別資料遷移完成：{len(rows)} 筆")
             return len(rows)
         except Exception as e:
             log.error(f"⚠️ 遷移行業別資料失敗: {e}")
             return 0
         finally:
             if old_conn:
                 old_conn.close()
             if new_conn:
                 new_conn.close()
     ```
  
  2. 在主流程 `main`（或排程更新入口）呼叫 `migrate_coords(DB_PATH, new_db)` 的後方（約 L659-660 行）加入：
     ```python
     migrate_industries(DB_PATH, new_db)
     ```

- [ ] **Step 4: 執行測試驗證它通過**
  
  Run: `pytest backend/tests/test_scheduler.py::test_scheduler_industry_migration -v`
  Expected: PASS

- [ ] **Step 5: 提交**
  
  ```bash
  git add scheduler/update_data.py backend/tests/test_scheduler.py
  git commit -m "feat: implement migrate_industries and link into scheduler"
  ```

---

### Task 4: 後端 API 路由與 Model 更新與整合測試

**Files:**
- Modify: `backend/models.py:4-20`
- Modify: `backend/routers/merchants.py:191-200`
- Modify: `backend/tests/test_search_api.py:58-88` (加入單一商家 API 的行業別回傳斷言)

**Interfaces:**
- Consumes: `GET /api/merchants/{merchant_id_or_tax_id}`
- Produces: 包含 `industries` 陣列的 JSON 結構響應模型。

- [ ] **Step 1: 寫下 API 會帶有行業別欄位的失敗整合測試**
  
  修改 [backend/tests/test_search_api.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/tests/test_search_api.py)：
  
  1. 在 `fixture_db_conn` 中寫入一些模擬的行業別資料：
     ```python
     conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)", ("11111111", "561115", "餐館業", 1))
     conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)", ("11111111", "561116", "飲料店業", 2))
     ```
  
  2. 新增測試函數 `test_get_merchant_by_id_includes_industries`：
     ```python
     def test_get_merchant_by_id_includes_industries(db_conn):
         client = TestClient(app)
         response = client.get("/api/merchants/11111111")
         assert response.status_code == 200
         data = response.json()
         assert "industries" in data
         assert len(data["industries"]) == 2
         assert data["industries"][0]["industry_name"] == "餐館業"
         assert data["industries"][0]["priority"] == 1
         assert data["industries"][1]["industry_name"] == "飲料店業"
         assert data["industries"][1]["priority"] == 2
     ```

- [ ] **Step 2: 執行測試並驗證它失敗**
  
  Run: `pytest backend/tests/test_search_api.py::test_get_merchant_by_id_includes_industries -v`
  Expected: FAIL (AssertionError: "industries" not in data 或者 Pydantic ValidationError)

- [ ] **Step 3: 實作 Pydantic Models 與 API 路由更新**
  
  1. 修改 [backend/models.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/models.py)：
     ```python
     class MerchantIndustry(BaseModel):
         industry_code: str
         industry_name: str
         priority: int
         
     class MerchantBase(BaseModel):
         name: str
         address: Optional[str] = None
         zip_code: Optional[str] = None
         tax_id: Optional[str] = None
         website: Optional[str] = None
         industries: Optional[List[MerchantIndustry]] = None # 加入此欄位
     ```
  
  2. 修改 [backend/routers/merchants.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/routers/merchants.py) 的 `get_merchant` 函數：
     ```python
     @router.get("/merchants/{merchant_id_or_tax_id}", response_model=MerchantWithCoords)
     def get_merchant(merchant_id_or_tax_id: str, db: sqlite3.Connection = Depends(get_db)):
         cursor = db.cursor()
         cursor.execute("SELECT * FROM merchants WHERE tax_id = ? OR id = ?", (merchant_id_or_tax_id, merchant_id_or_tax_id))
         row = cursor.fetchone()
         if not row:
             raise HTTPException(status_code=404, detail="Merchant not found")
         
         merchant = dict(row)
         
         # 撈取該店家的行業別，依 priority 排序
         ind_cursor = db.cursor()
         ind_cursor.execute(
             "SELECT industry_code, industry_name, priority FROM merchant_industries WHERE tax_id = ? ORDER BY priority ASC",
             (merchant["tax_id"],)
         )
         industries = [dict(r) for r in ind_cursor.fetchall()]
         merchant["industries"] = industries
         return merchant
     ```

- [ ] **Step 4: 執行測試驗證它通過**
  
  Run: `pytest backend/tests/test_search_api.py::test_get_merchant_by_id_includes_industries -v`
  Expected: PASS

- [ ] **Step 5: 提交**
  
  ```bash
  git add backend/models.py backend/routers/merchants.py backend/tests/test_search_api.py
  git commit -m "feat: add industries field to Pydantic models and backend api response"
  ```
