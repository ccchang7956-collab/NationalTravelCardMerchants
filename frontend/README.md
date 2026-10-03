國民旅遊卡特約商店查詢前端使用 Next.js 16、React 19 與 Leaflet。請使用 Node 22，並以 `npm ci` 安裝鎖定依賴。

```bash
npm ci
npm run dev
npm test -- --ci --watchAll=false --runInBand
npm run lint -- --max-warnings=0
npm run typecheck
```

開發模式停用 PWA。正式建置的 `npm run build` 明確使用 Webpack，讓現有 PWA 外掛產生 service worker 與 `/offline` 備援；API 使用 NetworkOnly，恢復連線時保留使用者所在頁面。

正式環境需設定 `NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_SITE_URL`；server-side 請求另可設定 `INTERNAL_API_URL`。Dockerfile 會封裝 standalone 服務與 PWA 產物。

`npm run test:e2e` 驗證正式服務，預設站點為 `http://localhost:13000`、API 為 `http://localhost:18000`。CI 使用暫存種子資料與可模擬 API 失敗的測試服務；這兩支腳本不會進入正式映像。

完整驗收與 SQLite 還原方式見 [修正驗收文件](../docs/remediation-verification.md)。
