# Task 4 Report: Frontend 互動與安全 Hardening

- **Status**: DONE
- **Date**: 2026-09-30
- **Branch**: main（直接在 main 上工作）

## 變更項目（7 檔 + 1 新測試）

1. **`frontend/src/utils/api.ts`** — 401 時除清除 `ntc_token` 外，加派
   `window.dispatchEvent(new Event("ntc:unauthorized"))`。
2. **`frontend/src/context/AuthContext.tsx`** — 新增 `useEffect` 監聽
   `ntc:unauthorized` → 呼叫 `logout()`；`logout` 改為 `useCallback` 並列入
   deps（避免 `react-hooks/exhaustive-deps` 警告，行為不變）。
3. **`frontend/src/app/merchant/[id]/page.tsx:14`** — `getMerchant` 內
   `fetch(.../api/merchants/${encodeURIComponent(id)})`，含 `/` 的 id 不破路徑。
4. **`frontend/src/components/HomeSearchSection.tsx`** — props 新增
   `initialLat?/initialLon?`；`radiusKm !== null` 且有 `userLocation` 或初始座標時
   輸出 hidden `lat/lon`（`userLocation` 優先，保留 `toFixed(5)`；否則用初始值，不遺失）。
5. **`frontend/src/app/page.tsx`** — merchants/stats 兩次 fetch 改為 `Promise.all`
   並行；同時把 URL 解析出的 `lat/lon` 以 `initialLat/initialLon` 傳給
   `HomeSearchSection`（否則 hidden 無資料可保）。`searchParams: Promise<...>` 未動。
6. **`frontend/src/app/layout.tsx`** — 刪除 `metadata.themeColor`，改為
   `export const viewport: Viewport = { themeColor: "#2563eb" }`（依
   `node_modules/next/dist/docs/.../generate-viewport.md`，Next 14+ 規範）。
7. **`frontend/src/app/map/page.tsx`** — 兩處 `target="_blank"` 的 `Link` 補
   `rel="noopener noreferrer"`；`handleResetFilters` 同時 `setCenter(DEFAULT_CENTER)`。
8. **`frontend/src/__tests__/Hardening.test.tsx`**（新）— 5 個測試：
   401 派發事件＋清 token、200 不派發、id 編碼契約、hidden lat/lon、
   AuthContext 收到事件即登出。

## TDD 過程

- 先寫測試、實作前執行：`Tests: 3 failed, 2 passed`（401 派發、hidden lat/lon、
  AuthContext 登出三項 FAIL；200 不派發、encode 契約兩項 PASS）→ 符合先 FAIL 預期。
- 實作後全量：`Test Suites: 7 passed, 7 total / Tests: 31 passed, 31 total`。
- `npm run lint`：exit 0，0 warnings。`npx tsc --noEmit`：exit 0。

## Concerns

- `logout` 未完全照 brief 原樣（`}, [])` 空 deps）— 原樣會觸發
  `exhaustive-deps` 警告，改用 `useCallback`＋列入 deps，行為等價。
- `userLocation` 路徑保留 `toFixed(5)`（brief 片段為 `userLocation?.lat` 原值，
  會改變既有提交精度）；初始座標路徑用原值字串。
- merchant id 編碼僅以契約測試覆蓋（`encodeURIComponent("123/456") === "123%2F456"`），
  未做 server component 渲染測試（需 Next App Router 完整環境，成本過高）。
- map `rel`＋reset center 僅程式碼審查確認，未入單元測試（同樣需導航＋動態地圖 mock）。
