# Code Review Issues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix critical DB update concurrency issues, search query edge cases, and API model representations identified in the code review, verified with full automated tests.

**Architecture:** 
1. `scheduler/update_data.py`: Refactor DB update pipeline to construct temporary SQLite DB with all tables/indices/FTS5, close connections, and execute atomic file replacement (`os.replace`) to target `DB_PATH`, eliminating schema lock and table drop risks during live API queries.
2. `backend/routers/merchants.py`: Handle invalid/punctuation-only search queries (`parse_search_query(q) is None` when `q` provided) by returning empty results (`total: 0, items: []`) instead of falling back to full table scan.
3. `backend/models.py` & `merchants.py`: Separate `MerchantListItem` (lightweight list response without industries array) from `MerchantDetail` (single merchant detail with industries array), and cap `radius_km` to `20.0` for performance safety.

**Tech Stack:** Python 3.9+, FastAPI, SQLite FTS5, Pytest, Next.js / TypeScript.

## Global Constraints

- Preserve all existing API query parameter names and endpoints.
- Keep tests hermetic using `:memory:` or temp files.
- Ensure all 28+ pytest tests pass with zero errors.

---

### Task 1: Fix Empty Search Query Edge Cases

**Files:**
- Modify: `backend/routers/merchants.py:68-160`
- Test: `backend/tests/test_query_parser.py`, `backend/tests/test_search_api.py`

**Interfaces:**
- `parse_search_query(q: Optional[str]) -> Optional[str]`
- `get_merchants(q, city, zip_code, has_website, industry_code, page, per_page, db)` -> `PaginatedMerchants`
- `get_nearby_merchants(lat, lon, radius_km, q, industry_code, limit, db)` -> `List[MerchantListItem]`

- [ ] **Step 1: Write failing test for punctuation-only search query**

Edit `backend/tests/test_search_api.py` to add test cases for `q="!!!"`, `q=" @#$ "` expecting `total: 0` for `/api/merchants` and `[]` for `/api/merchants/nearby`.

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/bin/pytest backend/tests/test_search_api.py -k test_punctuation_search`
Expected: FAIL (currently returns all merchants)

- [ ] **Step 3: Update `merchants.py` to return empty results when `q` is invalid**

In `get_merchants`:
```python
if q is not None and q.strip() != "":
    fts_query = parse_search_query(q)
    if not fts_query:
        return {
            "total": 0,
            "page": page,
            "per_page": per_page,
            "total_pages": 1,
            "items": []
        }
```
In `get_nearby_merchants`:
```python
if q is not None and q.strip() != "":
    fts_query = parse_search_query(q)
    if not fts_query:
        return []
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/bin/pytest backend/tests/test_search_api.py`
Expected: PASS

---

### Task 2: Refactor Scheduler DB Update Pipeline to Use Atomic File Replacement

**Files:**
- Modify: `scheduler/update_data.py:750-840`
- Modify: `backend/tests/test_scheduler.py`

**Interfaces:**
- `atomic_swap_db(temp_db_path: str, target_db_path: str) -> None`

- [ ] **Step 1: Write test for atomic database replacement**

In `backend/tests/test_scheduler.py`, add `test_atomic_db_replacement` ensuring `update_data.py` builds the DB into a temporary file and atomically replaces `DB_PATH` without executing `DROP TABLE` in place on live DB.

- [ ] **Step 2: Run test to verify failure/behavior**

Run: `PYTHONPATH=. .venv/bin/pytest backend/tests/test_scheduler.py`

- [ ] **Step 3: Implement atomic replacement in `scheduler/update_data.py`**

Refactor `update_data.py`'s `main()` flow:
1. Create temporary SQLite database file `tmp_db_path = DB_PATH + ".tmp"`
2. Build schema, insert records, build FTS5 index, and vacuum in `tmp_db_path`.
3. Close connection to `tmp_db_path`.
4. Perform `shutil.move(tmp_db_path, DB_PATH)` or `os.replace(tmp_db_path, DB_PATH)`.

- [ ] **Step 4: Run tests to verify passing**

Run: `PYTHONPATH=. .venv/bin/pytest backend/tests/test_scheduler.py`
Expected: PASS

---

### Task 3: Refactor Pydantic Models & Radius Safety Guard

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/routers/merchants.py`
- Test: `backend/tests/test_search_api.py`

**Interfaces:**
- Model `MerchantListItem`: Base merchant fields without `industries` array.
- Model `MerchantDetail`: Inherits `MerchantListItem` + `industries: List[IndustryInfo]`.
- Model `PaginatedMerchants`: `items: List[MerchantListItem]`.

- [ ] **Step 1: Write model test updates in `test_search_api.py`**

Verify `/api/merchants` returns list items and `/api/merchants/{id}` returns detail items with `industries`.

- [ ] **Step 2: Update `backend/models.py` definitions**

```python
class MerchantBase(BaseModel):
    id: str
    tax_id: Optional[str] = None
    name: str
    category: Optional[str] = None
    address: Optional[str] = None
    zip_code: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    note: Optional[str] = None

class MerchantListItem(MerchantBase):
    lat: Optional[float] = None
    lon: Optional[float] = None
    distance_km: Optional[float] = None

class MerchantDetail(MerchantListItem):
    industries: List[IndustryInfo] = []

class PaginatedMerchants(BaseModel):
    total: int
    page: int
    per_page: int
    total_pages: int
    items: List[MerchantListItem]
```

- [ ] **Step 3: Update `backend/routers/merchants.py` endpoint annotations and `radius_km` max bound**

Set `radius_km: float = Query(2.0, ge=0.1, le=20.0)`. Update `response_model` annotations.

- [ ] **Step 4: Run pytest to verify all search API tests pass**

Run: `PYTHONPATH=. .venv/bin/pytest backend/tests`
Expected: PASS

---

### Task 4: Comprehensive Verification

- [ ] **Step 1: Run full Pytest suite**

Run: `PYTHONPATH=. .venv/bin/pytest backend/tests -v`
Expected: ALL 30+ tests PASS.

- [ ] **Step 2: Frontend Build Check**

Run: `cd frontend && npm run build`
Expected: Build finishes cleanly with zero TypeScript / ESLint errors.
