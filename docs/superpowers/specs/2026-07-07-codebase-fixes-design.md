# Codebase Bugfixes & Performance Optimization Design Spec

本規格書詳細定義並記錄如何修復「國民旅遊卡特約商店檢索系統」專案程式碼審查中發現的漏洞、問題與優化項目。

---

## 1. 修正 PDF 解析排程器以還原第 0 頁資料

### 檔案變更: `scheduler/update_data.py`
在 `parse_pdf_to_db` 函式中：
1. 將 `range(1, total_pages)` 改為 `range(0, total_pages)`。
2. 擴充 `headers` 集合，過濾 `"國民旅遊卡特約商店清冊"`。
3. 排除開頭為 `"檔案日期"` 的行，防止封面標題干擾資料解析。

```python
    headers = {"特店名稱", "特店地址", "郵遞區號", "統一編號", "特店網頁位址", "國民旅遊卡特約商店清冊"}
    lines = []
    total_pages = len(doc)
    for page_num in range(0, total_pages):  # 從第 0 頁開始解析
        page = doc[page_num]
        text = page.get_text("text")
        for line in text.split("\n"):
            line = normalize_text(line)
            if line and line not in headers and not line.startswith("檔案日期"):
                lines.append(line)
```

---

## 2. 修正 Nominatim API 連線政策 (User-Agent)

### 檔案變更: `frontend/src/components/AddressSearch.tsx`
在 `fetch` 請求頭中加入自訂 `User-Agent`，遵守 OpenStreetMap API 政策規定，防範生產生環境中被回傳 `403 Forbidden`。

```typescript
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=tw&limit=5`,
          {
            headers: {
              "Accept-Language": "zh-TW,zh;q=0.9",
              "User-Agent": "NationalTravelCardQuerySystem/1.0 (contact: admin@example.com)"
            },
            signal: controller.signal,
          }
        );
```

---

## 3. 提升 SQLite 並行性能與防鎖死機制

### 檔案變更: 
* `backend/database.py`
* `scheduler/update_data.py`
* `scripts/migrate_and_benchmark.py`

在連線初始化時，均執行 `busy_timeout` 與 `synchronous = NORMAL`：
```python
    conn.execute("PRAGMA busy_timeout = 5000;")
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
```

---

## 4. 移除 Cron 排程日誌重導向

### 檔案變更: `scheduler/crontab`
移除輸出重導向，讓日誌能夠直接輸出至容器主控台 (stdout)，確保符合 Docker 容器標準日誌收集規範。

```crontab
# 每天台灣時間 03:00 執行（UTC 19:00）
0 19 * * * python /app/update_data.py
```

---

## 5. 建立經緯度聯合索引

### 檔案變更:
* `scheduler/update_data.py`
* `scripts/migrate_and_benchmark.py`

在資料庫建表後建立 `lat` 與 `lon` 的聯合索引，以優化地圖半徑範圍查詢效能：
```sql
CREATE INDEX IF NOT EXISTS idx_lat_lon ON merchants(lat, lon);
```

---

## 6. 測試與驗證計畫

### 1. 單元測試驗證
* 修改 `backend/tests/test_scheduler.py` 確保模擬測試依然通過，並對第 0 頁標題過濾邏輯進行補充測試。
* 執行 `pytest` 確保所有測試正常運作。

### 2. 基準效能驗證
* 執行 `python3 scripts/migrate_and_benchmark.py` 確保經緯度聯合索引建立完成，並能正常生成基準對比表格。
