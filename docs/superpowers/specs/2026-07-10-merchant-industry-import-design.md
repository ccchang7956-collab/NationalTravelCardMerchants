# 設計規格書：國旅卡特店導入行業別與關聯規劃

## 1. 目的
本規劃旨在為國旅卡特約商店（Merchants）導入政府標準的「行業別」資訊。資料來源為財政部「全國營業（稅籍）登記資料集」，透過離線批次匹配方式，將行業別（包含主要與次要行業）寫入資料庫，並修改後端 API 以支援回傳這些欄位。此外，我們必須修改排程更新邏輯，確保在每日清晨自動更新國旅卡 PDF 時，行業別資料能安全地從舊資料庫遷移到新資料庫，並且撰寫單元測試以進行驗證。

---

## 2. 資料庫結構設計

我們將在 SQLite 資料庫中建立一張新資料表 `merchant_industries` 來儲存一對多的行業別關係。

### `merchant_industries` 資料表
```sql
CREATE TABLE IF NOT EXISTS merchant_industries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tax_id TEXT NOT NULL,          -- 商家統一編號
    industry_code TEXT NOT NULL,   -- 行業別代碼 (例如 "561115")
    industry_name TEXT NOT NULL,   -- 行業別名稱 (例如 "麵店、小吃店")
    priority INTEGER NOT NULL,     -- 優先權：1為主行業，2~4為次要行業
    FOREIGN KEY(tax_id) REFERENCES merchants(tax_id) ON DELETE CASCADE
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_merchant_industries_tax_id ON merchant_industries(tax_id);
CREATE INDEX IF NOT EXISTS idx_merchant_industries_code ON merchant_industries(industry_code);
```

同時，為了配合外來鍵關聯，若 [scheduler/update_data.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/scheduler/update_data.py) 或是 [backend/database.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/database.py) 的資料表建立邏輯有被呼叫，也必須確保此資料表會被一同初始化。

---

## 3. 匯入腳本設計 (`scripts/import_industry.py`)

撰寫一次性的 Python 匯入腳本，支援大檔案 CSV 的串流讀取。

* **腳本入口**：`python scripts/import_industry.py --csv <CSV_FILE_PATH>`
* **核心邏輯**：
  1. 載入當前資料庫中所有已存在的 `tax_id` 至記憶體 `set` 中。
  2. 逐行串流讀取財政部 CSV 檔（預設支援 `utf-8-sig` 或隨後 fallback 到 `cp950`），解析欄位。
     * 財政部 CSV 標準欄位位置：
       * 欄位 0：統一編號
       * 欄位 6：行業代號 1 (主要)
       * 欄位 7：行業名稱 1 (主要)
       * 欄位 8：行業代號 2
       * 欄位 9：行業名稱 2
       * 欄位 10：行業代號 3
       * 欄位 11：行業名稱 3
       * 欄位 12：行業代號 4
       * 欄位 13：行業名稱 4
  3. 若行的 `統一編號` 存在於 `tax_id` 集合中，則：
     * 清理該統編在 `merchant_industries` 表中的舊資料。
     * 解析 1 組主要行業與最多 3 組次要行業，寫入 `merchant_industries` 暫存列表。
  4. 每滿 1000 筆或讀取結束時，批次插入（`INSERT INTO`）資料庫中，並進行 `commit`。

---

## 4. 排程更新整合 (`scheduler/update_data.py`)

因為排程更新是先建立一個全新的臨時資料庫並重新解析 PDF，所以當每次更新成功後，必須將舊資料庫的 `merchant_industries` 遷移行走。

### 新增 `migrate_industries` 函數
在 `scheduler/update_data.py` 中，新增此函數並在 `migrate_coordinates` 之後被呼叫：

```python
def migrate_industries(old_db_path: str, new_conn: sqlite3.Connection) -> int:
    """從舊 DB 遷移行業別資料到新 DB（以 tax_id 對應），回傳遷移筆數。"""
    if not os.path.exists(old_db_path):
        return 0
    try:
        with sqlite3.connect(old_db_path) as old_conn:
            # 檢查舊表是否存在
            table_exists = old_conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_industries'"
            ).fetchone()
            if not table_exists:
                return 0
            rows = old_conn.execute(
                "SELECT tax_id, industry_code, industry_name, priority FROM merchant_industries"
            ).fetchall()
        
        if not rows:
            return 0
            
        new_conn.executemany(
            "INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)",
            rows
        )
        new_conn.commit()
        return len(rows)
    except Exception as e:
        log.error(f"⚠️ 遷移行業別資料失敗: {e}")
        return 0
```

---

## 5. 後端 API 與 Model 更新

### 5.1 `backend/models.py`
新增 `MerchantIndustry` 響應模型，並在 `Merchant` 及 `MerchantWithCoords` 中追加此屬性。

```python
class MerchantIndustry(BaseModel):
    industry_code: str
    industry_name: str
    priority: int

class MerchantBase(BaseModel):
    # ...
    tax_id: Optional[str] = None
    website: Optional[str] = None
    industries: Optional[List[MerchantIndustry]] = None # 新增此欄位
```

### 5.2 `backend/routers/merchants.py`
在查詢單個店家的 API `GET /merchants/{merchant_id_or_tax_id}` 路由中，查詢 `merchant_industries` 資料表，並將結果封裝回傳：

```python
# 查詢該店家的行業別
ind_cursor = db.execute(
    "SELECT industry_code, industry_name, priority FROM merchant_industries WHERE tax_id = ? ORDER BY priority",
    (merchant["tax_id"],)
)
industries = [dict(row) for row in ind_cursor.fetchall()]
# 合併回傳
```

---

## 6. 測試與驗證計畫

我們必須編寫自動化測試以驗證功能正確性。

### 6.1 單元測試 (Unit Tests)
在 `backend/tests/` 下建立或擴充測試案例：
* **`test_import_script`**：
  * 使用模擬的 CSV 資料（包含合法與不合法的統編、主次要行業）。
  * 驗證匯入腳本是否精確解析主次行業並寫入 SQLite。
  * 驗證其僅匯入資料庫中已存在的 `tax_id` 商家。
* **`test_scheduler_migration`**：
  * 模擬排程器運作流程：建立舊 DB 寫入行業別，建立新 DB 呼叫 `migrate_industries`。
  * 驗證行業別是否依統編正確遷移到新 DB，且無遺漏。

### 6.2 整合與 API 測試 (Integration Tests)
* **`test_merchant_api_returns_industries`**：
  * 模擬一個帶有行業別的店家。
  * 呼叫 `GET /merchants/{tax_id}`。
  * 驗證回傳的 JSON 中含有正確的 `industries` 列表，包含代碼、名稱與優先權。
