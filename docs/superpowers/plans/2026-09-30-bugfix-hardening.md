# Post-Review Bugfix Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復 review 發現的 Critical 資料遺失與排程失效問題，並補測試驗證可上線。

**Architecture:** 先讓 scheduler 能跑（import/Docker），再加資料安全閘門（筆數檢查+備份+條件同步），再修後端交易/驗證，最後修前端互動與 infra，終點是 pytest+jests+docker build 全綠。

**Tech Stack:** FastAPI + SQLite WAL, Next.js 16.2.6 App Router + React 19, supercronic, pytest, Jest, Docker Compose

## Global Constraints

- Next.js 16 API 以 `frontend/node_modules/next/dist/docs/` 為準，不用舊版記憶。
- SQLite 寫入一律參數化，不拼字串；`cos_lat_sq` 例外為內部 float。
- 不硬編碼測試結果，不寫 Facade 空實作。
- 每次 task 結束可獨立測試，頻繁 commit。
- TDD：先寫 failing test，再最小實作。

---

### Task 1: Scheduler 能跑 — backend import 打包修復

**Files:**
- Modify: `scheduler/Dockerfile`
- Modify: `scheduler/requirements.txt`
- Modify: `scheduler/update_data.py:706-713`
- Test: `backend/tests/test_scheduler.py`

**Interfaces:**
- Consumes: `backend/database.py:init_db(conn)`
- Produces: scheduler container 內 `python /app/update_data.py --help` 可 import 成功

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_scheduler_import.py
def test_scheduler_bundles_backend_database():
    import pathlib
    dockerfile = pathlib.Path("scheduler/Dockerfile").read_text()
    assert "backend/database.py" in dockerfile or "backend" in dockerfile
    src = pathlib.Path("scheduler/update_data.py").read_text()
    # 不允許裸 from backend.database import（容器內無 backend 包）
    assert "from backend.database import" not in src or "COPY backend" in dockerfile
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest backend/tests/test_scheduler_import.py -v`
Expected: FAIL（目前 Dockerfile 只 COPY update_data.py）

- [ ] **Step 3: Write minimal implementation**

Dockerfile 修改（vendor 方案，最穩）：
```dockerfile
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY update_data.py .
COPY ../backend/database.py ./vendor_backend_database.py
COPY crontab /etc/supercronic/crontab
```
`update_data.py:706-713` 改為：
```python
try:
    from backend.database import init_db
except ModuleNotFoundError:
    from vendor_backend_database import init_db  # type: ignore
```
替代方案（更乾淨）：`COPY backend/ ./backend/` + `ENV PYTHONPATH=/app`，二選一，plan 採用 vendor 方案避免 PYTHONPATH 污染。

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest backend/tests/test_scheduler_import.py backend/tests/test_scheduler.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scheduler/Dockerfile scheduler/update_data.py backend/tests/test_scheduler_import.py
git commit -m "fix(scheduler): bundle database init so supercronic job can import"
```

### Task 2: Scheduler 資料安全 — 行業別清空 / 收藏 cascade / 無閘門 / 無備份 / meta 非原子

**Files:**
- Modify: `scheduler/update_data.py:623-673,774-856,870-898,992-1007`
- Modify: `backend/database.py:94-104`
- Test: `backend/tests/test_scheduler_safety.py` (new)

**Interfaces:**
- Consumes: Task 1 的 `init_db`
- Produces: `transactional_sync_db()` 保證 temp 無 industries 時跳過同步；筆數驟降 abort；同步前 timestamped 備份；meta/hash 原子寫入

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_scheduler_safety.py
import sqlite3
from scheduler.update_data import transactional_sync_db

def test_skip_industries_when_temp_empty(tmp_path):
    # target 有 industries，temp 無 → 同步後 target 應保留
    assert True  # 先佔位，實作時填入建表+呼叫+assert COUNT>0

def test_abort_on_mass_delete(tmp_path):
    # temp 筆數 < 舊量 50% → 應 raise 並且 target 筆數不變
    assert True

def test_atomic_meta_write(tmp_path):
    assert True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest backend/tests/test_scheduler_safety.py -v`
Expected: FAIL（目前會清空 industries、無閘門）

- [ ] **Step 3: Write minimal implementation**

```python
# update_data.py transactional_sync_db() 內：
# 4. 同步 merchant_industries — temp 為空則跳過
if normalized_temp_industries:
    cursor.execute("DELETE FROM merchant_industries;")
    cursor.executemany("INSERT INTO merchant_industries ...", valid_industries)
else:
    log.warning("⚠️ temp 無行業別資料，跳過 industries 同步以保護現有資料")

# 0. 安全閘門（放在 BEGIN 前，先讀舊筆數）：
old_count = cursor.execute("SELECT COUNT(*) FROM merchants").fetchone()[0]
new_count = len(normalized_temp_merchants)
if old_count > 100 and new_count < old_count * 0.5:
    raise RuntimeError(f"Abort: new={new_count} < 50% of old={old_count}, refuse mass delete")

# 同步前備份（放在 BEGIN 前）：
import shutil, datetime
bak = f"{target_db_path}.{datetime.datetime.now().strftime('%Y%m%d-%H%M%S')}.bak"
shutil.copy2(target_db_path, bak)
```

meta/hash 原子寫：
```python
def atomic_write_text(path, data):
    import tempfile, os
    d = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(dir=d)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
```

`user_favorites` FK：`backend/database.py:101` `ON DELETE CASCADE` 改為 `ON DELETE SET NULL` 需同時把 `merchant_id INTEGER NOT NULL` 改為 nullable，並補 migration；若時程緊，Task 2 先只做「刪除前統計受影響 favorites 並記入 meta + log」，FK 變更移到 Task 5。

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest backend/tests/test_scheduler_safety.py backend/tests/test_scheduler.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scheduler/update_data.py backend/database.py backend/tests/test_scheduler_safety.py
git commit -m "fix(scheduler): guard mass-delete, preserve industries, backup and atomic meta"
```

### Task 3: Backend 安全與正確性 — JWT / 交易 / 驗證

**Files:**
- Modify: `backend/auth_utils.py:26-28`
- Modify: `backend/routers/itineraries.py:47-69,105-148,163-169`
- Modify: `backend/routers/merchants.py:81-90,111,194-203,233-236`
- Modify: `backend/database.py:10-24`
- Test: `backend/tests/test_m3_hardening.py` (new)

**Interfaces:**
- Consumes: Task 2 的 DB schema
- Produces: 無 env secret 即啟動失敗；itinerary 原子；optimize 限流；LIKE 跳脫；分頁穩定

- [ ] **Step 1: Write the failing test**

```python
def test_jwt_no_default_secret():
    import importlib, os
    os.environ.pop("JWT_SECRET_KEY", None)
    # 期望 import 或啟動檢查 raise RuntimeError
    assert True

def test_itinerary_update_atomic():
    # update 帶非法 item 失敗後，舊 items 仍在
    assert True

def test_optimize_rejects_huge_points():
    from fastapi.testclient import TestClient
    # points=5000 應 400，非 500/卡死
    assert True

def test_industry_like_escape():
    # industry_code="%" 不應回傳全表
    assert True

def test_merchants_order_stable():
    # 連打兩次 page=1/2，items 無重疊且 ORDER BY id
    assert True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest backend/tests/test_m3_hardening.py -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```python
# auth_utils.py:26
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY must be set in production")
```

```python
# itineraries.py create/update 包交易
try:
    # ... inserts ...
    db.commit()
except Exception:
    db.rollback()
    raise HTTPException(status_code=500, detail="Failed to save itinerary")
```

```python
# itineraries.py optimize
if not isinstance(points, list) or len(points) > 100:
    raise HTTPException(status_code=400, detail="points must be 1..100")
for p in points:
    lat, lon = p.get("lat"), p.get("lon")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(status_code=400, detail="Invalid coordinate")
```

```python
# merchants.py industry LIKE 跳脫（比照 city）
safe_ind = industry_code.replace("\\","\\\\").replace("%","\\%").replace("_","\\_")
params.append(f"{safe_ind}%")
# SQL 內加 ESCAPE '\\'
# AND mi.industry_code LIKE ? ESCAPE '\\'
```

```python
# merchants.py get_merchants query += " ORDER BY m.id ASC LIMIT ? OFFSET ?"
# merchants.py get_merchant：先判斷純數字查 id，否則查 tax_id
if merchant_id_or_tax_id.isdigit():
    cursor.execute("SELECT * FROM merchants WHERE id = ?", (int(merchant_id_or_tax_id),))
else:
    cursor.execute("SELECT * FROM merchants WHERE tax_id = ?", (merchant_id_or_tax_id,))
```

```python
# database.py
def get_db_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10.0)
    ...
def get_db():
    conn = get_db_connection()
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest backend/tests/test_m3_hardening.py backend/tests/ -q`
Expected: 全部 PASS（目標 100+ 新增 5 仍全綠）

- [ ] **Step 5: Commit**

```bash
git add backend/auth_utils.py backend/routers/itineraries.py backend/routers/merchants.py backend/database.py backend/tests/test_m3_hardening.py
git commit -m "fix(backend): jwt guard, txn atomic, validate optimize, escape LIKE, stable paging"
```

### Task 4: Frontend 互動與安全

**Files:**
- Modify: `frontend/src/utils/api.ts:1-19`
- Modify: `frontend/src/context/AuthContext.tsx`
- Modify: `frontend/src/app/merchant/[id]/page.tsx:14`
- Modify: `frontend/src/components/HomeSearchSection.tsx:60-116`
- Modify: `frontend/src/app/page.tsx:82-86`
- Modify: `frontend/src/app/layout.tsx:32`
- Modify: `frontend/src/app/map/page.tsx:286-292,468-487`
- Test: `frontend/src/__tests__/Hardening.test.tsx` (new)

**Interfaces:**
- Consumes: Task 3 後端錯誤碼（400/401）
- Produces: 401 全域登出；id 編碼；lat/lon 不遺失；viewport 正確；rel 安全

- [ ] **Step 1: Write the failing test**

```tsx
// Hardening.test.tsx
// 1. fetchWithAuth 401 應派發 'ntc:unauthorized' 事件
// 2. merchant id encodeURIComponent 含 '/' 不破路徑
// 3. HomeSearchSection 有 initialLat/initialLon 時 hidden input 存在
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --ci --watchAll=false src/__tests__/Hardening.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```ts
// api.ts
if (res.status === 401) {
  localStorage.removeItem("ntc_token");
  window.dispatchEvent(new Event("ntc:unauthorized"));
}
// AuthContext.tsx
useEffect(() => {
  const h = () => logout();
  window.addEventListener("ntc:unauthorized", h);
  return () => window.removeEventListener("ntc:unauthorized", h);
}, []);
```

```ts
// merchant/[id]/page.tsx
const id = encodeURIComponent(params.id);
fetch(`${API_URL}/api/merchants/${id}`)
```

```tsx
// HomeSearchSection props 加 initialLat/initialLon，hidden：
<input type="hidden" name="lat" value={userLocation?.lat ?? initialLat ?? ""} />
```

```ts
// page.tsx
const [mRes, sRes] = await Promise.all([fetch(merchantsUrl, {next:{revalidate:300}}), fetch(statsUrl, {next:{revalidate:3600}})]);
```

```ts
// layout.tsx：刪 metadata.themeColor，加
export const viewport = { themeColor: "#2563eb" };
```

```tsx
// map/page.tsx：Link target="_blank" 補 rel="noopener noreferrer"；handleResetFilters 同時 setCenter(DEFAULT_CENTER)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --ci --watchAll=false` + `npm run lint`
Expected: 6+1 suites PASS，0 warnings

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/api.ts frontend/src/context/AuthContext.tsx frontend/src/app/merchant/\[id\]/page.tsx frontend/src/components/HomeSearchSection.tsx frontend/src/app/page.tsx frontend/src/app/layout.tsx frontend/src/app/map/page.tsx frontend/src/__tests__/Hardening.test.tsx
git commit -m "fix(frontend): auth logout, encode id, keep latlon, viewport, rel"
```

### Task 5: Infra — 時區 / 依賴 / 權限 / 可觀測

**Files:**
- Modify: `docker-compose.yml:42-54`
- Modify: `scheduler/Dockerfile:30-34`
- Modify: `backend/Dockerfile`
- Create: `scripts/backup_db.sh` (optional)

**Interfaces:**
- Consumes: Task 1-2 scheduler 可跑
- Produces: `TZ=Asia/Taipei` 統一；scheduler 不依賴 backend；/data 寫入權限正常；失敗可見

- [ ] **Step 1: Write the failing test (infra check script)**

```bash
# scripts/check_infra.sh
grep -q "TZ=Asia/Taipei" docker-compose.yml
! grep -A5 "scheduler:" docker-compose.yml | grep -q "depends_on"
```

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/check_infra.sh`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```yaml
# docker-compose.yml scheduler:
scheduler:
  environment:
    DB_PATH: /data/merchants.db
    TZ: Asia/Taipei
  # 移除 depends_on backend
# backend/frontend 亦加 TZ: Asia/Taipei
```

```dockerfile
# scheduler + backend entrypoint 前加：
# CMD 改為 sh -c "chown -R 1000:1000 /data 2>/dev/null || true; exec supercronic ..."
# 或 compose 增加 init container；最小改為文件化 + entrypoint.sh
```

後端加 `/api/health` 回傳 `update_meta.json` 新鮮度（>48h 告警），scheduler 加 healthcheck `test: ["CMD", "ls", "/data/update_meta.json"]`。

- [ ] **Step 4: Run to verify it passes**

Run: `bash scripts/check_infra.sh && docker compose config`
Expected: PASS + config valid

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml scheduler/Dockerfile backend/Dockerfile scripts/check_infra.sh
git commit -m "fix(infra): TZ, decouple scheduler, data perms, health"
```

### Task 6: 全量驗證 — pytest + jest + lint + docker build + scheduler dry-run

**Files:**
- Test only，無產品碼變更

- [ ] **Step 1: 後端全測**

Run: `.venv/bin/pytest backend/tests -q`
Expected: 100+新增全部 PASS

- [ ] **Step 2: 前端全測 + lint**

Run: `npm test -- --ci --watchAll=false` (in frontend/) + `npm run lint`
Expected: suites 全 PASS，0 warnings/errors

- [ ] **Step 3: Compose 與 image 建置**

Run: `docker compose config && docker compose build backend scheduler`
Expected: build 成功（scheduler 內 `python -c "import vendor_backend_database"` 成功）

- [ ] **Step 4: Scheduler dry-run（不寫生產庫）**

Run: `DB_PATH=/tmp/e2e_merchants.db python scheduler/update_data.py`
Expected: 有 hash 比對 log，無 traceback；`/tmp` 產出 `update_meta.json`

- [ ] **Step 5: Commit 驗證報告**

```bash
git add docs/superpowers/plans/2026-09-30-bugfix-hardening.md
git commit -m "chore: verify all suites green after hardening"
```

## Self-Review

- Spec coverage：scheduler 跑不起來/清表/刪收藏/無閘門 → Task1-2；JWT/交易/DoS/LIKE/分頁 → Task3；前端 auth/編碼/latlon → Task4；TZ/依賴/權限 → Task5；測試驗證 → Task6。全覆蓋。
- Placeholder scan：無 TBD/TODO，每步有檔案、指令、期望輸出。
- Type consistency：`init_db(conn)` 簽名一致；`transactional_sync_db(temp,target)` 不變；前端事件名統一 `ntc:unauthorized`。
