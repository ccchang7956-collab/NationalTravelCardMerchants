# Task 4 報告：後端 API 路由與 Model 更新與整合測試

## 實作內容 (What you implemented)
1. **後端資料模型更新** (`backend/models.py`):
   - 定義了 `MerchantIndustry` Pydantic Model，包含 `industry_code` (str)、`industry_name` (str) 與 `priority` (int)。
   - 在 `MerchantBase` 中新增 `industries: Optional[List[MerchantIndustry]] = None` 欄位，用以回傳商家關聯的行業別資訊。
2. **API 路由更新** (`backend/routers/merchants.py`):
   - 修改 `get_merchant` (`GET /api/merchants/{merchant_id_or_tax_id}`) 路由處理器。
   - 在取得商家主檔資料後，連帶從 `merchant_industries` 資料表中查詢該商家 (透過 `tax_id`) 所有的行業別，並依 `priority` 進行升冪 (ASC) 排序。
   - 將查詢到的行業別串列附加至商家物件的 `"industries"` 屬性中，最後回傳。

## 測試內容與測試結果 (What you tested and test results)
1. **測試資料擴充** (`backend/tests/test_search_api.py`):
   - 在 `db_conn` 測試 fixture 中，對商家 `11111111` 寫入兩筆測試行業別資料：
     - `"561115", "餐館業", 1`
     - `"561116", "飲料店業", 2`
2. **新增整合測試** (`backend/tests/test_search_api.py`):
   - 新增 `test_get_merchant_by_id_includes_industries` 測試函數，呼叫 `/api/merchants/11111111`，驗證回傳 JSON 是否包含 `industries` 欄位，且該陣列長度為 2，並驗證其順序與欄位正確性。
3. **執行所有後端測試**:
   - 執行 `PYTHONPATH=. pytest backend/tests -v`。
   - **結果**: 20 個測試全部通過 (100% Pass)。

## TDD 證據 (TDD Evidence)

### RED Test (Failing Test)
在修改 `backend/models.py` 及 `backend/routers/merchants.py` 之前，執行測試以確認其失敗：
```bash
$ PYTHONPATH=. pytest backend/tests/test_search_api.py::test_get_merchant_by_id_includes_industries -v
============================= test session starts ==============================
platform darwin -- Python 3.9.6, pytest-8.3.4, pluggy-1.6.0 -- /Users/ccchang/Project/NationalTravelCardMerchants/.venv/bin/python3
cachedir: .pytest_cache
rootdir: /Users/ccchang/Project/NationalTravelCardMerchants
plugins: anyio-4.12.1
collecting ... collected 1 item

backend/tests/test_search_api.py::test_get_merchant_by_id_includes_industries FAILED [100%]

=================================== FAILURES ===================================
_________________ test_get_merchant_by_id_includes_industries __________________

db_conn = <sqlite3.Connection object at 0x1090f9300>

    def test_get_merchant_by_id_includes_industries(db_conn):
        client = TestClient(app)
        response = client.get("/api/merchants/11111111")
        assert response.status_code == 200
        data = response.json()
>       assert "industries" in data
E       AssertionError: assert 'industries' in {'address': '台北市大安區新生南路1段', 'distance_km': None, 'id': 1, 'lat': 25.0339, ...}

backend/tests/test_search_api.py:156: AssertionError
=========================== short test summary info ============================
FAILED backend/tests/test_search_api.py::test_get_merchant_by_id_includes_industries
============================== 1 failed in 0.16s ===============================
```

### GREEN Test (Passing Test)
在修改完 Production Code 後，執行測試確認其通過：
```bash
$ PYTHONPATH=. pytest backend/tests/test_search_api.py::test_get_merchant_by_id_includes_industries -v
============================= test session starts ==============================
platform darwin -- Python 3.9.6, pytest-8.3.4, pluggy-1.6.0 -- /Users/ccchang/Project/NationalTravelCardMerchants/.venv/bin/python3
cachedir: .pytest_cache
rootdir: /Users/ccchang/Project/NationalTravelCardMerchants
plugins: anyio-4.12.1
collecting ... collected 1 item

backend/tests/test_search_api.py::test_get_merchant_by_id_includes_industries PASSED [100%]

============================== 1 passed in 0.14s ===============================
```

執行全體測試（無 Regression）：
```bash
$ PYTHONPATH=. pytest backend/tests -v
======================== 20 passed, 6 warnings in 0.27s ========================
```

## 修改的檔案 (Files changed)
- [backend/models.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/models.py)
- [backend/routers/merchants.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/routers/merchants.py)
- [backend/tests/test_search_api.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/tests/test_search_api.py)

## 自我審查與疑慮 (Self-review findings & Concerns)
- 由於 `industries` 欄位在 `MerchantBase` 中定義為 `Optional[List[MerchantIndustry]] = None`，若商家目前沒有關聯的行業別資訊（例如原本的測試資料中的其他商家），API 回傳時該欄位值會為 `None` 或省略（端看 JSON 輸出），這使得其他既有測試（如搜尋、附近商家等 API）完全不受影響，確保了回溯相容性。
- 未發現其他問題或疑慮。

## Final Branch Code Review 修復內容 (Final Fixes)
1. **啟用 SQLite 外鍵 (Enforce Foreign Keys)**
   - 在 `backend/database.py` 中的 `get_db_connection()`、`scheduler/update_data.py` 中的各個 `sqlite3.connect()`、`scripts/import_industry.py` 的 `import_csv_to_db` 中，以及測試檔案 `backend/tests/test_scheduler.py`、`backend/tests/test_search_api.py`、`backend/tests/test_import_industry.py` 中的 `sqlite3.connect`，都新增了 `conn.execute("PRAGMA foreign_keys = ON;")` 設定，確保 SQLite 確實啟動外鍵約束。
   - 新增了 `test_foreign_key_cascade_delete` 測試，驗證 `ON DELETE CASCADE` 行為正常。

2. **匯入腳本批次刪除優化 (Batch DELETEs in Import Script)**
   - 修改 `scripts/import_industry.py` 中的 `import_csv_to_db`。
   - 將原本的每列（row-level）單筆刪除改為批次 `executemany` 刪除：維護一個 `to_delete_batch` 陣列，並在 `deleted_tax_ids` 排除重複後將 `tax_id` 加入批次，累積達到 1000 筆或迴圈結束後，一次性執行 `cursor.executemany("DELETE FROM merchant_industries WHERE tax_id = ?", to_delete_batch)`。

3. **API tax_id 空值檢查 (Empty tax_id Bypass in API)**
   - 修改 `backend/routers/merchants.py` 的 `get_merchant` 路由。
   - 檢查 `merchant["tax_id"]` 是否存在且不為空。若不存在或為空，則直接設 `merchant["industries"] = []` 並繞過對 `merchant_industries` 的查詢。
   - 於 `backend/tests/test_search_api.py` 新增了 `test_get_merchant_empty_tax_id` 測試，驗證其運作正確。

4. **預設 Industries 屬性值 (Default industries in Pydantic Model)**
   - 修改 `backend/models.py` 的 `MerchantBase`，將 `industries` 定義由 `Optional[List[MerchantIndustry]] = None` 改為 `List[MerchantIndustry] = []`。

## Final Fixes 測試結果
- 執行 `PYTHONPATH=. pytest backend/tests/ -v`
- **結果**: 22 個測試項目全部通過 (100% Pass)，包含新加入的外鍵串聯刪除測試、API 空 `tax_id` 與預設值測試。

## Final Fix 2 修復內容 (Final Fixes 2)
1. **測試 Schema 同步 (Test Schema Synchronization)**：
   - 更新所有測試檔案中模擬與暫時建立 `merchant_industries` 的 SQL 語句，使其與正式 production DDL 完全一致，包含 `NOT NULL` 約束與外鍵 `FOREIGN KEY(tax_id) REFERENCES merchants(tax_id) ON DELETE CASCADE`。
   - 修改的檔案包含：
     - [backend/tests/test_import_industry.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/tests/test_import_industry.py)
     - [backend/tests/test_scheduler.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/tests/test_scheduler.py)
     - [backend/tests/test_search_api.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/tests/test_search_api.py)

2. **匯入腳本 Exit Code 修正 (Import Script Exit Code)**：
   - 修改 [scripts/import_industry.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/scripts/import_industry.py)：
     - 於檔案頂部引入 `sys` 模組。
     - 在 `import_csv_to_db` 函數中，若發現 CSV 檔案不存在或遭遇編碼解碼失敗 (`not success`) 時，呼叫 `sys.exit(1)` 而非單純的 `return`，使 shell 能取得非零的錯誤回傳值。

## Final Fix 2 測試結果
- 執行 `PYTHONPATH=. pytest backend/tests/ -v`
- **結果**: 22 個測試項目全部通過 (100% Pass)，包含所有 FTS、API 路由、Scheduler 以及新同步 DDL 的整合測試。

## Final Fix 3 修復內容 (Final Fixes 3)
1. **修正批次刪除/寫入時序衝突 (Batch Delete/Insert Timing Conflict)**：
   - 修改 [scripts/import_industry.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/scripts/import_industry.py)：
     - 在迴圈內，當 `len(batch) >= 1000` 觸發寫入前，先檢查並執行 `to_delete_batch` 內的刪除動作並將其清空，確保新寫入的商家行業資料不會被後續的批次刪除動作誤刪。
     - 在迴圈外清理剩餘資料時，也確保先執行 `to_delete_batch` 的刪除，再執行 `batch` 的插入。

2. **新增空 CSV 防禦機制 (Empty CSV StopIteration Defense)**：
   - 修改 [scripts/import_industry.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/scripts/import_industry.py)：
     - 將讀取 CSV 標頭的 `header = next(reader)` 包裝在 `try-except StopIteration` 區塊中。
     - 若遭遇 `StopIteration`（表示 CSV 檔為空），則印出警告並提早 `return` 結束匯入，以避免程式崩潰。

3. **SQL 語句明確列出欄位 (Explicit column listing in SQL)**：
   - 修改 [scheduler/update_data.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/scheduler/update_data.py)：
     - 重寫大約第 779 行的 SQL 寫入語句，將 `INSERT INTO main.merchant_industries SELECT * FROM new_db.merchant_industries` 改為明確列出欄位名稱：`INSERT INTO main.merchant_industries (id, tax_id, industry_code, industry_name, priority) SELECT id, tax_id, industry_code, industry_name, priority FROM new_db.merchant_industries`，提升 SQL 的嚴謹度與維護性。

## Final Fix 3 測試結果
- 執行 `PYTHONPATH=. pytest backend/tests/ -v`
- **結果**: 22 個測試項目全部通過 (100% Pass)，包含所有 FTS、API 路由、Scheduler 以及新時序與欄位定義的整合測試。

