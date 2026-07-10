# 國民旅遊卡特約商店專案 - 深度 Review 報告

本報告針對「國民旅遊卡特約商店（National Travel Card Merchants）」專案進行全方位的深度代碼與架構審查。審查範圍涵蓋 Scheduler 排程器、Backend 後端服務、Frontend 前端應用以及 DevOps 部署架構。

---

## 📋 診斷清單與優先級摘要

| 模組 | 診斷項目 | 嚴重程度/優先級 | 影響層面 | 說明 |
| :--- | :--- | :---: | :---: | :--- |
| **Frontend** | [F-1] Popup HTML 渲染中的 XSS 漏洞 | **High** | 安全性 | `MapView.tsx` 的 Popup HTML 直接拼接特店網址與名稱，可能遭受 XSS 攻擊。 |
| **Scheduler** | [S-1] `requests` 下載缺乏 Retry 與 Timeout 機制 | **Medium** | 健壯性 | 政府 OpenData 網站極不穩定，缺乏重試會導致每日排程頻繁失敗中斷。 |
| **Backend** | [B-1] SQLite 執行緒安全與併發鎖定評估 | **Medium** | 效能/健壯性 | `check_same_thread=False` 搭配 WAL 在多線程（Uvicorn）下的鎖定與資源洩漏風險。 |
| **Backend** | [B-2] Full-Text Search (FTS5) LIKE 拼裝安全 | **Medium** | 安全性/效能 | 關鍵字搜尋時混用 FTS5 與 LIKE。LIKE 部分轉義字符不當，可能導致無效查詢。 |
| **DevOps** | [D-1] 環境變數安全性與命名一致性 | **Low** | 安全性/維運 | 容器內部路徑與外部配置的同步問題，以及 API URL 的配置冗餘。 |
| **Frontend** | [F-2] Leaflet SSR 避讓與 Geolocation 異常防護 | **Low** | 健壯性 | Geolocation 拒絕或超時未給予友善提示，部分極端情況下可能產生 Hydration 錯誤。 |

---

## 🛠️ 模組深度剖析

### 1. Scheduler 模組 (資料處理與 PDF 解析)

#### 1.1 健壯性：下載重試與超時機制
*   **現狀分析**：
    在 [update_data.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/scheduler/update_data.py#L303) 中，使用 `requests.get(DOWNLOAD_URL, ...)` 進行下載，雖然設定了 `timeout=120`，但對於政府伺服器常見的「短暫連線中斷」或「伺服器過載 503」缺乏重試機制，這會導致排程腳本在第一次下載失敗時就直接調用 `sys.exit(1)` 中斷。
*   **優化建議**：
    引入 `urllib3` 的 `Retry` 機制，並將其掛載至 `requests.Session` 上。實施指數退避（Exponential Backoff）重試。

##### 💡 程式碼優化對比
```diff
-        resp = requests.get(DOWNLOAD_URL, headers=headers, timeout=120, stream=True)
-        resp.raise_for_status()
+        from requests.adapters import HTTPAdapter
+        from urllib3.util import Retry
+
+        session = requests.Session()
+        retries = Retry(
+            total=5,
+            backoff_factor=2,  # 重試間隔：2s, 4s, 8s, 16s, 32s
+            status_forcelist=[500, 502, 503, 504],
+            raise_on_status=False
+        )
+        session.mount("https://", HTTPAdapter(max_retries=retries))
+        session.mount("http://", HTTPAdapter(max_retries=retries))
+
+        resp = session.get(DOWNLOAD_URL, headers=headers, timeout=60, stream=True)
+        resp.raise_for_status()
```

#### 1.2 效能：PDF 解析與 SQLite 批次寫入
*   **現狀分析**：
    *   `PyMuPDF` 在 `parse_pdf_to_db` 中逐頁讀取並將所有文本載入至 `lines` 陣列（5.5 萬筆數據，共約 22 萬行），佔用記憶體極小（約數十 MB），此設計在記憶體管理上是安全的。
    *   在寫入 SQLite 時，使用了 `executemany`：
        ```python
        cursor.executemany(
            "INSERT OR IGNORE INTO merchants (name, address, zip_code, tax_id, website) VALUES (?, ?, ?, ?, ?)",
            insert_data
        )
        ```
        這在單次 Transaction 中處理 5.5 萬筆寫入，效能良好。
*   **潛在風險**：
    在 `prod_conn` 的原子性替換部分：
    ```python
    prod_conn.execute("DELETE FROM main.merchants")
    prod_conn.execute("INSERT INTO main.merchants SELECT * FROM new_db.merchants")
    ```
    雖然有 WAL 模式，但直接清空再插入 5.5 萬筆資料會導致 WAL 檔案短暫膨脹至 ~20MB，並在此寫入事務期間阻止其他寫入事務。因本專案後端只有讀取 API，沒有其他寫入操作，因此這是一個**可接受且安全的原子性設計**。

---

### 2. Backend 模組 (FastAPI & SQLite)

#### 2.1 健壯性：SQLite `check_same_thread=False` 與資源洩漏
*   **現狀分析**：
    在 [database.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/database.py#L11) 中：
    ```python
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    ```
    FastAPI 預設會在執行緒池（ThreadPoolExecutor）中運行 sync 路由函數（如 `get_merchants`），此時多個執行緒會共用或獲取不同的 `sqlite3.Connection`。
    因為 `database.py` 中使用了 `Generator` (`get_db`) 與 FastAPI 的 `Depends(get_db)` 依賴注入：
    ```python
    def get_db() -> Generator[sqlite3.Connection, None, None]:
        conn = get_db_connection()
        try:
            yield conn
        finally:
            conn.close()
    ```
    *   **結論**：每個 API 請求都有獨立的連接，且會在請求結束時由 `finally` 正確關閉，因此**不存在跨執行緒共享連接的競態風險，資源管理非常安全**。

#### 2.2 全文檢索與 SQL LIKE 安全性
*   **現狀分析**：
    在 [merchants.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/routers/merchants.py#L75-L78) 中，當搜尋詞長度小於 3 時，會退回到 `LIKE` 查詢：
    ```python
    for term in like_terms:
        safe_term = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where_clauses.append("(m.name LIKE ? ESCAPE '\\' OR m.address LIKE ? ESCAPE '\\')")
        params.extend([f"%{safe_term}%", f"%{safe_term}%"])
    ```
    *   **優點**：開發者主動轉義了 `\`、`%` 和 `_`，並使用了 `ESCAPE '\'`，防範了萬用字元造成的查詢效能災難，這是非常優秀的安全意識。
    *   **改善空間**：若使用者輸入了包含特殊字元的短關鍵字（例如包含大量的空白字元），解析器 `parse_search_query` 僅以 `q.split()` 拆分，這能有效過濾連續空白。但如果 API 傳入 `q="   "`，會導致回傳空清單，應加強防禦性判斷。

---

### 3. Frontend 模組 (Next.js & Leaflet Map)

#### 3.1 🔴 安全性：Popup HTML 渲染中的 XSS 漏洞
*   **重大風險**：
    在 [MapView.tsx](file:///Users/ccchang/Project/NationalTravelCardMerchants/frontend/src/components/MapView.tsx#L161-L173) 中，我們看到了直接拼接 HTML 的做法：
    ```javascript
    const websiteLink = m.website
      ? `<a href="${m.website.startsWith("http") ? m.website : "http://" + m.website}" target="_blank" rel="noopener" ...>🔗 官方網站</a>`
      : "";
    
    marker.bindPopup(
      `<div style="...">
        <div style="...">${m.name}</div>
        <div style="...">${m.address || ""}</div>
        ...
        ${websiteLink}
      </div>`
    );
    ```
    如果資料庫中的 `m.name`、`m.address` 或 `m.website` 含有惡意 HTML/JavaScript 字串，例如：
    `m.name = '"><script>alert(document.cookie)</script>'` 或 `m.website = 'javascript:alert(1)'`。
    因為 Leaflet 的 `bindPopup` 會將這段字串直接作為 HTML 寫入 DOM，這將導致**跨站腳本攻擊 (XSS)**。
*   **優化建議**：
    在將欄位拼裝進 HTML 之前，必須進行 HTML 轉義（HTML Escape），且對於 `m.website`，應限制其必須以 `http://` 或 `https://` 開頭，阻斷 `javascript:` 偽協議注入。

##### 💡 程式碼優化對比
```diff
+    const escapeHtml = (unsafe: string) => {
+      return unsafe
+        .replace(/&/g, "&amp;")
+        .replace(/</g, "&lt;")
+        .replace(/>/g, "&gt;")
+        .replace(/"/g, "&quot;")
+        .replace(/'/g, "&#039;");
+    };
+
+    const sanitizeUrl = (url: string) => {
+      const trimmed = url.trim();
+      if (/^(https?:\/\/)/i.test(trimmed)) {
+        return trimmed;
+      }
+      if (/^(javascript:|data:|vbscript:)/i.test(trimmed)) {
+        return "about:blank";
+      }
+      return "http://" + trimmed;
+    };
+
     merchants.forEach((m) => {
       if (!m.lat || !m.lon) return;
       const marker = L.marker([m.lat, m.lon], { icon: merchantIcon });
 
       const distText =
         m.distance_km !== undefined
           ? `<span style="color:#C25E40;font-weight:500">${m.distance_km.toFixed(2)} km</span>`
           : "";
 
       const websiteLink = m.website
-        ? `<a href="${m.website.startsWith("http") ? m.website : "http://" + m.website}" target="_blank" rel="noopener" ...>🔗 官方網站</a>`
+        ? `<a href="${sanitizeUrl(m.website)}" target="_blank" rel="noopener" ...>🔗 官方網站</a>`
         : "";
 
+      const safeName = escapeHtml(m.name);
+      const safeAddress = escapeHtml(m.address || "");
+      const safeTaxId = escapeHtml(m.tax_id || "");
+
       marker.bindPopup(
         `<div style="min-width:200px;font-family:system-ui;padding:4px 0">
-          <div style="font-weight:600;font-size:14px;color:#333;margin-bottom:4px">${m.name}</div>
-          <div style="font-size:12px;color:#666;margin-bottom:4px">${m.address || ""}</div>
-          <div style="font-size:11px;color:#888">統編：${m.tax_id || ""}</div>
+          <div style="font-weight:600;font-size:14px;color:#333;margin-bottom:4px">${safeName}</div>
+          <div style="font-size:12px;color:#666;margin-bottom:4px">${safeAddress}</div>
+          <div style="font-size:11px;color:#888">統編：${safeTaxId}</div>
           ${websiteLink}
           ${distText ? `<div style="margin-top:4px;font-size:11px">${distText} 外</div>` : ""}
           ...
         </div>`
       );
```

#### 3.2 效能：Leaflet 標記渲染與 DOM 瓶頸
*   **現狀分析**：
    地圖頁面 (`map/page.tsx`) 預設最大獲取 `limit=200` 個商家。當前使用 `leaflet.markercluster` 進行標記聚合，這是一項極佳的效能決策，因為它能防止大量 DOM 節點一次性渲染在地圖上，有效將 Marker 的 DOM 開銷維持在 200 個以內，運作非常流暢。
*   **注意點**：
    如果未來擴大 `limit`（例如開放到 `limit=1000` 以上），即使有 Cluster，地圖縮放到最細（展開所有 Marker）時仍會造成瀏覽器卡頓。若未來有擴充需求，建議將 Leaflet 渲染模式切換為 **Canvas 模式**（透過設定 `L.map(..., { preferCanvas: true })`）。

#### 3.3 健壯性：HTML5 Geolocation API 的容錯
*   **現狀分析**：
    在 `map/page.tsx` 中有對 Geolocation 的呼叫：
    ```javascript
    navigator.geolocation.getCurrentPosition(
      (pos) => { ... },
      (err) => {
        setGeoError("定位失敗：" + err.message);
        setLocationStatus("定位失敗，請手動點擊地圖選擇位置");
      },
      { enableHighAccuracy: false, timeout: 5000 }
    );
    ```
    *   **優點**：設定了 `enableHighAccuracy: false`（降低定位耗時）以及 `timeout: 5000`（防卡死），並處理了錯誤回呼（Error Callback）。
    *   **改善空間**：在 HTTPS 以外的環境或部分瀏覽器中，`navigator.geolocation` 物件可能為 `undefined`。代碼中雖有 `if (!navigator.geolocation)` 判斷，但如果使用者在手機端拒絕了權限，通常會留下持久的拒絕狀態。若能加入引導使用者重新開啟定位權限的說明文字，使用者體驗會更佳。

---

### 4. DevOps 與系統整合

#### 4.1 Dockerfile 優化
*   **現狀分析**：
    *   前後端均有各自的 `Dockerfile`，且根目錄設有 `docker-compose.yml`。
    *   後端 FastAPI 採用 SQLite，本專案的 Scheduler 是在獨立容器中運行，每天更新並覆蓋 `merchants.db`。如果在 `docker-compose.yml` 中，Scheduler 與 Backend 掛載同一個主機目錄（Host Volume）以共享 `merchants.db`，則可以完美支援 Backend 讀取。
*   **環境變數一致性**：
    在 `.env` 與 `docker-compose.yml` 中，需確保 `DB_PATH` 對 Backend 與 Scheduler 的掛載路徑完全一致（例如：統一為 `/data/merchants.db`），否則會導致 Scheduler 更新了 `/data/merchants.db`，但 Backend 卻在讀取 `/app/backend/merchants.db`。

---

## 📈 高/中/低優先級優化建議清單

### 🔴 高優先級 (必須立刻修復)
1. **[F-1] 修正 `MapView.tsx` 的 XSS 漏洞**
   - **說明**：特店的 HTML Popup 直接注入變數，存在嚴重的跨站腳本攻擊風險。
   - **行動**：實施 HTML Escape 轉義，並對網址進行 `javascript:` 偽協議檢查與過濾。

### 🟡 中優先級 (建議於下個版本更新)
2. **[S-1] 為 Scheduler 下載腳本增加 `Retry` 與 `Timeout`**
   - **說明**：提升定時更新的成功率，避免政府網站偶發性異常導致排程中斷。
   - **行動**：在 `requests.Session` 內配置 HTTPAdapter 及指數退避重試。
3. **[B-2] 改善搜尋關鍵字過濾防禦**
   - **說明**：避免輸入空白字元時執行無效的 SQL `LIKE` 搜尋，減少資料庫效能損耗。
   - **行動**：在 API router 端點增加前置字元清理與空白檢查。

### 🟢 低優先級 (程式碼美化與體驗提升)
4. **[D-1] 統一並收斂環境變數**
   - **說明**：清理前後端重複配置的 API 網址，並在 `docker-compose.yml` 寫明 Volume 掛載關係。
5. **[F-2] 提升 Geolocation 定位體驗說明**
   - **說明**：在定位失敗或權限被拒絕時，在介面上提供「如何重新授權定位」的友善說明提示。
