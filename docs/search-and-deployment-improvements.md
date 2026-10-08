# 搜尋與部署改善（2026-10-08）

地址搜尋改為使用者按 Enter 或搜尋按鈕後才提交至 `/api/geocoding/search`，輸入與選取結果不會自動查詢。後端使用獨立 SQLite 快取（`/data/address_search.db`），快取七天、最多 1,000 組查詢；以 SQLite 交易統一保留上游請求時段，未命中快取時整站最多每 1.1 秒一次，超額回 HTTP 429 與 Retry-After。上游 429 會觸發至少 60 秒的全站冷卻。多個 backend worker 必須共用同一快取檔；跨主機部署需要另行共用限流服務。

`.env` 的 `ADDRESS_SEARCH_URL` 可切換支援 Nominatim JSON 格式的供應者，`ADDRESS_SEARCH_USER_AGENT` 用來識別應用程式；更新後重新建立 backend 容器，不需重新建置前端。此設定與批次定位腳本的 `GEOCODER_URL` 分開。公開 Nominatim 不允許自動完成，限制以整個應用程式計算，請遵循 [官方使用政策](https://operations.osmfoundation.org/policies/nominatim/)。大量使用應改用適合的供應者。

附近搜尋串流讀取完整 bbox 候選並計算距離，使用 heap 保留目前分頁所需的最近商家，再依未四捨五入的距離及 ID 排序。沒有 5,000 筆截斷；總數、載入更多與半徑過濾均依完整候選計算。一般首批查詢只保留 limit 筆結果；很深的 offset 仍會增加 heap 大小與計算成本。

PWA 使用 `apis-v2` 快取，HTTP 5xx 回退先前成功回應，資料取得時間由 service worker 在寫入快取時記錄。地圖與雷達對快取回應顯示警示與取得時間；重新取得即時結果後提示消失。取得時間不等於政府來源更新時間。快取超過 24 小時、取得時間未知或 API 回應非 HTTP 200 時，不會作為有效備援。

API 路由比對依 pathname，兼容同域及跨來源的開發設定。CSP 的 connect-src 明確加入 `NEXT_PUBLIC_API_URL` 的 origin，讓已設定的本地 HTTP API 可正常連線。

`deploy.sh` 在啟動後呼叫 `bash scripts/verify_deployment.sh`。所有驗收路由必須回 HTTP 200（包括 `/api/health`），HTTP 3xx、4xx、5xx、連線失敗或無效 sitemap manifest 均中止並回傳非零狀態。每次紀錄保存在 `deploy-logs/`；可透過 `DEPLOY_LOG_DIR` 改位置。資料過期或排程失敗也會使驗收失敗；已啟動容器不會自動還原。

可獨立執行唯讀驗收：`bash scripts/verify_deployment.sh http://127.0.0.1:8088`。這次程式修改不會自動部署或呼叫正式地址搜尋供應者。

## 驗證結果

- 相關後端回歸：64 passed，涵蓋搜尋、座標、密集區分頁、地址快取／限流、錯誤回應及部署驗收。
- 前端 Jest：4 suites、18 tests passed，涵蓋手動地址提交、選取後不重查、舊回應取消、快取標記／期限及雷達提示。
- 正式 standalone 瀏覽器：2 passed，涵蓋 service worker 離線頁，以及網路在線但 API 503 時的快取資料、時間及恢復後清除提示。
- ESLint 零警告、TypeScript、Next.js production build、shell 語法、git diff --check 及 production Docker Compose config --quiet 均通過。

目前工作目錄的前端依賴缺少 GNU SWC 及 Playwright。前端測試與建置在隔離 `/tmp` 副本執行，沿用既有完整依賴，package.json 與 package-lock.json 雜湊皆與工作目錄一致。後端測試與瀏覽器 API 只操作暫存資料庫，地址供應者由 mock 取代，驗證服務已停止。

驗證時另補齊兩個既有 fixture：無變更 PDF 測試需記錄目前 parser_version，瀏覽器 seed 資料需先建立 merchant_tax_ids 父表資料，以符合現行外鍵限制。
