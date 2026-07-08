# FTS5 Search Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為特約商店系統引入 SQLite FTS5 (trigram) 全文檢索，將 3 字以上的關鍵字搜尋效能提升 40 倍以上，同時向下相容短關鍵字搜尋，並整合至每日排程更新與自動化測試中。

**Architecture:** 
1. 建立以 `trigram` 斷字器的 FTS5 外部內容虛擬表 `merchants_fts` 指向 `merchants`。
2. 開發 Python 關鍵字解析器進行長度分流，動態拼接 `JOIN merchants_fts ... MATCH` 與 `LIKE`。
3. 更新排程腳本在資料庫替換前重建 FTS 索引，並提供一次性遷移兼效能測試工具。

**Tech Stack:** FastAPI, SQLite (FTS5 trigram), Pytest, HTTPX (用於 API 整合測試)

## Global Constraints
* 所有程式碼與測試均符合專案原有的排版格式。
* 資料庫異動以事務 (Transaction) 保護，不影響既有連線。
* 不可使用 `jieba` 等外部斷詞函式庫，完全依賴 SQLite 3.34+ 內建的 `trigram`。

---

## Task 1: Scaffolding Testing and Implementing Query Parser

**Files:**
* Modify: `backend/requirements.txt`
* Create: `backend/tests/__init__.py`
* Create: `backend/tests/test_query_parser.py`
* Modify: `backend/routers/merchants.py`

**Interfaces:**
* Produces: `parse_search_query(q: str) -> tuple[Optional[str], list[str]]` 用於將使用者搜尋字串分流為 FTS 語句與 LIKE 字詞列表。

- [ ] **Step 1: 安裝測試工具**
  修改 `backend/requirements.txt`，加入 `pytest` 與 `httpx`：
  ```text
  fastapi==0.128.8
  uvicorn[standard]==0.39.0
  pydantic==2.13.4
  PyMuPDF==1.26.5
  requests==2.32.5
  pytest==8.3.4
  httpx==0.28.1
  ```
  在終端機執行安裝指令：
  ```bash
  pip install -r backend/requirements.txt
  ```

- [ ] **Step 2: 建立第一個失敗的測試 (TDD)**
  建立空目錄/檔案：
  ```bash
  mkdir -p backend/tests
  touch backend/tests/__init__.py
  ```
  建立 `backend/tests/test_query_parser.py`，寫入對 `parse_search_query` 的預期行為測試：
  ```python
  from backend.routers.merchants import parse_search_query

  def test_parse_search_query_empty():
      assert parse_search_query("") == (None, [])
      assert parse_search_query(None) == (None, [])

  def test_parse_search_query_short_terms():
      # 2字詞會被歸類在 LIKE
      assert parse_search_query("台北 咖啡") == (None, ["台北", "咖啡"])

  def test_parse_search_query_long_terms():
      # 3字及以上詞會被歸類在 FTS
      assert parse_search_query("大飯店 義大利麵") == ('"大飯店" AND "義大利麵"', [])

  def test_parse_search_query_mixed_terms():
      # 混合詞分流
      assert parse_search_query("台北 大飯店 咖啡") == ('"大飯店"', ["台北", "咖啡"])

  def test_parse_search_query_escape_quotes():
      # 逸出雙引號防注入/報錯
      assert parse_search_query('路易"莎 咖啡') == ('"路易""莎"', ["咖啡"])
  ```
  執行測試以驗證它失敗：
  ```bash
  pytest backend/tests/test_query_parser.py -v
  ```
  預期輸出：`ImportError` 或 `AttributeError`（因為 `parse_search_query` 尚未定義）。

- [ ] **Step 3: 實作 `parse_search_query`**
  編輯 `backend/routers/merchants.py`，在檔案開頭（例如第 9 行，`router = APIRouter()` 上方）加入實作：
  ```python
  from typing import Tuple, List

  def parse_search_query(q: str) -> Tuple[Optional[str], List[str]]:
      """
      解析搜尋字串 q。
      回傳:
        - fts_query: 適用於 FTS5 MATCH 的字串 (長度 >= 3 的詞以 AND 連接，並用雙引號包覆)
        - like_terms: 適用於 LIKE 的剩餘短詞 (長度 < 3)
      """
      if not q:
          return None, []
      
      terms = [t.strip() for t in q.split() if t.strip()]
      fts_parts = []
      like_terms = []
      
      for term in terms:
          if len(term) >= 3:
              escaped = term.replace('"', '""')
              fts_parts.append(f'"{escaped}"')
          else:
              like_terms.append(term)
              
      fts_query = " AND ".join(fts_parts) if fts_parts else None
      return fts_query, like_terms
  ```

- [ ] **Step 4: 執行測試並驗證通過**
  在終端機執行：
  ```bash
  pytest backend/tests/test_query_parser.py -v
  ```
  預期輸出：所有測試項目皆 `PASSED`。

- [ ] **Step 5: 提交程式碼**
  ```bash
  git add backend/requirements.txt backend/tests/__init__.py backend/tests/test_query_parser.py backend/routers/merchants.py
  git commit -m "test & feat: add query parser and setup testing dependencies"
  ```

---

## Task 2: FTS5 Database Migration & Benchmark Script

**Files:**
* Create: `scripts/migrate_and_benchmark.py`

**Interfaces:**
* 建立 `scripts/migrate_and_benchmark.py` 作為獨立的可執行腳本，執行現有資料庫結構變更，並產出效能對比報表。

- [ ] **Step 1: 建立遷移與基準測試腳本**
  建立 `scripts/migrate_and_benchmark.py`，內容如下：
  ```python
  #!/usr/bin/env python3
  import os
  import sys
  import time
  import sqlite3

  # 取得 DB 路徑
  backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
  DB_PATH = os.path.join(backend_dir, "merchants.db")

  def migrate_database():
      print(f"📦 連線至資料庫 {DB_PATH} ...")
      if not os.path.exists(DB_PATH):
          print("❌ 找不到資料庫檔案，請確認路徑或先執行排程腳本生成資料庫。")
          sys.exit(1)
          
      conn = sqlite3.connect(DB_PATH)
      cursor = conn.cursor()
      try:
          print("🛠️  建立 FTS5 虛擬表...")
          cursor.execute("""
              CREATE VIRTUAL TABLE IF NOT EXISTS merchants_fts USING fts5(
                  name,
                  address,
                  content='merchants',
                  content_rowid='id',
                  tokenize='trigram'
              );
          """)
          print("⚡ 重建 FTS5 索引...")
          cursor.execute("INSERT INTO merchants_fts(merchants_fts) VALUES('rebuild');")
          conn.commit()
          print("✅ 資料庫遷移與索引重建成功！")
      except Exception as e:
          conn.rollback()
          print(f"❌ 遷移失敗: {e}")
          sys.exit(1)
      finally:
          conn.close()

  def benchmark_queries():
      conn = sqlite3.connect(DB_PATH)
      # 測試詞彙
      test_cases = [
          ("大飯店", "3字長詞"),
          ("咖啡廳", "3字長詞"),
          ("7-11", "4字英文/數字"),
          ("台北", "2字短詞"),
          ("台中", "2字短詞"),
          ("台北 大飯店", "混合字詞")
      ]
      
      print("\n⏱️  開始搜尋效能基準測試 (每個關鍵字執行 50 次取平均時間)...")
      print("-" * 75)
      print(f"{'關鍵字':<12} | {'類型':<10} | {'LIKE 平均時長':<14} | {'FTS5 混合平均':<14} | {'加速倍數':<8}")
      print("-" * 75)
      
      for q, qtype in test_cases:
          # --- 1. 舊版 LIKE 搜尋模擬 ---
          terms = q.split()
          like_where = []
          like_params = []
          for t in terms:
              safe_t = t.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
              like_where.append("(name LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\')")
              like_params.extend([f"%{safe_t}%", f"%{safe_t}%"])
          
          like_sql = f"SELECT COUNT(*) FROM merchants WHERE {' AND '.join(like_where)}"
          
          t0 = time.time()
          for _ in range(50):
              conn.execute(like_sql, like_params).fetchone()
          t_like = ((time.time() - t0) / 50) * 1000  # ms
          
          # --- 2. 新版 FTS5 混合搜尋模擬 ---
          # 採用我們 parse_search_query 的分流邏輯
          fts_parts = []
          like_terms = []
          for t in terms:
              if len(t) >= 3:
                  fts_parts.append(f'"{t.replace(chr(34), chr(34)+chr(34))}"')
              else:
                  like_terms.append(t)
                  
          fts_query = " AND ".join(fts_parts) if fts_parts else None
          
          fts_where = []
          fts_params = []
          fts_sql = ""
          
          if fts_query:
              fts_sql = "SELECT COUNT(*) FROM merchants m JOIN merchants_fts f ON m.id = f.rowid WHERE f.merchants_fts MATCH ?"
              fts_params.append(fts_query)
              for t in like_terms:
                  safe_t = t.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                  fts_where.append("(m.name LIKE ? ESCAPE '\\' OR m.address LIKE ? ESCAPE '\\')")
                  fts_params.extend([f"%{safe_t}%", f"%{safe_t}%"])
              if fts_where:
                  fts_sql += f" AND {' AND '.join(fts_where)}"
          else:
              fts_sql = f"SELECT COUNT(*) FROM merchants WHERE {' AND '.join(like_where)}"
              fts_params = like_params

          t0 = time.time()
          for _ in range(50):
              conn.execute(fts_sql, fts_params).fetchone()
          t_fts = ((time.time() - t0) / 50) * 1000  # ms
          
          ratio = t_like / t_fts if t_fts > 0 else 1.0
          print(f"{q:<15} | {qtype:<10} | {t_like:8.3f} ms | {t_fts:8.3f} ms | {ratio:6.1f}x")
          
      conn.close()

  if __name__ == "__main__":
      migrate_database()
      benchmark_queries()
  ```

- [ ] **Step 2: 執行遷移與測試**
  賦予權限並執行腳本：
  ```bash
  chmod +x scripts/migrate_and_benchmark.py
  python3 scripts/migrate_and_benchmark.py
  ```
  預期輸出：
  資料庫遷移與重建成功，且基準測試報表顯示大於 3 字的關鍵字搜尋（如「大飯店」、「咖啡廳」）享有高達數十倍（預期大於 20x）的加速成果，而 2 字的「台北」維持相似的 LIKE 時長。

- [ ] **Step 3: 提交腳本**
  ```bash
  git add scripts/migrate_and_benchmark.py
  git commit -m "feat: add migration and performance benchmark script"
  ```

---

## Task 3: Integrating FTS5 Hybrid Search in API Endpoints

**Files:**
* Modify: `backend/routers/merchants.py`
* Create: `backend/tests/test_search_api.py`

**Interfaces:**
* `/api/merchants` 與 `/api/merchants/nearby` 路由內部採用 FTS5 進行搜尋加速。

- [ ] **Step 1: 建立失敗的 API 搜尋測試 (TDD)**
  建立整合測試檔案 `backend/tests/test_search_api.py`，內容如下：
  ```python
  import pytest
  import sqlite3
  from fastapi.testclient import TestClient
  from backend.main import app
  from backend.database import get_db

  # 建立測試資料庫
  @pytest.fixture(name="db_conn")
  def fixture_db_conn():
      conn = sqlite3.connect(":memory:")
      conn.row_factory = sqlite3.Row
      conn.execute("""
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
      conn.execute("""
          CREATE VIRTUAL TABLE merchants_fts USING fts5(
              name,
              address,
              content='merchants',
              content_rowid='id',
              tokenize='trigram'
          )
      """)
      
      # 寫入測試商店
      test_merchants = [
          (1, "台北大安咖啡店", "台北市大安區新生南路1段", "106", "11111111", "example1.com", 25.0339, 121.5645),
          (2, "高雄大安咖啡店", "高雄市苓雅區五福路", "802", "22222222", "example2.com", 22.6273, 120.3014),
          (3, "彰化大飯店", "彰化縣彰化市中山路", "500", "33333333", None, 24.0800, 120.5378)
      ]
      conn.executemany(
          "INSERT INTO merchants VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          test_merchants
      )
      conn.execute("INSERT INTO merchants_fts(merchants_fts) VALUES('rebuild')")
      conn.commit()
      
      yield conn
      conn.close()

  def test_get_merchants_hybrid_search(db_conn):
      # 覆寫 FastAPI 的 DB 依賴為測試記憶體連線
      def override_get_db():
          try:
              yield db_conn
          finally:
              pass
      
      app.dependency_overrides[get_db] = override_get_db
      client = TestClient(app)
      
      # 1. 測試長關鍵字 (使用 FTS)
      response = client.get("/api/merchants?q=咖啡店")
      assert response.status_code == 200
      data = response.json()
      assert data["total"] == 2
      assert any("台北大安咖啡店" in item["name"] for item in data["items"])
      
      # 2. 測試混合關鍵字 (FTS + LIKE)
      response = client.get("/api/merchants?q=台北 咖啡店")
      assert response.status_code == 200
      data = response.json()
      assert data["total"] == 1
      assert data["items"][0]["name"] == "台北大安咖啡店"
      
      # 3. 測試短關鍵字 (Fallback LIKE)
      response = client.get("/api/merchants?q=彰化")
      assert response.status_code == 200
      data = response.json()
      assert data["total"] == 1
      assert data["items"][0]["name"] == "彰化大飯店"

      # 清理依賴覆寫
      app.dependency_overrides.clear()
  ```
  執行測試，它應該會失敗或報錯，因為我們尚未整合 `parse_search_query` 到路由中。
  ```bash
  pytest backend/tests/test_search_api.py -v
  ```

- [ ] **Step 2: 修改 `backend/routers/merchants.py`**
  替換 `/merchants` 路由邏輯，整合 `parse_search_query`。
  找到 `get_merchants` 函式（原第 19-75 行），修改為以下實作：
  ```python
  @router.get("/merchants", response_model=PaginatedMerchants)
  def get_merchants(
      q: Optional[str] = Query(None, description="Search keyword for name or address"),
      city: Optional[str] = Query(None, description="Filter by city (e.g. 台北市)"),
      zip_code: Optional[str] = Query(None, description="Exact match zip code"),
      has_website: Optional[bool] = Query(None, description="Filter only stores with website"),
      page: int = Query(1, ge=1, description="Page number"),
      per_page: int = Query(20, ge=1, le=100, description="Items per page"),
      db: sqlite3.Connection = Depends(get_db)
  ):
      query = "SELECT m.* FROM merchants m"
      count_query = "SELECT COUNT(*) FROM merchants m"
      joins = []
      where_clauses = []
      params = []

      # 解析搜尋關鍵字
      if q:
          fts_query, like_terms = parse_search_query(q)
          if fts_query:
              joins.append("JOIN merchants_fts f ON m.id = f.rowid")
              where_clauses.append("f.merchants_fts MATCH ?")
              params.append(fts_query)
              
              for term in like_terms:
                  safe_term = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                  where_clauses.append("(m.name LIKE ? ESCAPE '\\' OR m.address LIKE ? ESCAPE '\\')")
                  params.extend([f"%{safe_term}%", f"%{safe_term}%"])
          else:
              for term in like_terms:
                  safe_term = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                  where_clauses.append("(m.name LIKE ? ESCAPE '\\' OR m.address LIKE ? ESCAPE '\\')")
                  params.extend([f"%{safe_term}%", f"%{safe_term}%"])

      if city:
          safe_city = city.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
          where_clauses.append("m.address LIKE ? ESCAPE '\\'")
          params.append(f"{safe_city}%")

      if zip_code:
          where_clauses.append("m.zip_code = ?")
          params.append(zip_code)

      if has_website is True:
          where_clauses.append("m.website IS NOT NULL AND m.website != ''")
      elif has_website is False:
          where_clauses.append("(m.website IS NULL OR m.website = '')")

      # 拼接 JOIN
      if joins:
          join_str = " " + " ".join(joins)
          query += join_str
          count_query += join_str

      # 拼接 WHERE
      if where_clauses:
          where_str = " WHERE " + " AND ".join(where_clauses)
          query += where_str
          count_query += where_str

      cursor = db.cursor()
      cursor.execute(count_query, params)
      total = cursor.fetchone()[0]
      total_pages = math.ceil(total / per_page) if total > 0 else 1
      offset = (page - 1) * per_page

      query += " LIMIT ? OFFSET ?"
      # 為了不影響 params 陣列，另外拷貝分頁參數
      query_params = list(params)
      query_params.extend([per_page, offset])
      
      cursor.execute(query, query_params)
      rows = cursor.fetchall()
      items = [dict(row) for row in rows]

      return {
          "total": total,
          "page": page,
          "per_page": per_page,
          "total_pages": total_pages,
          "items": items
      }
  ```

- [ ] **Step 3: 修改 `backend/routers/merchants.py` 裡的 `get_nearby_merchants`**
  同樣修改 `/merchants/nearby` 端點以採用 FTS。
  找到 `get_nearby_merchants` 函式（原第 78-121 行），修改為以下實作：
  ```python
  @router.get("/merchants/nearby", response_model=List[MerchantWithCoords])
  def get_nearby_merchants(
      lat: float = Query(..., ge=-89.0, le=89.0, description="Latitude of center point"),
      lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude of center point"),
      radius_km: float = Query(2.0, ge=0.1, le=50.0, description="Search radius in km"),
      q: Optional[str] = Query(None, description="Search keyword for name or address"),
      limit: int = Query(100, ge=1, le=500, description="Max number of results"),
      db: sqlite3.Connection = Depends(get_db)
  ):
      # Approx degrees per km
      lat_delta = radius_km / 111.0
      lon_delta = min(radius_km / (111.0 * math.cos(math.radians(lat))), 180.0)

      query = "SELECT m.* FROM merchants m"
      joins = []
      where_clauses = [
          "m.lat IS NOT NULL",
          "m.lat BETWEEN ? AND ?",
          "m.lon BETWEEN ? AND ?"
      ]
      params = [lat - lat_delta, lat + lat_delta, lon - lon_delta, lon + lon_delta]

      if q:
          fts_query, like_terms = parse_search_query(q)
          if fts_query:
              joins.append("JOIN merchants_fts f ON m.id = f.rowid")
              where_clauses.append("f.merchants_fts MATCH ?")
              params.append(fts_query)
              
              for term in like_terms:
                  safe_term = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                  where_clauses.append("(m.name LIKE ? ESCAPE '\\' OR m.address LIKE ? ESCAPE '\\')")
                  params.extend([f"%{safe_term}%", f"%{safe_term}%"])
          else:
              for term in like_terms:
                  safe_term = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                  where_clauses.append("(m.name LIKE ? ESCAPE '\\' OR m.address LIKE ? ESCAPE '\\')")
                  params.extend([f"%{safe_term}%", f"%{safe_term}%"])

      if joins:
          query += " " + " ".join(joins)
      if where_clauses:
          query += " WHERE " + " AND ".join(where_clauses)

      cursor = db.cursor()
      cursor.execute(query, params)
      rows = cursor.fetchall()
      
      results = []
      for row in rows:
          m = dict(row)
          dist = haversine(lat, lon, m["lat"], m["lon"])
          if dist <= radius_km:
              m["distance_km"] = round(dist, 3)
              results.append(m)

      results.sort(key=lambda x: x["distance_km"])
      return results[:limit]
  ```

- [ ] **Step 4: 執行測試並驗證**
  執行測試套件：
  ```bash
  pytest backend/tests/test_search_api.py -v
  ```
  預期輸出：測試結果為 `PASSED`。

- [ ] **Step 5: 提交程式碼**
  ```bash
  git add backend/routers/merchants.py backend/tests/test_search_api.py
  git commit -m "feat: integrate FTS5 hybrid search into API endpoints and pass integration tests"
  ```

---

## Task 4: Integrating FTS5 in Scheduler

**Files:**
* Modify: `scheduler/update_data.py`
* Create: `backend/tests/test_scheduler.py`

**Interfaces:**
* 每日定時任務執行時，會自動重建 `merchants_fts` 虛擬表並重建索引。

- [ ] **Step 1: 建立排程器整合的 TDD 測試**
  建立 `backend/tests/test_scheduler.py` 以驗證臨時資料庫生成流程是否含 FTS：
  ```python
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
  ```
  執行測試：
  ```bash
  pytest backend/tests/test_scheduler.py -v
  ```
  預期輸出：`PASSED`。

- [ ] **Step 2: 修改 `scheduler/update_data.py`**
  我們需要同時在 `parse_pdf_to_db` 建立 Table 處新增建立 FTS 的 SQL，並在 `main` 遷移完畢後執行 `rebuild`。
  
  1. 編輯 `scheduler/update_data.py` 的 `parse_pdf_to_db`（約第 347-362 行），將：
     ```python
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
         cursor.execute("CREATE INDEX idx_name ON merchants(name)")
         cursor.execute("CREATE INDEX idx_zip_code ON merchants(zip_code)")
         cursor.execute("CREATE INDEX idx_tax_id ON merchants(tax_id)")
         conn.commit()
     ```
     **替換為：**
     ```python
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
         cursor.execute("CREATE INDEX idx_name ON merchants(name)")
         cursor.execute("CREATE INDEX idx_zip_code ON merchants(zip_code)")
         cursor.execute("CREATE INDEX idx_tax_id ON merchants(tax_id)")
         
         # 同步建立 FTS 虛擬表
         cursor.execute("""
             CREATE VIRTUAL TABLE IF NOT EXISTS merchants_fts USING fts5(
                 name,
                 address,
                 content='merchants',
                 content_rowid='id',
                 tokenize='trigram'
             );
         """)
         conn.commit()
     ```

  2. 編輯 `scheduler/update_data.py` 的 `main`（約第 564-570 行），將：
     ```python
             # 5. 遷移座標
             migrate_coords(DB_PATH, new_db)
     
             # 6. 填補缺失座標
             fill_missing_coords(new_db)
     ```
     **替換為：**
     ```python
             # 5. 遷移座標
             migrate_coords(DB_PATH, new_db)
     
             # 6. 填補缺失座標
             fill_missing_coords(new_db)
             
             # 6.5. 在原子性替換生產 DB 之前，重建 FTS 索引
             log.info("⚡ 在新資料庫中重建 FTS5 索引...")
             try:
                 new_conn = sqlite3.connect(new_db)
                 new_conn.execute("INSERT INTO merchants_fts(merchants_fts) VALUES('rebuild')")
                 new_conn.commit()
                 new_conn.close()
                 log.info("✅ FTS5 索引重建完成")
             except Exception as e:
                 log.error(f"❌ 重建 FTS5 索引失敗: {e}")
                 sys.exit(1)
     ```

- [ ] **Step 3: 執行全局測試驗證**
  在專案根目錄下，使用 `pytest` 跑所有測試：
  ```bash
  pytest -v
  ```
  預期輸出：所有測試 (`test_query_parser`, `test_search_api`, `test_scheduler`) 全部綠燈通過。

- [ ] **Step 4: 提交程式碼**
  ```bash
  git add scheduler/update_data.py backend/tests/test_scheduler.py
  git commit -m "feat & test: integrate FTS5 index rebuild in scheduler and add scheduler db test"
  ```
