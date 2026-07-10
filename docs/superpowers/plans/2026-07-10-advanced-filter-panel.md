# Advanced Filter Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在首頁（`/`）與地圖頁（`/map`）加入進階篩選面板（Bottom Sheet），支援縣市、有無網站、距離範圍三種條件組合篩選。

**Architecture:** 新增 `FilterSheet.tsx` 為共用 Client Component，包含觸發按鈕與 Bottom Sheet overlay。首頁透過 URL query string 持久化篩選條件（SSR 友好），地圖頁透過元件 state 管理篩選條件並重新呼叫 `/api/merchants/nearby`。後端 API 無需修改。

**Tech Stack:** Next.js App Router、React 19、TypeScript 5、Tailwind CSS 4、Heroicons 2、瀏覽器 Geolocation API

## Global Constraints

- Next.js 16.2.6，所有新 Client Component 必須加 `"use client"` 指示詞
- Tailwind CSS 4 語法（`@theme` 變數已在 `globals.css` 定義）；使用現有 CSS 變數：`accent = #C25E40`、`accent-hover = #A74E33`、`card = #FFFFFF`、`border = #E8E5E1`、`muted = #8C8A87`、`muted-bg = #F4F2EE`
- 使用 Heroicons 24/outline（已安裝）
- 不修改後端任何程式碼
- 動畫使用純 CSS transition（不引入新動畫套件）
- 縣市列表與首頁現有 `TAIWAN_CITIES` 陣列完全一致（22 縣市）
- 距離 Slider 固定步階：`[0.5, 1, 2, 5, 10, 20]` km

---

## Task 1: 建立 FilterSheet 元件（核心 UI + 動畫）

**Files:**
- Create: `frontend/src/components/FilterSheet.tsx`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Produces:
  ```typescript
  // FilterState 型別（後續 Task 使用）
  export interface FilterState {
    city: string;               // "" = 全部
    hasWebsite: boolean | null; // null=不限, true=有, false=無
    radiusKm: number | null;    // null=不限, 數字=距離km
  }

  // FilterSheet Props（後續 Task 使用）
  interface FilterSheetProps {
    filters: FilterState;
    cities: string[];                              // 縣市清單（含商家數量顯示用）
    onChange: (filters: FilterState) => void;
    userLocation: { lat: number; lon: number } | null;
    onRequestLocation: () => void;
    locationLoading: boolean;
    locationError: string | null;
  }

  // 預設篩選狀態（後續 Task 使用）
  export const DEFAULT_FILTER_STATE: FilterState = {
    city: "",
    hasWebsite: null,
    radiusKm: null,
  };
  ```

- [ ] **Step 1: 在 globals.css 新增 Bottom Sheet 動畫樣式**

  修改 `frontend/src/app/globals.css`，在 `@layer base` 區塊後方加入：

  ```css
  @layer utilities {
    .filter-sheet-overlay {
      position: fixed;
      inset: 0;
      background-color: rgba(0, 0, 0, 0);
      z-index: 40;
      transition: background-color 300ms ease-out;
      pointer-events: none;
    }
    .filter-sheet-overlay.open {
      background-color: rgba(0, 0, 0, 0.45);
      pointer-events: auto;
    }
    .filter-sheet-panel {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background-color: var(--color-card);
      border-radius: 20px 20px 0 0;
      z-index: 50;
      max-height: 85vh;
      overflow-y: auto;
      transform: translateY(100%);
      transition: transform 300ms ease-out;
      box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
    }
    .filter-sheet-panel.open {
      transform: translateY(0);
    }
    @media (min-width: 768px) {
      .filter-sheet-overlay {
        display: flex;
        align-items: flex-end;
        justify-content: center;
      }
      .filter-sheet-panel {
        position: fixed;
        left: 50%;
        right: auto;
        bottom: 24px;
        transform: translateX(-50%) translateY(120%);
        width: 100%;
        max-width: 480px;
        border-radius: 20px;
        max-height: 80vh;
      }
      .filter-sheet-panel.open {
        transform: translateX(-50%) translateY(0);
      }
    }
  }
  ```

- [ ] **Step 2: 建立 FilterSheet.tsx**

  建立 `frontend/src/components/FilterSheet.tsx`：

  ```tsx
  "use client";

  import { useState, useEffect, useRef, useCallback } from "react";
  import { AdjustmentsHorizontalIcon, XMarkIcon, MapPinIcon } from "@heroicons/react/24/outline";

  export interface FilterState {
    city: string;
    hasWebsite: boolean | null;
    radiusKm: number | null;
  }

  export const DEFAULT_FILTER_STATE: FilterState = {
    city: "",
    hasWebsite: null,
    radiusKm: null,
  };

  const RADIUS_STEPS = [0.5, 1, 2, 5, 10, 20];

  interface FilterSheetProps {
    filters: FilterState;
    cities: string[];
    onChange: (filters: FilterState) => void;
    userLocation: { lat: number; lon: number } | null;
    onRequestLocation: () => void;
    locationLoading: boolean;
    locationError: string | null;
  }

  function countActiveFilters(filters: FilterState): number {
    let count = 0;
    if (filters.city) count++;
    if (filters.hasWebsite !== null) count++;
    if (filters.radiusKm !== null) count++;
    return count;
  }

  export default function FilterSheet({
    filters,
    cities,
    onChange,
    userLocation,
    onRequestLocation,
    locationLoading,
    locationError,
  }: FilterSheetProps) {
    const [isOpen, setIsOpen] = useState(false);
    // Local draft state — only committed on "套用"
    const [draft, setDraft] = useState<FilterState>(filters);
    const panelRef = useRef<HTMLDivElement>(null);
    // Touch state for swipe-to-close
    const touchStartY = useRef<number | null>(null);

    // Sync draft when filters change externally (e.g. URL navigation)
    useEffect(() => {
      setDraft(filters);
    }, [filters]);

    // Focus trap & Escape key
    useEffect(() => {
      if (!isOpen) return;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setIsOpen(false);
      };
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
      };
    }, [isOpen]);

    const handleOpen = useCallback(() => {
      setDraft(filters); // Reset draft to current applied filters
      setIsOpen(true);
    }, [filters]);

    const handleApply = useCallback(() => {
      onChange(draft);
      setIsOpen(false);
    }, [draft, onChange]);

    const handleClear = useCallback(() => {
      setDraft(DEFAULT_FILTER_STATE);
    }, []);

    const handleOverlayClick = useCallback(() => {
      setIsOpen(false);
    }, []);

    // Swipe-to-close handlers
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
    }, []);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
      if (touchStartY.current === null) return;
      const delta = e.changedTouches[0].clientY - touchStartY.current;
      if (delta > 80) setIsOpen(false);
      touchStartY.current = null;
    }, []);

    const handleRadiusSliderClick = useCallback(() => {
      if (!userLocation && !locationLoading) {
        onRequestLocation();
      }
    }, [userLocation, locationLoading, onRequestLocation]);

    const activeCount = countActiveFilters(filters);

    return (
      <>
        {/* Trigger Button */}
        <button
          id="filter-sheet-trigger"
          onClick={handleOpen}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer shrink-0 ${
            activeCount > 0
              ? "bg-accent text-white hover:bg-accent-hover"
              : "bg-muted-bg text-muted hover:bg-border hover:text-foreground border border-border"
          }`}
        >
          <AdjustmentsHorizontalIcon className="w-4 h-4" />
          篩選
          {activeCount > 0 && (
            <span className="ml-0.5 bg-white text-accent text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {activeCount}
            </span>
          )}
        </button>

        {/* Overlay */}
        <div
          className={`filter-sheet-overlay ${isOpen ? "open" : ""}`}
          onClick={handleOverlayClick}
          aria-hidden="true"
        />

        {/* Bottom Sheet Panel */}
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="filter-sheet-title"
          className={`filter-sheet-panel ${isOpen ? "open" : ""}`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Drag Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div
              className="w-10 h-1 rounded-full bg-border"
              aria-label="拖曳以關閉"
            />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
            <h2 id="filter-sheet-title" className="text-base font-semibold text-foreground">
              篩選條件
            </h2>
            <div className="flex items-center gap-3">
              {activeCount > 0 && (
                <button
                  onClick={handleClear}
                  className="text-sm text-muted hover:text-accent transition-colors cursor-pointer"
                >
                  清除全部
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                aria-label="關閉篩選面板"
                className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-muted-bg transition-colors cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-6">
            {/* City */}
            <div>
              <label htmlFor="filter-city" className="block text-sm font-medium text-foreground mb-2">
                縣市
              </label>
              <div className="relative">
                <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <select
                  id="filter-city"
                  value={draft.city}
                  onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                  className="w-full pl-9 pr-4 py-2.5 bg-muted-bg border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all appearance-none text-sm"
                >
                  <option value="">所有縣市</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Has Website */}
            <div>
              <p className="text-sm font-medium text-foreground mb-2">有無官網</p>
              <div className="flex gap-2">
                {[
                  { label: "不限", value: null },
                  { label: "有", value: true },
                  { label: "無", value: false },
                ].map(({ label, value }) => (
                  <button
                    key={label}
                    onClick={() => setDraft({ ...draft, hasWebsite: value })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer border ${
                      draft.hasWebsite === value
                        ? "bg-accent text-white border-accent"
                        : "bg-muted-bg text-muted border-transparent hover:border-border"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Radius */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground">距離範圍</p>
                {draft.radiusKm !== null && (
                  <span className="text-sm text-accent font-medium">{draft.radiusKm} km</span>
                )}
              </div>

              {!userLocation && !locationLoading && (
                <p className="text-xs text-muted mb-2">
                  需開啟位置權限才能使用距離篩選
                </p>
              )}
              {locationLoading && (
                <p className="text-xs text-muted mb-2 flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin inline-block" />
                  定位中...
                </p>
              )}
              {locationError && (
                <p className="text-xs text-red-500 mb-2">{locationError}</p>
              )}

              <div className="flex flex-wrap gap-2" onClick={handleRadiusSliderClick}>
                {RADIUS_STEPS.map((km) => (
                  <button
                    key={km}
                    disabled={!userLocation}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!userLocation) {
                        onRequestLocation();
                        return;
                      }
                      setDraft({ ...draft, radiusKm: draft.radiusKm === km ? null : km });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all duration-150 border cursor-pointer ${
                      draft.radiusKm === km
                        ? "bg-accent text-white border-accent"
                        : !userLocation
                        ? "bg-muted-bg text-muted/40 border-transparent cursor-not-allowed"
                        : "bg-muted-bg text-muted border-transparent hover:border-border"
                    }`}
                  >
                    {km} km
                  </button>
                ))}
                {draft.radiusKm !== null && (
                  <button
                    onClick={() => setDraft({ ...draft, radiusKm: null })}
                    className="px-3 py-1.5 rounded-lg text-sm text-muted border border-transparent hover:border-border bg-muted-bg transition-all cursor-pointer"
                  >
                    不限
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-6 pt-2">
            <button
              id="filter-sheet-apply"
              onClick={handleApply}
              className="w-full py-3 bg-accent text-white rounded-xl font-semibold text-sm hover:bg-accent-hover transition-colors cursor-pointer"
            >
              套用篩選
              {countActiveFilters(draft) > 0 && (
                <span className="ml-2 opacity-80">（{countActiveFilters(draft)} 項）</span>
              )}
            </button>
          </div>
        </div>
      </>
    );
  }
  ```

- [ ] **Step 3: 驗證元件可編譯**

  ```bash
  cd /Users/ccchang/Project/NationalTravelCardMerchants/frontend
  npx tsc --noEmit 2>&1 | head -40
  ```

  預期：無 `FilterSheet.tsx` 相關錯誤（可能有其他既有警告，忽略即可）

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/ccchang/Project/NationalTravelCardMerchants
  git add frontend/src/components/FilterSheet.tsx frontend/src/app/globals.css
  git commit -m "feat: add FilterSheet component with bottom sheet animation"
  ```

---

## Task 2: 整合至首頁（`/`）

**Files:**
- Create: `frontend/src/components/HomeSearchSection.tsx`
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes from Task 1:
  - `FilterSheet` (default export from `@/components/FilterSheet`)
  - `FilterState` (named export)
  - `DEFAULT_FILTER_STATE` (named export)

- Produces:
  - 首頁篩選狀態透過 URL params 傳遞：`city`, `has_website` (`"true"`/`"false"`), `radius_km` (數字字串), `lat`, `lon`

**背景說明：**
首頁 `page.tsx` 是 Server Component，不能直接用 `useState`。因此把含有篩選面板的互動部分抽出為 Client Component `HomeSearchSection.tsx`，接收 server 傳來的初始值，並在套用篩選時用 `useRouter().push()` 更新 URL 觸發 server re-render。

- [ ] **Step 1: 建立 HomeSearchSection.tsx**

  建立 `frontend/src/components/HomeSearchSection.tsx`：

  ```tsx
  "use client";

  import { useState, useCallback, useRef } from "react";
  import { useRouter } from "next/navigation";
  import Form from "next/form";
  import { MagnifyingGlassIcon, MapPinIcon } from "@heroicons/react/24/outline";
  import FilterSheet, { FilterState, DEFAULT_FILTER_STATE } from "@/components/FilterSheet";

  interface HomeSearchSectionProps {
    initialQ: string;
    initialFilters: FilterState;
    cities: string[];
  }

  export default function HomeSearchSection({
    initialQ,
    initialFilters,
    cities,
  }: HomeSearchSectionProps) {
    const router = useRouter();
    const [filters, setFilters] = useState<FilterState>(initialFilters);
    const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
    const [locationLoading, setLocationLoading] = useState(false);
    const [locationError, setLocationError] = useState<string | null>(null);
    const geoRef = useRef<GeolocationPosition | null>(null);

    const handleRequestLocation = useCallback(() => {
      if (!navigator.geolocation) {
        setLocationError("您的瀏覽器不支援定位功能");
        return;
      }
      setLocationLoading(true);
      setLocationError(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          geoRef.current = pos;
          setUserLocation(loc);
          setLocationLoading(false);
        },
        (err) => {
          setLocationError("定位失敗：" + err.message);
          setLocationLoading(false);
        },
        { enableHighAccuracy: false, timeout: 8000 }
      );
    }, []);

    const handleFilterChange = useCallback(
      (newFilters: FilterState) => {
        setFilters(newFilters);

        // Build new URL with filter params (preserve existing q)
        const currentSearch = new URLSearchParams(window.location.search);
        const q = currentSearch.get("q") || "";

        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (newFilters.city) params.set("city", newFilters.city);
        if (newFilters.hasWebsite !== null)
          params.set("has_website", String(newFilters.hasWebsite));
        if (newFilters.radiusKm !== null && userLocation) {
          params.set("radius_km", String(newFilters.radiusKm));
          params.set("lat", userLocation.lat.toFixed(5));
          params.set("lon", userLocation.lon.toFixed(5));
        }
        params.set("page", "1");

        router.push(`/?${params.toString()}`);
      },
      [router, userLocation]
    );

    return (
      <Form action="/" className="bg-card p-6 rounded-2xl shadow-sm border border-border/60">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search input */}
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="text"
              name="q"
              defaultValue={initialQ}
              placeholder="搜尋店名 or 地址..."
              className="w-full pl-10 pr-4 py-2.5 bg-muted-bg border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
            />
          </div>

          {/* Hidden inputs to carry filter state through form submit */}
          {filters.city && <input type="hidden" name="city" value={filters.city} />}
          {filters.hasWebsite !== null && (
            <input type="hidden" name="has_website" value={String(filters.hasWebsite)} />
          )}
          {filters.radiusKm !== null && userLocation && (
            <>
              <input type="hidden" name="radius_km" value={String(filters.radiusKm)} />
              <input type="hidden" name="lat" value={userLocation.lat.toFixed(5)} />
              <input type="hidden" name="lon" value={userLocation.lon.toFixed(5)} />
            </>
          )}

          {/* Filter Sheet trigger */}
          <FilterSheet
            filters={filters}
            cities={cities}
            onChange={handleFilterChange}
            userLocation={userLocation}
            onRequestLocation={handleRequestLocation}
            locationLoading={locationLoading}
            locationError={locationError}
          />

          <button
            type="submit"
            className="bg-accent text-white px-6 py-2.5 rounded-lg hover:bg-accent-hover transition-colors font-medium"
          >
            搜尋
          </button>
        </div>
      </Form>
    );
  }
  ```

- [ ] **Step 2: 修改 page.tsx 讀取新的 URL 參數並使用 HomeSearchSection**

  在 `frontend/src/app/page.tsx` 做以下修改：

  **2a. 在 import 區塊最後加入：**
  ```tsx
  import HomeSearchSection from "@/components/HomeSearchSection";
  import type { FilterState } from "@/components/FilterSheet";
  ```

  **2b. 在 `Home` 函式的 `resolvedParams` 解構處（約第 47-57 行），擴充解讀新參數：**
  ```tsx
  // 原有
  const q = typeof resolvedParams.q === "string" ? resolvedParams.q : "";
  const parsedPage = typeof resolvedParams.page === "string" ? parseInt(resolvedParams.page, 10) : 1;
  const page = isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
  const city = typeof resolvedParams.city === "string" ? resolvedParams.city : "";

  // 新增（緊接在 city 之後）
  const hasWebsiteParam = resolvedParams.has_website;
  const hasWebsite: boolean | null =
    hasWebsiteParam === "true" ? true : hasWebsiteParam === "false" ? false : null;
  const radiusKm: number | null =
    typeof resolvedParams.radius_km === "string"
      ? parseFloat(resolvedParams.radius_km) || null
      : null;
  const latParam = typeof resolvedParams.lat === "string" ? parseFloat(resolvedParams.lat) : NaN;
  const lonParam = typeof resolvedParams.lon === "string" ? parseFloat(resolvedParams.lon) : NaN;
  ```

  **2c. 修改 query 組建（約第 53-57 行），加入新參數：**
  ```tsx
  const query = new URLSearchParams();
  if (q) query.append("q", q);
  if (city) query.append("city", city);
  if (hasWebsite !== null) query.append("has_website", String(hasWebsite));
  query.append("page", page.toString());
  query.append("per_page", "20");
  ```

  **2d. 建立 initialFilters 物件（在 `return (` 前加入）：**
  ```tsx
  const initialFilters: FilterState = {
    city,
    hasWebsite,
    radiusKm,
  };
  ```

  **2e. 在 JSX 中把原有的 `<Form action="/" ...>` 搜尋區塊（約第 110-141 行）整個替換為：**
  ```tsx
  {/* Search + Filter Section */}
  <HomeSearchSection
    initialQ={q}
    initialFilters={initialFilters}
    cities={TAIWAN_CITIES}
  />
  ```

  **2f. 修改 generateMetadata 函式的 `hasFilters`，加入新參數判斷：**
  ```tsx
  const hasFilters = !!(q || city || resolved.has_website || resolved.radius_km);
  ```

  **2g. 修改分頁連結，保留新參數（約第 207、220、254、271、282 行，所有 `href` 的 URLSearchParams）：**
  - 將所有分頁 `href` 從 `` `/?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}&page=${...}` `` 改為使用 helper 函式：
  
  在 `return (` **前**新增 helper：
  ```tsx
  const buildPageUrl = (targetPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (city) params.set("city", city);
    if (hasWebsite !== null) params.set("has_website", String(hasWebsite));
    if (radiusKm !== null && !isNaN(latParam) && !isNaN(lonParam)) {
      params.set("radius_km", String(radiusKm));
      params.set("lat", latParam.toFixed(5));
      params.set("lon", lonParam.toFixed(5));
    }
    params.set("page", String(targetPage));
    return `/?${params.toString()}`;
  };
  ```
  
  然後把所有分頁 `href` 替換：
  - `href={`/?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}&page=${page - 1}`}` → `href={buildPageUrl(page - 1)}`
  - `href={`/?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}&page=1`}` → `href={buildPageUrl(1)}`
  - `href={`/?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}&page=${p}`}` → `href={buildPageUrl(p)}`
  - `href={`/?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}&page=${totalPages}`}` → `href={buildPageUrl(totalPages)}`
  - `href={`/?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}&page=${page + 1}`}` → `href={buildPageUrl(page + 1)}`

  **2h. 修改跳頁 Form 的 hidden inputs（約第 295-296 行），加入新 hidden input：**
  ```tsx
  {q && <input type="hidden" name="q" value={q} />}
  {city && <input type="hidden" name="city" value={city} />}
  {hasWebsite !== null && <input type="hidden" name="has_website" value={String(hasWebsite)} />}
  {radiusKm !== null && !isNaN(latParam) && !isNaN(lonParam) && (
    <>
      <input type="hidden" name="radius_km" value={String(radiusKm)} />
      <input type="hidden" name="lat" value={latParam.toFixed(5)} />
      <input type="hidden" name="lon" value={lonParam.toFixed(5)} />
    </>
  )}
  ```

  **2i. 修改 API query 加入 `has_website` 傳遞（城市已透過 city 傳入，`has_website` 需傳到 API）：**
  
  在 `query.append("per_page", "20");` 後加入：
  ```tsx
  // 注意：距離篩選（radius_km+lat+lon）不由首頁 API 處理，留待後續功能擴充
  // has_website 傳給 API（後端 /api/merchants 已支援此參數）
  ```
  
  修改 fetch URL 附帶 `has_website`（在 `query` 組建時，`has_website` 已透過 Step 2c 加入 query，所以 `${API_URL}/api/merchants?${query.toString()}` 不需另外修改）。

- [ ] **Step 3: 驗證 TypeScript 編譯**

  ```bash
  cd /Users/ccchang/Project/NationalTravelCardMerchants/frontend
  npx tsc --noEmit 2>&1 | head -40
  ```

  預期：無新錯誤

- [ ] **Step 4: 啟動 dev server 手動測試**

  ```bash
  cd /Users/ccchang/Project/NationalTravelCardMerchants/frontend
  npm run dev
  ```

  測試清單：
  - [ ] 首頁顯示「篩選」按鈕在搜尋框旁
  - [ ] 點擊「篩選」按鈕，Bottom Sheet 從底部滑出
  - [ ] 選擇縣市後點「套用篩選」，URL 更新且商家列表重新載入
  - [ ] 選擇「有網站」後套用，URL 帶 `has_website=true`
  - [ ] 篩選按鈕顯示紅色數字 badge（已套用幾項）
  - [ ] 「清除全部」清空所有條件
  - [ ] 按 `Escape` 關閉面板
  - [ ] 分頁連結保留篩選條件（URL 中 city/has_website 不消失）
  - [ ] 手機尺寸（375px）測試：面板寬滿版、底部圓角

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/ccchang/Project/NationalTravelCardMerchants
  git add frontend/src/components/HomeSearchSection.tsx frontend/src/app/page.tsx
  git commit -m "feat: integrate FilterSheet into homepage with URL persistence"
  ```

---

## Task 3: 整合至地圖頁（`/map`）

**Files:**
- Modify: `frontend/src/app/map/page.tsx`

**Interfaces:**
- Consumes from Task 1:
  - `FilterSheet` (default export from `@/components/FilterSheet`)
  - `FilterState`, `DEFAULT_FILTER_STATE` (named exports)

**背景說明：**
地圖頁 `map/page.tsx` 已是完整的 Client Component。`FilterSheet` 整合到現有的 `MapContent` 函式中，套用篩選後重新呼叫 `fetchNearby`，radius 篩選直接更新現有的 `radius` state（地圖頁本已有 `radius` 和 `userLocation`）。

- [ ] **Step 1: 修改 map/page.tsx，整合 FilterSheet**

  **1a. 在 import 區塊新增：**
  ```tsx
  import FilterSheet, { FilterState, DEFAULT_FILTER_STATE } from "@/components/FilterSheet";
  ```

  **1b. 在 `MapContent` 函式的 state 宣告區（緊接在現有 state 之後，約第 62 行後）新增：**
  ```tsx
  const [filterState, setFilterState] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationGeoError, setLocationGeoError] = useState<string | null>(null);
  ```

  **1c. 新增 `handleRequestLocation` callback（整合進現有的 `handleLocate`，加入 loading/error state）：**

  找到現有的 `handleLocate`（約第 173 行）：
  ```tsx
  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("您的瀏覽器不支援定位功能");
      return;
    }
    setLocationStatus("定位中...");
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(loc);
        setCenter(loc);
        fetchNearby(loc[0], loc[1], radius, keyword);
      },
      (err) => {
        setGeoError("定位失敗：" + err.message);
        setLocationStatus("定位失敗，請手動點擊地圖選擇位置");
      },
      { enableHighAccuracy: false, timeout: 5000 }
    );
  }, [fetchNearby, radius, keyword]);
  ```

  在 `handleLocate` 後新增 `handleFilterRequestLocation`：
  ```tsx
  const handleFilterRequestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationGeoError("您的瀏覽器不支援定位功能");
      return;
    }
    setLocationLoading(true);
    setLocationGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(loc);
        setCenter(loc);
        setLocationLoading(false);
      },
      (err) => {
        setLocationGeoError("定位失敗：" + err.message);
        setLocationLoading(false);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, []);
  ```

  **1d. 新增 `handleFilterChange` callback（在 `handleFilterRequestLocation` 後）：**
  ```tsx
  const handleFilterChange = useCallback(
    (newFilters: FilterState) => {
      setFilterState(newFilters);
      // Apply radius if set and we have a location
      const newRadius = newFilters.radiusKm ?? radius;
      if (newFilters.radiusKm !== null) {
        setRadius(newFilters.radiusKm);
        setTempRadius(newFilters.radiusKm);
      }
      // Re-fetch with updated filters
      fetchNearby(center[0], center[1], newRadius, keyword);
    },
    [fetchNearby, center, radius, keyword]
  );
  ```

  **1e. 在 JSX 的 Controls 區塊中，找到關鍵字搜尋列旁邊的「篩選」按鈕（約第 252-254 行）：**
  ```tsx
  <button onClick={handleKeywordSearch} className="shrink-0 bg-accent px-4 py-2 rounded-lg text-sm text-white font-medium hover:bg-accent-hover transition-colors">
    篩選
  </button>
  ```
  
  將其替換為（在 input 和此按鈕之間插入 FilterSheet，保留原本的「篩選」按鈕改為搜尋按鈕）：
  ```tsx
  <button
    onClick={handleKeywordSearch}
    className="shrink-0 bg-accent px-4 py-2 rounded-lg text-sm text-white font-medium hover:bg-accent-hover transition-colors cursor-pointer"
  >
    搜尋
  </button>
  <FilterSheet
    filters={filterState}
    cities={[
      "基隆市", "台北市", "新北市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
      "台中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "台南市",
      "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "台東縣", "澎湖縣", "金門縣", "連江縣"
    ]}
    onChange={handleFilterChange}
    userLocation={userLocation ? { lat: userLocation[0], lon: userLocation[1] } : null}
    onRequestLocation={handleFilterRequestLocation}
    locationLoading={locationLoading}
    locationError={locationGeoError}
  />
  ```

- [ ] **Step 2: 驗證 TypeScript 編譯**

  ```bash
  cd /Users/ccchang/Project/NationalTravelCardMerchants/frontend
  npx tsc --noEmit 2>&1 | head -40
  ```

  預期：無新錯誤

- [ ] **Step 3: 手動測試地圖頁篩選**

  在 dev server 上（`npm run dev`）測試：
  - [ ] 地圖頁「搜尋關鍵字」旁出現「篩選▾」按鈕
  - [ ] 點擊後 Bottom Sheet 滑出，顯示縣市/有無網站/距離三個條件
  - [ ] 選縣市後套用 → sidebar 的商家列表依縣市篩選（但地圖頁 `nearby` API 無 city 參數，此為預期行為：縣市篩選在地圖頁僅控制 radius/hasWebsite，city 不起作用，此限制可於 footer 說明或留待後續）

  > **已知限制**：地圖頁的 `/api/merchants/nearby` 不支援 `city` 篩選（設計如此，nearby 以距離為主）。FilterSheet 中縣市選項在地圖頁套用時不傳給 API，但 `filterState` 仍記錄，UI badge 仍顯示。未來可考慮在地圖頁隱藏縣市選項。

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/ccchang/Project/NationalTravelCardMerchants
  git add frontend/src/app/map/page.tsx
  git commit -m "feat: integrate FilterSheet into map page"
  ```

---

## Task 4: 最終驗收與收尾

**Files:**
- No new files; 驗證整體功能

- [ ] **Step 1: 確認完整 TypeScript 編譯無誤**

  ```bash
  cd /Users/ccchang/Project/NationalTravelCardMerchants/frontend
  npx tsc --noEmit 2>&1
  ```
  
  預期：零錯誤（可能有既有 any 型別警告，可忽略）

- [ ] **Step 2: Build 確認無 build error**

  ```bash
  cd /Users/ccchang/Project/NationalTravelCardMerchants/frontend
  npm run build 2>&1 | tail -30
  ```
  
  預期：`✓ Compiled successfully` 或 `Route (app)` 輸出，無紅色 Error 行

- [ ] **Step 3: 完整功能驗收清單**

  啟動 dev server (`npm run dev`) 後逐項測試：

  **首頁：**
  - [ ] 篩選按鈕出現在搜尋框右側
  - [ ] 無篩選時：按鈕為 outline 樣式（灰色邊框）
  - [ ] 套用篩選後：按鈕變 accent 色，右上顯示白色數字 badge
  - [ ] Bottom Sheet 滑出動畫流暢（300ms）
  - [ ] 選縣市 → 套用 → URL 帶 `city=xxx` → 列表重新整理
  - [ ] 選有網站 → 套用 → URL 帶 `has_website=true`
  - [ ] 分頁連結保留篩選參數
  - [ ] 跳頁 Form 保留篩選參數
  - [ ] 按 Escape 關閉面板
  - [ ] 下滑手勢關閉面板（手機模擬）
  - [ ] 點選 overlay 背景關閉面板
  - [ ] 「清除全部」重設所有條件（但還未套用，需按「套用篩選」）
  - [ ] 桌機（> 768px）：面板顯示為置中 modal 樣式

  **地圖頁：**
  - [ ] 篩選按鈕出現在關鍵字搜尋框旁
  - [ ] 套用距離篩選（先定位）→ `radius` 更新 → 地圖重新搜尋
  - [ ] 距離按鈕在未定位時顯示為灰色不可點擊
  - [ ] 點擊距離按鈕時觸發定位請求

- [ ] **Step 4: 最終 Commit**

  ```bash
  cd /Users/ccchang/Project/NationalTravelCardMerchants
  git add -A
  git commit -m "chore: verify advanced filter panel feature complete"
  ```

