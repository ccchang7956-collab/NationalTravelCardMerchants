# PWA 行動端體驗、離線快取與周邊雷達 專案設計規格書

- **日期**：2026-07-20
- **狀態**：已審核通過 (Approved)
- **主要目標**：提升國民旅遊卡特約商店查詢平台之行動端體驗，包含 PWA 手機安裝 (Manifest)、Service Worker (Network-First 離線快取與離線控制台)、手機端「附近雷達」浮動按鈕 (FAB) 與底部抽屜 (Bottom Sheet) 近鄰商店探索。

---

## 1. 系統架構與 PWA 模組設計 (PWA Architecture & Offline Strategy)

### 1.1 Web App Manifest (`public/manifest.json`)
- `name`: "國民旅遊卡特約商店導航秘書"
- `short_name`: "國旅卡秘書"
- `start_url`: "/"
- `display`: "standalone"
- `theme_color`: "#2563eb"
- `background_color`: "#f8fafc"
- `icons`: 提供 192x192 與 512x512 適配手機主畫面的 PNG 圖示。

### 1.2 Service Worker 離線快取與頁面 (`frontend/src/app/offline/page.tsx`)
- 使用 `@ducanh2912/next-pwa` (或動態 Service Worker 配置)。
- **Network-First 策略**：優先發送網路 API 請求；斷網時回傳快取的 API 資料（如 `/api/assistant/favorites`）。
- 離線備用頁面 `/offline`：在缺乏網路時顯示友善控制台與個人快取收藏店家。

---

## 2. 手機端「附近雷達」UI 規格 (Mobile Radar UI & Bottom Sheet)

### 2.1 浮動按鈕 (`frontend/src/components/RadarFab.tsx`)
- 位於畫面右下角 `bottom-20 right-4 z-40`，手機版常駐。
- 具備藍色發光與擴散波紋動畫 (Pulse Ring Animation)，圖示為 `📡 附近雷達`。
- 點擊後喚起 `RadarSheet` 對話框並自動請求手機 GPS 定位。

### 2.2 探索抽屜 (`frontend/src/components/RadarSheet.tsx`)
- 呼叫 HTML5 `navigator.geolocation.getCurrentPosition()`。
- 半徑切換：`0.5 km` / `1.0 km` / `2.0 km`。
- API: GET `/api/merchants/nearby?lat=...&lon=...&radius_km=...`
- 呈現卡片：店家名稱、距離 (如 `0.15 km`)、地址、行業徽章、❤️ 收藏按鈕、➕ 記帳按鈕與 Google Maps 導航連結。
- 備援機制：GPS 權限被拒絕或斷網時，提供地址手動搜尋輸入框及離線快取提醒。

---

## 3. 自動化測試與驗證計畫 (Testing & Verification Plan)

### 3.1 前端與 PWA 驗證
- 驗證 `manifest.json` 符合 W3C PWA 規範。
- 驗證 Service Worker 離線模式下能載入 `/offline` 與快取的「我的收藏」。
- 驗證 `RadarFab.tsx` 與 `RadarSheet.tsx` 響應式佈局 (375px ~ 430px) 與 GPS 座標獲取。
- 執行 `npm run lint` 確保 0 Errors / 0 Warnings。
- 執行 `npm run build` 確保 PWA 打包與 Next.js 靜態頁面產生完全成功。

### 3.2 後端相容性驗證
- 執行 `PYTHONPATH=. .venv/bin/pytest backend/tests/` 確保 33 項測試持續 100% 通過。
