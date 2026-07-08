# SQLite FTS5 搜尋效能優化設計規格書 (FTS5 Search Optimization Design)

本規格書詳細規劃如何在「國民旅遊卡特約商店查詢系統」中，引入 SQLite FTS5 (Full Text Search 5) 搭配 `trigram` 斷字器，以優化中英文關鍵字搜尋效能。

---

## 1. 背景與動機 (Background & Motivation)

系統目前收錄約 55,000 筆特約商店資料，搜尋功能的實作採用標準的 SQL `LIKE '%keyword%'` 語法。
當使用者搜尋店名或地址時，SQLite 會進行全表掃描（Linear Scan），耗時約 2-10 毫秒。雖然對於單次查詢看似微小，但在高併發（Concurrency）或伺服器資源受限的環境下，全表掃描會耗費大量 CPU 與 I/O，限制系統的吞吐量與反應速度。

由於 SQLite 3.34.0+ 已內建 `trigram` 斷字器，我們可以使用 FTS5 trigram 建立高效的三字元索引，使 3 字以上的關鍵字搜尋降至 0.1 毫秒以下（加速 40 倍以上），同時對小於 3 字的短詞提供 `LIKE` 降級相容，達到效能與精準度的平衡。

---

## 2. 系統架構設計 (Technical Design)

### 2.1 資料庫結構 (Database Schema)

在主資料庫中建立虛擬表 `merchants_fts`，並設定為 `merchants` 的外部內容表（External Content Table）。

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS merchants_fts USING fts5(
    name,
    address,
    content='merchants',
    content_rowid='id',
    tokenize='trigram'
);
```

#### 索引重建機制
由於使用外部內容表，當來源資料表 `merchants` 發生大量異動（如每日排程更新）時，必須手動觸發 FTS 索引重建：
```sql
INSERT INTO merchants_fts(merchants_fts) VALUES('rebuild');
```

---

### 2.2 後端 API 查詢邏輯 (Backend API Query Logic)

將原本直接使用 `LIKE` 的方式，修改為「混合式搜尋語意解析與 SQL 動態構建」。

#### 關鍵字解析器 (`parse_search_query`)
在 `backend/routers/merchants.py` 新增分析函式：
```python
def parse_search_query(q: str) -> tuple[Optional[str], list[str]]:
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
            # 逸出雙引號以防 FTS 語法報錯
            escaped = term.replace('"', '""')
            fts_parts.append(f'"{escaped}"')
        else:
            like_terms.append(term)
            
    fts_query = " AND ".join(fts_parts) if fts_parts else None
    return fts_query, like_terms
```

#### 動態 SQL 構建
對於 `/api/merchants` 與 `/api/merchants/nearby` 路由，將動態拼接 `JOIN merchants_fts`：

*   **情況 A：只有長詞（或包含長詞）**（如 `q="大飯店"` 或 `q="台北 大飯店"`）
    ```sql
    SELECT m.* FROM merchants m
    JOIN merchants_fts f ON m.id = f.rowid
    WHERE f.merchants_fts MATCH :fts_query
      -- 若有短詞，則加上 LIKE 輔助篩選：
      AND (m.name LIKE :like_q ESCAPE '\' OR m.address LIKE :like_q ESCAPE '\')
    ```
*   **情況 B：只有短詞**（如 `q="台北"`）
    維持原狀，不進行 JOIN，直接使用原有的 `LIKE`：
    ```sql
    SELECT m.* FROM merchants m
    WHERE (m.name LIKE :like_q ESCAPE '\' OR m.address LIKE :like_q ESCAPE '\')
    ```

---

### 2.3 排程器整合 (Scheduler Integration)

修改 `scheduler/update_data.py` 中的 `parse_pdf_to_db` 函式：
1.  建立 `new_db` 時同步建立 `merchants_fts` 虛擬表。
2.  在插入完全部解析資料後、且座標遷移（`migrate_coords`）與填補（`fill_missing_coords`）完成之後，執行重建 FTS 索引：
    ```python
    conn.execute("INSERT INTO merchants_fts(merchants_fts) VALUES('rebuild')")
    ```
3.  確認重建無誤後，再替換至生產資料庫。

---

## 3. 測試與驗證計畫 (Testing & Verification Plan)

為了確保 FTS5 優化不會導致搜尋結果遺漏，且效能確實提升，我們將規劃完整的測試與驗證流程。

### 3.1 單元測試 (Unit Tests)
在 `backend/tests/` 下建立測試檔案：
*   **字詞解析測試 (`test_query_parser`)**：
    *   測試長度 $\ge 3$ 的中文字詞是否正確產出 `fts_query`。
    *   測試長度 $< 3$ 的字詞是否推入 `like_terms`。
    *   測試包含特殊字元（如雙引號 `"`、破折號 `-`）時，是否會被正確轉義，避免 SQLite FTS 語法崩潰。
    *   測試多字詞混合輸入的解析結果。

### 3.2 整合測試 (Integration Tests)
*   **資料庫搜尋正確性測試 (`test_database_search`)**：
    *   建立測試用 SQLite 記憶體資料庫。
    *   寫入模擬特約商店（含各種名稱如 "台北大飯店", "高雄咖啡廳", "7-11便利商店"）。
    *   驗證使用 FTS5 / LIKE 混合查詢所取得的結果與純 LIKE 查詢的結果完全一致（無漏掉資料）。

### 3.3 一次性遷移腳本與驗證 (One-time Migration & Benchmark)
我們將建立一個一次性遷移與基準測試腳本 `scripts/migrate_and_benchmark.py`：
1.  **資料庫升級**：在現有的 `backend/merchants.db` 中建立 `merchants_fts` 並執行 `rebuild`。
2.  **基準測試 (Benchmark)**：
    *   隨機挑選多個不同長度的搜尋關鍵字（例如 2 字的「飯店」、3 字的「大飯店」、4 字的「義式料理」）。
    *   分別使用舊的 LIKE 方式與新的 FTS5 方式執行 100 次查詢，計算平均執行時間（毫秒）。
    *   列印出效能對比報表，確保搜尋耗時大幅下降。
3.  **正確性核對**：比對兩種方式回傳的商家 ID 列表是否完全一致。

---

## 4. 實作步驟規劃 (Implementation Steps)

1.  **建立遷移與基準測試腳本**：撰寫 `scripts/migrate_and_benchmark.py` 用於現有生產資料庫的升級與效能驗證。
2.  **更新 API 邏輯**：修改 `backend/routers/merchants.py` 整合 FTS 查詢。
3.  **編寫單元與整合測試**：新增相關測試以驗證解析器與搜尋正確性。
4.  **修改排程更新腳本**：修改 `scheduler/update_data.py` 確保後續每日更新能自動重建索引。
5.  **執行驗證**：跑測試與 Benchmark，將數據呈現給使用者確認。
