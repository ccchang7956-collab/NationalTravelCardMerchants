# Task 3 實作與測試報告：前端頁面篩選狀態與 API 串接

## 1. 實作內容 (What you implemented)
- **修改地圖頁面 API 請求與 URL 參數綁定** (`frontend/src/app/map/page.tsx`)：
  - 更新 `updateURL` 回呼，加入 `industry_code` 參數。如果 `industry_code` 存在，則動態追加 `industry_code` 參數，以便隨時同步篩選狀態到網址中，支援使用者直接分享地圖篩選結果或進行瀏覽器歷史瀏覽。
  - 更新 `fetchNearby` 函式，支援 `industryCode` 參數。在呼叫後端 API `/api/merchants/nearby` 時，如果 `industryCode` 不為空值，則動態追加 `&industry_code=${encodeURIComponent(indCode)}` 以獲取特定行業別的特約商店。
  - 在 `useEffect` 監聽與雙向綁定邏輯中同步 `industry_code` 的網址變化，並使 `fetchNearby` 在參數改變時能自動觸發更新。
  - 更新元件內的各種地圖互動回呼（如點擊地圖 `handleMapClick`、輸入地址 `handleAddressSelect`、搜尋關鍵字 `handleKeywordSearch`、定位 `handleLocate` 等），在呼叫 `fetchNearby` 時皆帶入當前 `filterState.industryCode`。

- **更新首頁與首頁搜尋轉導邏輯** (`frontend/src/app/page.tsx`)：
  - 在 `Home` 首頁伺服器元件（RSC）中，從網址參數解析出 `industry_code`。
  - 當向後端 `/api/merchants` 發送請求時，動態將 `industry_code` 追加至 API 查詢字串中。
  - 在翻頁重定向（`redirect`）、分頁按鈕網址生成（`buildPageUrl`）以及跳頁輸入表單的隱藏欄位中，皆完整串接並帶入 `industry_code` 參數。
  - 修改特約商店列表卡片，點擊右上角的地圖按鈕（在地圖上查看）跳轉至 `/map` 頁面時，若當前有行業別篩選狀態，則動態將 `industry_code` 追加到 URL 參數中。

- **更新首頁搜尋區塊狀態與表單提交** (`frontend/src/components/HomeSearchSection.tsx`)：
  - 在 `handleFilterChange` 邏輯中，確保行業別篩選值 `newFilters.industryCode` 正確寫入 `industry_code` 網址參數中。
  - 在 `HomeSearchSection` 的表單內，新增隱藏輸入欄位 `<input type="hidden" name="industry_code" value={filters.industryCode} />`，確保點擊「搜尋」提交表單時能順利將行業別狀態傳遞給後端。

## 2. 測試內容與編譯結果 (What you tested and compile results)
- **後端 API 整合測試**：
  - 執行 `PYTHONPATH=. pytest backend/tests/ -v`。
  - 測試結果：全數測試通過 (25 passed, 0 failed, 6 warnings)。
- **前端編譯建置測試**：
  - 執行 `npm run build --prefix frontend`。
  - 測試結果：編譯順利通過 (Compiled successfully)，沒有任何 TypeScript 或語法錯誤。

## 3. 變更的檔案 (Files changed)
- [frontend/src/app/map/page.tsx](file:///Users/ccchang/Project/NationalTravelCardMerchants/frontend/src/app/map/page.tsx) (修改)
- [frontend/src/app/page.tsx](file:///Users/ccchang/Project/NationalTravelCardMerchants/frontend/src/app/page.tsx) (修改)
- [frontend/src/components/HomeSearchSection.tsx](file:///Users/ccchang/Project/NationalTravelCardMerchants/frontend/src/components/HomeSearchSection.tsx) (修改)

## 4. 自為審查發現 (Self-review findings)
- 所有頁面的行業別篩選功能已完整串接後端 API。
- URL 狀態雙向綁定正常，無論是透過搜尋提交、篩選套用，或是列表卡片跳轉至地圖，都能正確傳遞、套用並渲染最新的行業別資料。

## 5. 問題或疑慮 (Any issues or concerns)
- 無。

## 6. Fix Subagent 修正紀錄
- **狀態不同步問題修正**：
  - 在 [HomeSearchSection.tsx](file:///Users/ccchang/Project/NationalTravelCardMerchants/frontend/src/components/HomeSearchSection.tsx) 中，加入 `useEffect` 監聽 `initialFilters` 的變化。當外部 props 或是瀏覽器上下一步歷史導航更新了首頁搜尋元件的 `initialFilters` 時，能即時同步更新元件內部的 `filters` state。
- **重新驗證前端編譯**：
  - 執行 `npm run build --prefix frontend`。
  - 編譯結果：建置成功 (Compiled successfully)，無任何 TypeScript 或是 Next.js build 錯誤。

## 7. 最終審查修正 (Final Code Review Fixes)
- **前端 API 請求主機 (API_URL)**：
  - 在 [FilterSheet.tsx](file:///Users/ccchang/Project/NationalTravelCardMerchants/frontend/src/components/FilterSheet.tsx) 中定義 `API_URL`：
    ```typescript
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
    ```
    並將原本的相對路徑 `fetch("/api/industries")` 修改為使用絕對路徑 `fetch(`${API_URL}/api/industries`)`，避免本地端前端開發 (port 3000) 呼叫時發生 404 錯誤。
- **優化 useEffect 依賴陣列**：
  - 在 [HomeSearchSection.tsx](file:///Users/ccchang/Project/NationalTravelCardMerchants/frontend/src/components/HomeSearchSection.tsx) 中，調整監聽 `initialFilters` 的依賴陣列為具體欄位：`initialFilters.city`、`initialFilters.hasWebsite`、`initialFilters.radiusKm`、`initialFilters.industryCode`，防止因物件參照變更導致不必要的重複渲染與 API 請求。
- **後端 Pydantic 模型與 API 路由優化**：
  - 在 [models.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/models.py) 中定義新模型 `IndustryInfo` 用於動態行業別下拉選單。
  - 在 [merchants.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/routers/merchants.py) 中：
    - 匯入 `IndustryInfo` 並將 `get_industries` 路由的 `response_model` 修改為 `List[IndustryInfo]`。
    - 移除唯讀查詢中多餘的 `db.execute("PRAGMA foreign_keys = ON;")`。
    - 改以 Column Name Key 取得 SQL 查詢結果欄位以防出錯：`row["industry_code"]`、`row["industry_name"]`。
- **編譯與測試驗證**：
  - 後端測試：執行 `PYTHONPATH=. pytest backend/tests/ -v`，25 項測試皆全數通過。
  - 前端建置：執行 `npm run build --prefix frontend`，前端靜態頁面編譯建置成功。
