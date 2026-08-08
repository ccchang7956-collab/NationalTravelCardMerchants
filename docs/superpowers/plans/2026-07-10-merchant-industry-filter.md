# 行業別篩選器整合 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為特店的搜尋與篩選器導入「行業別」動態篩選功能，包含後端 API 對接與前端 FilterSheet 下拉選單整合，並實作完整的測試驗證。

**Architecture:** 
1. 新增 `GET /api/industries` 後端路由，獲取有被使用的行業代碼與名稱。
2. 修改 `GET /api/merchants` 與 `GET /api/merchants/nearby` 路由，支援 `industry_code` query 參數，並使用 `EXISTS` 搭配前綴模糊匹配（`LIKE ?%`）進行 SQL 過濾。
3. 擴充前端 `FilterState` 狀態與 `FilterSheet` 面板，動態載入行業列表並渲染為網頁下拉選擇器（Select）。
4. 更新地圖頁面與首頁搜尋，將篩選狀態拼接到 API 網址並發送。

**Tech Stack:** Python 3, SQLite, FastAPI, Pydantic, TypeScript, React, Next.js, pytest

## Global Constraints
- 資料庫連線必須啟用 `PRAGMA foreign_keys = ON;`，以維持外鍵的 CASCADE 性質。
- 專案中的所有後端程式碼與測試案例必須嚴格遵守 TDD 流程（先寫失敗測試、驗證失敗、實作程式碼、驗證成功、提交）。

---

### Task 1: 後端 API 實作與其單元/整合測試

**Files:**
- Modify: `backend/routers/merchants.py:57-180`
- Modify: `backend/tests/test_search_api.py:40-136`

**Interfaces:**
- Consumes: `GET /api/merchants`、`GET /api/merchants/nearby`
- Produces: 新 API 路由 `GET /api/industries`，以及搜尋 API 對 `industry_code` 參數的支援。

- [ ] **Step 1: 在 `backend/tests/test_search_api.py` 中新增行業篩選與清單的失敗測試**
  
  修改 [backend/tests/test_search_api.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/tests/test_search_api.py)，在 `fixture_db_conn` 中寫入一些模擬的 `merchant_industries` 關係：
  ```python
  # 寫入測試行業別 (台北咖啡店有餐飲與飲料業；彰化大飯店有旅館業)
  conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)", ("11111111", "561115", "餐館業", 1))
  conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)", ("11111111", "561116", "飲料店業", 2))
  conn.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)", ("33333333", "551011", "旅館業", 1))
  ```
  
  並在檔案末尾加入以下兩個測試案例：
  
  ```python
  def test_get_industries_api(db_conn):
      client = TestClient(app)
      response = client.get("/api/industries")
      assert response.status_code == 200
      data = response.json()
      assert len(data) == 3
      assert data[0]["industry_code"] == "551011"
      assert data[0]["industry_name"] == "旅館業"
      assert data[1]["industry_code"] == "561115"
      assert data[1]["industry_name"] == "餐館業"
  
  def test_merchants_filter_by_industry(db_conn):
      client = TestClient(app)
      # 1. 測試精確子類別代碼 (551011)
      response = client.get("/api/merchants?industry_code=551011")
      assert response.status_code == 200
      data = response.json()
      assert data["total"] == 1
      assert data["items"][0]["name"] == "彰化大飯店"
  
      # 2. 測試大類別前綴模糊匹配 (56) - 應該匹配到台北大安咖啡店
      response = client.get("/api/merchants?industry_code=56")
      assert response.status_code == 200
      data = response.json()
      assert data["total"] == 1
      assert data["items"][0]["name"] == "台北大安咖啡店"
  ```

- [ ] **Step 2: 執行測試並驗證它失敗**
  
  Run: `pytest backend/tests/test_search_api.py::test_get_industries_api backend/tests/test_search_api.py::test_merchants_filter_by_industry -v`
  Expected: FAIL (404 Not Found 或者是 Pydantic Validation 錯誤)

- [ ] **Step 3: 實作新 API 路由與過濾邏輯**
  
  修改 [backend/routers/merchants.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/routers/merchants.py)：
  
  1. 於檔案末端（`get_stats` 之前或之後）新增 `get_industries` 路由：
     ```python
     @router.get("/industries", response_model=List[dict])
     def get_industries(db: sqlite3.Connection = Depends(get_db)):
         db.execute("PRAGMA foreign_keys = ON;")
         cursor = db.cursor()
         cursor.execute("""
             SELECT DISTINCT industry_code, industry_name 
             FROM merchant_industries 
             WHERE industry_code != '' AND industry_name != ''
             ORDER BY industry_code ASC
         """)
         return [{"industry_code": row[0], "industry_name": row[1]} for row in cursor.fetchall()]
     ```
  
  2. 修改 `get_merchants` API 路由（L58 之後），新增參數 `industry_code: Optional[str] = Query(None)`，並在 SQL where clauses 組裝處加入：
     ```python
     if industry_code:
         where_clauses.append("""
             EXISTS (
                 SELECT 1 FROM merchant_industries mi 
                 WHERE mi.tax_id = m.tax_id AND mi.industry_code LIKE ?
             )
         """)
         params.append(f"{industry_code}%")
     ```
  
  3. 修改 `get_nearby_merchants` API 路由（L137 之後），同樣新增參數 `industry_code: Optional[str] = Query(None)` 並加上相同的 `EXISTS` SQL 篩選邏輯與 `params` 附加。

- [ ] **Step 4: 執行測試驗證它通過**
  
  Run: `pytest backend/tests/test_search_api.py -v`
  Expected: 22 passed

- [ ] **Step 5: 提交**
  
  ```bash
  git add backend/routers/merchants.py backend/tests/test_search_api.py
  git commit -m "feat: implement industries API and integrate industry_code filter into search/nearby routes"
  ```

---

### Task 2: 前端 `FilterSheet` 元件更新與狀態擴充

**Files:**
- Modify: `frontend/src/components/FilterSheet.tsx`

**Interfaces:**
- Consumes: `/api/industries`
- Produces: 帶有 `industryCode` 狀態與選單的 `FilterSheet` 元件。

- [ ] **Step 1: 擴充 `FilterState` 介面與預設值**
  
  在 [frontend/src/components/FilterSheet.tsx](file:///Users/ccchang/Project/NationalTravelCardMerchants/frontend/src/components/FilterSheet.tsx) 中：
  * 修改 `FilterState` 介面，加入 `industryCode: string;`。
  * 修改 `DEFAULT_FILTER_STATE` 加上 `industryCode: "",`。
  * 修改 `countActiveFilters`，若 `filters.industryCode` 有值，則 count++：
    ```typescript
    if (filters.industryCode) count++;
    ```

- [ ] **Step 2: 載入行業別資料與渲染選單**
  
  修改 [frontend/src/components/FilterSheet.tsx](file:///Users/ccchang/Project/NationalTravelCardMerchants/frontend/src/components/FilterSheet.tsx) 元件：
  
  1. 於元件開頭，宣告行業別 state：
     ```typescript
     const [industries, setIndustries] = useState<Array<{ industry_code: string; industry_name: string }>>([]);
     const [industriesLoading, setIndustriesLoading] = useState(false);
     ```
  
  2. 建立 `useEffect` 當 `isOpen` 被打開時，非同步載入行業別列表：
     ```typescript
     useEffect(() => {
       if (!isOpen || industries.length > 0 || industriesLoading) return;
       setIndustriesLoading(true);
       fetch("/api/industries")
         .then((res) => res.json())
         .then((data) => {
           if (Array.isArray(data)) {
             setIndustries(data);
           }
         })
         .catch((err) => console.error("Failed to fetch industries:", err))
         .finally(() => setIndustriesLoading(false));
     }, [isOpen, industries.length, industriesLoading]);
     ```
  
  3. 在 Body 的「縣市」選擇器（Select）下方（約 L207 之後），新增一個「行業別」選擇器：
     ```tsx
     {/* 行業別 */}
     <div>
       <label htmlFor="filter-industry" className="block text-sm font-medium text-foreground mb-2">
         行業別
       </label>
       <select
         id="filter-industry"
         value={draft.industryCode}
         onChange={(e) => setDraft({ ...draft, industryCode: e.target.value })}
         className="w-full px-3 py-2.5 bg-muted-bg border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all text-sm cursor-pointer"
       >
         <option value="">所有行業</option>
         {industries.map((ind) => (
           <option key={ind.industry_code} value={ind.industry_code}>
             {ind.industry_name} ({ind.industry_code})
           </option>
         ))}
       </select>
     </div>
     ```

- [ ] **Step 3: 驗證元件語法與編譯狀況**
  
  執行前端編譯以驗證 TypeScript 與 React 沒有編譯錯誤。
  Run: `npm run build --prefix frontend`（可選，或直接確認無語法錯誤）

- [ ] **Step 4: 提交**
  
  ```bash
  git add frontend/src/components/FilterSheet.tsx
  git commit -m "frontend: extend FilterState with industryCode and render select dropdown in FilterSheet"
  ```

---

### Task 3: 前端頁面篩選狀態與 API 串接

**Files:**
- Modify: `frontend/src/app/map/page.tsx`
- Modify: `frontend/src/components/HomeSearchSection.tsx`

**Interfaces:**
- Consumes: `FilterState` 中的 `industryCode` 狀態
- Produces: 傳遞 `industry_code` 參數至後端搜尋 API 的頁面邏輯。

- [ ] **Step 1: 修改地圖頁面 API 請求連結**
  
  修改 [frontend/src/app/map/page.tsx](file:///Users/ccchang/Project/NationalTravelCardMerchants/frontend/src/app/map/page.tsx)：
  * 在呼叫 `/api/merchants` 或 `/api/merchants/nearby` 的 URL 組合邏輯中，檢測如果 `filters.industryCode` 不為空值，則動態追加 `&industry_code=${filters.industryCode}`。
  * 例如：
    ```typescript
    if (filters.industryCode) {
      url += `&industry_code=${encodeURIComponent(filters.industryCode)}`;
    }
    ```

- [ ] **Step 2: 修改首頁搜尋重導向邏輯**
  
  修改 [frontend/src/components/HomeSearchSection.tsx](file:///Users/ccchang/Project/NationalTravelCardMerchants/frontend/src/components/HomeSearchSection.tsx)：
  * 在 `FilterSheet` 組件調用處，確保 `filters` 狀態包含 `industryCode`，並在點擊「套用」或在搜尋轉導至 `/map` 頁面時，將 `industry_code` 作為 query string 傳遞。

- [ ] **Step 3: 執行完整的專案編譯與整合測試**
  
  執行前後端所有測試與編譯。
  Run: `PYTHONPATH=. pytest backend/tests/ -v`
  Run: `npm run build --prefix frontend`
  Expected: 全部 PASS 且前端建置無錯誤。

- [ ] **Step 4: 提交**
  
  ```bash
  git add frontend/src/app/map/page.tsx frontend/src/components/HomeSearchSection.tsx
  git commit -m "frontend: integrate industryCode filter state with map page and home search page redirections"
  ```
