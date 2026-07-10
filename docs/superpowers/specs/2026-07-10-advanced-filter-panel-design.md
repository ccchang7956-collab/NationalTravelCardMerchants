# 進階篩選面板 — 設計規格

**日期**：2026-07-10  
**狀態**：待實作  
**功能**：進階篩選面板（Bottom Sheet）  

---

## 1. 背景與目標

### 問題描述
目前首頁的篩選功能分散（縣市 dropdown 在搜尋列旁、郵遞區號在 URL 參數）、地圖頁完全沒有篩選能力，使用者無法組合多條件進行精準查詢。

### 目標
- 提供統一的進階篩選介面，支援多條件組合篩選
- 以手機體驗為優先設計
- 首頁（`/`）與地圖頁（`/map`）都整合此元件
- 篩選條件對兩種使用情境均適用：一般旅遊規劃 & 公務批量查詢

---

## 2. 篩選條件規格

| 條件 | 類型 | API 參數 | 備註 |
|------|------|----------|------|
| 縣市 | Dropdown（22 縣市 + 「全部」） | `city` | 現有功能升級為面板內 |
| 有無網站 | Toggle（三態：不限/有/無） | `has_website` | 現有功能整合 |
| 距離範圍 | Slider（0.5/1/2/5/10/20 km） | `radius_km`（搭配定位） | 需 Geolocation API 授權；未授權時此選項 disabled |

---

## 3. 元件架構

### 新增元件

```
frontend/src/components/
└── FilterSheet.tsx          # 核心元件：觸發按鈕 + Bottom Sheet overlay
```

### 元件 Props 介面

```typescript
interface FilterState {
  city: string;                // "" 代表全部
  hasWebsite: boolean | null;  // null=不限, true=有, false=無
  radiusKm: number | null;     // null=不限, 數字=距離km（需定位）
}

interface FilterSheetProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  userLocation?: { lat: number; lon: number } | null;
  onRequestLocation?: () => void;
}
```

### 首頁整合

- 搜尋框右側加入觸發按鈕（顯示已套用項目數）
- `FilterSheet` 作為 Client Component 包在現有搜尋區塊內
- 篩選狀態透過 URL query string 傳遞（`city`、`has_website`、`radius_km`、`lat`、`lon`）

### 地圖頁整合

- 篩選按鈕放在地圖右上角浮動（position: fixed）
- 套用後重新呼叫 `/api/merchants/nearby`
- 狀態存在元件 state，不需 URL 持久化

---

## 4. UI 設計細節

### 觸發按鈕
- 樣式：圓角膠囊按鈕，accent 色 `#C25E40`
- 有條件套用時：右上角顯示數字 badge（套用項目數）
- 未套用任何條件：outline 樣式

### Bottom Sheet 結構

```
╔══════════════════════════════╗  ← overlay（半透明黑）
║  ┌────────────────────────┐  ║
║  │  ━━━━  （拖曳把手）    │  ║
║  │  篩選條件    [清除全部] │  ║
║  │  縣市: [全部▾]         │  ║
║  │  有無官網: [不限][有][無]│  ║
║  │  距離: ○──── 5 km      │  ║
║  │  [套用篩選]            │  ║
║  └────────────────────────┘  ║
╚══════════════════════════════╝
```

### 動畫規格
- 開啟：`translateY(100%) → translateY(0)`，300ms ease-out
- 關閉：`translateY(0) → translateY(100%)`，250ms ease-in
- 支援下滑手勢關閉（超過 80px 觸發）

### 響應式行為
- 手機（< 768px）：寬 100%，高度最大 85vh，圓角在上
- 桌機（≥ 768px）：置中 modal，最大寬 480px

---

## 5. 地理定位處理

- 首次點擊距離 Slider 時觸發 `navigator.geolocation.getCurrentPosition()`
- 授權拒絕：Slider disabled，顯示提示
- 定位成功：Slider 啟用，座標存在 state
- 定位座標不寫入 localStorage（隱私考量）

---

## 6. 無障礙設計

- Bottom Sheet 開啟時：focus trap、`aria-modal="true"`、`role="dialog"`
- 按 `Escape` 鍵關閉

---

## 7. 不在此次範圍內

- 郵遞區號範圍篩選
- 儲存篩選條件到 localStorage
- 商家分類篩選
- 多縣市同時勾選

---

## 8. 影響評估

### 後端變動
**無需修改**：`/api/merchants` 和 `/api/merchants/nearby` 均已支援所需參數

### 前端變動

| 檔案 | 變動類型 | 說明 |
|------|----------|------|
| `src/components/FilterSheet.tsx` | **新增** | 核心元件 |
| `app/page.tsx` | **修改** | 整合 FilterSheet，擴充 URL 參數處理 |
| `app/map/page.tsx` | **修改** | 整合 FilterSheet，地圖右上角浮動按鈕 |
| `app/globals.css` | **修改** | 新增 bottom sheet 動畫、overlay 樣式 |
