# 設計規格書：國旅卡特店行業別篩選器整合規劃

## 1. 目的
本規劃旨在為國旅卡特店專案的搜尋與篩選器導入「行業別」篩選功能。使用者可於前端地圖頁面或首頁的「篩選條件（FilterSheet）」面板中，透過下拉選單動態點選行業別類別（例如：旅宿業、餐館業等），並能將篩選條件發送至後端 API，實現高效率的店家行業別篩選與過濾。

---

## 2. 後端設計 (Backend API)

### 2.1 新增行業別選單 API (`GET /api/industries`)
* **URL 路由**：`/api/industries`
* **響應模型**：`List[dict]`，格式為 `[{"industry_code": "561115", "industry_name": "餐館業"}, ...]`。
* **行為**：
  使用 `DISTINCT` 從資料庫的 `merchant_industries` 表中撈取目前所有已被關聯使用的行業別代碼與名稱，並依 `industry_code` 升冪排序。

### 2.2 修改搜尋與附近 API (`GET /api/merchants` & `GET /api/merchants/nearby`)
* **URL 路由**：`/api/merchants` 與 `/api/merchants/nearby`
* **新增參數**：`industry_code: Optional[str] = Query(None)`
* **SQL 查詢異動**：
  若傳入 `industry_code`，在 `where_clauses` 中加入一個 `EXISTS` 子查詢，並搭配前綴模糊匹配（`LIKE ?%`），使大類別（如 `56`）可直接對應子類別（如 `561115`）：
  ```sql
  EXISTS (
      SELECT 1 FROM merchant_industries mi 
      WHERE mi.tax_id = m.tax_id AND mi.industry_code LIKE ?
  )
  ```
  參數 `params` 對應帶入 `f"{industry_code}%"`。

---

## 3. 前端設計 (Frontend UI & Logic)

### 3.1 前端 Filter 狀態擴充
修改 [frontend/src/components/FilterSheet.tsx](file:///Users/ccchang/Project/NationalTravelCardMerchants/frontend/src/components/FilterSheet.tsx)：
* 擴充 `FilterState` 介面，增加 `industryCode: string`。
* 擴充 `DEFAULT_FILTER_STATE` 加上 `industryCode: ""`。
* 擴充 `countActiveFilters` 函數，如果 `filters.industryCode` 有值，則 `count++`。

### 3.2 篩選面板 UI 整合
在 `FilterSheet` 面板的 Body 中（「縣市」選擇器下方），加入「行業別」下拉選擇選單：
* 內部狀態維護：建立 `industries` 狀態陣列，並在 `useEffect`（當 `isOpen` 為 `true` 且 `industries` 為空時）向後端發送 `fetch("/api/industries")` 獲取最新的行業列表。
* UI 渲染：
  ```tsx
  <div>
    <label htmlFor="filter-industry" className="block text-sm font-medium text-foreground mb-2">
      行業別
    </label>
    <select
      id="filter-industry"
      value={draft.industryCode}
      onChange={(e) => setDraft({ ...draft, industryCode: e.target.value })}
      className="w-full px-3 py-2.5 bg-muted-bg border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm"
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

### 3.3 首頁與地圖頁 API 參數串接
* 修改 [frontend/src/app/map/page.tsx](file:///Users/ccchang/Project/NationalTravelCardMerchants/frontend/src/app/map/page.tsx) 的 API fetch 邏輯，若 `filters.industryCode` 有值，則於 URL params 中附帶 `&industry_code=${filters.industryCode}`。
* 修改 [frontend/src/components/HomeSearchSection.tsx](file:///Users/ccchang/Project/NationalTravelCardMerchants/frontend/src/components/HomeSearchSection.tsx) 的搜尋與重導向邏輯，同步將 `industryCode` 以 query parameter 形式在頁面跳轉與 API 請求中傳遞。

---

## 4. 測試與驗證計畫

### 4.1 後端測試 (FastAPI Backend Tests)
* **`test_get_industries_api`**：
  * 向測試資料庫寫入兩筆 `merchant_industries` 記錄。
  * 打 `GET /api/industries` 路由。
  * 驗證回傳的 JSON 資料結構是否精確包含了對應的代碼與名稱，且已排序。
* **`test_merchants_filter_by_industry`**：
  * 向測試資料庫中寫入兩家不同的商店，各自關聯不同行業別。
  * 呼叫 `GET /api/merchants?industry_code={code}`。
  * 驗證回傳的列表僅含有符合該行業別的商店。

### 4.2 前端元件與端到端驗證 (Verification)
* 透過瀏覽器開啟地圖頁面，點選「篩選」按鈕。
* 驗證「行業別」下拉選單有正常發送 `/api/industries` API 請求，並成功加載選項。
* 選擇「餐館業」，點選「套用篩選」，驗證地圖上的店家標記已被成功篩選為餐館業店家，且呼叫了對應的後端網址。
