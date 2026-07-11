# Task 3 整合測試與效能基準測試報告

## 1. 整合測試執行結果 (Pytest)

執行指令：
```bash
PYTHONPATH=. pytest backend/tests/ -v
```

測試輸出：
```text
============================= test session starts ==============================
platform darwin -- Python 3.9.6, pytest-8.3.4, pluggy-1.6.0 -- /Users/ccchang/Project/NationalTravelCardMerchants/.venv/bin/python3
cachedir: .pytest_cache
rootdir: /Users/ccchang/Project/NationalTravelCardMerchants
plugins: anyio-4.12.1
collecting ... collected 28 items

backend/tests/test_import_industry.py::test_import_industry_logic PASSED [  3%]
backend/tests/test_import_industry.py::test_import_industry_encoding_and_idempotency PASSED [  7%]
backend/tests/test_import_industry.py::test_foreign_key_cascade_delete PASSED [ 10%]
backend/tests/test_query_parser.py::test_parse_search_query_empty PASSED [ 14%]
backend/tests/test_query_parser.py::test_parse_search_query_short_terms PASSED [ 17%]
backend/tests/test_query_parser.py::test_parse_search_query_long_terms PASSED [ 21%]
backend/tests/test_query_parser.py::test_parse_search_query_mixed_terms PASSED [ 25%]
backend/tests/test_query_parser.py::test_parse_search_query_escape_quotes PASSED [ 28%]
backend/tests/test_query_parser.py::test_parse_search_query_deduplication PASSED [ 32%]
backend/tests/test_query_parser.py::test_parse_search_query_extreme_inputs PASSED [ 35%]
backend/tests/test_query_parser.py::test_parse_search_query_safe_chars PASSED [ 39%]
backend/tests/test_scheduler.py::test_scheduler_db_creation PASSED       [ 42%]
backend/tests/test_scheduler.py::test_scheduler_page_0_filtering_logic PASSED [ 46%]
backend/tests/test_scheduler.py::test_scheduler_wrapped_website_merge PASSED [ 50%]
backend/tests/test_scheduler.py::test_scheduler_industry_migration PASSED [ 53%]
backend/tests/test_scheduler_network.py::test_download_zip_with_adapter_mock_fails PASSED [ 57%]
backend/tests/test_scheduler_network.py::test_download_zip_real_retry_chain PASSED [ 60%]
backend/tests/test_search_api.py::test_get_merchants_hybrid_search PASSED [ 64%]
backend/tests/test_search_api.py::test_get_nearby_merchants_hybrid_search PASSED [ 67%]
backend/tests/test_search_api.py::test_get_stats PASSED                  [ 71%]
backend/tests/test_search_api.py::test_get_merchant_by_id_includes_industries PASSED [ 75%]
backend/tests/test_search_api.py::test_get_merchant_empty_tax_id PASSED  [ 78%]
backend/tests/test_search_api.py::test_get_industries_api PASSED         [ 82%]
backend/tests/test_search_api.py::test_merchants_filter_by_industry PASSED [ 85%]
backend/tests/test_search_api.py::test_nearby_merchants_filter_by_industry PASSED [ 89%]
backend/tests/test_search_optimization.py::test_space_segment PASSED     [ 92%]
backend/tests/test_search_optimization.py::test_parse_search_query PASSED [ 96%]
backend/tests/test_search_optimization.py::test_fts_match_correctness PASSED [100%]

======================== 28 passed, 6 warnings in 0.28s ========================
```

測試驗證了以下項目：
- `test_space_segment`：確保中英數混合字詞（例如 "臺北市中正區"、"CHIC古亭店"、"7-11便利店"）能正確進行空白切分。
- `test_parse_search_query`：驗證搜尋語句能成功轉換為 FTS5 專用的語法，並包含對特殊字元（如雙引號）的容錯移除，以及 Unicode 標準化將「臺」置換為「台」。
- `test_fts_match_correctness`：**使用記憶體資料庫 (`:memory:`) 的密封測試**，模擬測試資料（如「台北大飯店」、「台北小樽咖啡」、「台中咖啡廳」等），驗證包含短詞以及多重條件的 FTS5 搜尋正確性，不依賴外部生產資料庫。

---

## 2. 基準測試效能結果 (Benchmark)

執行指令：
```bash
python3 scripts/migrate_and_benchmark.py
```

效能基準測試輸出：
```text
📦 連線至資料庫 /Users/ccchang/Project/NationalTravelCardMerchants/backend/merchants.db ...
🛠️  建立 FTS5 虛擬表...
🛠️  檢查並建立經緯度欄位...
🛠️  建立經緯度聯合索引...
⚡ 重建 FTS5 索引...
✅ 資料庫遷移與索引重建成功！

⏱️  開始搜尋效能基準測試 (每個關鍵字執行 50 次取平均時間)...
-------------------------------------------------------------------------------------
關鍵字          | 類型            | LIKE 平均時長      | FTS5 混合平均      | 加速倍數    
-------------------------------------------------------------------------------------
大飯店          | 3字長詞         |        5.776 ms |        0.272 ms |   21.2x
咖啡廳          | 3字長詞         |        5.453 ms |        0.033 ms |  164.7x
7-11            | 4字英文/數字    |        4.984 ms |        0.036 ms |  140.2x
台北            | 2字短詞         |        5.362 ms |        0.661 ms |    8.1x
台中            | 2字短詞         |        5.554 ms |        0.795 ms |    7.0x
台北 大飯店     | 混合字詞        |        6.117 ms |        0.325 ms |   18.8x
                | 空關鍵字        |        0.237 ms |        0.228 ms |    1.0x
```

### 效能分析：
1. **短詞加速 (2字短詞)**：使用 FTS5 Trigram 結合空白切分優化後，針對「台北」、「台中」等 2 字短詞的平均搜尋時間縮短至 `0.66ms ~ 0.80ms`，加速倍數達 `7.0x ~ 8.1x`。
2. **長詞與特殊英文/數字詞加速**：「大飯店」、「咖啡廳」、「7-11」等詞彙的搜尋速度獲得大幅提升，FTS5 混合平均僅 `0.03ms ~ 0.27ms`，效能提升可達 `21.2x` 至 `164.7x`。
3. **混合字詞**：如「台北 大飯店」的 FTS5 混合平均時間為 `0.325 ms`，相較於 LIKE 的 `6.117 ms`，達到 `18.8x` 的加速。

---

## 3. Git Commit 資訊

產生的 Commit 詳情如下：

1. **修正 Code Review 反饋 (記憶體測試、台/臺字元標準化等)**：
```text
commit f10efb0d0c8f6533cd398a274e2fa4eb22946b4f
Author: ccchang <ccchang@example.com>
Date:   Sat Jul 11 14:38:38 2026 +0800

    fix: address code review feedback on hermetic tests and query normalization
```

2. **初始 Task 3 Commit**：
```text
commit afa7c38f05fe8bd150317972f7316e73b3f856f2
Author: ccchang <ccchang@example.com>
Date:   Sat Jul 11 14:35:57 2026 +0800

    test: add test suite and update benchmark for space-segmented Chinese search
```

異動檔案：
- `backend/tests/test_search_optimization.py` (新增與重寫密封單元與整合測試)
- `backend/routers/merchants.py` (整合 `unicodedata` 對查詢進行「台/臺」統一與 Unicode 正規化)
- `scripts/parse_pdf.py` (同步更新 pdf 讀取時的「台/臺」轉換)
- `scripts/migrate_and_benchmark.py` (移除舊版分流邏輯，採用全新的 `parse_search_query` FTS MATCH)
