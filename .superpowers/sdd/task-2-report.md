# Task 2 Report: Scheduler 資料安全 (industries 保留 / 驟降閘門 / 備份 / 原子寫入)

- Date: 2026-09-30
- Status: DONE
- Scope: `scheduler/update_data.py` + `backend/tests/test_scheduler_safety.py` (new)
- Note: `backend/database.py` user_favorites FK 本 Task 刻意不改 schema（brief 允許 deferred 至 Task 5），僅做刪除前統計 + log。

## TDD

- Step 1: 新建 `backend/tests/test_scheduler_safety.py`，6 tests（industries 空表/無表跳過、mass-delete abort、timestamped 備份、atomic_write_text、favorites log）。
- Step 2: 初跑 `.venv/bin/pytest backend/tests/test_scheduler_safety.py -v` → 6 failed（符合預期：會清空 industries、無閘門、無 `atomic_write_text`、無備份、無 favorites log）。
- Step 3: 實作（見下）。
- Step 4: `.venv/bin/pytest backend/tests/test_scheduler_safety.py backend/tests/test_scheduler.py -v` → 12 passed。

## Implementation (`scheduler/update_data.py`)

1. `atomic_write_text(path, data)`: mkstemp(dir=target dir) + `fsync` + `os.replace`；失敗清理 tmp 後重拋。
2. `transactional_sync_db()`:
   - 安全閘門（BEGIN 前）：`old_count = SELECT COUNT(*) FROM merchants`；若 `old>100 且 new<50%` 則 `close + raise RuntimeError("Abort: ...")`；target 筆數不變（ROLLBACK 前即拒絕，連 BEGIN 都不進）。
   - 同步前備份（BEGIN 前）：`shutil.copy2(target, target.YYYYMMDD-HHMMSS.bak)`（Taipei TZ）；失敗僅 warning 不中斷。
   - 刪除前 favorites 統計：檢查 `user_favorites` 表存在 → 查出將被刪除 merchant ids → `SELECT COUNT(*) ... WHERE merchant_id IN (...)`（全參數化）→ `log.warning("將刪除 X 間...影響 Y 筆 user_favorites...")`；無刪除則 info。
   - industries 條件同步：`if normalized_temp_industries:` 才 DELETE+INSERT，否則 `log.warning("temp 無行業別資料，跳過...")`。
3. `main()`: HASH_FILE 與 META_FILE 寫入點改用 `atomic_write_text`（meta 先 `json.dumps` 再原子寫）。

## Tests

- `test_skip_industries_when_temp_empty` / `test_skip_industries_when_temp_table_empty`: PASS
- `test_abort_on_mass_delete` (150 舊 / 10 新 → RuntimeError + 筆數不變）: PASS
- `test_backup_created_before_sync` (`target.*.bak` 存在）: PASS
- `test_atomic_meta_write`（寫入/覆寫/無 tmp 殘留）: PASS
- `test_favorites_affected_logged` (caplog 含 "favorite"): PASS
- 回歸 `backend/tests/test_scheduler.py` 6 tests: PASS

## Concerns

- 備份檔無輪轉/清理：長期每日運行會累積 `.bak`；建議後續 Task 加 retention（如只留 N 天）。
- 驟降閘門閾值（100 / 50%）為固定常數，未可配置；若商家總量長期萎縮可能誤觸，可考慮環境變數化。
- favorites 僅 log 未寫入 meta.json；若需要稽核追蹤，需在 `main()` 層回傳並寫入 meta。
- `database.py` FK (`ON DELETE CASCADE` + `NOT NULL`) 未動，級聯刪除語義不變；正式修復排入 Task 5（含 nullable migration）。
