# 地圖、搜尋排序與退役功能整理

## 地圖與列表

- `MapView` 以商店 ID 保留 Leaflet 標記，只移除不再符合搜尋條件的標記；內容更新時更新 popup，座標移動時重新加入群聚索引。
- 追加分頁保留既有標記，每個 animation frame 最多處理 100 筆變更。切換結果或離開頁面時取消未完成的批次，避免過期標記重新出現。
- 標記點擊透過最新資料與 callback 選取商店，不會沿用舊距離或舊商店內容。零度座標也可正確選取。
- `VirtualMerchantList` 只渲染可視範圍與前後各三列，使用 `ResizeObserver` 量測卡片高度。地圖點選會捲至對應卡片；正在使用鍵盤的卡片保留掛載，列表提供商店總數與位置資訊。
- 載入更多按鈕位於列表之外，追加分頁不重設已捲動的位置。重新搜尋則清除選取與原結果。

## 關鍵字排序

一般商店搜尋依下列順序排序，排序完成後才套用分頁：

1. 商店名稱完全符合關鍵字。
2. 商店名稱以前綴符合關鍵字。
3. FTS5 BM25 相關性，名稱權重 10、地址權重 1。
4. 同分以商店 ID 遞增排序，確保相同資料下的分頁順序穩定。

名稱比較沿用 NFKC、臺／台正規化並忽略大小寫；前綴比較使用字串比較，百分比與底線不會變成 SQL 萬用字元。原有篩選及查詢長度限制繼續適用。附近搜尋仍依真實距離及 ID 排序。

## 退役程式與依賴

- 移除 `auth_utils.py`、行程路線最佳化服務、退役 Pydantic models，以及對應退役功能的測試。
- 新資料庫不再建立使用者、支出、收藏、行程及行程項目表，也不再建立這些表的索引。
- 既有資料庫的歷史表與資料保留；沒有執行 `DROP TABLE` 或清除正式資料。保留歷史關聯的測試使用 `backend/tests/legacy_schema.py`，公開應用程式不會引用它。
- 後端 runtime 依賴保留 FastAPI、uvicorn、Pydantic、requests；JWT、密碼雜湊、email-validator 已移除。PDF 解析依賴留在 scheduler；pytest、httpx 改由 `backend/requirements-dev.txt` 安裝。
- CI 使用開發依賴清單，Compose 與環境範例移除 JWT 設定。既有 `.env` 未修改。

## 本輪檢查

Python 語法、TypeScript、ESLint、Next.js production build、CI YAML 結構、Compose 設定解析及 `git diff --check` 通過。前端建置在暫存副本進行，使用與專案 lockfile 相符的依賴。

2026-10-08 依使用者要求補做測試：

- 後端完整測試：211 passed。包含完全符合／前綴／名稱與地址權重、穩定分頁、篩選及文字正規化、歷史使用者與行程資料保留。
- 前端單元測試：157 passed，26 suites。新增 2,000 筆列表的有限渲染、捲動選取、追加結果保留位置、焦點保留，以及標記增量更新、最新 callback、取消過期批次與零度座標情境。
- 正式 standalone 前端瀏覽器測試：16 passed。包含桌面 1280 px 與手機 390 px 各 2,000 筆地圖資料、十次分頁載入、最後一間商店選取／popup、重新搜尋清除、20 km 篩選、PWA 離線與 503 快取備援、城市分頁、sitemap、404 與分享圖片。
- Python 3.12.3 隔離環境只安裝正式 requirements，在未設定 JWT、未安裝 JWT／密碼／Email 驗證／PDF／pytest／httpx 套件下，後端 lifespan 與新資料庫初始化成功。
- TypeScript、ESLint、Python 語法與差異格式檢查通過。

修正了舊測試對卡片所在檔案、捲動實作、過時三碼分類與 robots 分片清單的假設。煙霧測試資料改用正式六碼行業代碼，補入 40 筆無座標商店供城市第二頁驗證；附近搜尋仍保留原有三筆。大量地圖測試使用可重現的模擬 API 資料，地圖元件與虛擬列表在真正瀏覽器中執行。

pytest 的 6 個警告來自第三方 PyMuPDF／Starlette 棄用訊息，沒有測試失敗。未進行正式部署或正式資料操作，也沒有量測或宣稱效能提升百分比。後續測試環境請使用 `pip install -r backend/requirements-dev.txt`；正式後端映像仍使用 `backend/requirements.txt`。
