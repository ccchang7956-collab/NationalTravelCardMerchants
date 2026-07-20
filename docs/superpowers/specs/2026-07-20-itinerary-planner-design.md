# 國旅卡旅遊行程與路線規劃器 設計規格書 (Design Spec)

> **建立日期**：2026-07-20  
> **專案名稱**：國民旅遊卡特約商店系統 (National Travel Card Merchants)  
> **功能主題**：旅遊行程與路線規劃器 (Itinerary & Route Planner)  

---

## 1. 概述 (Overview)

本功能為國民旅遊卡特約商店系統擴充「旅遊行程與路線規劃器」，幫助公務人員與一般使用者在休假出遊前，能從全台 55,000+ 筆特約商店資料庫及「個人收藏夾」中挑選欲造訪的店家，自動規劃最順路的旅遊行程、計算預估可核銷之觀光/自行運用額度，並可一鍵匯出至 Google Maps 進行多站導航。

---

## 2. 功能需求與使用情境 (Requirements & User Stories)

1. **一鍵挑選與建立行程**：使用者可從「我的收藏」或搜尋頁面勾選 1~10 家特約商店，建立包含日期與名稱的旅遊行程。
2. **自動順路優化 (Route Optimization)**：系統基於各站點的經緯度 (`lat`, `lon`)，採用 Nearest Neighbor / TSP 演算法自動計算最順路的造訪順序與預估行車距離。
3. **額度試算與進度整合**：根據行程中特店的分類（觀光旅遊 / 自行運用），自動計算並顯示該行程預計可核銷的額度金額與剩餘額度。
4. **地圖視覺化與時間軸**：
   - 時間軸清單：顯示順序 (1, 2, 3...)、店家名稱、地址、額度類別、預計停留時間。
   - Leaflet 地圖：以帶數字的 Marker 標示站點，並繪製路線連線 (Polyline)。
5. **Google Maps 多站導航匯出**：產生 Google Maps 導航 URL（`https://www.google.com/maps/dir/?api=1&origin=...&destination=...&waypoints=...`），便於行動端一鍵開啟導航。
6. **完整單元與整合測試**：後端與前端皆需編寫自動化測試，確保 CRUD、TSP 排序正確性與權限防範。

---

## 3. 系統架構與資料庫設計 (Architecture & Data Model)

### 3.1 資料庫 Schema

在 `backend/database.py` 中新增以下兩張資料表：

```sql
CREATE TABLE IF NOT EXISTS user_itineraries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    start_date TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS itinerary_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    itinerary_id INTEGER NOT NULL,
    merchant_id INTEGER,
    custom_name TEXT NOT NULL,
    address TEXT,
    lat REAL,
    lon REAL,
    order_index INTEGER NOT NULL,
    estimated_cost REAL DEFAULT 0,
    quota_category TEXT DEFAULT '一般消費',
    stay_minutes INTEGER DEFAULT 60,
    FOREIGN KEY (itinerary_id) REFERENCES user_itineraries (id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE SET NULL
);
```

### 3.2 後端 API 設計 (`backend/routers/itineraries.py`)

* `POST /api/itineraries`
  * 請求內文：`{ title: string, start_date?: string, notes?: string, items: Array<{ merchant_id?: number, custom_name: string, address?: string, lat?: number, lon?: number, estimated_cost?: number, quota_category?: string, stay_minutes?: number }> }`
  * 回應：建立好的行程完整資料。
* `GET /api/itineraries`
  * 權限：需登入。
  * 回應：目前使用者的行程列表（包含總站數與額度加總）。
* `GET /api/itineraries/{id}`
  * 權限：需登入且為擁有者。
  * 回應：行程與下屬 `itinerary_items` 陣列（依 `order_index` 排序）。
* `PUT /api/itineraries/{id}`
  * 請求內文：更新行程標題、日期、備註或重新設定 `items` 順序與內容。
* `DELETE /api/itineraries/{id}`
  * 刪除指定行程及其站點。
* `POST /api/itineraries/optimize`
  * 請求內文：`{ points: Array<{ id: string|number, lat: number, lon: number }> }`
  * 回應：最佳排序後的點位陣列與預估總距離 (km)。

---

## 4. 前端介面與元件設計 (Frontend Design)

### 4.1 頁面結構

* `src/app/itinerary/page.tsx`：行程管理列表頁面，支援新建行程與瀏覽歷史行程。
* `src/app/itinerary/[id]/page.tsx`：行程詳情編輯頁面，包含左側/上方時間軸卡片與右側/下方 Leaflet 地圖展示。

### 4.2 核心元件

* `CreateItineraryModal.tsx`：從我的收藏中勾選店家快速建立行程。
* `ItineraryMapView.tsx`：使用 Leaflet 繪製帶數字標籤的 Marker 與路線連線。
* `GoogleMapsExportButton.tsx`：轉換行程地點為 Google Maps 多站導航網址並開啟新分頁/App。

---

## 5. 測試規劃 (Testing Strategy)

### 5.1 後端測試 (`backend/tests/test_itineraries.py`)

1. **CRUD 與權限測試**：驗證使用者僅能對自己的行程進行操作，跨使用者讀寫應回傳 403/404。
2. **TSP 順路演算法測試**：以台北、桃園、新竹三點測試，驗證最適排序演算法能產出極小化總距離的順序。
3. **連帶刪除測試**：測試刪除 `user_itineraries` 時，`itinerary_items` 亦一併被刪除。

### 5.2 前端單元邏輯驗證

1. **Google Maps 導航網址轉換測試**：驗證經緯度/地址陣列正確轉譯為帶 `origin`, `destination`, `waypoints` 的 Google Maps URL。
2. **額度加總統計測試**：驗證包含觀光旅遊與自行運用項目的行程，其金額累加無誤。

---

## 6. 部署與效能考量 (Performance & Security)

- 在 `user_itineraries(user_id)` 與 `itinerary_items(itinerary_id, order_index)` 建立索引，確保高效率查詢。
- 所有行程編輯與查詢皆通過 JWT Auth 中間件過濾，避免存取權限越界。
