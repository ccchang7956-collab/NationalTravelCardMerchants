# Task 5 執行報告：Infra — 時區 / 依賴 / 權限 / 可觀測（2026-09-30）

## 1. 先 FAIL（執行前基準）
`bash scripts/check_infra.sh` → 7 項全 FAIL（exit=1）：
- backend/frontend/scheduler 缺少 TZ=Asia/Taipei
- scheduler 仍有 depends_on backend
- 後端缺少 /api/health + update_meta 新鮮度邏輯
- scheduler 缺少 healthcheck
- /data 權限未處理

## 2. 實作（最小改動）
- `docker-compose.yml`
  - backend / frontend / scheduler 環境各加 `TZ: Asia/Taipei`（排程 cron 註解「每天台灣時間 03:00」與容器時區一致）
  - scheduler **移除 `depends_on backend`**（排程只經 SQLite 檔案與 backend 共享資料，不打 API；backend 掛掉不應拖住資料更新）
  - scheduler 新增 `healthcheck: test: ["CMD", "ls", "/data/update_meta.json"]`（interval 5m / start_period 30s）
- `scheduler/entrypoint.sh`（新增）、`backend/entrypoint.sh`（新增）
  - 背景：image 建置期 `chown /data` 會被 runtime 的 named volume 掛載覆蓋（首次建立屬主為 root），ntcuser(uid 1000) 寫入 SQLite 會失敗
  - 作法：容器以 root 起手 `chown -R ntcuser:ntcuser /data`（`|| true` 不中斷），再 `su ntcuser` 降權 exec CMD；無 su/runuser 時降級直跑 CMD
- `scheduler/Dockerfile` / `backend/Dockerfile`
  - COPY entrypoint.sh + `ENTRYPOINT`，移除 `USER ntcuser`（改由 entrypoint 降權；保留 UID/GID 1000 建置期 chown 與註解說明）
- `backend/main.py`
  - 新增 `GET /api/health`：讀 `update_meta.json`（與 `/api/data-info` 同目錄），回傳 `status(ok|stale)`、`age_hours`、`stale`、`stale_after_hours`、`database_ready`、`last_updated`
  - `last_updated` 超過門檻（`DATA_STALE_AFTER_HOURS` 環境變數可覆寫，預設 **48h**）或遺失/無法解析 → `stale: true` 告警；回傳恆為 200（供監控解析欄位，不觸發 compose 健康檢查誤判）
- `scripts/check_infra.sh`（新增，可執行）：7 項檢查（3×TZ、scheduler 無 depends_on、後端 health+meta、scheduler healthcheck、/data entrypoint）

## 3. 後 PASS（驗證）
- `bash scripts/check_infra.sh` → PASS=7 FAIL=0，`INFRA OK`（exit=0）
- `docker compose config`（含 override）與 `docker compose -f docker-compose.yml config`（基底）皆 exit=0
- `/api/health` 5 案例直測全過：無 meta→stale；新鮮→ok；72h 舊→stale；壞 timestamp→stale 不噴錯；台北時區 ISO→ok
- `pytest backend/tests/` → **116 passed**（15.6s），無迴歸
- `sh -n` 兩 entrypoint 語法 OK；非 root 下 `entrypoint.sh echo` 正常 exec

## 4. Commit
- `fix(infra): TZ, decouple scheduler, data perms, health`（含 docker-compose.yml、scheduler/Dockerfile、backend/Dockerfile、backend/main.py、兩 entrypoint.sh、check_infra.sh、本報告）

## 5. Concerns（給 reviewer / 後續）
- `docker-compose.override.yml`（本地開發）把 scheduler command 蓋成 `sleep infinity`：healthcheck（ls update_meta.json）在本地首次會是 unhealthy，若本機從未跑過 update 屬預期現象，非 bug；CI 若 assert healthy 需注意
- scheduler healthcheck 只驗「檔案存在」不驗新鮮度（遵循 brief）；真正的新鮮度告警在 `/api/health` 的 `stale` 欄位，需外部監控/Uptime 去 poll，compose 層面看不到
- backend Dockerfile 現以 root 啟動再降權：entrypoint 是信任邊界內的第一方腳本，但若有人 `docker exec -u root` 仍是 root——與先前 `USER ntcuser` 相比攻擊面理論上略增，換來的是 volume 權限自癒；可接受，記錄在此
- 前端 Dockerfile 未動（frontend 無 /data 需求，TZ 已由 compose 環境注入；alpine 內 TZ 縮寫顯示需 tzdata，但不影響邏輯時區換算——如需容器內 `date` 顯示 CST 可再加 tzdata，此次最小改動未加）

## 6. 補充：Task 5 review findings 修復（2026-09-30）
- 清理本報告前半誤混入的前端行程報告段（含不符 commit `543e5cc`），現只留本次 Infra 段
- `backend/main.py`：`DATA_STALE_AFTER_HOURS` 解析加 try/except，非數字 fallback `48.0`（原 `float(...)` 無 try，env 非數字會 import crash；已驗 `abc→48.0`、`72→72.0`、預設 `48.0`）
- 兩 `entrypoint.sh`：`chown -R 1000:1000` → `chown -R ntcuser:ntcuser`（與 Dockerfile 用戶名一致，消除 UID 隱性耦合）
- `docker-compose.override.yml`：scheduler 加 `healthcheck: disable: true`（override 是 `sleep infinity`，原基底 healthcheck 在 dev 會誤判；基底 compose healthcheck 不受影響，§5 首條 concern 已解）
- 驗證：`bash scripts/check_infra.sh` → PASS=7 FAIL=0 `INFRA OK`；`docker compose config`（含 override）與基底皆 exit=0（含 `disable: true`）；`sh -n` 兩 entrypoint OK；`.venv/bin/pytest backend/tests/ -q` → **116 passed** 無迴歸
