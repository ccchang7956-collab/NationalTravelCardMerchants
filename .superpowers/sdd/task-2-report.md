# Task 2 實作與測試報告：撰寫一次性匯入腳本與其單元測試

## 1. 實作內容 (What you implemented)
- **一次性行業別匯入腳本 `scripts/import_industry.py`**：
  - 支援使用 `--csv` 參數讀取稅籍登記 CSV 檔案。
  - 支援使用 `--db` 參數指定 SQLite 資料庫路徑（預設為 `backend/merchants.db`）。
  - 自動嘗試多種常見編碼（`utf-8-sig`, `cp950`, `utf-8`）以解碼 CSV。
  - 串流讀取大檔案並支援批次寫入（每 1000 筆批次提交以提升效能）。
  - 匯入邏輯會比對 `merchants` 資料庫，僅匯入屬於特約商店（統編存在於 `merchants` 資料庫）的行業別。
  - 支援多組行業別，主、次行業別優先序（`priority` 1 至 4）。
  - 確保匯入時會先清除該店家已有的舊行業資料（確保冪等性）。

## 2. 測試內容與結果 (What you tested and test results)
- 撰寫單元測試檔案 `backend/tests/test_import_industry.py`：
  - `test_import_industry_logic`：驗證基本的匯入邏輯，測試是否過濾非特約商店，並確保正確讀取主次行業與設定其優先度。
  - `test_import_industry_encoding_and_idempotency`：驗證多重編碼支援（CP950）與冪等性邏輯（若重複匯入會先刪除舊行業資料）。
- **測試結果**：全部通過 (2/2 passing)。

## 3. TDD 證據 (TDD Evidence)
- **RED (測試失敗)**：
  - 建立測試檔案後，於未實作 `scripts/import_industry.py` 時執行 `pytest backend/tests/test_import_industry.py -v`：
    ```
    ModuleNotFoundError: No module named 'scripts'
    ```
- **GREEN (測試通過)**：
  - 實作完畢後，執行 `PYTHONPATH=. pytest backend/tests/test_import_industry.py -v`：
    ```
    backend/tests/test_import_industry.py::test_import_industry_logic PASSED [ 50%]
    backend/tests/test_import_industry.py::test_import_industry_encoding_and_idempotency PASSED [100%]
    ============================== 2 passed in 0.03s ===============================
    ```

## 4. 變更的檔案 (Files changed)
- [backend/tests/test_import_industry.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/tests/test_import_industry.py) (新增)
- [scripts/import_industry.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/scripts/import_industry.py) (新增)

## 5. 自我審查發現 (Self-review findings)
- 批次寫入在處理大型 CSV 檔案時非常有用，且對重複統編進行了 DELETE 處理，避免資料庫累積髒資料。
- 專案未將根目錄預設加入 `sys.path`，因此測試時需要以 `PYTHONPATH=.` 執行。

## 6. 問題或疑慮 (Any issues or concerns)
- 無。

## 7. 修正報告 (Fix Report)
根據 Code Review 的回饋，進行了以下修正：

1. **編碼強健性 (Encoding Robustness)**：
   將整個 CSV 讀取和處理過程放入 `try...except UnicodeDecodeError` 區塊。如果在讀取過程中發生 `UnicodeDecodeError`，會呼叫 `conn.rollback()` 回滾已執行的變更並關閉檔案，隨後嘗試下一種編碼。
2. **交易提交效率 (Commit Efficiency)**：
   移除迴圈批次中的 `conn.commit()`，只在整個 CSV 成功匯入的最後執行單一一次 `conn.commit()`，有效提升 SQLite 的寫入效能。
3. **防禦性檢查 (Defensive Checks)**：
   在檢查與處理 `tax_id` 前，新增了非空檢查：`if tax_id and tax_id in existing_tax_ids:`。
4. **刪除效能優化 (DELETE Efficiency)**：
   不再於迴圈中對每筆資料個別執行 `DELETE`，改為在匯入一開始直接執行一次 `DELETE FROM merchant_industries` 清空表格，大幅減少資料庫負擔。

### 測試結果
執行 `PYTHONPATH=. pytest backend/tests/test_import_industry.py -v`：
```
============================= test session starts ==============================
platform darwin -- Python 3.9.6, pytest-8.3.4, pluggy-1.6.0 -- /Users/ccchang/Project/NationalTravelCardMerchants/.venv/bin/python3
cachedir: .pytest_cache
rootdir: /Users/ccchang/Project/NationalTravelCardMerchants
plugins: anyio-4.12.1
collecting ... collected 2 items

backend/tests/test_import_industry.py::test_import_industry_logic PASSED [ 50%]
backend/tests/test_import_industry.py::test_import_industry_encoding_and_idempotency PASSED [100%]

============================== 2 passed in 0.02s ===============================
```

### Commit 訊息
```
fix(scripts): improve CSV import robustness and database transaction performance

- Wrap CSV parsing/processing in a try...except UnicodeDecodeError block per encoding with transaction rollback.
- Optimize transaction commit by performing only a single commit at the end of successful processing.
- Defensively check that tax_id is not empty before checking/processing.
- Optimize delete efficiency by executing a single table clear at the start instead of row-by-row deletions.
```

## 8. 第二次修正報告 (Second Fix Report)
根據 Reviewer 的最新回饋，我們對 `DELETE` 範圍進行了更精細的優化，以保留不在 CSV 中的商店資料（增量更新），並確保在重新插入前只刪除這次要寫入的商店舊資料。

1. **更精細的 Row DELETE Scope**：
   - 移除了腳本開頭會清空整個表格的 `DELETE FROM merchant_industries` 語句。
   - 在 `import_csv_to_db` 函數內的 `try` 區塊開頭宣告了一個 set `deleted_tax_ids = set()`。
   - 在 CSV row loop 中，當驗證有匹配的 `tax_id` (即 `if tax_id and tax_id in existing_tax_ids:`) 時，先檢查此 `tax_id` 是否已經被刪除過。
   - 若尚未被刪除，則執行 `cursor.execute("DELETE FROM merchant_industries WHERE tax_id = ?", (tax_id,))`，並將該 `tax_id` 加入 `deleted_tax_ids` 集合中。
   - 這樣一來，不在此次 CSV 匯入名單中的其他特約商店的行業資料將會被完整保留，實現真正的增量更新，且同時確保重新匯入的特約商店資料不會重複累積。

2. **測試案例增強**：
   - 修改了 `test_import_industry_encoding_and_idempotency` 測試，額外新增一筆不在 CSV 內的商店 `33333333`（商店C）及其舊行業資料。
   - 驗證匯入完成後，商店A（在 CSV 中）的舊行業資料被成功清空並替換為新行業，而商店C（不在 CSV 中）的舊行業資料仍被保留。

### 測試結果
執行 `PYTHONPATH=. pytest backend/tests/test_import_industry.py -v`：
```
============================= test session starts ==============================
platform darwin -- Python 3.9.6, pytest-8.3.4, pluggy-1.6.0 -- /Users/ccchang/Project/NationalTravelCardMerchants/.venv/bin/python3
cachedir: .pytest_cache
rootdir: /Users/ccchang/Project/NationalTravelCardMerchants
plugins: anyio-4.12.1
collecting ... collected 2 items

backend/tests/test_import_industry.py::test_import_industry_logic PASSED [ 50%]
backend/tests/test_import_industry.py::test_import_industry_encoding_and_idempotency PASSED [100%]

============================== 2 passed in 0.02s ===============================
```

### Commit 訊息
```
fix(scripts): refine DELETE scope in industry import to support incremental updates

- Remove global table clear (DELETE FROM merchant_industries).
- Introduce `deleted_tax_ids` set to perform row-level deletions for merchants actively being updated.
- Preserve existing industry records for merchants not present in the CSV.
- Update test cases to verify preservation of non-CSV merchant data.
```

## 9. 第三次修正報告 (Third Fix Report)
根據 Reviewer 的進一步回饋，我們對資源管理進行了重構，以消除資料庫連接洩漏 (Connection Leak) 與檔案洩漏 (File Leak) 的隱憂：

1. **資源管理優化（以 Context Manager 進行重構）**：
   - **資料庫連接**：將 `import_csv_to_db` 中的 `sqlite3.connect` 改為以 `with sqlite3.connect(db_path) as conn:` 管理。即使在拋出其他 Exception 或執行流程提早 Return 時，資料庫連接都能得到自動且妥善的關閉，消除了 Connection Leak。
   - **檔案開啟**：將編碼嘗試迴圈中的 `open(csv_path)` 改為以 `with open(csv_path, mode="r", encoding=enc) as f:` 區塊管理。無論是在正常讀取結束、拋出 `UnicodeDecodeError` 還是其他例外時，Python 都會自動關閉檔案，消除了 `f.close()` 手動關閉可能造成的 File Leak。

### 測試結果
執行 `PYTHONPATH=. pytest backend/tests/test_import_industry.py -v`：
```
============================= test session starts ==============================
platform darwin -- Python 3.9.6, pytest-8.3.4, pluggy-1.6.0 -- /Users/ccchang/Project/NationalTravelCardMerchants/.venv/bin/python3
cachedir: .pytest_cache
rootdir: /Users/ccchang/Project/NationalTravelCardMerchants
plugins: anyio-4.12.1
collecting ... collected 2 items

backend/tests/test_import_industry.py::test_import_industry_logic PASSED [ 50%]
backend/tests/test_import_industry.py::test_import_industry_encoding_and_idempotency PASSED [100%]

============================== 2 passed in 0.02s ===============================
```

### Commit 訊息
```
fix(scripts): rewrite resource management using context managers to prevent leaks

- Replace manual database connection close with `with sqlite3.connect` block.
- Replace manual file open/close with nested `with open` block inside the encoding loop.
- Remove redundant f.close() and conn.close() calls.
```
