# SEO 與 AI 搜尋維護

本次新增 `/city`、22 個 `/city/{slug}` 縣市頁及 `/about`。縣市頁由伺服器輸出商家名單，每頁 40 筆，分頁使用獨立 canonical 並允許索引；空名單設為 noindex，非法縣市與頁碼使用 notFound 且明確設定 robots／googlebot noindex（Next.js 已開始串流時 HTTP 狀態可能為 200），API 故障顯示錯誤而非假裝沒有商家。

首頁、商家頁與錯誤頁連到縣市頁。根 sitemap 包含首頁、縣市入口、22 個縣市頁、FAQ 與資料來源頁；原有商家分片保留相容性；robots.txt 公布 /sitemap-index.xml，統一列出根目錄商家分片。FAQ 與關於本站頁不使用商家名單日期當成文章更新日期。

## 內容維護

- `frontend/src/utils/cities.ts` 集中管理縣市名稱、slug 與臺／台正規化。
- `frontend/src/utils/travelPolicy.ts` 集中管理資格及額度文字，首頁與 FAQ 可見內容及結構化資料共用。變更政策文字時，查核官方 Q&A，再更新政策查核日期；不要以排程執行日取代政策查核日。
- `/about` 說明非官方服務、開放資料來源、每日檢查與成功匯入的差別、座標精度和 GitHub 回報管道。
- 商家頁直接回答是否列於名單，並提醒核對分店、地址與統編；名單資料更新不等同實地驗證。
- LocalBusiness 表示商家，WebPage 表示本站商家介紹頁。尚無逐筆內容異動日期，因此商家 WebPage 不輸出 dateModified，也不宣告本站商家是政府服務的一部分。
- `llms.txt` 提供可維護的頁面入口與限制說明；它不是排名或 AI 引用保證。

## 爬蟲與索引

robots.txt 允許公開頁爬取；一般搜尋結果、地圖與離線頁透過頁面 robots metadata 設為 noindex、follow，讓爬蟲可以讀取指令並探索商家連結。Googlebot 的 metadata 與一般 robots 指令同步，避免沿用根 layout 的 index 設定。

`next.config.ts` 的 htmlLimitedBots 保留 Next 16.3.8 預設分享／搜尋爬蟲，加入 Googlebot 及 AI 搜尋爬蟲，讓 metadata 在初始 HTML head 輸出。升級 Next 時請重新對照預設清單。一般瀏覽器保留串流回應。

網站規則已允許 OAI-SearchBot；搜尋與模型訓練是不同用途，GPTBot 不決定是否出現在 ChatGPT 搜尋。CDN、WAF 或主機層是否阻擋爬蟲，仍需在正式站請求紀錄核對；僅憑 User-Agent 字串無法驗證爬蟲身分。

## 上線後追蹤

依 [現有部署文件](deployment-ubuntu-server.md) 部署前端；正式服務部署結果見下方紀錄，外部搜尋帳號尚未操作。`NEXT_PUBLIC_SITE_URL` 須為正式 HTTPS 網域，並在建置時提供。

1. 在擁有該網域權限的 Google Search Console 與 Bing Webmaster Tools 中確認網站所有權，提交 /sitemap-index.xml，一次包含一般頁面與各商家分片。
2. 以網址檢查確認首頁、`/city/taipei`、縣市第二頁、`/faq`、`/about` 及抽樣商家頁可讀取、canonical 正確。確認搜尋結果、地圖與離線頁有 noindex。
3. 記錄首次部署日期及搜尋曝光、點擊、索引頁數；每週觀察「國旅卡特約商店」「台北國旅卡」「台中國民旅遊卡商店」等實際搜尋字詞，區分首頁、縣市頁、商家頁的成效。
4. 固定每月用相同問題測試 ChatGPT、Gemini、Perplexity，例如「台北有哪些國旅卡特約商店？」和抽樣店家的「○○可以用國旅卡嗎？」。記錄測試日期、是否開啟搜尋、引用網址與回答內容。搜尋結果會變動，不將單次引用視為排名保證。
5. 根據真實搜尋字詞和資料覆蓋率，再決定行政區、行業分類頁；分類資料不足時不要大量建立內容相同的頁面。

## 官方依據

- [Google AI 搜尋最佳做法](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Google 開發者 SEO 與索引控制](https://developers.google.com/search/docs/fundamentals/get-started-developers)
- [OpenAI 搜尋與訓練爬蟲](https://developers.openai.com/api/docs/bots)
- [行政院人事行政總處 114 年 12 月版國民旅遊卡 Q&A](https://travel.nccc.com.tw/text/news/102/11412QA.pdf)

## 本次驗證（2026-10-07）

- 在 `/tmp` 隔離副本依 lockfile 安裝依賴，使用 Node 22 執行型別檢查及 Next 正式建置，皆成功。
- 全部前端測試：21 個套件、131 項測試通過；新增縣市頁、分頁、API 故障、schema／可見內容一致性和爬蟲 metadata 回歸測試。
- 本次修改檔案的 ESLint 與 `git diff --check` 通過。全站 ESLint 原有 `Toast.tsx` 第 94–96 行三個 `react-hooks/immutability` 錯誤，未在此 SEO 改善中修改。
- 使用 standalone 正式建置及本機模擬 API，以 Googlebot、Bingbot、OAI-SearchBot、PerplexityBot 請求、不執行 JavaScript：確認初始 head 的 canonical、商家文字、分頁連結、JSON-LD 及錯誤頁 robots／googlebot noindex。
- 確認一般搜尋結果、地圖、離線頁 noindex；根 sitemap 26 個入口、商家分片和 llms.txt 可讀取。串流 notFound 頁 HTTP 為 200，但初始 head 明確包含 robots／googlebot noindex。
- 實作階段的 HTTP 測試使用本機模擬 API；正式站驗證結果見下方。Search Console／Bing 帳號尚未操作，網站可爬取不代表已收錄或已被 AI 引用。


## 正式部署（2026-10-07）

依使用者指示執行 `./deploy.sh`，使用 base + prod Compose 重建映像。frontend、backend、scheduler、nginx 四個容器均重建啟動，部署後健康狀態皆為 healthy，nginx 設定檢查通過。商家資料維持 54,008 筆，資料更新時間維持 2026-10-07T03:00:11.342879+08:00。

同時驗證本機入口與正式 HTTPS `https://ntc.shibaalin.com`：縣市頁與第二頁、首頁縣市連結、FAQ、資料來源頁、商家問答、26 個 sitemap 入口、robots、llms.txt 均通過。四種搜尋爬蟲的初始 HTML canonical 與商家清單可讀取；搜尋結果、地圖、離線及非法縣市頁的 robots／googlebot noindex 正確。原有 6 個商家 sitemap 分片均回應 200。

部署前映像保留為 `ntc-frontend:pre-seo-20261007`、`ntc-backend:pre-seo-20261007`、`ntc-scheduler:pre-seo-20261007`。本次沒有刪除資料 volume 或重啟主機的 Docker daemon，也未操作其他專案。


## 2026-10-07 第二輪修復

- 新增 `/sitemap-index.xml`，列出 `/sitemap.xml` 與根目錄 `/sitemap-merchants-{id}.xml`。根分片由 Next rewrites 提供，舊 `/merchants/sitemap/{id}.xml` 仍有效；不需要搬動商家網址。manifest 故障時 index 回 503，避免公布不完整清單。
- 商家 XML 省略無法證實的逐筆 lastmod；商家及分類頁也不再把全站匯入時間當成頁面 dateModified。可見的「名單資料更新」仍表示整份資料日期。商家 fetch 改成 300 秒快取並設 10 秒 timeout，與名單快取週期一致；未實作逐筆更新紀錄，資料異動可能有最多約 5 分鐘快取延遲。
- 移除根 `app/loading.tsx` 的全站 Suspense fallback，讓不存在的縣市、分類、超出範圍分頁及商家在送出回應前設定 404。先前章節記載的 HTTP 200/noindex 為第一輪驗收結果；本輪以 HTTP 測試確認修正為 404/noindex。
- 新增 `/city/{slug}/accommodation` 與 `/city/{slug}/dining`，依實際 API 的 55/56 行業別篩選；空分類 noindex 且不加入 sitemap，完整名單不被取代。分類依統編對照，不保證各分店提供相同服務。分頁保留分類 canonical，新增前後 10 頁跳轉。
- 雷達改成使用者開啟時才下載並掛載。FAQ／關於／縣市頁不再因根 layout 靜態引入 RadarSheet。這是程式載入改善，尚無足夠正式站 field data 判定 Core Web Vitals 成效。
- PDF parser 新增完整縣市、行政區及含門牌地址的保守切欄；遇多個可能位置不強行拆分。新增 parser_version：來源 PDF hash 相同但 parser 升級時仍重新解析。
- `scripts/repair_merchant_addresses.py --db PATH` 預設唯讀統計；`--apply` 才在 advisory lock 下建立 SQLite WAL 完整備份並以交易修復、保留 ID 和使用者關聯、更新 FTS 及 dataset version。只使用現有文字中的完整地址，不補猜測值；不確定資料繼續標示缺漏。操作若失敗回滾。
- 地址缺漏頁改用 Organization 表示可辨識的商家，不輸出缺少地址的 LocalBusiness；描述不拼接 null／undefined，無地址與座標時不提供空導航連結。

回歸驗證：完整前端 Jest、型別檢查與 production build；後端地址修復及排程測試；`SMOKE_SITE_URL=... npm run test:e2e -- seo.spec.ts` 用真實 HTTP 驗證 Mozilla、Googlebot、OAI-SearchBot、Bingbot 的 404/noindex、分類可讀取 HTML、自我 canonical 及根分片相容性。


本輪正式部署驗收（2026-10-07）：`./deploy.sh` 成功，backend／frontend／scheduler 重建並重新啟動，nginx 保持正常，4 個容器均 healthy，nginx 設定檢查通過。正式 HTTPS 的 6 項 SEO HTTP 回歸全部通過。根 sitemap 有 70 個頁面入口，其中 44 個為有資料的縣市住宿／餐飲頁；6 個根目錄商家分片皆 200。

正式資料修復 171 筆，商家筆數維持 54,008，沒有遺失任何商家 ID，FTS 仍為 54,008 筆，SQLite quick_check 為 ok，foreign_key_check 無錯誤；收藏與消費紀錄筆數與備份相同。剩餘 71 筆缺漏無法由既有文字可靠恢復，維持缺漏提示。修復前完整備份為 named volume 中的 `/data/merchants.db.20261007-124853-774079-backup.bak`；這是部署後需要回復資料時使用的 SQLite 備份。

驗證結果：23 組前端 Jest／139 測試通過，32 個地址修復及排程後端測試通過，型別檢查與 production build 通過；修改檔案 ESLint 無 error。全專案既有 `Toast.tsx` lint 問題未納入本輪。外部 Search Console／Bing 提交、實際收錄與 Core Web Vitals 長期資料仍需後續觀察。
