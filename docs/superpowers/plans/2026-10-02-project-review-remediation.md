**2026-10-02 專案審查修正計畫**

目標：修復本次審查確認的 12 個功能、資料及設定問題，補上 CI，並完成 sitemap 與座標精度兩項改善。先恢復功能與資料正確性，再處理需要資料遷移的優化。

狀態：實作與隔離環境驗收完成；正式資料庫快照演練與部署仍待正式上線窗口。

基準：實作前為 Next.js 16.2.6；pytest 137 passed、10 failed（舊 FTS 斷言及既有測試簽名），Jest 79 passed；TypeScript 通過，ESLint 有 1 個錯誤、1 個警告。完成驗收為 pytest 179 passed、Jest 94 passed／17 suites、lint 零錯誤／零警告、typecheck 通過、production 瀏覽器 smoke 5 passed，`npm audit` 0 vulnerabilities。pytest 的 6 項第三方 DeprecationWarning 詳列於驗收文件。

| 階段 | 工作內容 | 對應項目 | 完成條件 |
| --- | --- | --- | --- |
| 0 | 建立可重現的測試環境與基準 | O01 前置 | 完整測試可執行，失敗可區分為環境或程式問題 |
| 1 | 修正 WAL 備份、搬家座標 | F03、F04 | 備份可還原；地址變更不沿用舊座標 |
| 2 | 修正篩選、地圖、雷達、錯誤畫面 | F01、F02、F05、F06、F08、F09 | 表單、URL、API、顯示結果一致 |
| 3 | 修正中文搜尋與舊索引 | F07 | 關鍵字保留順序，舊庫與新匯入結果一致 |
| 4 | 修正健康狀態及容器設定 | F10、F12 | 更新失敗可被監控看見，設定可傳入容器 |
| 5 | 修正 PWA 並完成 CI 門檻 | F11、O01 | 正式建置、離線流程、完整測試均通過 |
| 6 | 優化 sitemap 與座標精度 | O02、O03 | 超過 6 萬筆仍完整收錄，估算位置清楚標示 |

依 0 → 1 → 2 → 3 → 4 → 5 → 6 完成。階段 1～5 與階段 6 的 sitemap、座標精度修正均已實作並驗收。本工作保留在工作區供審查；正式資料遷移及部署未執行。詳見 [驗收與資料維護](../../../docs/remediation-verification.md)。

**階段 0：測試環境與基準**

修改或補充位置：`backend/tests/conftest.py`、`frontend/package.json`、必要時修正 `frontend/package-lock.json` 的平台依賴、`.github/workflows/build.yml`、`frontend/README.md`。

- [x] 在乾淨 checkout／測試容器安裝已鎖定版本的 Python 與 npm 依賴。Node 使用 22，與前端 Dockerfile 一致；npm 在目標平台執行 `npm ci`，確認 SWC 原生套件可載入。
- [x] 後端所有測試使用暫存 DB_PATH；需要 app lifespan 的測試也要覆寫它，不能只替換 `get_db`。排程測試的 meta、hash、備份及下載檔也放在暫存目錄。
- [x] 記錄完整 pytest、Jest、lint、型別檢查的基準。舊測試若比對已過期的 FTS 字串，於階段 3 更新成搜尋行為驗證。
- [x] 增加 `typecheck` 指令，讓本地與 CI 使用同一個 TypeScript 檢查入口。
- [x] 把前次暫存重現案例轉成維護於專案的回歸測試。測試應描述正確結果，對目前缺陷失敗，修正後通過；不沿用「斷言 bug 存在」的暫存探針。

驗收：測試可以完整收集與執行；取得可重跑的失敗清單。SWC／缺少 pytest 屬環境問題，與 ESLint 及功能缺陷分開記錄。

**階段 1：資料備份與座標一致性**

主要檔案：`scheduler/update_data.py`。測試延伸 `backend/tests/test_scheduler_safety.py`、`backend/tests/test_scheduler.py`，新增備份還原與商家搬遷案例。

F03 — WAL 備份：

- [x] 使用 SQLite Connection.backup() 建立同步前快照，取代 `shutil.copy2()`。在 `BEGIN IMMEDIATE` 寫入交易前完成備份，避免對有未提交寫入的同一連線啟動 backup。
- [x] 先寫到唯一暫存備份檔，關閉目的連線、驗證備份可查詢後再發布 `.bak`。檔名避免同秒重跑覆蓋，保留現有最近 7 份的清理策略。
- [x] 有既有資料卻無法建立有效備份時，中止該次同步；DB、hash 與成功 metadata 不得提前更新。

F04 — 商家搬家：

- [x] `migrate_coords()` 同時比對統編與正規化地址，且只保留有效的完整 lat/lon。地址不同即不搬移舊座標。
- [x] UPSERT 也必須比較舊、新地址：地址相同才可回退到舊座標；地址變更時使用新座標或 NULL。不能只修遷移函式，否則現有 COALESCE 仍會把舊座標補回。
- [x] 地址改變且新資料無座標時，交由現有 fallback 流程處理；估算精度的呈現於階段 6 補齊。
- [x] 列出已存在的「地址與座標不符」疑似資料供重新定位，不批次把所有既有座標假定為正確或直接清空。

驗收：保持另一條連線開啟、關閉自動 checkpoint，在 WAL 中提交資料後產生備份；還原檔的商家及既有關聯資料須完整。備份故障時同步中止。相同統編從台北搬到高雄後，不得仍帶台北座標；地址未變的資料保留原座標和 merchant id。UPSERT 沒有新座標的情境也要測試。

**階段 2：篩選與前端資料流**

主要檔案：`frontend/src/components/FilterSheet.tsx`、`HomeSearchSection.tsx`、`RadarSheet.tsx`、`frontend/src/app/map/page.tsx`、`frontend/src/app/page.tsx`、`backend/routers/merchants.py`。

新增 `frontend/src/utils/mapSearchParams.ts` 統一地圖參數解析、URL 序列化、半徑範圍與查詢 key。把目前從 map/page.tsx 匯出的 clamp 輔助函式移到此處，並更新相關測試的 import，避免正式 Webpack 建置遇到 page 的非標準匯出檢查。

F01、F02 — 篩選面板：

- [x] 行業別請求的 effect 只依開關與明確重試動作啟動，loading 不能成為讓同一請求 cleanup 的依賴。關閉面板後忽略回應，成功空陣列視為已載入，失敗顯示可重試狀態。
- [x] 保留成功的共用行業別快取；失敗才清除快取。整站共用同一個 API URL helper。
- [x] 面板內所有非表單送出按鈕明確設定 `type="button"`，包含開啟、關閉、草稿選項、清除及套用。
- [x] 草稿在開啟、取消、套用事件更新；外部已套用條件變更時，以穩定的條件 key 重置面板。移除 `prevFilters` 同步 effect，修復既有 lint 錯誤。

F05、F06 — 地圖條件一致：

- [x] 附近 API 增加 `city`、`has_website`，沿用列表目前的參數化縣市前綴範圍及官網條件；適度共用 WHERE 建立邏輯。
- [x] `city`、`has_website` 同時納入地圖 state、URL、fetch key、API 請求、重試與重設。定位、點地圖、地址搜尋後仍保留已套用條件。
- [x] 首頁距離搜尋的兩條路徑都保留縣市與官網條件：`HomeSearchSection` 導頁與首頁 Server Component 的 geo redirect。
- [x] 前端搜尋半徑統一 0.5～20 km，預設 2 km；後端維持既有 0.1～20 km 的 API 相容範圍。20 km 選項、slider、URL 解析均不得縮成 10 km。
- [x] 地圖面板顯示實際搜尋半徑，清除條件恢復 2 km；地圖本身固定有搜尋半徑，不顯示會誤導使用者的「不限」。列表頁保留可不選距離的行為。

F08 — 雷達請求順序：

- [x] 附近查詢及手動搜尋共用一個請求世代／序號，並取消可取消的舊 fetch。只有目前請求可更新結果、錯誤與 loading。
- [x] GPS callback 也檢查該動作是否仍有效；較舊的定位結果、關閉抽屜後的回應不能覆蓋新操作。

F09 — 首頁失敗畫面：

- [x] 商家及統計請求獨立處理結果，避免統計失敗連帶丟失已成功取得的商家。
- [x] 只有商家 API 成功且 items 為空才顯示「找不到符合的商店」；非 2xx、斷線、逾時或回應無法解析時顯示載入失敗與重試。
- [x] 重試保留使用者的關鍵字及條件；統計失敗時不偽裝成 0 間商家。

驗收：以實際首頁表單包住 FilterSheet，開啟、草稿點選、取消與套用都不誤送出表單，只有搜尋按鈕送出。延遲的行業別成功回應可顯示選項，失敗可重試。地圖條件經重新整理、上一頁、下一頁仍一致，API 回傳只含符合條件的商家。20 km 的畫面、URL 與請求一致。雷達以反向完成的請求測試舊資料不覆蓋新資料；API 503 不呈現查無商家。

**階段 3：中文搜尋與索引遷移**

主要檔案：`backend/services/search_service.py`、`scheduler/update_data.py`、`scheduler/Dockerfile`、`scripts/parse_pdf.py`、所有會重建 FTS 的腳本、`backend/database.py`。新增標準化／分詞共用模組及可重跑的索引遷移入口。

F07 的搜尋規則：同一個輸入詞保持順序及相鄰 token；空白分開的多個詞採 AND，允許不同詞分別出現在店名與地址。例如「台北」必須是連續詞，「台北 咖啡」可分別命中地址與店名。

- [x] 寫入與查詢使用同一套 NFKC、臺→台及 ASCII/CJK 分詞規則。CJK 按原順序逐字入索引，不去掉重複字；ASCII 保留整詞。
- [x] 同一詞改成 FTS phrase，例如「台北」為 `"台 北"`；不同輸入詞才用 AND。混合英中文及引號／標點須有明確且安全的處理。
- [x] 移除獨立 n-gram 與 unigram 規則的混用；backend、scheduler、手動匯入及重建腳本都走共用實作。scheduler 映像必須包含共用模組，不能只在本地 import 成功。
- [x] 記錄 FTS 索引版本；在安全備份後以單一交易重建舊庫索引，維持 rowid 對應。遷移可重跑，失敗回滾；不能只改查詢 parser。
- [x] 檢查所有 FTS 寫入入口是否同版。即使官方 PDF hash 未變更，升級搜尋規則仍須能觸發本地索引遷移。
- [x] 舊測試改驗證命中結果，保留語法、特殊字元及例外驗證，不只替換字串斷言。

驗收：「台北」命中台北市、不命中台中市北區；字序相反、字被拆在兩個欄位、重複字不足均不誤命中。多詞、單字、CHIC古亭、7-11、臺北／台北、全形與特殊符號均有案例。舊索引遷移、新 PDF 匯入與手動重建後，結果一致且商家 id／關聯資料不變。

**階段 4：健康狀態與設定傳遞**

主要檔案：`backend/main.py`、`scheduler/update_data.py`、`docker-compose.yml`、`.env.example`、`deploy.sh`、`scripts/check_infra.sh`、`docs/deployment-ubuntu-server.md`。相關前端更新 `dataFreshness.ts` 與它的使用位置。

F10 — 分開觀察排程存活、成功檢查及服務就緒：

- [x] 每次執行仍更新 `last_checked`、`last_check_result`；成功更新或確認無變更時，另更新 `last_successful_check`。
- [x] `/api/health` 同時提供最後檢查、最後成功檢查及失敗原因。最近結果 failed 回報 degraded；超過成功檢查門檻為 stale；DB 無法查詢為 unavailable。這些狀態回 HTTP 503，正常回 200。
- [x] 無變更且檢查成功屬正常，不能因 `last_updated` 很舊而誤報。舊 metadata 沒有新欄位時，以成功結果的 last_checked 回退；最後才用 last_updated。
- [x] 新增輕量 `/api/ready`，檢查 API 可處理請求、商家 schema 可查詢。Compose 與部署等待使用此端點，資料新鮮度由 `/api/health` 另行監控，避免更新失敗阻斷前端啟動。
- [x] 首頁附註能顯示更新失敗並保留既有資料日期，不把失敗寫成今日已更新。

F12 — 傳遞設定：

- [x] backend environment 加入 `DATA_STALE_AFTER_HOURS`；scheduler 加入 `NOTIFY_WEBHOOK_URL`、`MASS_DELETE_MIN_OLD`、`MASS_DELETE_RATIO`，皆保留現有預設。
- [x] 統一環境變數解析，移除 scheduler 頂層會提前 crash 的重複解析；數值需有限且落在合理範圍。非法值有明確錯誤／告警及一致的預設政策。
- [x] `.env.example` 說明改為成功檢查的新鮮度；同步更新部署驗收與監控文件。通知測試一律使用 mock，不能實際送出 webhook。

驗收：近期 updated 與 skipped_no_change 回健康；近期 failed、排程停跑、metadata 缺失／損壞、DB 不可讀有明確狀態。容器在可提供舊資料時仍可 ready。以假的 env 值渲染 base+prod Compose 並啟動測試容器，確認指定變數實際存在與生效；不輸出真實 webhook 或秘密。部署腳本明確區分服務就緒與資料健康驗收。

**階段 5：PWA 與 CI**

主要檔案：`frontend/package.json`、`frontend/next.config.ts`、`frontend/Dockerfile`、`.github/workflows/build.yml`，必要時補充正式模式的瀏覽器驗收腳本。

F11 — 使用現有外掛的建置路徑：

- [x] production build 明確改用 `next build --webpack`，讓現有 PWA 外掛執行；開發仍可使用 Turbopack 並停用 PWA。不把大規模更換 PWA 外掛綁進本次修正。
- [x] 核對專案已安裝版本的 Next.js 文件及 Webpack 正式建置。階段 2 的 page 輔助函式移動是必要前置。
- [x] 驗證 `sw.js`、Workbox 產物及 `/offline` 都納入 standalone 映像且可由瀏覽器取得，service worker 可以註冊與啟用。
- [x] 商家 API 修正初期採 NetworkOnly；若要離線供應舊結果，另加明確資料日期與離線標示後再啟用快取，避免 PWA 把階段 2 的 503 錯誤處理藏起來。

O01 — CI 門檻：

- [x] 執行完整 pytest、Jest、lint、typecheck、前端正式 build。
- [x] frontend build 設定假的合法站點與 API URL；SSR／sitemap 需要資料時提供本地測試後端及種子資料，不能依賴正式站或政府下載服務。
- [x] 使用明確的 `python -m pytest`，移除會在任意測試失敗後重跑一次的 pytest fallback。
- [x] 檢查 base+prod Compose 設定，建置 backend、scheduler、frontend 三個映像。
- [x] 新增正式模式瀏覽器 smoke：首頁篩選、地圖完整 URL、20 km、後端失敗畫面、PWA 離線 fallback。每個修正的細節回歸仍放在 pytest／Jest，不把所有驗證塞入慢速瀏覽器測試。

驗收：完整檢查為綠；lint 0 error、0 warning。用正式映像首次在線開啟、等待 SW 啟用後，切離線並導向未快取頁面，應顯示離線備援；恢復連線能正常搜尋。新版本發布後可更新 SW。產生檔存在及 PWA 宣告都不足以代替瀏覽器驗收。

**階段 6A：sitemap 批次匯出與動態分片**

主要檔案：`backend/routers/merchants.py` 或新增專用 sitemap router、`backend/models.py`、`frontend/src/app/merchants/sitemap.ts`、`frontend/src/app/robots.ts`、`frontend/src/utils/sitemapShards.ts`、部署驗收腳本。必要時改用相同公開 URL 的 request-time route handler，替換原 metadata 路由，避免重名路由同時存在。

- [x] 新增只回傳 id、tax_id 的 cursor 匯出 API，單次上限 5,000 筆，使用 id 索引。避免每 100 筆再次執行 COUNT 和傳送完整 merchant 資料。
- [x] 增加共用分片 manifest，依實際存在的商家 id 計算每 10,000 筆的邊界；不能用 max(id)/10,000 推估，因為 id 可能有缺口。
- [x] manifest、批次匯出與前端快取使用同一個資料版本；排程在商家同步交易內更新版本。生成途中版本改變就整片重試，不能發布不同版本混合或截斷的部分 sitemap。
- [x] `generateSitemaps`／route handler、robots 及部署腳本使用同一 manifest，移除固定 6 片及固定 0～5 的驗收迴圈。
- [x] 維持 `/sitemap.xml` 與 `/merchants/sitemap/<id>.xml` 公開連結。分片發現不能因 build 時後端尚未啟動而永久固定成空集合。
- [x] 實測路由及 fetch 的快取行為，成功結果才可快取；失敗回可重試的錯誤，不回 200 的空或部分清單。

驗收：以 60,001 筆以上且 id 有大量缺口的測試資料生成分片。聯集須完整、無重複，每片不超過 10,000 筆；新增第 7 片後不需重新建置前端即可被發現。10,000 筆分片只需 2 次批次資料請求；跨批失敗或資料版本切換不發布半份結果。量測請求數、生成時間與 SQLite 查詢計畫。

**階段 6B：座標來源與精度**

主要檔案：`backend/database.py`、`backend/models.py`、`scheduler/update_data.py`、`scripts/geocode_real.py`、`scripts/geocode_zipcodes.py`、前端列表／地圖／商家詳情／雷達導航連結。

- [x] 新增向前相容欄位 `coord_source`、`coord_accuracy`、`geocoded_address`，以版本化遷移處理。來源至少分 address_geocode、postal_estimate、legacy_unknown；精度以 estimated／unknown 等已知事實標示，不能把 geocoder 回應直接視為精準門牌。
- [x] 所有座標寫入及同步都維持 lat/lon 成對，記錄定位使用的地址。地址變更時使舊定位失效，與階段 1 的規則共用。
- [x] 郵遞區號 fallback 改用穩定的區域中心估算，來源明確；不再加入隨機位移。既有無來源座標標成 legacy_unknown，逐步重新定位。
- [x] 估算或來源未知位置標示「約略位置／距離」，Google 導航優先使用商家地址。API 的 nearby 結果附精度，前端不把估算數字呈現為精準距離。
- [x] 重新定位使用快取及可重跑批次；正式批次前確認提供者對負載的限制。僅有明確證據且地址未改變的座標才可提高精度標示。

驗收：舊庫遷移後可正常啟動，數量與關聯不變；重跑 fallback 位置不漂移。新增、未搬家、搬家、定位失敗、只有郵遞區號、legacy_unknown 都有資料案例。列表、地圖、詳情與雷達對同一精度使用一致標示及導航目的地。

**驗證指令與完成門檻**

在已安裝依賴、DB_PATH 指向隔離資料庫的環境依序執行：

```bash
python -m pytest backend/tests -q
npm --prefix frontend test -- --ci --watchAll=false --runInBand
npm --prefix frontend run lint -- --max-warnings=0
npm --prefix frontend run typecheck
npm --prefix frontend run build
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.prod.yml build backend scheduler frontend
```

typecheck 是階段 0 新增的指令；build 的測試 URL 與測試後端在 CI 步驟明確設定。每階段先跑相關回歸；完整套件在整批變更完成後執行。瀏覽器 PWA、超過 6 萬筆 sitemap、WAL 備份還原各自保留驗收結果。

**資料與版本交付**

- [x] 有效備份能力先於 FTS／座標 schema 遷移交付；備份只讀商家與既有關聯資料，不移除歷史使用者表。
- [x] FTS 查詢與索引版本、健康 API 與部署檢查、資料欄位與 scheduler／frontend 消費端各自成組發布。
- [ ] 正式部署前，先對正式資料快照演練並檢閱遷移結果，再排定正式遷移。本次已在空的本地資料庫快照及含使用者關聯的隔離 fixtures 驗證程式；尚未取得正式資料快照。
- [x] 記錄每次遷移的版本與結果。回退先回退程式，索引由現存 merchant 資料重建；需要恢復整庫時停止寫入並使用受驗證的 SQLite 還原流程，不能直接覆蓋有活動 WAL 的主檔。
- [x] 階段 1～5 全部通過後交付第一批修正；階段 6A、6B 通過後完成本計畫全部範圍。
