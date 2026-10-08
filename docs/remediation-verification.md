修正驗收與資料維護

測試使用獨立的 DB_PATH 與 `/tmp` 目錄；不需要下載政府清冊或呼叫外部定位服務。Node 22、Python 3.12 與 Dockerfile 一致。

```bash
pip install -r backend/requirements-dev.txt
python -m pytest backend/tests -q
npm --prefix frontend ci
npm --prefix frontend test -- --ci --watchAll=false --runInBand
npm --prefix frontend run lint -- --max-warnings=0
npm --prefix frontend run typecheck
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.prod.yml build backend scheduler frontend
```

CI 使用 `scripts/seed_smoke_data.py`、`scripts/smoke_backend.py` 建立暫存資料與可控制失敗的測試 API，再啟動正式 standalone 前端映像執行 `npm run test:e2e`。測試涵蓋首頁表單、全部地圖條件、20 km、API 503 重試、真正瀏覽器的 PWA 離線導頁，以及 robots／sitemap 公開路由。測試 API 不會被複製進正式映像。

本次最終驗收結果：pytest 179 passed；Jest 94 passed（17 suites）；ESLint 零錯誤、零警告；TypeScript 檢查通過；production 瀏覽器 smoke 5 passed；Docker Compose 設定有效，後端、排程及前端映像均成功建置。`npm audit` 完整相依樹為 0 vulnerabilities。`scripts/check_infra.sh` 為 9/9。pytest 顯示 6 個第三方相依套件的 deprecation warnings。

PWA 的 `reloadOnOnline` 設為 false：自動重新載入會打斷正在進行的導頁，讓離線備援被上一頁的快取取代。恢復連線後，使用者可沿用目前頁面重新搜尋或重試。商家、統計及資料資訊 API 使用 NetworkFirst，快取只收 HTTP 200，最多 50 筆、24 小時；網路失敗、8 秒逾時或後端 5xx 時可回退快取。其他 API 使用 NetworkOnly。快取回應帶有 X-Data-Source 與 X-Data-Fetched-At，地圖及雷達會顯示資料取得時間與可能過期的提示；多頁載入保留最早的快取時間。未知取得時間或超過 24 小時的回應不再使用。

SQLite 更新與升級會先使用 Connection.backup 建立包含 WAL 的完整快照，驗證後才發布 `.bak`。FTS 與座標 schema 升級在交易內執行，使用與排程相同的 `.update.lock`。版本記錄在 app_metadata；FTS 的 `ordered-phrase-v2` 與查詢 parser 必須成組部署。官方 PDF 無變更時仍會檢查本地版本。手動 PDF 匯入也改走暫存解析、資料驗證與 UPSERT，不再刪掉原商家表重建 ID。

首次上線前應在正式資料的隔離 SQLite 快照演練新版本。要還原整庫，先停止所有寫入、關閉 DB 連線，備妥目前 DB 及 WAL，再由受驗證的備份恢復；不要直接覆蓋仍有活動 WAL 的主檔。自動測試與此輪修正不會操作正式資料或部署。

既有本地 `backend/merchants.db` 為空資料庫，其隔離快照已驗證 schema 遷移、可重跑與備份完整性。含使用者關聯的升級與 WAL 還原另以測試資料驗證。正式資料庫快照演練、正式部署與外部定位批次仍屬上線工作，這次未執行。

座標欄位的 `geocoded_address` 記錄定位時的原始商家地址，用來辨認搬遷；來源分 `address_geocode`、`postal_estimate`、`legacy_unknown`。所有一般 geocoder 回應與郵遞區號中心都標成估算，舊座標不會因升級變成精準位置。`scripts/audit_coordinates.py` 可只讀列出失效座標、來源未確認與遠離郵遞區號中心的疑似資料。

`scripts/geocode_zipcodes.py` 只補缺漏，保留既有地址定位。`scripts/geocode_real.py --dry-run` 不寫入資料或快取；預設每批 50 筆，可使用 `--upgrade-estimates`、`--refresh-cache` 做可重跑的定位。正式大量定位前，先依供應者政策選用適合的服務與設定 `GEOCODER_URL`、`GEOCODER_USER_AGENT`；不要把公開 Nominatim 服務當作全庫無限制批次 API。前端對估算或未知來源顯示約略距離，導航優先使用地址，結構化資料也不宣稱估算點為精準門牌。

依賴安全修正把 Next.js 及 `eslint-config-next` 更新並鎖定在 16.3.8；分享圖使用 Next.js 內建 `next/og`。PWA 建置相依套件使用 `serialize-javascript` 7.1.2 override；目前完整依賴稽核為零漏洞。參考 [Next.js 官方安全公告](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j)及[修正版發布紀錄](https://github.com/vercel/next.js/releases/tag/v16.3.8)。若後續 PWA 外掛更新 `serialize-javascript`，應確認相容後移除 override。
