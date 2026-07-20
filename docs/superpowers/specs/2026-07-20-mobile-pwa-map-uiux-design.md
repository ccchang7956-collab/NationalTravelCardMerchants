# 設計規格書：移動端 Map-First UI/UX 升級與 PWA 離線快取機制

- **日期**：2026-07-20
- **專案**：國民旅遊卡特約商店系統 (National Travel Card Merchants)
- **主題**：移動端全地圖主視覺 (Map-First UI/UX)、三段式拖曳面板 (BottomSheet)、深色模式與 PWA 離線地圖快取 (Offline Caching)

---

## 1. 概述 (Overview)

本專案旨在提升國民旅遊卡特約商店系統於移動端 (Mobile) 的使用者體驗 (UI/UX) 與離線可用性 (Offline Availability)。透過重構前端畫面為「Map-First 全螢幕地圖」為主視覺，結合滑動面板 (BottomSheet)、現代化深淺色主題切換、流暢的微互動動畫，以及基於 Workbox / Service Worker 的 PWA 離線地圖與特約店家快取機制，提供貼近 Native App 的高品質使用者體驗。

---

## 2. 核心功能與 UI/UX 設計 (UI/UX Design)

### 2.1 頁面佈局與視圖層次 (Layout & Z-Index Hierarchy)
- **Layer 0 (Z-Index 0)**: `MapView` 全螢幕底圖 (`100vw x 100dvh`)。地圖 Tiles 自動配合主題切換（Light: CartoDB Positron / Dark: CartoDB Dark Matter）。
- **Layer 1 (Z-Index 10)**: 磨砂玻璃 (Glassmorphic) 頂部導覽列 `Navbar`。包含關鍵字搜尋列、產業類別標籤 (Pills)、深淺色主題切換按鈕 (`ThemeToggle`)、離線模式提醒 Badge。
- **Layer 2 (Z-Index 20)**: 右下角地圖懸浮按鈕組 (`LocateFab`, `RadarFab`)，支援彈跳動畫與閃爍微互動。
- **Layer 3 (Z-Index 30)**: 移動端三段式滑動面板 (`MobileBottomSheet.tsx`)。

### 2.2 三段式拖曳面板 (`MobileBottomSheet.tsx`)
基於 `framer-motion` 實現流暢手勢與三階段吸附點 (Snap Points)：
1. **Collapsed (80px)**：收合狀態，僅露出頂部拖曳條與當前附近/搜尋店家數量摘要。
2. **Half (45vh)**：半開狀態，呈現店家列表與分類篩選列。
3. **Full (90vh)**：全開狀態，呈現特約店家完整詳細卡片、額度試算 (觀光旅遊 8,000 / 自由運用 8,000) 與行程加入功能。
- **手勢與滾動處置**：全開狀態時，內部清單支援自訂 Y 軸滾動；滑動至頂部後持續向下拉動會平滑觸發面板收合。

### 2.3 深淺色主題系統 (Dark/Light Theme)
- 使用 CSS Variable 與 Tailwind CSS `dark:` 系統。
- 支援系統偏好預設 (`prefers-color-scheme`) 與 LocalStorage 偏好記住。
- **地圖 Tiles 動態切換**：深色模式自動切換為深色地圖 Tiles，確保無縫視覺體驗。

---

## 3. PWA 與離線快取架構 (PWA & Offline Architecture)

### 3.1 Service Worker 快取策略 (`sw.ts` / Workbox)
1. **App Shell & 靜態資源**：Precache 快取 HTML, CSS, JS, Fonts。
2. **API 回應 (Stale-While-Revalidate)**：快取 `/api/merchants` 搜尋結果至 CacheStorage/IndexedDB，斷線時自動讀取最新歷史搜尋。
3. **地圖 Tiles (CacheFirst)**：快取 Leaflet 地圖 Tiles 圖片，設定 500 張上限與 7 天 TTL 過期機制。

### 3.2 離線狀態監控與 UI (`PWAOfflineBanner.tsx`)
- 動態監聽 `window.addEventListener('offline')` / `'online'`。
- 斷線時於 Navbar 頂部顯示「離線模式（讀取快取圖資與店家資料）」通知 Badge。

---

## 4. 測試與驗證程序 (Testing & Verification Procedures)

### 4.1 自動化單元與元件測試 (Unit & Component Tests)
- **`MobileBottomSheet.test.tsx`**：
  - 驗證預設 `Collapsed` 狀態 (80px)。
  - 模擬 Touch Event 拖曳，驗證 Snap Points 狀態切換。
  - 驗證手勢事件衝突保護。
- **`ThemeProvider.test.tsx`**：
  - 驗證主題切換對 `<html>` tag 的 `dark` class 影響。
  - 驗證 LocalStorage 持久化儲存。
- **`PWAOfflineBanner.test.tsx`**：
  - 模擬 `online`/`offline` 事件切換，驗證 Banner 顯隱。

### 4.2 PWA 與離線快取驗證程序
- **Service Worker 狀態確認**：在 Chrome DevTools (Application > Service Workers) 確認 SW `activated`。
- **Network Offline 斷線測試**：
  - 在 DevTools Network 選擇 `Offline`。
  - 重新載入，確認 App Shell 無縫開啟。
  - 驗證離線模式下能搜尋並檢視已快取之店家與地圖瓦片。
- **Lighthouse PWA 審核**：通過 Lighthouse PWA 測試標準。

### 4.3 UI 響應式與手勢驗證
- **多尺寸裝置適配**：測試 iPhone SE (375px)、iPhone 14/15 Pro (393px)、Pixel 7 (412px)。
- **iOS Safe Area**：適配 `env(safe-area-inset-bottom)` 保護區邊界。
