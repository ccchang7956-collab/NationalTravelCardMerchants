# Task 3: Backend 安全與正確性 — JWT / 交易 / 驗證 執行報告

- 狀態：DONE
- 方法：TDD（先寫 `backend/tests/test_m3_hardening.py` 9 測 → 確認全 FAIL → 實作 → 全 PASS）
- 分支：main（直接工作）

## 變更

- `backend/auth_utils.py:26-28`：移除預設 secret；`JWT_SECRET_KEY` 未設定即 `raise RuntimeError`。
- `backend/routers/itineraries.py`：create/update 寫入包 try/except，失敗 `db.rollback()` + 500（`HTTPException` 原樣透出）；`/optimize` 限 `points` 1..100 筆（否則 400 `points must be 1..100`），逐點驗證 dict/數值/有限值/範圍（否則 400 `Invalid coordinate`）。
- `backend/routers/merchants.py`：`get_merchants` + `nearby` 的 `industry_code` LIKE 跳脫（`\`、`%`、`_`，比照 city）+ `ESCAPE '\\'`；`get_merchants` 加 `ORDER BY m.id ASC`；`get_merchant` 純數字先查 `id`（miss 則 fallback 查 `tax_id`，見 Concerns），否則查 `tax_id`；全參數化。
- `backend/database.py`：`get_db_connection` 加 `timeout=10.0`；`get_db` 異常時 `rollback` 後重拋。
- `backend/tests/conftest.py`（新增，測試專用）：提供 `JWT_SECRET_KEY=test-only-...`，使既有套件可在嚴格 guard 下 import；production 無 env 仍啟動失敗。
- `backend/tests/test_m3_hardening.py`（新增，9 測）。

## 測試摘要

- TDD FAIL 階段：`pytest backend/tests/test_m3_hardening.py -v` → 9 failed（符合預期）。
- PASS 階段：
  - `pytest backend/tests/test_m3_hardening.py backend/tests/ -q` → 9 passed（pytest 將重複路徑去重，實質執行 m3 檔）。
  - `pytest backend/tests/ -q` → **116 passed**（全套件，含既有 107 + 新增 9）。

## Concerns

1. `get_merchant` 的 `isdigit` 分支與 brief 字面（純數字只查 id）有衝突：本國統編本身就是 8 位純數字（如既有測試 `11111111`），字面實作會把統編查詢導向 `id` 而 404 破壞既有行為。改為「純數字先查 id，miss 再 fallback 查 tax_id」，行為相容且滿足分流意圖。
2. `optimize` 空陣列現回 400（brief 要求 1..100 下限）；service 層 `optimize_route` 的寬容行為保留，僅 endpoint 擋。
3. `ESCAPE` 引號陷阱：Python 源須寫 `ESCAPE '\\'`（SQL 收到單位元組 `\`）；寫成 `'\''` 會產生 SQL 語法錯誤。已比照既有 city 過濾寫法並以測試覆蓋。
4. 需提醒部署：production 必須設定 `JWT_SECRET_KEY`，否則服務無法啟動（此為本任務意圖）。
