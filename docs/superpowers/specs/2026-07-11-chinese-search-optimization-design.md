# 國民旅遊卡特約商店 中文搜尋優化設計規格書

> 規格書路徑：`docs/superpowers/specs/2026-07-11-chinese-search-optimization-design.md`  
> 建立日期：2026-07-11  
> 狀態：待評審（Under Review）  

---

## 1. 背景與動機
目前國民旅遊卡特約商店查詢系統收錄了約 55,000 筆商家資料。目前的 FTS5 全文檢索表（`merchants_fts`）採用 `trigram` (三字元) 分詞。

這導致一個核心問題：**當關鍵字小於 3 個字時（如中文常見詞「台北」、「咖啡」、「民宿」），FTS5 無法匹配 any Token，搜尋結果為 0。**

目前系統的解決方式是在 API 端進行分流：長詞走 FTS5 MATCH，短詞退回到 SQLite `LIKE '%關鍵字%'`。
然而，`LIKE` 查詢在沒有索引支持的情況下會進行**全表掃描（Full Table Scan）**。在併發查詢或資料量增加時，這會成為系統效能的隱憂（經測量，單次 LIKE 耗時約 6~50ms，而 FTS5 僅需 <1ms）。

---

## 2. 解決方案：空白分詞法 (Space-Segmented Unigram FTS5)
本優化方案將 FTS5 虛擬表的分詞機制從 `trigram` 改為 `unicode61` (基於空白分詞)，並在資料寫入與查詢時進行預處理。

### 2.1 資料庫結構變更 (Database Schema)
將 `merchants_fts` 虛擬表從 `content='merchants'` 與 `trigram` 改為獨立的標準 FTS5 虛擬表，採用預設的 `unicode61` 分詞器：

```sql
DROP TABLE IF EXISTS merchants_fts;
CREATE VIRTUAL TABLE merchants_fts USING fts5(
    name,
    address,
    tokenize="unicode61"
);
```
*註：我們移除 `content='merchants'`，因為 FTS5 的外部內容表在 MATCH 時，會從內容表讀取原始文字進行分詞。如果內容表儲存的是無空格的原始中文，則無法配合空格化的分詞索引工作。獨立的 FTS5 表大約會增加 5~7MB 的資料庫體積，但跨庫複製、事務操作與相容性最佳。*

### 2.2 寫入端分詞預處理 (Ingestion Pre-processing)
在資料寫入（即 PDF 解析與排程更新）時，新增中文空白分詞函數：

```python
def space_segment(text: str) -> str:
    if not text:
        return ""
    result = []
    current_word = []
    for char in text:
        # 判斷是否為中文字元
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

寫入邏輯：
- 在 `parse_pdf_to_db` 中，當寫入 `merchants` 表後，計算 `space_segment(name)` 與 `space_segment(address)`，並寫入 `merchants_fts`（`rowid` 與 `merchants.id` 對齊）。
- 在 `update_data.py` 的資料替換事務中，使用如下指令遷移 FTS 表：
  ```sql
  DELETE FROM main.merchants_fts;
  INSERT INTO main.merchants_fts (rowid, name, address) 
  SELECT rowid, name, address FROM new_db.merchants_fts;
  ```

### 2.3 後端 API 查詢解析 (API Query Parser)
修改 [merchants.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/routers/merchants.py) 的 `parse_search_query` 邏輯，廢除長短詞分流，統一將搜尋詞轉為 FTS5 的雙引號相鄰短語（Phrase Query）：

```python
def parse_search_query(q: str) -> str:
    # 移除非字母、數字、中文與安全符號，保留 '-' 以利處理如 '7-11' 的詞彙
    cleaned_q = re.sub(r'[^\w\s\u4e00-\u9fff\-&+=]', ' ', q)
    
    parts = []
    for term in cleaned_q.split():
        term = term.strip()
        if not term:
            continue
        segmented = space_segment(term)
        parts.append(f'"{segmented}"')
        
    return " AND ".join(parts)
```
- 例如搜尋 `q="台北 咖啡"`，解析後傳給 `MATCH` 的字串為 `'"台 北" AND "咖 啡"'`。
- 這將強制 FTS5 進行相鄰性檢查，確保搜尋「台北」不會錯誤匹配「台中市北區」。

---

## 3. 測試與驗證計畫 (Test & Verification Plan)

### 3.1 寫入與結構驗證
- 排程與導入腳本執行後，直接在資料庫中執行：
  ```sql
  SELECT rowid, name, address FROM merchants_fts LIMIT 5;
  ```
  驗證輸出格式是否為空格分詞（如 `"台 灣 柒 天 精 品 旅 店"`）。

### 3.2 搜尋正確性驗證 (Regression & Edge Cases)
我們將撰寫單元/整合測試腳本，測試並比對以下查詢在 FTS MATCH 與 `LIKE` 下的結果數量是否一致（誤差應為 0，或僅有「臺/台」正規化造成的預期差異）：
1.  **2字中文短詞**（如：「`台北`」、「`咖啡`」、「`民宿`」）
2.  **3字中文長詞**（如：「`大飯店`」、「`餐飲業`」）
3.  **多詞複合查詢**（如：「`台北 咖啡`」）
4.  **英數混雜詞**（如：「`7-11`」、「`CHIC古亭`」）
5.  **地圖附近搜尋**：驗證地圖附近搜尋的關鍵字過濾功能是否正常運作。

### 3.3 效能基準測試 (Benchmark)
我們將執行 [migrate_and_benchmark.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/scripts/migrate_and_benchmark.py)，對比舊版 `LIKE` 與新版 FTS5 混合搜尋。
- **目標**：短字詞查詢的平均耗時從 `>5ms` 下降至 `<1ms`，加速比達 10 倍以上。

---

## 4. 時程與實作步驟 (Milestones)
1.  **步驟一**：建立並送審設計規格書（此文件）。
2.  **步驟二**：撰寫獨立測試腳本與現有資料庫對照基準。
3.  **步驟三**：修改 `scripts/parse_pdf.py` 與 `scheduler/update_data.py` 的資料表結構與寫入邏輯。
4.  **步驟四**：修改 `backend/routers/merchants.py` 的查詢解析與 SQL 查詢語法。
5.  **步驟五**：執行排程資料更新，重新生成 `merchants.db`。
6.  **步驟六**：執行測試腳本，驗證正確性與效能提升。
