# Phase 4 Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清掉 Phase3 後殘留的 10 項小修：後端生命週期、限流、stats、meta 計數、MapView 連動、API_URL 凍結、分頁防禦。

**Architecture:** 後端只加防衛不改行為（lifespan、記憶體限流、城市前綴匹配）；排程讓 meta 說真話（目標庫 COUNT）；前端修連動與凍結（effect 內取值、flyTo）；終點全綠驗證。

**Tech Stack:** FastAPI + SQLite WAL, Next.js 16.2.6 + React 19, pytest, Jest, Docker Compose

## Global Constraints

- Next.js 16 API 以 `frontend/node_modules/next/dist/docs/` 為準。
- SQLite 寫入一律參數化。
- 不硬編碼測試結果，不寫 Facade 空實作。
- 每 Task 可獨立測試，頻繁 commit。
- TDD：先 failing test，再最小實作。

---

### Task 1: 後端生命週期與依賴 pin

**Files:**
- Modify: `backend/main.py:1-11,128`
- Modify: `backend/requirements.txt`
- Test: `backend/tests/test_phase4_lifecycle.py`

**Interfaces:**
- Consumes: 無。
- Produces: `lifespan` 啟動建表；`reload` 預設關；依賴全 pin。

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_phase4_lifecycle.py
def test_no_import_side_effect():
    import pathlib
    src = pathlib.Path("backend/main.py").read_text()
    assert "init_db()" not in src.split("lifespan")[0] or "lifespan" in src

def test_requirements_pinned():
    import pathlib
    txt = pathlib.Path("backend/requirements.txt").read_text()
    assert "pyjwt>=" not in txt and "passlib[bcrypt]>=" not in txt and "bcrypt>=" not in txt
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/bin/pytest backend/tests/test_phase4_lifecycle.py -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```python
# backend/main.py
from contextlib import asynccontextmanager
@asynccontextmanager
async def lifespan(app):
    init_db()
    yield
app = FastAPI(..., lifespan=lifespan)
# 刪頂層 init_db()；__main__ 改：
uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=os.environ.get("UVICORN_RELOAD", "false").lower() == "true")
```

```
# backend/requirements.txt：把 4 行 >= 改 ==（以目前已驗證版本為準）：
pyjwt==2.10.1
passlib[bcrypt]==1.7.4
bcrypt==4.3.0
email-validator==2.2.0
```
版本號以 `pip freeze` 實測為準，implementer 先跑 `./.venv/bin/pip freeze | grep -Ei "pyjwt|passlib|bcrypt|email"` 再填，不臆測。

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/bin/pytest backend/tests/test_phase4_lifecycle.py backend/tests/test_auth.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/requirements.txt backend/tests/test_phase4_lifecycle.py
git commit -m "chore(backend): lifespan init, reload off, pin deps"
```

### Task 2: 限流與 stats 城市匹配

**Files:**
- Modify: `backend/routers/auth.py`
- Modify: `backend/routers/merchants.py:258-287`
- Test: `backend/tests/test_phase4_throttle_stats.py`

**Interfaces:**
- Consumes: Task 1。
- Produces: 登入/註冊記憶體限流；stats 用城市表前綴匹配。

- [ ] **Step 1: Write the failing test**

```python
def test_login_throttled_after_5_fails(client):
    for _ in range(6):
        r = client.post("/api/auth/login", json={"email":"n@x.com","password":"wrong"})
    assert r.status_code == 429

def test_stats_cities_are_known():
    from backend.routers.merchants import TAIWAN_CITIES
    assert "台北市" in TAIWAN_CITIES
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/bin/pytest backend/tests/test_phase4_throttle_stats.py -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```python
# backend/routers/auth.py 頂：
import time
_FAILS: dict[str, list[float]] = {}
def _throttle(key: str, limit: int = 5, window: int = 60):
    from fastapi import HTTPException
    now = time.time()
    hits = [t for t in _FAILS.get(key, []) if now - t < window]
    if len(hits) >= limit:
        raise HTTPException(status_code=429, detail="Too many attempts")
    hits.append(now); _FAILS[key] = hits
# login/register 內第一行：_throttle("login:"+email_norm)；成功後 _FAILS.pop(key, None)
```

```python
# backend/routers/merchants.py 頂：
TAIWAN_CITIES = ["基隆市","台北市","新北市","桃園市","新竹市","新竹縣","苗栗縣","台中市","彰化縣","南投縣","雲林縣","嘉義市","嘉義縣","台南市","高雄市","屏東縣","宜蘭縣","花蓮縣","台東縣","澎湖縣","金門縣","連江縣"]
# get_stats 改：SELECT address, COUNT(*) 全撈（或沿用 GROUP），Python 用 address.startswith(city) 歸 bucket，未命中歸「其他」，不再 SUBSTR 切 3 字：
counts = {c: 0 for c in TAIWAN_CITIES}; other = 0
for row in cursor.fetchall():
    addr = row["address"] or ""
    for c in TAIWAN_CITIES:
        if addr.startswith(c): counts[c] += row["count"] if "count" in row.keys() else 1; break
    else: other += 1
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/bin/pytest backend/tests/test_phase4_throttle_stats.py backend/tests/ -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/auth.py backend/routers/merchants.py backend/tests/test_phase4_throttle_stats.py
git commit -m "fix(backend): in-memory auth throttle, city prefix stats"
```

### Task 3: 排程 meta 說真話

**Files:**
- Modify: `scheduler/update_data.py:992-1007`
- Test: `backend/tests/test_phase4_meta.py`

**Interfaces:**
- Consumes: Task 2。
- Produces: meta.total_merchants = 目標庫同步後 COUNT；增減用正規化後集合。

- [ ] **Step 1: Write the failing test**

```python
def test_meta_uses_target_count():
    import pathlib
    src = pathlib.Path("scheduler/update_data.py").read_text()
    assert "SELECT COUNT(*) FROM merchants" in src  # meta 前需查目標庫
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/bin/pytest backend/tests/test_phase4_meta.py -v`
Expected: FAIL（目前直接寫 new_count）

- [ ] **Step 3: Write minimal implementation**

```python
# transactional_sync_db 成功後回傳目標筆數（已回傳 removed_favorites，改回傳 tuple 或再查一次）；
# main() 內：
target_conn = sqlite3.connect(DB_PATH)
try:
    final_total = target_conn.execute("SELECT COUNT(*) FROM merchants").fetchone()[0]
finally:
    target_conn.close()
meta = {"last_updated": ..., "pdf_hash": new_hash, "total_merchants": final_total,
        "new_merchants": added_count, "removed_merchants": removed_count, ...}
# added/removed 計算兩側皆 normalize_tax_id（舊集合讀出後同樣 normalize）
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/bin/pytest backend/tests/test_phase4_meta.py backend/tests/test_scheduler_safety.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scheduler/update_data.py backend/tests/test_phase4_meta.py
git commit -m "fix(scheduler): meta reports target count"
```

### Task 4: MapView 選店連動 + API_URL 解凍

**Files:**
- Modify: `frontend/src/components/MapView.tsx:28-130`
- Modify: `frontend/src/app/map/page.tsx:49,425-434`
- Modify: `frontend/src/app/merchant/[id]/page.tsx:9-20`
- Test: `frontend/src/__tests__/Phase4.test.tsx`

**Interfaces:**
- Consumes: Task 3 無。
- Produces: 側欄選店地圖 flyTo + 開 popup；API_URL 每次請求時取值。

- [ ] **Step 1: Write the failing test**

```tsx
// Phase4.test.tsx
// 1. MapView 源碼含 selectedMerchant.id 的 useEffect + flyTo/openPopup
// 2. map/page.tsx 與 merchant/[id]/page.tsx 源碼無模組頂層 const API_URL（改函式內呼叫）
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --ci --watchAll=false src/__tests__/Phase4.test.tsx` (in frontend/)
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```tsx
// MapView.tsx：map 實例 ref 已有，補：
useEffect(() => {
  if (!mapRef.current || !selectedMerchant?.lat || !selectedMerchant?.lon) return;
  mapRef.current.flyTo([selectedMerchant.lat, selectedMerchant.lon], Math.max(mapRef.current.getZoom(), 15), { duration: 0.6 });
  // 開對應 marker popup：markersRef.current[selectedMerchant.id]?.openPopup()
}, [selectedMerchant]);
```

```tsx
// map/page.tsx：刪 const API_URL Module 頂，fetchNearby 內 const API_URL = getPublicApiUrl();
// merchant/[id]/page.tsx：刪模組 const，generateMetadata + Page 函式內 const API_URL = getBackendUrl();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --ci --watchAll=false` + `npm run lint` (in frontend/)
Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MapView.tsx frontend/src/app/map/page.tsx "frontend/src/app/merchant/[id]/page.tsx" frontend/src/__tests__/Phase4.test.tsx
git commit -m "fix(frontend): merchant flyTo, runtime api url"
```

### Task 5: page.tsx 防禦與 a11y

**Files:**
- Modify: `frontend/src/app/page.tsx:40,132-147,168,257`
- Test: `frontend/src/__tests__/Phase4b.test.tsx`

**Interfaces:**
- Consumes: Task 4。
- Produces: 型別上移、數字防禦、q 截斷、分頁 aria。

- [ ] **Step 1: Write the failing test**

```tsx
// Phase4b：page.tsx 源碼含 Number(stats?.total_merchants、q.slice(0, 50)、aria-label="上一頁"/"下一頁"、interface 在組件外
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --ci --watchAll=false src/__tests__/Phase4b.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```tsx
// 檔案頂移入 CityStat/Merchant interfaces；
// stats 顯示改 Number(stats?.total_merchants ?? 0).toLocaleString()；merchant 欄位 String(m.address ?? "")；
// generateMetadata + 內文 q 改 q.slice(0, 50)；搜尋框已有 maxLength=100 保留；
// 分頁 ←/→ Link 加 aria-label="上一頁"/"下一頁"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --ci --watchAll=false` + `npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/__tests__/Phase4b.test.tsx
git commit -m "fix(frontend): page guards and pagination a11y"
```

### Task 6: 全量驗證

**Files:** Test only

- [ ] **Step 1: 後端全測**

Run: `./.venv/bin/pytest backend/tests -q`
Expected: 133+新增全 PASS

- [ ] **Step 2: 前端全測 + lint + tsc**

Run: `npm test -- --ci --watchAll=false` + `npm run lint` + `npx tsc --noEmit` (in frontend/)
Expected: 全 PASS

- [ ] **Step 3: Infra**

Run: `bash scripts/check_infra.sh && JWT_SECRET_KEY=dummy docker compose config`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-09-30-phase4-cleanup.md
git commit -m "chore: verify phase4 suites green"
```

## Self-Review

- Spec coverage：生命週期/pin → Task1；限流/stats → Task2；meta → Task3；連動/URL → Task4；防禦/a11y → Task5；驗證 → Task6。全覆蓋。token revoke/refresh、httpOnly cookie、備份異地、VACUUM 刻意排除（大改或效益低，留後續）。
- Placeholder scan：無 TBD/TODO，每步有檔案、程式碼、指令、期望。
- Type consistency：`prune_backups(target,keep)`、`notify(msg)`、`getBackendUrl()/getPublicApiUrl()`、`clampLat/Lon/RadiusKm` 沿用既有名；`transactional_sync_db` 回傳沿用 Phase2（int removed_favorites），Task3 新增 final COUNT 查詢不改簽名。
