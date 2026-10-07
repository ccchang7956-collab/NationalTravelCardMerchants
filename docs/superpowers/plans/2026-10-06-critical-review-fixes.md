# Critical Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復深度 review 發現的 Critical/Important bug，附測試與驗證。

**Architecture:** 後端 FastAPI/SQLite 為主，前端 Next.js 16 修 XSS/快取，scheduler 補座標守衛，ops 加限流。每 task 獨立可測。

**Tech Stack:** Python 3.11+ FastAPI/pytest, TypeScript Next 16/jest, SQLite FTS5, nginx.

**Spec:** 本次 review 的 4 路報告（backend/frontend/shared-scheduler/ops）+ 用戶要求「包含測試和驗證」。

## Global Constraints

- 不洩漏 `.env` secrets，只比對 key 名。
- 不改動 `merchants.db` 生產檔，測試用 `:memory:` + `conftest.py` 隔離。
- Next 16 breaking：`params/searchParams` 為 Promise，必須 `await`（已正確，保持）。
- `tax_id` 允許重複（以 `id` 為主鍵），`merchant/[id]` 為 canonical。
- 繁簡只保證 `臺→台` + NFKC，不承諾簡體全轉。

## Review Focus

- 缺座標當 (0,0) 被當最近點 — 合理人期望缺資料不該排最前。
- `Response=None` 直調炸 500 — 合理人期望單元測試可直調。
- JSON-LD `</script>` 注入 — 合理人期望商家名含 `<` 不執行。
- robots 每次打後端全掃 — 合理人期望爬蟲不打掛本站。
- 無統編搬遷保留舊座標 — 合理人期望搬家後地圖更新。
- 測試加 `Expected:` 比對真實輸出，非「看起來對」。

---

### Task 1: Backend 正確性（Response/空值/haversine/tax_id/stats/503）

**Files:**
- Modify: `backend/routers/merchants.py:58-77,172,200-204,236-255,258-274,315-360,364-385`
- Test: `backend/tests/test_critical_review_fixes.py` (new)

**Interfaces:**
- Consumes: `get_db`, `parse_search_query`, `haversine(lat1,lon1,lat2,lon2)->float`
- Produces: `haversine` 缺值回 `inf`（呼叫方過濾），`get_nearby` 保證 `lon NOT NULL`，`get_merchant` 確定性 `ORDER BY id LIMIT 1`

- [ ] **Step 1: Write failing test** `backend/tests/test_critical_review_fixes.py` 含：haversine None→inf、nearby 過濾 lon NULL、Response None 直調不炸、tax_id 重複確定性、stats 臺北正規化、get_merchant/stats OperationalError→503（mock locked DB）
- [ ] **Step 2: Run test to verify it fails** Run: `pytest backend/tests/test_critical_review_fixes.py -v` Expected: FAIL（haversine 回 0、Response AttributeError 等）
- [ ] **Step 3: Implement fix in `backend/routers/merchants.py`**：haversine 缺值→inf；where 加 `m.lon IS NOT NULL`；`response: Response | None = None` + `if response is not None` 守衛；tax_id 查詢加 `ORDER BY id LIMIT 1`；stats `c3.replace("臺","台")`；get_merchant/get_stats/get_industries 包 OperationalError→503；nearby 候選加 `LIMIT 5000`（文件化近似語意）；page 加 `le=10000`
- [ ] **Step 4: Run test to verify it passes** Run: `pytest backend/tests/test_critical_review_fixes.py -v` Expected: PASS
- [ ] **Step 5: Run full backend suite** Run: `pytest backend/tests/ -q` Expected: PASS（若有既有紅燈， ledger 記錄 by name）
- [ ] **Step 6: Commit** `git add backend/routers/merchants.py backend/tests/test_critical_review_fixes.py; git commit -m "fix(backend): haversine inf, lon null, Response guard, tax deterministic, stats 台正規化, 503統一"`

### Task 2: Frontend XSS/SEO/快取（JSON-LD/robots/sitemap/redirect/sanitize）

**Files:**
- Modify: `frontend/src/app/page.tsx:552-604`, `frontend/src/app/merchant/[id]/page.tsx:342-350`, `frontend/src/app/layout.tsx:82-105`, `frontend/src/app/faq/page.tsx:186-202`, `frontend/src/app/robots.ts`, `frontend/src/app/sitemap.ts`, `frontend/src/app/merchant/[id]/page.tsx:94-96`, `frontend/src/utils/sanitize.ts`, `frontend/src/app/llms.txt/route.ts`, `frontend/src/app/error.tsx` (new), `frontend/src/utils/jsonld.ts` (new)
- Test: `frontend/src/__tests__/CriticalReviewFixes.test.ts` (new)

**Interfaces:**
- Consumes: `getSiteUrl()`, `fetchSitemapManifest()`
- Produces: `escapeJsonLd(obj)->string`（`<`→`\u003c`），robots/sitemap `revalidate=3600`

- [ ] **Step 1: Write failing test** 含：escape `< /script>`→`\u003c`、sanitize 擋換行/control、`normalize page array`、canonical 白名單
- [ ] **Step 2: Run to verify fails** Run: `npx jest src/__tests__/CriticalReviewFixes.test.ts --no-coverage` Expected: FAIL（function not defined）
- [ ] **Step 3: Implement**：新增 `utils/jsonld.ts` + 四處 JSON-LD 用它；robots/sitemap 加 `export const revalidate=3600` + try/catch 回退靜態；`redirect`→`permanentRedirect`；sanitize 加 trim+`\s`/control 拒絕+`new URL` 驗 protocol；`llms.txt` 改 `force-dynamic`+`/merchant/{id}`；加 `app/error.tsx` 中文重試頁；page canonical 白名單 `has_website true/false` + `page array` normalize
- [ ] **Step 4: Run test passes** Run: 同上 Expected: PASS
- [ ] **Step 5: Run frontend suite** Run: `npx jest --no-coverage 2>&1 | tail -20` Expected: PASS
- [ ] **Step 6: Commit**

### Task 3: Scheduler/Shared（無統編搬遷座標 + FTS 上限 + (0,0) 拒絕）

**Files:**
- Modify: `scheduler/update_data.py:909-918`, `shared/search.py:20-28`, `shared/coordinates.py:14-20`, `backend/routers/merchants.py:58-77`（與 Task1 共用 haversine inf）
- Test: `backend/tests/test_scheduler_review_fixes.py` (new)

**Interfaces:**
- Consumes: `preservable_coordinates`, `same_address`
- Produces: 無統編 UPDATE 加 `same_address` 守衛；`parse_search_query` 限 10 短語/100 字；`valid_coordinates` 拒 (0,0)

- [ ] **Step 1: Write failing test**：無統編搬地址不保留舊座標、50 詞查詢被截斷、(0,0) invalid
- [ ] **Step 2: Run fails** `pytest backend/tests/test_scheduler_review_fixes.py -v` Expected: FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run passes**
- [ ] **Step 5: Full suite**
- [ ] **Step 6: Commit**

### Task 4: Ops/安全（限流 + CORS收斂 + healthcheck + 文件）

**Files:**
- Modify: `nginx.conf`, `backend/main.py:36-43`, `docker-compose.yml`, `docker-compose.prod.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, `scheduler/Dockerfile`, `docs/deployment-ubuntu-server.md:30,50-66`
- Test: `scripts/verify_ops.sh` (new, grep 斷言) + `backend/tests/test_ops_config.py` (new, 讀檔斷言非運行)

**Interfaces:**
- Consumes: 無（靜態配置）
- Produces: nginx `limit_req_zone/limit_req/client_max_body_size/server_tokens off`，CORS `GET,OPTIONS`，TrustedHost，healthcheck 內嵌

- [ ] **Step 1: Write failing check**：assert nginx 含 limit_req、main 含 TrustedHost、compose 含 logging/healthcheck
- [ ] **Step 2: Run fails** Expected: FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run passes** + `nginx -t` 若可用 + `docker compose config` 若可用
- [ ] **Step 5: Commit**
