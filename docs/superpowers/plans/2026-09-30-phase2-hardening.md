# Phase 2 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清掉第一期殘留的 P0 安全、P1 資料穩定、P2 前端體驗問題，達到可部署。

**Architecture:** 後端先收緊 auth/CORS/驗證不改行為只加防衛；scheduler 加下載與解析防護加 retention；前端做低風險本地化與標頭；最後補 CI 與告警鉤子，全程 TDD。

**Tech Stack:** FastAPI + SQLite WAL, Next.js 16.2.6 + React 19, supercronic, pytest, Jest, Docker Compose

## Global Constraints

- Next.js 16 API 以 `frontend/node_modules/next/dist/docs/` 為準。
- SQLite 寫入一律參數化。
- 不硬編碼測試結果，不寫 Facade 空實作。
- 每 Task 結束可獨立測試，頻繁 commit。
- TDD：先 failing test，再最小實作。

---

### Task 1: P0 後端 Auth 與 CORS 收緊

**Files:**
- Modify: `backend/auth_utils.py:1-42`
- Modify: `backend/routers/auth.py`
- Modify: `backend/main.py:22-28`
- Test: `backend/tests/test_phase2_auth.py`

**Interfaces:**
- Consumes: 第一期 `SECRET_KEY` fail-fast、`get_db` rollback。
- Produces: register 明確 400（重複/過長密碼）、CORS 明確白名單、JWT 效期 env 可覆寫。

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_phase2_auth.py
from fastapi.testclient import TestClient
def test_register_duplicate_returns_400(client):
    r1 = client.post("/api/auth/register", json={"email":"dup@test.com","password":"123456","name":"A"})
    r2 = client.post("/api/auth/register", json={"email":" dup@test.com ","password":"123456","name":"B"})
    assert r2.status_code == 400

def test_password_over_72B_rejected():
    from backend.auth_utils import hash_password
    import pytest
    with pytest.raises(ValueError):
        hash_password("x"*100)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/bin/pytest backend/tests/test_phase2_auth.py -v`
Expected: FAIL（目前重複拋 500、長密碼靜默截斷）

- [ ] **Step 3: Write minimal implementation**

```python
# backend/auth_utils.py
import os
MAX_PASSWORD_BYTES = 72
def hash_password(password: str) -> str:
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError("Password too long (max 72 bytes)")
    return pwd_context.hash(password)

ACCESS_TOKEN_EXPIRE_HOURS = float(os.environ.get("JWT_EXPIRE_HOURS", "24"))
def create_access_token(user_id: int, email: str) -> str:
    from datetime import datetime, timedelta, timezone
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": str(user_id), "email": email, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)
```

```python
# backend/routers/auth.py register 內：
email_norm = payload.email.strip().lower()
try:
    cursor.execute("INSERT INTO users ...", (email_norm, ...))
except sqlite3.IntegrityError:
    db.rollback()
    raise HTTPException(status_code=400, detail="Email already registered")
```

```python
# backend/main.py:22-28
if "*" in CORS_ORIGINS and len(CORS_ORIGINS) == 1:
    raise RuntimeError("CORS_ORIGINS=* with credentials is forbidden")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
    allow_methods=["GET","POST","PUT","DELETE","OPTIONS"], allow_headers=["Authorization","Content-Type"])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/bin/pytest backend/tests/test_phase2_auth.py backend/tests/test_auth.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/auth_utils.py backend/routers/auth.py backend/main.py backend/tests/test_phase2_auth.py
git commit -m "fix(auth): duplicate 400, 72B limit, expiry env, tight CORS"
```

### Task 2: P1 資料正確 — 分頁/驗證/FTS/保留

**Files:**
- Modify: `backend/routers/assistant.py`
- Modify: `backend/models.py:64-105`
- Modify: `backend/routers/itineraries.py:11-45`
- Modify: `backend/database.py:59-65`
- Modify: `scheduler/update_data.py:803-810,992-1007`
- Test: `backend/tests/test_phase2_data.py`

**Interfaces:**
- Consumes: Task 1 無。
- Produces: expenses 有 limit/offset 與 date 驗證；行程 N+1 消除；FTS 數量一致檢查；.bak 留 7 份；閘門 env 化。

- [ ] **Step 1: Write the failing test**

```python
def test_expenses_pagination(client_auth):
    r = client_auth.get("/api/expenses?limit=5&offset=0")
    assert r.status_code == 200 and len(r.json()) <= 5

def test_expense_bad_date_rejected(client_auth):
    r = client_auth.post("/api/expenses", json={"merchant_name":"X","amount":100,"category":"觀光旅遊","expense_date":"not-a-date"})
    assert r.status_code in (400,422)

def test_bak_retention(tmp_path):
    from scheduler.update_data import prune_backups
    assert callable(prune_backups)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/bin/pytest backend/tests/test_phase2_data.py -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```python
# backend/routers/assistant.py GET expenses：
def get_expenses(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), ...):
    cursor.execute("SELECT ... WHERE user_id=? ORDER BY expense_date DESC LIMIT ? OFFSET ?", (uid, limit, offset))
```

```python
# backend/models.py ExpenseCreate：expense_date 改
from datetime import date
expense_date: date
# ItineraryItemCreate：
estimated_cost: float = Field(default=0.0, ge=0)
stay_minutes: int = Field(default=60, ge=0)
quota_category: str = Field(default="一般消費", pattern="^(觀光旅遊|自行運用|一般消費)$")
lat: Optional[float] = Field(default=None, ge=-90, le=90)
lon: Optional[float] = Field(default=None, ge=-180, le=180)
```

```python
# backend/routers/itineraries.py get_itineraries：一次 JOIN
cursor.execute("SELECT ... FROM user_itineraries WHERE user_id=? ORDER BY updated_at DESC", (uid,))
rows = cursor.fetchall()
cursor.execute("SELECT ... FROM itinerary_items WHERE itinerary_id IN (%s) ORDER BY order_index" % ",".join("?"*len(ids)), ids)
# Python 按 itinerary_id 分組
```

```python
# backend/database.py init_db 尾：
c = cursor.execute("SELECT COUNT(*) FROM merchants").fetchone()[0]
f = cursor.execute("SELECT COUNT(*) FROM merchants_fts").fetchone()[0]
if c != f:
    import logging; logging.warning(f"FTS mismatch merchants={c} fts={f}, rebuild needed")
```

```python
# scheduler/update_data.py
MASS_MIN_OLD = int(os.environ.get("MASS_DELETE_MIN_OLD", "100"))
MASS_RATIO = float(os.environ.get("MASS_DELETE_RATIO", "0.5"))
def prune_backups(target_db_path: str, keep: int = 7):
    import glob
    baks = sorted(glob.glob(target_db_path + ".*.bak"))
    for old in baks[:-keep]:
        os.remove(old)
# transactional_sync_db 尾呼叫 prune_backups；meta 加 removed_favorites 筆數（刪除前 SELECT COUNT JOIN user_favorites）
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/bin/pytest backend/tests/test_phase2_data.py backend/tests/ -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/assistant.py backend/models.py backend/routers/itineraries.py backend/database.py scheduler/update_data.py backend/tests/test_phase2_data.py
git commit -m "fix(data): paging, validation, fts check, retention, thresholds env"
```

### Task 3: Scheduler 強韌 — 下載/解析防護

**Files:**
- Modify: `scheduler/update_data.py:323-374,439-558`
- Modify: `scheduler/crontab`
- Test: `backend/tests/test_phase2_scheduler.py`

**Interfaces:**
- Consumes: Task 2 的 prune/threshold。
- Produces: 429 重試、大小上限、ZIP/PDF 魔數校驗、解析筆數校驗。

- [ ] **Step 1: Write the failing test**

```python
def test_download_rejects_oversize():
    from scheduler.update_data import MAX_DOWNLOAD_MB
    assert MAX_DOWNLOAD_MB == 200

def test_parse_validates_counts():
    from scheduler.update_data import validate_records
    assert validate_records([], 0) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/bin/pytest backend/tests/test_phase2_scheduler.py -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```python
# scheduler/update_data.py 頂：
MAX_DOWNLOAD_MB = 200
# download_zip：status_forcelist 加 429；iter_content 累計 >上限即 abort 刪檔；結束驗 content-type 非 html 且前 4 bytes 為 PK\x03\x04（zip）
# extract_pdf 後驗前 5 bytes == b"%PDF-"
# parse 後：
def validate_records(insert_data, count):
    if count < 1000:
        log.error(f"Parse too few: {count}")
        return False
    return True
# main() 若 False 即 sys.exit(1) 不進同步
```

```cron
# scheduler/crontab（確保換行 + python3）：
0 3 * * * python3 /app/update_data.py
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/bin/pytest backend/tests/test_phase2_scheduler.py backend/tests/test_scheduler.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scheduler/update_data.py scheduler/crontab backend/tests/test_phase2_scheduler.py
git commit -m "fix(scheduler): retry 429, size cap, magic check, count gate"
```

### Task 4: P2 前端安全與體驗

**Files:**
- Modify: `frontend/next.config.ts`
- Modify: `frontend/src/components/MapView.tsx:77-81`
- Modify: `frontend/src/components/MerchantMiniMap.tsx:35-39`
- Modify: `frontend/src/utils/env.ts`
- Modify: `frontend/src/components/HomeSearchSection.tsx`
- Modify: `frontend/src/app/map/page.tsx`
- Test: `frontend/src/__tests__/Phase2.test.tsx`

**Interfaces:**
- Consumes: 後端分頁/驗證錯誤碼。
- Produces: CSP 標頭、本地 marker、URL 不凍結、a11y 可操作。

- [ ] **Step 1: Write the failing test**

```tsx
// Phase2.test.tsx
// 1. getBackendUrl 去尾 slash：getBackendUrl("http://x/") 不以 //api 結尾
// 2. HomeSearchSection input 用 key={initialQ} 受控更新
// 3. MapView 無 cdnjs 字串（改本地 /leaflet/marker-icon.png）
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --ci --watchAll=false src/__tests__/Phase2.test.tsx` (in frontend/)
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```ts
// next.config.ts
async headers() {
  return [{ source: "/(.*)", headers: [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
  ]}];
}
// CSP 先只 report（避免擋 Leaflet）：
// { key: "Content-Security-Policy-Report-Only", value: "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'" }
```

```ts
// 下載 marker 到 public/leaflet/，MapView 改：
iconUrl: "/leaflet/marker-icon.png",
iconRetinaUrl: "/leaflet/marker-icon-2x.png",
shadowUrl: "/leaflet/marker-shadow.png",
```

```ts
// utils/env.ts getBackendUrl：strip trailing /；client 若 NEXT_PUBLIC_API_URL 未設且非 localhost，用 window.location.hostname 組 http://host:8000（並 console.warn）
// HomeSearchSection：<input key={initialQ} ... maxLength={100}>；q 用 ref 持有，handleFilterChange 用 ref 值
// map/page.tsx：lat/lon/radius 箝制 [-90,90]/[-180,180]/<=10；商店卡 div 改 button + aria-label；useEffect 取代 render 期 setState
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --ci --watchAll=false` + `npm run lint` (in frontend/)
Expected: suites 全 PASS，0 warnings

- [ ] **Step 5: Commit**

```bash
git add frontend/next.config.ts frontend/src/components/MapView.tsx frontend/src/components/MerchantMiniMap.tsx frontend/public/leaflet/ frontend/src/utils/env.ts frontend/src/components/HomeSearchSection.tsx frontend/src/app/map/page.tsx frontend/src/__tests__/Phase2.test.tsx
git commit -m "fix(frontend): csp, local markers, url, a11y"
```

### Task 5: 可觀測與 CI

**Files:**
- Create: `.github/workflows/build.yml`
- Modify: `scheduler/update_data.py` (SLACK/WEBHOOK hook)
- Modify: `scripts/check_infra.sh`
- Test: `scripts/check_infra.sh`

**Interfaces:**
- Consumes: Task 1-4。
- Produces: CI 跑 pytest+jest+compose config+build；失敗可通知。

- [ ] **Step 1: Write the failing test**

```bash
# scripts/check_infra.sh 新增第 8-9 項：
# - .github/workflows/build.yml 存在且含 pytest + jest + compose build
# - update_data.py 含 NOTIFY_WEBHOOK_URL 環境鉤子
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/check_infra.sh`
Expected: FAIL（新兩項）

- [ ] **Step 3: Write minimal implementation**

```yaml
# .github/workflows/build.yml
name: build
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./.venv/bin/pytest backend/tests -q || python -m pytest backend/tests -q
      - run: npm --prefix frontend test -- --ci --watchAll=false
      - run: docker compose config
      - run: docker compose build backend scheduler
```

```python
# scheduler/update_data.py main() except/system exit 處：
NOTIFY_URL = os.environ.get("NOTIFY_WEBHOOK_URL", "")
def notify(msg: str):
    if NOTIFY_URL:
        try: requests.post(NOTIFY_URL, json={"text": msg}, timeout=10)
        except Exception as e: log.warning(f"notify failed: {e}")
# 下載失敗/解析失敗/abort 處呼叫 notify
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/check_infra.sh && docker compose config`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/build.yml scheduler/update_data.py scripts/check_infra.sh
git commit -m "chore: ci build and failure notify hook"
```

### Task 6: 全量驗證

**Files:** Test only

- [ ] **Step 1: 後端全測**

Run: `./.venv/bin/pytest backend/tests -q`
Expected: 116+新增全 PASS

- [ ] **Step 2: 前端全測 + lint**

Run: `npm test -- --ci --watchAll=false` + `npm run lint` (in frontend/)
Expected: 全 PASS，0 warnings

- [ ] **Step 3: Infra 與建置**

Run: `bash scripts/check_infra.sh && docker compose config`
Expected: PASS；有 daemon 則加 `docker compose build backend scheduler` 通過

- [ ] **Step 4: Commit 驗證**

```bash
git add docs/superpowers/plans/2026-09-30-phase2-hardening.md
git commit -m "chore: verify phase2 suites green"
```

## Self-Review

- Spec coverage：P0 auth/CORS → Task1；P1 data/retention → Task2；scheduler 下載解析 → Task3；前端 CSP/marker/URL/a11y → Task4；CI/告警 → Task5；驗證 → Task6。全覆蓋。httpOnly cookie 因需前後端大改刻意排除，留 Phase 3。
- Placeholder scan：無 TBD/TODO，每步有檔案、程式碼、指令、期望輸出。
- Type consistency：`prune_backups(target_db_path, keep)`、`validate_records`、`notify(msg)`、`ACCESS_TOKEN_EXPIRE_HOURS` 全文一致；前端事件名沿用 `ntc:unauthorized`。
