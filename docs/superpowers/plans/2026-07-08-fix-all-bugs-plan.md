# 國民旅遊卡特約商店查詢專案 — 漏洞與修復實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-step. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一次性修復專案中發現的 7 個 Bug（涵蓋 PDF 解析器、搜尋分流、縣市下拉選單、地圖 React 渲染與生命週期等問題），重建完整乾淨的特約商店資料庫，並大幅提升中文字詞搜尋效能與使用者體驗。

**Architecture:** 
- **後端與腳本**：重構 PDF 行預處理，處理折行網址合併；重構 items 切分狀態機，精確處理合併行；調整後端搜尋解析器以在 FTS5 trigram 索引上匹配 2 字元中文詞；調整 stats API 過濾機制。
- **前端 Web**：重構 React Leaflet 異步渲染依賴；將 Next.js URL query params 作為 Single Source of Truth，實現頁面狀態的雙向同步。

**Tech Stack:** Python 3.9, FastAPI, SQLite FTS5, Next.js 15, Leaflet, PyMuPDF (fitz)

## Global Constraints
- 保持原代碼註釋與結構完整性，不進行無關的重構。
- 所有修改均需進行 TDD 驗證，跑通單元測試與手動基準測試。
- 資料庫 schema 保持一致，但需重建完整無損的 `merchants.db`。

---

### Task 1: 修復 PDF 解析器中的首頁解析遺漏問題
**Files:**
- Modify: `scripts/parse_pdf.py`

- [ ] **Step 1: 修改遍歷頁面範圍**
  在 [scripts/parse_pdf.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/scripts/parse_pdf.py) 中，將遍歷範圍 `range(1, total_pages)` 改為 `range(0, total_pages)`，以包含第 0 頁的特店資料。並在 `headers` 集合中追加 `"國民旅遊卡特約商店清冊"`，並在行過濾時篩除 `"檔案日期"` 開頭的行。
  
  ```python
  # 修改前 (L73-L82):
  # lines = []
  # headers = {"特店名稱", "特店地址", "郵遞區號", "統一編號", "特店網頁位址"}
  # 
  # print("Reading text from PDF...")
  # for page_num in range(1, total_pages):
  #     page = doc[page_num]
  #     text = page.get_text("text")
  #     for line in text.split('\n'):
  #         line = normalize_text(line)
  #         if line and line not in headers:
  #             lines.append(line)

  # 修改後:
  lines = []
  headers = {"特店名稱", "特店地址", "郵遞區號", "統一編號", "特店網頁位址", "國民旅遊卡特約商店清冊"}
  
  print("Reading text from PDF...")
  for page_num in range(0, total_pages):
      page = doc[page_num]
      text = page.get_text("text")
      for line in text.split('\n'):
          line = normalize_text(line)
          if line and line not in headers and not line.startswith("檔案日期"):
              lines.append(line)
  ```

- [ ] **Step 2: 執行 pytest 驗證**
  執行：`PYTHONPATH=. pytest backend/tests/test_scheduler.py -v`
  預期結果：`test_scheduler_page_0_filtering_logic` 通過。

- [ ] **Step 3: 提交變更**
  ```bash
  git add scripts/parse_pdf.py
  git commit -m "fix(parser): include page 0 in pdf parsing to prevent missing records"
  ```

---

### Task 2: 預處理折行網址合併以防資料損毀
**Files:**
- Modify: `scripts/parse_pdf.py`
- Modify: `scheduler/update_data.py`

- [ ] **Step 1: 在 `scripts/parse_pdf.py` 中引入折行網址合併**
  在讀取完所有 lines 後，進行預處理，檢查當前行如果是網址且下一行是折行殘留，則進行合併，並跳過下一行。
  
  ```python
  # 程式碼片段：
  # 在 lines 獲取完畢後，即 lines.append(line) 迴圈結束後插入：
  merged_lines = []
  i = 0
  while i < len(lines):
      line = lines[i]
      if i + 1 < len(lines) and is_website(line):
          next_line = lines[i + 1]
          if (not re.search(r'[\u4e00-\u9fff]', next_line) and 
              not re.match(r'^\d{8}$', next_line) and 
              not re.match(r'^\d{3,6}$', next_line) and 
              ' ' not in next_line and
              len(next_line) <= 15):
              line = line + next_line
              i += 1
      merged_lines.append(line)
      i += 1
  lines = merged_lines
  ```

- [ ] **Step 2: 在 `scheduler/update_data.py` 中引入相同的合併邏輯**
  在 [scheduler/update_data.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/scheduler/update_data.py) 的 `parse_pdf_to_db` 函數中，於獲取完 lines 列表後（L393 的後面）插入相同的折行網址合併邏輯。

- [ ] **Step 3: 執行 pytest 驗證**
  執行：`PYTHONPATH=. pytest backend/tests/test_scheduler.py`
  預期結果：PASS。

- [ ] **Step 4: 提交變更**
  ```bash
  git add scripts/parse_pdf.py scheduler/update_data.py
  git commit -m "fix(parser): merge wrapped website lines during preprocessing to prevent data corruption"
  ```

---

### Task 3: 重構 items 切分狀態機以精確解析合併行
**Files:**
- Modify: `scripts/parse_pdf.py`
- Modify: `scheduler/update_data.py`

- [ ] **Step 1: 重構 `scripts/parse_pdf.py` 的 items 解析狀態機**
  修改 `for k in range(len(tax_indices))` 迴圈中的 items 判定邏輯，以處理店名與地址合併在同一行卻多出一行副資訊（如門牌）的例外情況。
  
  ```python
  # 修改後之 logic:
  if len(items) == 3:
      prev_website = items[0]
      n_part, a_part = split_merged(items[1])
      if a_part:
          name = n_part
          address = a_part + " " + items[2]
      else:
          name = items[1]
          address = items[2]
  elif len(items) == 2:
      if is_website(items[0]):
          prev_website = items[0]
          name, address = split_merged(items[1])
      else:
          n_part, a_part = split_merged(items[0])
          if a_part:
              name = n_part
              address = a_part + " " + items[1]
          else:
              name = items[0]
              address = items[1]
  elif len(items) == 1:
      name, address = split_merged(items[0])
  elif len(items) == 0:
      continue
  else:
      if is_website(items[0]):
          prev_website = items[0]
          n_part, a_part = split_merged(items[1])
          if a_part:
              name = n_part
              address = a_part + " " + "".join(items[2:])
          else:
              name = items[1]
              address = "".join(items[2:])
      else:
          n_part, a_part = split_merged(items[0])
          if a_part:
              name = n_part
              address = a_part + " " + "".join(items[1:])
          else:
              name = items[0]
              address = "".join(items[1:])
  ```

- [ ] **Step 2: 重構 `scheduler/update_data.py` 中的相同邏輯**
  將上述重構後的 items 判斷狀態機套用到 `scheduler/update_data.py` 對應的位置。

- [ ] **Step 3: 執行全量資料庫重新建置與解析**
  執行：`PYTHONPATH=. .venv/bin/python scripts/parse_pdf.py`
  這會重新讀取並生成 `merchants.db`，我們需要驗證損毀資料是否已經被修復。

- [ ] **Step 4: 執行 scratch 腳本驗證修復結果**
  執行驗證腳本：`PYTHONPATH=. .venv/bin/python /Users/ccchang/.gemini/antigravity-cli/brain/2679bb83-19b6-4a03-b845-94369eb5df65/scratch/inspect_db_errors.py`
  預期結果：其輸出的 Potential URL wrapping errors 數量應降為 0，且 Potential merged line errors 數量大幅減少（僅餘非格式問題）。

- [ ] **Step 5: 提交變更**
  ```bash
  git add scripts/parse_pdf.py scheduler/update_data.py
  git commit -m "fix(parser): robust state machine for items partitioning to handle merged name-address with extra lines"
  ```

---

### Task 4: 放寬 FTS5 中文 2 字詞限制以優化搜尋效能
**Files:**
- Modify: `backend/routers/merchants.py`
- Modify: `backend/tests/test_query_parser.py`
- Modify: `backend/tests/test_search_api.py`

- [ ] **Step 1: 修改 `parse_search_query` 中的長度限制**
  在 [backend/routers/merchants.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/routers/merchants.py) 中，將 `len(term) >= 3` 修改為 `len(term) >= 2`，以使所有 2 字元的中文查詢詞均走 FTS 索引搜尋。
  
  ```python
  # 修改前:
  # for term in terms:
  #     if len(term) >= 3:
  #         escaped = term.replace('"', '""')
  #         fts_parts.append(f'"{escaped}"')
  #     else:
  #         like_terms.append(term)

  # 修改後:
  for term in terms:
      if len(term) >= 2:
          escaped = term.replace('"', '""')
          fts_parts.append(f'"{escaped}"')
      else:
          like_terms.append(term)
  ```

- [ ] **Step 2: 修改單元測試**
  更新 `backend/tests/test_query_parser.py` 和 `backend/tests/test_search_api.py` 中的測試案例斷言，使其符合 2 字詞走 FTS 索引的預期。
  
  在 [backend/tests/test_query_parser.py](file:///Users/ccchang/Project/NationalTravelCardMerchants/backend/tests/test_query_parser.py)：
  ```python
  # 修改前:
  # def test_parse_search_query_short_terms():
  #     # 2字詞會被歸類在 LIKE
  #     assert parse_search_query("台北 咖啡") == (None, ["台北", "咖啡"])
  
  # 修改後:
  def test_parse_search_query_short_terms():
      # 2字詞現在走 FTS
      assert parse_search_query("台北 咖啡") == ('"台北" AND "咖啡"', [])
  ```
  
  同時，也將 `test_parse_search_query_mixed_terms` 中的短詞對應修改。

- [ ] **Step 3: 執行 pytest 驗證**
  執行：`PYTHONPATH=. pytest`
  預期結果：10 passed。

- [ ] **Step 4: 執行基準效能測試**
  執行：`PYTHONPATH=. .venv/bin/python scripts/migrate_and_benchmark.py`
  預期結果：在 "台北", "台中" 等 2 字短詞上，FTS 混合搜尋平均時長應顯著下降，並獲得數倍至數十倍的加速比。

- [ ] **Step 5: 提交變更**
  ```bash
  git add backend/routers/merchants.py backend/tests/
  git commit -m "perf(api): allow 2-character Chinese words to leverage FTS5 trigram index"
  ```

---

### Task 5: 重構 Stats API 縣市過濾邏輯
**Files:**
- Modify: `backend/routers/merchants.py`

- [ ] **Step 1: 重構 `get_stats` 中的 SQL 與 Python 過濾邏輯**
  修改 `get_stats` 函數。不再在 SQL 中使用 `LIMIT 25` 進行粗暴截斷，改為獲取全量前綴，以正則過濾出合法的台灣 22 個縣市，避免離島縣市在選單中缺失。
  
  ```python
  # 修改前:
  # cursor.execute("""
  #     SELECT SUBSTR(address, 1, 3) as city, COUNT(*) as count
  #     FROM merchants
  #     WHERE address IS NOT NULL AND address != ''
  #     GROUP BY SUBSTR(address, 1, 3)
  #     ORDER BY count DESC
  #     LIMIT 25
  # """)
  # cities = [{"city": row["city"], "count": row["count"]} for row in cursor.fetchall()]
  # valid_cities = [c for c in cities if not any(char.isdigit() for char in c["city"])]

  # 修改後:
  import re
  cursor.execute("""
      SELECT SUBSTR(address, 1, 3) as city, COUNT(*) as count
      FROM merchants
      WHERE address IS NOT NULL AND address != ''
      GROUP BY SUBSTR(address, 1, 3)
      ORDER BY count DESC
  """)
  # 台灣有效縣市清單 (排除雜訊)
  taiwan_city_pattern = re.compile(r'^[\u4e00-\u9fff]{3}$') # 匹配 3 個中文字 (如 台北市、南投縣)
  cities = []
  for row in cursor.fetchall():
      city_name = row["city"]
      if taiwan_city_pattern.match(city_name):
          cities.append({"city": city_name, "count": row["count"]})
  
  # valid_cities 邏輯更替
  ```

- [ ] **Step 2: 執行手動 API 測試**
  啟動後端：`PYTHONPATH=. .venv/bin/python backend/main.py`
  在另一視窗呼叫：`curl http://127.0.0.1:8000/api/stats`
  預期結果：JSON 回傳中應包含全台所有 22 個縣市（如 "連江縣" 應在列表中）。

- [ ] **Step 3: 提交變更**
  ```bash
  git add backend/routers/merchants.py
  git commit -m "fix(api): fix stats API city truncation to ensure all 22 cities are available"
  ```

---

### Task 6: 修復 Leaflet 地圖異步渲染與標記丟失問題
**Files:**
- Modify: `frontend/src/components/MapView.tsx`

- [ ] **Step 1: 引進 `mapReady` State 來驅使標記重繪**
  在 [frontend/src/components/MapView.tsx](file:///Users/ccchang/Project/NationalTravelCardMerchants/frontend/src/components/MapView.tsx) 中，加入一個 `mapReady` state。在地圖初始化結束時，呼叫 `setMapReady(true)`，並將 `mapReady` 加入到渲染特店標記的 `useEffect` 的依賴陣列中。
  
  ```typescript
  // 在 MapView 內部頂部引入狀態:
  const [mapReady, setMapReady] = useState(false);

  // 修改 initMap 完成處:
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { ... }).addTo(map);
  // ...
  mapRef.current = map;
  markersLayerRef.current = clusterGroup;
  setMapReady(true); // 標記地圖已就緒

  // 修改 clean-up:
  return () => {
    isMounted = false;
    setMapReady(false);
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  };

  // 修改渲染 markers 的 useEffect 依賴陣列:
  useEffect(() => {
    if (!mapReady || !mapRef.current || !markersLayerRef.current || !LRef.current) return;
    const L = LRef.current;
    // ... 繪製 markers ...
  }, [merchants, onSelectMerchant, mapReady]);
  ```

- [ ] **Step 2: 提交變更**
  ```bash
  git add frontend/src/components/MapView.tsx
  git commit -m "fix(frontend): introduce mapReady state to fix dynamic markers rendering issues"
  ```

---

### Task 7: 修復 Next.js 地圖頁面雙向狀態同步與歷史導航 Bug
**Files:**
- Modify: `frontend/src/app/map/page.tsx`

- [ ] **Step 1: 將 URL Query 參數作為地圖搜尋與位置狀態的 Single Source of Truth**
  在 [frontend/src/app/map/page.tsx](file:///Users/ccchang/Project/NationalTravelCardMerchants/frontend/src/app/map/page.tsx) 中，重構狀態同步。建立一個監聽 `searchParams` 變化的 `useEffect`，一旦發現 URL 上的緯度/經度或關鍵字改變，則同步更新本地 `center`, `keyword`, `radius` 狀態，並發起 `fetchNearby` 呼叫。這樣使用者在按下一頁/上一頁時地圖狀態方能連動。

  ```typescript
  // 修改 MapContent 中的 useEffect:
  useEffect(() => {
    const lat = searchParams.get("lat");
    const lon = searchParams.get("lon");
    const r = searchParams.get("radius");
    const q = searchParams.get("q");

    let currentLat = lat ? parseFloat(lat) : DEFAULT_CENTER[0];
    let currentLon = lon ? parseFloat(lon) : DEFAULT_CENTER[1];
    let currentRadius = r ? parseFloat(r) : 2;
    let currentKeyword = q || "";

    setCenter([currentLat, currentLon]);
    setRadius(currentRadius);
    setKeyword(currentKeyword);

    if (lat && lon) {
      fetchNearby(currentLat, currentLon, currentRadius, currentKeyword);
    }
  }, [searchParams, fetchNearby]); // 監聽 searchParams 的變化以支援雙向綁定與歷史導航
  ```

- [ ] **Step 2: 提交變更**
  ```bash
  git add frontend/src/app/map/page.tsx
  git commit -m "fix(frontend): make searchParams reactive to support browser back/forward navigation on map"
  ```
