# Codebase Bugfixes & Performance Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復排程器解析第 0 頁資料漏失問題、地圖搜尋 OSM API 合規性、資料庫 Busy Timeout 鎖定問題、日誌輸出重導向，以及建立經緯度聯合索引。

**Architecture:** 
1. 修正 PDF 遍歷迴圈範圍，納入封面頁（Page 0），並以 headers 集合排他性過濾封面標題與日期行。
2. 於 Nominatim API 的 headers 注入自訂 `User-Agent`。
3. 為所有後端及排程 SQLite 連線啟用 `PRAGMA busy_timeout = 5000` 與 `PRAGMA synchronous = NORMAL`。
4. 移除 `crontab` 重導向；在 DB 建表語句追加 `idx_lat_lon` 經緯度聯合索引。

**Tech Stack:** FastAPI, Next.js, SQLite, Pytest

## Global Constraints
* 所有程式碼必須遵循專案現有的排版風格。
* 不可引進外部第三方斷詞庫。
* 連線關閉必須置於 `finally` 區塊中。

---

## Task 1: Fix PDF Parsing Logic and Add Unit Tests

**Files:**
* Modify: `scheduler/update_data.py`
* Modify: `backend/tests/test_scheduler.py`

**Interfaces:**
* `scheduler/update_data.py:parse_pdf_to_db` 改為從 `0` 頁開始遍歷，且過濾 `"國民旅遊卡特約商店清冊"` 及 `"檔案日期"`。

- [ ] **Step 1: 修改 PDF 解析邏輯**
  編輯 `scheduler/update_data.py` 中的 `parse_pdf_to_db`（約第 365-375 行）：
  將原本：
  ```python
      # 讀取文字
      headers = {"特店名稱", "特店地址", "郵遞區號", "統一編號", "特店網頁位址"}
      lines = []
      total_pages = len(doc)
      for page_num in range(1, total_pages):  # 跳過第 0 頁（封面 / 目錄頁，不含商家資料）
          page = doc[page_num]
          text = page.get_text("text")
          for line in text.split("\n"):
              line = normalize_text(line)
              if line and line not in headers:
                  lines.append(line)
  ```
  **修改為：**
  ```python
      # 讀取文字
      headers = {"特店名稱", "特店地址", "郵遞區號", "統一編號", "特店網頁位址", "國民旅遊卡特約商店清冊"}
      lines = []
      total_pages = len(doc)
      for page_num in range(0, total_pages):  # 從第 0 頁（包含封面）開始解析
          page = doc[page_num]
          text = page.get_text("text")
          for line in text.split("\n"):
              line = normalize_text(line)
              if line and line not in headers and not line.startswith("檔案日期"):
                  lines.append(line)
  ```

- [ ] **Step 2: 在 `backend/tests/test_scheduler.py` 中新增第 0 頁過濾與解析測試**
  編輯 `backend/tests/test_scheduler.py`，新增測試案例：
  ```python
  from scheduler.update_data import normalize_text

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
  ```

- [ ] **Step 3: 執行測試並驗證**
  執行測試套件：
  ```bash
  PYTHONPATH=. .venv/bin/pytest backend/tests/test_scheduler.py -v
  ```
  預期輸出：測試成功通過 (`PASSED`)。

- [ ] **Step 4: 提交程式碼**
  ```bash
  git add scheduler/update_data.py backend/tests/test_scheduler.py
  git commit -m "fix: parse page 0 in scheduler to prevent data loss and add unit tests"
  ```

---

## Task 2: Nominatim User-Agent and Database Busy Timeout

**Files:**
* Modify: `frontend/src/components/AddressSearch.tsx`
* Modify: `backend/database.py`
* Modify: `scheduler/update_data.py`
* Modify: `scripts/migrate_and_benchmark.py`

**Interfaces:**
* API 及排程 SQLite 連線套用 `PRAGMA busy_timeout = 5000` 與 `PRAGMA synchronous = NORMAL`。
* `AddressSearch.tsx` fetch 地理編碼時發送 `User-Agent` Header。

- [ ] **Step 1: 修改 Nominatim API 的 User-Agent**
  編輯 `frontend/src/components/AddressSearch.tsx`（約第 46-56 行）：
  將原本：
  ```typescript
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=tw&limit=5`,
            {
              headers: {
                "Accept-Language": "zh-TW,zh;q=0.9",
              },
              signal: controller.signal,
            }
          );
  ```
  **修改為：**
  ```typescript
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=tw&limit=5`,
            {
              headers: {
                "Accept-Language": "zh-TW,zh;q=0.9",
                "User-Agent": "NationalTravelCardQuerySystem/1.0 (contact: admin@example.com)"
              },
              signal: controller.signal,
            }
          );
  ```

- [ ] **Step 2: 在 `backend/database.py` 中加入 SQLite PRAGMA 設定**
  編輯 `backend/database.py` 的 `get_db_connection`（第 10-14 行）：
  將原本：
  ```python
  def get_db_connection() -> sqlite3.Connection:
      conn = sqlite3.connect(DB_PATH, check_same_thread=False)
      conn.execute("PRAGMA journal_mode=WAL;")
      conn.row_factory = sqlite3.Row
      return conn
  ```
  **修改為：**
  ```python
  def get_db_connection() -> sqlite3.Connection:
      conn = sqlite3.connect(DB_PATH, check_same_thread=False)
      conn.execute("PRAGMA busy_timeout = 5000;")
      conn.execute("PRAGMA journal_mode=WAL;")
      conn.execute("PRAGMA synchronous = NORMAL;")
      conn.row_factory = sqlite3.Row
      return conn
  ```

- [ ] **Step 3: 修改 `scheduler/update_data.py` 中所有的 sqlite3.connect 連線**
  編輯 `scheduler/update_data.py`，搜尋所有 `sqlite3.connect`，於連線建立後追加設定。
  1. 在 `parse_pdf_to_db` 函式中（約第 344 行）：
     ```python
     conn = sqlite3.connect(db_path)
     conn.execute("PRAGMA busy_timeout = 5000;")
     conn.execute("PRAGMA journal_mode=WAL;")
     conn.execute("PRAGMA synchronous = NORMAL;")
     ```
  2. 在 `migrate_coords` 函式中（約第 451-452 行）：
     ```python
     old_conn = sqlite3.connect(old_db)
     old_conn.execute("PRAGMA busy_timeout = 5000;")
     new_conn = sqlite3.connect(new_db)
     new_conn.execute("PRAGMA busy_timeout = 5000;")
     ```
  3. 在 `fill_missing_coords` 函式中（約第 475 行）：
     ```python
     conn = sqlite3.connect(db_path)
     conn.execute("PRAGMA busy_timeout = 5000;")
     conn.execute("PRAGMA journal_mode=WAL;")
     conn.execute("PRAGMA synchronous = NORMAL;")
     ```
  4. 在 `main` 函式中的 `prod_conn = sqlite3.connect(DB_PATH)`（約第 600 行）：
     ```python
     prod_conn = sqlite3.connect(DB_PATH)
     prod_conn.execute("PRAGMA busy_timeout = 5000;")
     prod_conn.execute("PRAGMA journal_mode=WAL;")
     prod_conn.execute("PRAGMA synchronous = NORMAL;")
     ```

- [ ] **Step 4: 修改 `scripts/migrate_and_benchmark.py` 中的 sqlite3.connect 連線**
  編輯 `scripts/migrate_and_benchmark.py` 中的所有 `sqlite3.connect`，於連線建立後追加設定：
  ```python
  conn = sqlite3.connect(DB_PATH)
  conn.execute("PRAGMA busy_timeout = 5000;")
  conn.execute("PRAGMA journal_mode=WAL;")
  conn.execute("PRAGMA synchronous = NORMAL;")
  ```

- [ ] **Step 5: 執行測試並驗證**
  執行測試：
  ```bash
  PYTHONPATH=. .venv/bin/pytest -v
  ```
  預期輸出：所有測試正常通過。

- [ ] **Step 6: 提交程式碼**
  ```bash
  git add frontend/src/components/AddressSearch.tsx backend/database.py scheduler/update_data.py scripts/migrate_and_benchmark.py
  git commit -m "fix: set busy_timeout and synchronous normal for SQLite and configure Nominatim User-Agent"
  ```

---

## Task 3: Lat/Lon Index and Cron Redirection Removal

**Files:**
* Modify: `scheduler/update_data.py`
* Modify: `scripts/migrate_and_benchmark.py`
* Modify: `scheduler/crontab`

**Interfaces:**
* 資料庫 `merchants` 資料表上擁有 `idx_lat_lon` 聯合索引。
* `scheduler/crontab` 中沒有 stdout 重導向。

- [ ] **Step 1: 在排程器新增經緯度聯合索引**
  編輯 `scheduler/update_data.py` 中的 `parse_pdf_to_db`（約第 362 行，建立索引處）：
  將原本：
  ```python
         cursor.execute("CREATE INDEX idx_name ON merchants(name)")
         cursor.execute("CREATE INDEX idx_zip_code ON merchants(zip_code)")
         cursor.execute("CREATE INDEX idx_tax_id ON merchants(tax_id)")
  ```
  **修改為：**
  ```python
         cursor.execute("CREATE INDEX idx_name ON merchants(name)")
         cursor.execute("CREATE INDEX idx_zip_code ON merchants(zip_code)")
         cursor.execute("CREATE INDEX idx_tax_id ON merchants(tax_id)")
         cursor.execute("CREATE INDEX idx_lat_lon ON merchants(lat, lon)")
  ```

- [ ] **Step 2: 在遷移基準測試腳本中建立相同的索引**
  編輯 `scripts/migrate_and_benchmark.py`，於 `migrate_database` 的 DDL 建立邏輯中，加入建立 `idx_lat_lon` 索引的 DDL：
  ```python
          print("🛠️  建立 FTS5 虛擬表...")
          # ... (原有 FTS 語句)
          
          print("🛠️  建立經緯度聯合索引...")
          cursor.execute("CREATE INDEX IF NOT EXISTS idx_lat_lon ON merchants(lat, lon);")
          
          print("⚡ 重建 FTS5 索引...")
          cursor.execute("INSERT INTO merchants_fts(merchants_fts) VALUES('rebuild');")
  ```

- [ ] **Step 3: 移除 `scheduler/crontab` 的日誌重導向**
  編輯 `scheduler/crontab`（第 2 行）：
  將原本：
  ```crontab
  0 19 * * * python /app/update_data.py >> /data/update.log 2>&1
  ```
  **修改為：**
  ```crontab
  0 19 * * * python /app/update_data.py
  ```

- [ ] **Step 4: 執行遷移升級並驗證**
  在本地執行遷移腳本升級現有資料庫並測試效能：
  ```bash
  python3 scripts/migrate_and_benchmark.py
  ```
  執行整體測試：
  ```bash
  PYTHONPATH=. .venv/bin/pytest -v
  ```
  預期輸出：所有測試與基準測試均正常通過。

- [ ] **Step 5: 提交程式碼**
  ```bash
  git add scheduler/update_data.py scripts/migrate_and_benchmark.py scheduler/crontab
  git commit -m "feat & refactor: create lat/lon index for nearby queries and fix crontab logging to stdout"
  ```
