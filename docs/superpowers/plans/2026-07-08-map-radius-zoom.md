# 地圖比例隨搜尋半徑動態縮放實作計畫 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在地圖模式中，當搜尋半徑或搜尋中心改變時，動態繪製對應半徑的 Leaflet 圓圈，並自動調用 `map.fitBounds` 使圓圈完整呈現在地圖視野中，且包含完整的測試驗證。

**Architecture:** 
1. 將 `radius` 狀態從 `page.tsx` 傳遞至 `MapView.tsx`。
2. 在 `MapView.tsx` 中使用 `useRef` 維護一個 `circle` 實例，避免重複建立 Leaflet 物件。
3. 移除舊有的 `setView` 邏輯，並透過 `useEffect` 監聽 `radius`、`center` 和 `userLocation` 進行圓圈重繪與 `map.fitBounds` 自動視野貼合。

**Tech Stack:** React, Next.js, Leaflet, TailwindCSS

## Global Constraints
- 所有修改均須確保不破壞地圖的原有功能（如店家 Marker 點擊、Sidebar 列表同步等）。
- 必須使用繁體中文。
- 測試與驗證必須包含手動測試步驟。

---

### Task 1: 傳遞半徑參數給 MapView

**Files:**
- Modify: `frontend/src/app/map/page.tsx` (第 240-255 行)

**Interfaces:**
- Consumes: `radius` 狀態 (number)
- Produces: 新增 `radius={radius}` prop 傳遞給 `<MapView>` 元件

- [ ] **Step 1: 修改 page.tsx 傳遞 radius prop**

尋找 `frontend/src/app/map/page.tsx` 中渲染 `<MapView>` 的程式碼：
```typescript
          <MapView
            merchants={merchants}
            center={center}
            userLocation={userLocation}
            onMapClick={handleMapClick}
            selectedMerchant={selectedMerchant}
            onSelectMerchant={setSelectedMerchant}
          />
```
將其修改為：
```typescript
          <MapView
            merchants={merchants}
            center={center}
            userLocation={userLocation}
            onMapClick={handleMapClick}
            selectedMerchant={selectedMerchant}
            onSelectMerchant={setSelectedMerchant}
            radius={radius}
          />
```

- [ ] **Step 2: 驗證 page.tsx 語法正確**

確認專案可正常編譯（這時 `MapView` 尚未支援此屬性，Typescript 編譯會暫時報錯，屬於預期結果）。

---

### Task 2: 實作 MapView.tsx 的圓圈繪製與比例動態縮放

**Files:**
- Modify: `frontend/src/components/MapView.tsx`

**Interfaces:**
- Consumes: `radius` prop
- Produces: 地圖上的半透明搜尋半徑圓圈，以及地圖視野的自動貼合 (fitBounds)

- [ ] **Step 1: 修改 MapViewProps 介面定義**

在 `frontend/src/components/MapView.tsx` 的 `interface MapViewProps` 新增 `radius: number;`：
```typescript
interface MapViewProps {
  merchants: Merchant[];
  center: [number, number];
  userLocation: [number, number] | null;
  onMapClick: (lat: number, lon: number) => void;
  selectedMerchant: Merchant | null;
  onSelectMerchant: (m: Merchant) => void;
  radius: number; // 新增
}
```

- [ ] **Step 2: 在 MapView 元件接收 radius 參數**

```typescript
export default function MapView({
  merchants,
  center,
  userLocation,
  onMapClick,
  selectedMerchant,
  onSelectMerchant,
  radius, // 新增
}: MapViewProps) {
```

- [ ] **Step 3: 新增 circleRef 並修改地圖銷毀邏輯**

在 `MapView` 元件內部的 `useRef` 區域，新增 `circleRef`：
```typescript
  const circleRef = useRef<any>(null);
```
並在初始化地圖的第一個 `useEffect` 中的 return 清理函數內（約第 109-116 行），加入銷毀圓圈的邏輯：
```typescript
    return () => {
      isMounted = false;
      setMapReady(false);
      if (circleRef.current && mapRef.current) {
        mapRef.current.removeLayer(circleRef.current);
        circleRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
```

- [ ] **Step 4: 註解或移除原本與 fitBounds 衝突的 center 監聽器**

尋找並移除或註解以下程式碼（約第 257-260 行）：
```typescript
  // Pan map when center changes
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView(center, mapRef.current.getZoom(), { animate: true });
  }, [center]);
```

- [ ] **Step 5: 新增動態圓圈繪製與 fitBounds 貼合的 useEffect**

在元件內新增以下 `useEffect`：
```typescript
  // Update radius circle and fit bounds dynamically
  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;

    // 1. 決定中心點位置與其對應的圓圈顏色
    const circleCenter = userLocation || center;
    const isUserLoc = !!userLocation;
    const strokeColor = isUserLoc ? "#3B82F6" : "#10B981"; // 使用者定位用藍色，自選中心用綠色

    // 2. 建立或更新 L.circle 物件
    if (circleRef.current) {
      circleRef.current.setLatLng(circleCenter);
      circleRef.current.setRadius(radius * 1000);
      circleRef.current.setStyle({
        color: strokeColor,
        fillColor: strokeColor,
      });
    } else {
      circleRef.current = L.circle(circleCenter, {
        radius: radius * 1000,
        color: strokeColor,
        fillColor: strokeColor,
        weight: 1,
        opacity: 0.6,
        fillOpacity: 0.06,
        interactive: false, // 不攔截點擊事件，以便點擊圓圈範圍內的店家 Marker
      }).addTo(map);
    }

    // 3. 自動貼合地圖邊界
    map.fitBounds(circleRef.current.getBounds(), {
      padding: [20, 20],
      animate: true,
    });
  }, [radius, center, userLocation, mapReady]);
```

---

### Task 3: 測試與驗證

本任務專注於在本地環境執行測試與手動驗證，確保沒有編譯錯誤且功能符合預期。

- [ ] **Step 1: 檢查 Typescript 編譯錯誤**

在終端機中，切換到 `frontend` 目錄並執行：
```bash
npm run build
```
預期結果：專案可以成功打包 build，沒有任何 Typescript 語法或 Props 錯誤。

- [ ] **Step 2: 啟動本地開發伺服器進行手動功能驗證**

執行以下命令啟動專案（通常包含後端與前端）：
```bash
# 在專案根目錄下
./start.sh
```
或手動在 `frontend` 執行 `npm run dev` 並在 `backend` 執行 FastAPI。
打開瀏覽器至：`http://localhost:3000/map` （依專案實際連接埠而定，通常為 3000）。

- [ ] **Step 3: 驗證地圖基本載入**
- 預期結果：地圖應成功載入。若預設的 `radius` 存在（預設值為 2），地圖上應以台北 101 週邊（`DEFAULT_CENTER`）為圓心，繪製一個半透明綠色、半徑為 2km 的圓圈。地圖的比例應自動縮放到剛好能完整看到此圓圈的邊界。

- [ ] **Step 4: 驗證半徑拖曳**
- 操作：拉動半徑 slider 從 2km 到 0.5km。
- 預期結果：綠色圓圈會縮小，同時地圖自動放大（Zoom In）至剛好包覆 0.5km 圓圈。
- 操作：拉動半徑 slider 到 5km 或 10km。
- 預期結果：綠色圓圈會放大，同時地圖自動縮小（Zoom Out）至剛好包覆 10km 圓圈。

- [ ] **Step 5: 驗證定位與中心點切換**
- 操作：點擊「定位我的位置」或在地圖上任意點擊新中心。
- 預期結果：圓圈移動至新中心。若點擊「定位我的位置」，圓圈應變成藍色；點擊地圖時圓圈應變成綠色。地圖視野應自動重新計算 bounds 並平滑過渡（Pan & Zoom）。

- [ ] **Step 6: 驗證 Marker 點擊功能**
- 操作：在圓圈內尋找店家標記，點擊店家 Marker。
- 預期結果：彈出 Popup 視窗，顯示店家詳細資訊與「查看詳情」按鈕。點擊「查看詳情」能正常跳轉。
- 備註：這可驗證 `circle` 的 `interactive: false` 屬性起作用，沒有攔截 Marker 的滑鼠點擊。

---

### Task 4: Git 提交與收尾

- [ ] **Step 1: 將修改檔案提交**

執行：
```bash
git add frontend/src/app/map/page.tsx frontend/src/components/MapView.tsx
git commit -m "feat: implement dynamic map scaling based on search radius with leaflet circle"
```
