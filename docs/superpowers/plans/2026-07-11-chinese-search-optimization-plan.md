# 國民旅遊卡特約商店 中文搜尋優化實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-step. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將國旅卡特約商店搜尋從 `LIKE` 全表掃描優化為基於空白分詞的 Unigram FTS5 檢索，使 1-2 字中文短詞搜尋效能提升 10 倍以上。

**Architecture:** 
1. 建立中文空白分詞函數，將中文字元在 FTS 虛擬表中以空格隔開儲存。
2. 將 FTS5 虛擬表改為標準 `unicode61` 分詞表。
3. 後端 API 解析搜尋字串，轉換為多個 Phrase Query（短語查詢）並以 `AND` 連接，實現高速精準檢索。

**Tech Stack:** Python 3, FastAPI, SQLite 3 (FTS5)

## Global Constraints
- 所有代碼改動均需以繁體中文註解與提示。
- 嚴格遵守 Python 原始碼代碼風格，維持現有變數命名與縮排。
- 修改後必須通過單元測試與效能基準測試驗證。

---

### Task 1: 寫入端分詞預處理與資料庫遷移

**Files:**
- Modify: `scripts/parse_pdf.py:14-52` (新增分詞函數並修改 init_db)
- Modify: `scripts/parse_pdf.py:190-202` (寫入 FTS5 虛擬表)
- Modify: `scheduler/update_data.py:245-293` (新增分詞函數)
- Modify: `scheduler/update_data.py:358-410` (修改新資料庫的 FTS5 表結構)
- Modify: `scheduler/update_data.py:518-531` (解析 PDF 後寫入 FTS5 表)
- Modify: `scheduler/update_data.py:752-782` (原子性替換生產 DB 邏輯)

**Interfaces:**
- Produces: `space_segment(text: str) -> str` 函數，用於在寫入端空格切分中文字元。
- Produces: `merchants_fts` 標準 FTS5 虛擬表（`tokenize="unicode61"`，不包含 `content` 參數）。

- [ ] **Step 1: 在 `scripts/parse_pdf.py` 中新增 `space_segment` 函數並修改 `init_db`**

新增並修改為：
```python
def space_segment(text):
    if not text:
        return ""
    result = []
    current_word = []
    for char in text:
        if "\u4e00" <= char <= "\u9fff":
            if current_word:
                result.append("".join(current_word))
                current_word = []
            result.append(char)
        elif char.isalnum():
            current_word.append(char)
        else:
            if current_word:
                result.append("".join(current_word))
                current_word = []
    if current_word:
        result.append("".join(current_word))
    return " ".join(result)

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS merchants")
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
    
    # 建立獨立的 FTS5 虛擬表
    cursor.execute("DROP TABLE IF EXISTS merchants_fts")
    cursor.execute("""
        CREATE VIRTUAL TABLE merchants_fts USING fts5(
            name,
            address,
            tokenize="unicode61"
        )
    """)
    conn.commit()
    return conn
```

- [ ] **Step 2: 在 `scripts/parse_pdf.py` 寫入段添加 FTS5 寫入邏輯**

修改 `scripts/parse_pdf.py` 的 `main()` 尾端（約 189-202 行）：
```python
    print(f"Parsed {len(records)} records. Inserting into database...")
    
    insert_data = [(r['name'], r['address'], r['zip_code'], r['tax_id'], r['website']) for r in records]
    cursor.executemany(
        "INSERT OR IGNORE INTO merchants (name, address, zip_code, tax_id, website) VALUES (?, ?, ?, ?, ?)",
        insert_data
    )
    conn.commit()
    
    # 讀取剛剛寫入的資料以同步至 FTS5
    cursor.execute("SELECT id, name, address FROM merchants")
    inserted = cursor.fetchall()
    fts_insert = [(r[0], space_segment(r[1]), space_segment(r[2])) for r in inserted]
    cursor.executemany(
        "INSERT INTO merchants_fts (rowid, name, address) VALUES (?, ?, ?)",
        fts_insert
    )
    conn.commit()
```

- [ ] **Step 3: 修改 `scheduler/update_data.py` 新增 `space_segment` 與虛擬表結構**

在 `scheduler/update_data.py` 約 245 行處，將 `normalize_text` 旁新增 `space_segment` 函數：
```python
def space_segment(text: str) -> str:
    if not text:
        return ""
    result = []
    current_word = []
    for char in text:
        if "\u4e00" <= char <= "\u9fff":
            if current_word:
                result.append("".join(current_word))
                current_word = []
            result.append(char)
        elif char.isalnum():
            current_word.append(char)
        else:
            if current_word:
                result.append("".join(current_word))
                current_word = []
    if current_word:
        result.append("".join(current_word))
    return " ".join(result)
```

修改 `scheduler/update_data.py` 的 `parse_pdf_to_db` 初始化 DB 區塊（約 368-410 行）：
```python
        cursor.execute("DROP TABLE IF EXISTS merchants")
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
        cursor.execute("CREATE INDEX idx_lat_lon ON merchants(lat, lon)")
        
        cursor.execute("DROP TABLE IF EXISTS merchants_fts")
        cursor.execute("""
            CREATE VIRTUAL TABLE merchants_fts USING fts5(
                name,
                address,
                tokenize="unicode61"
            );
        """)
```

- [ ] **Step 4: 修改 `scheduler/update_data.py` 寫入與原子性替換邏輯**

在 `parse_pdf_to_db` 尾部（約 518-531 行）寫入 FTS5：
```python
        insert_data = [(r["name"], r["address"], r["zip_code"], r["tax_id"], r["website"]) for r in records]
        cursor.executemany(
            "INSERT OR IGNORE INTO merchants (name, address, zip_code, tax_id, website) VALUES (?, ?, ?, ?, ?)",
            insert_data
        )
        conn.commit()

        # 同步寫入 FTS5
        cursor.execute("SELECT id, name, address FROM merchants")
        inserted = cursor.fetchall()
        fts_insert = [(r[0], space_segment(r[1]), space_segment(r[2])) for r in inserted]
        cursor.executemany(
            "INSERT INTO merchants_fts (rowid, name, address) VALUES (?, ?, ?)",
            fts_insert
        )
        conn.commit()
```

修改主程序事務替換邏輯（約 752-782 行）：
```python
                prod_conn.execute("DROP TABLE IF EXISTS main.merchants_fts")
                prod_conn.execute("""
                    CREATE VIRTUAL TABLE IF NOT EXISTS main.merchants_fts USING fts5(
                        name,
                        address,
                        tokenize="unicode61"
                    )
                """)
                
                prod_conn.execute("ATTACH DATABASE ? AS new_db", (new_db,))
                prod_conn.execute("BEGIN TRANSACTION")
                prod_conn.execute("DELETE FROM main.merchant_industries")
                prod_conn.execute("DELETE FROM main.merchants")
                prod_conn.execute("DELETE FROM main.merchants_fts")
                prod_conn.execute("INSERT INTO main.merchants SELECT * FROM new_db.merchants")
                prod_conn.execute("INSERT INTO main.merchant_industries (id, tax_id, industry_code, industry_name, priority) SELECT id, tax_id, industry_code, industry_name, priority FROM new_db.merchant_industries")
                prod_conn.execute("INSERT INTO main.merchants_fts (rowid, name, address) SELECT rowid, name, address FROM new_db.merchants_fts")
                prod_conn.execute("COMMIT")
                prod_conn.execute("DETACH DATABASE new_db")
```

- [ ] **Step 5: 執行 `parse_pdf.py` 驗證寫入正確性**

指令：
```bash
python3 scripts/parse_pdf.py
```
驗證方式：確認成功插入約 55,000 筆商家。再使用 sqlite3 執行：
```bash
sqlite3 backend/merchants.db "SELECT name, address FROM merchants_fts LIMIT 3;"
```
期望輸出：
```
CHIC CHIC GIRL 古 亭 店|臺 北 市 中 正 區 羅 斯 福 路 2 段 198 號
上 海 鄉 村 仁 愛 店|台 北 市 中 正 區 仁 愛 路 1 段 17 號 地 下 1 樓
大 集 合 精 品 鞋 坊|台 北 市 中 正 區 羅 斯 福 路 4 段 28 號
```

- [ ] **Step 6: Commit**

```bash
git add scripts/parse_pdf.py scheduler/update_data.py
git commit -m "feat(database): change FTS5 to space-segmented unicode61 for Chinese search support"
```

---

### Task 2: 後端 API 搜尋邏輯改動

**Files:**
- Modify: `backend/routers/merchants.py:9-45` (改寫搜尋解析邏輯，廢除 LIKE 分流)
- Modify: `backend/routers/merchants.py:75-86` (簡化 get_merchants MATCH)
- Modify: `backend/routers/merchants.py:171-182` (簡化 get_nearby_merchants MATCH)

**Interfaces:**
- Consumes: 資料庫中的 `merchants_fts` (空格分詞)。
- Produces: 最佳化後的搜尋介面，在 `GET /api/merchants` 中不再使用 `LIKE` 進行關鍵字搜尋。

- [ ] **Step 1: 修改 `backend/routers/merchants.py` 新增 `space_segment` 與變更 `parse_search_query`**

將 `backend/routers/merchants.py` 中的 `parse_search_query` 及其相關輔助函數（第 9-45 行）改寫為：
```python
def space_segment(text: str) -> str:
    if not text:
        return ""
    result = []
    current_word = []
    for char in text:
        if "\u4e00" <= char <= "\u9fff":
            if current_word:
                result.append("".join(current_word))
                current_word = []
            result.append(char)
        elif char.isalnum():
            current_word.append(char)
        else:
            if current_word:
                result.append("".join(current_word))
                current_word = []
    if current_word:
        result.append("".join(current_word))
    return " ".join(result)

def parse_search_query(q: Optional[str]) -> Optional[str]:
    if not q:
        return None
    
    # 保留字母、數字、中文與安全符號，其餘轉為空格
    cleaned_q = re.sub(r'[^\w\s\u4e00-\u9fff\-&+=]', ' ', q)
    
    parts = []
    for term in cleaned_q.split():
        term = term.strip()
        if not term:
            continue
        segmented = space_segment(term)
        parts.append(f'"{segmented}"')
        
    return " AND ".join(parts) if parts else None
```

- [ ] **Step 2: 簡化 `get_merchants` 中的關鍵字過濾邏輯**

修改 `backend/routers/merchants.py` 中 `get_merchants` 的關鍵字過濾部分（原第 75-86 行）：
```python
    # 解析搜尋關鍵字
    if q:
        fts_query = parse_search_query(q)
        if fts_query:
            joins.append("JOIN merchants_fts f ON m.id = f.rowid")
            where_clauses.append("f.merchants_fts MATCH ?")
            params.append(fts_query)
```

- [ ] **Step 3: 簡化 `get_nearby_merchants` 中的關鍵字過濾邏輯**

修改 `backend/routers/merchants.py` 中 `get_nearby_merchants` 的關鍵字過濾部分（原第 171-182 行）：
```python
    if q:
        fts_query = parse_search_query(q)
        if fts_query:
            joins.append("JOIN merchants_fts f ON m.id = f.rowid")
            where_clauses.append("f.merchants_fts MATCH ?")
            params.append(fts_query)
```

- [ ] **Step 4: 啟動後端並用 curl 測試 API 搜尋**

在背景啟動後端（若尚未啟動）：
```bash
python3 -m uvicorn backend.main:app --port 8000 &
```
等待 2 秒後，執行 curl 測試：
```bash
curl -s "http://127.0.0.1:8000/api/merchants?q=%E5%92%96%E5%95%A1&per_page=2" | grep -q "咖啡" && echo "PASS" || echo "FAIL"
```
期望輸出：`PASS`

- [ ] **Step 5: Commit**

```bash
git add backend/routers/merchants.py
git commit -m "feat(api): simplify search parser to use unified FTS5 phrase MATCH for Chinese keywords"
```

---

### Task 3: 整合測試與效能基準測試

**Files:**
- Create: `backend/tests/test_search_optimization.py` (新增單元與整合測試)
- Modify: `scripts/migrate_and_benchmark.py` (修正基準測試中的分流測試邏輯)

**Interfaces:**
- Produces: `pytest backend/tests/test_search_optimization.py` 驗證搜尋邏輯正確性。
- Produces: `python3 scripts/migrate_and_benchmark.py` 輸出效能加速比數據。

- [ ] **Step 1: 建立整合測試檔案 `backend/tests/test_search_optimization.py`**

建立內容如下：
```python
import sqlite3
import pytest
from backend.routers.merchants import space_segment, parse_search_query
from backend.database import DB_PATH

def test_space_segment():
    assert space_segment("臺北市中正區") == "臺 北 市 中 正 區"
    assert space_segment("CHIC古亭店") == "CHIC 古 亭 店"
    assert space_segment("7-11便利店") == "7 11 便 利 店"

def test_parse_search_query():
    assert parse_search_query("台北 咖啡") == '"台 北" AND "咖 啡"'
    assert parse_search_query("7-11") == '"7 11"'
    assert parse_search_query("CHIC古亭") == '"CHIC 古 亭"'

def test_fts_match_correctness():
    # 驗證 FTS MATCH 與 LIKE 的回傳結果基本一致
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    keyword = "咖啡"
    # LIKE
    cursor.execute("SELECT COUNT(*) FROM merchants WHERE name LIKE ? OR address LIKE ?", (f"%{keyword}%", f"%{keyword}%"))
    like_count = cursor.fetchone()[0]
    
    # FTS MATCH
    fts_q = parse_search_query(keyword)
    cursor.execute("SELECT COUNT(*) FROM merchants m JOIN merchants_fts f ON m.id = f.rowid WHERE f.merchants_fts MATCH ?", (fts_q,))
    fts_count = cursor.fetchone()[0]
    
    # 允許少量由於「台/臺」正規化產生的預期差異，但應該非常接近
    assert abs(like_count - fts_count) < 20
    conn.close()
```

- [ ] **Step 2: 執行 Pytest 驗證測試通過**

指令：
```bash
pytest backend/tests/test_search_optimization.py -v
```
期望輸出：`3 passed`

- [ ] **Step 3: 修改基準測試腳本 `scripts/migrate_and_benchmark.py`**

修改 `scripts/migrate_and_benchmark.py` 的 FTS5 測試邏輯，使其不再以 `len >= 3` 進行 LIKE 分流（約 116-147 行）：
```python
            # --- 2. 新版 FTS5 搜尋模擬 ---
            fts_query = parse_search_query(q)
            fts_params = []
            
            if fts_query:
                fts_sql = "SELECT COUNT(*) FROM merchants m JOIN merchants_fts f ON m.id = f.rowid WHERE f.merchants_fts MATCH ?"
                fts_params.append(fts_query)
            else:
                fts_sql = "SELECT COUNT(*) FROM merchants WHERE 1=1"
```
（確保在該腳本頂端導入 `from backend.routers.merchants import parse_search_query`）

- [ ] **Step 4: 執行基準測試輸出效能加速比**

指令：
```bash
python3 scripts/migrate_and_benchmark.py
```
期望輸出：
台北、台中等 2 字短詞的「FTS5 混合平均」時間應 `<1.5ms`，且「加速倍數」應為 `10x` ~ `50x`。

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_search_optimization.py scripts/migrate_and_benchmark.py
git commit -m "test: add test suite and update benchmark for space-segmented Chinese search"
```
