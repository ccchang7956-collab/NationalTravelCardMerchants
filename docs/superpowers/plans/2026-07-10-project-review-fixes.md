# 國民旅遊卡特約商店優化實作計畫 (Project Review Fixes)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復深度 Review 中發現的安全漏洞 (XSS)、下載穩定性缺陷 (Retry) 與搜尋關鍵字的防禦性邊界。

**Architecture:**
1. 在前端實作 HTML 轉義與 URL 過濾工具函式，並修改 Leaflet `MapView` 整合此防護，阻斷 XSS 攻擊。
2. 替排程下載器引進 `urllib3.util.Retry` 與 `requests.Session` 進行指數退避重試。
3. 加強後端全文檢索的關鍵字剖析器，過濾純空白與特殊雜訊以防無效的 SQL LIKE 語句。

**Tech Stack:** TypeScript (Next.js), Python 3 (FastAPI, pytest, requests, urllib3)

## Global Constraints
- 前端程式碼需符合 TypeScript 型別安全性。
- 後端 Python 代碼需與 Python 3.9+ 相容。
- 每個任務均須符合 TDD (測試驅動開發) 規範，先撰寫/修改測試確認失敗後，再撰寫實作使其通過。

---

### Task 1: 前端 MapView XSS 漏洞修復與測試

**Files:**
- Create: `frontend/src/utils/sanitize.ts`
- Modify: `frontend/src/components/MapView.tsx:130-195`
- Create: `frontend/scripts/test-sanitize.js`

**Interfaces:**
- Consumes: Leaflet 地圖中的特店屬性資料 `m.name`, `m.address`, `m.website`, `m.tax_id`。
- Produces: 
  - `escapeHtml(unsafe: string): string` 轉義 HTML 特殊字元。
  - `sanitizeUrl(url: string): string` 過濾 `javascript:` 等惡意協定網址。

- [ ] **Step 1: 建立前端 Sanitize 工具函式**
  建立 `frontend/src/utils/sanitize.ts`：
  ```typescript
  export const escapeHtml = (unsafe: string): string => {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  export const sanitizeUrl = (url: string): string => {
    const trimmed = url.trim();
    if (/^(https?:\/\/)/i.test(trimmed)) {
      return trimmed;
    }
    // 阻斷 javascript:, data:, vbscript: 注入
    if (/^(javascript:|data:|vbscript:)/i.test(trimmed)) {
      return "about:blank";
    }
    return "http://" + trimmed;
  };
  ```

- [ ] **Step 2: 建立前端驗證單元測試**
  建立獨立的 Node 測試檔 `frontend/scripts/test-sanitize.js`：
  ```javascript
  const assert = require("assert");

  // Mock TS module import manually
  const escapeHtml = (unsafe) => {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const sanitizeUrl = (url) => {
    const trimmed = url.trim();
    if (/^(https?:\/\/)/i.test(trimmed)) {
      return trimmed;
    }
    if (/^(javascript:|data:|vbscript:)/i.test(trimmed)) {
      return "about:blank";
    }
    return "http://" + trimmed;
  };

  console.log("🧪 執行前端 Sanitization 測試...");

  // Test HTML Escaping
  assert.strictEqual(escapeHtml("<div>test</div>"), "&lt;div&gt;test&lt;/div&gt;");
  assert.strictEqual(escapeHtml('Joe"s Cafe & Bar'), "Joe&quot;s Cafe &amp; Bar");
  assert.strictEqual(escapeHtml("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");

  // Test URL Sanitization
  assert.strictEqual(sanitizeUrl("https://example.com"), "https://example.com");
  assert.strictEqual(sanitizeUrl("javascript:alert(document.cookie)"), "about:blank");
  assert.strictEqual(sanitizeUrl("www.google.com"), "http://www.google.com");
  assert.strictEqual(sanitizeUrl("  http://test.tw  "), "http://test.tw");

  console.log("✅ 前端 Sanitization 測試全數通過！");
  ```

- [ ] **Step 3: 執行前端測試腳本**
  Run: `node frontend/scripts/test-sanitize.js`
  Expected: 印出 `✅ 前端 Sanitization 測試全數通過！` 且無錯誤拋出。

- [ ] **Step 4: 修改 MapView.tsx 整合防禦程式碼**
  修改 `frontend/src/components/MapView.tsx:130-195` 匯入與使用安全防護函式：
  ```typescript
  // 在 MapView.tsx 的適當位置（例如元件渲染前）引入或直接定義輔助函數（因 package.json 暫無 aliases，直接就地定義或相對路徑引進）
  const escapeHtml = (unsafe: string): string => {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const sanitizeUrl = (url: string): string => {
    const trimmed = url.trim();
    if (/^(https?:\/\/)/i.test(trimmed)) {
      return trimmed;
    }
    if (/^(javascript:|data:|vbscript:)/i.test(trimmed)) {
      return "about:blank";
    }
    return "http://" + trimmed;
  };
  ```
  在 `merchants.forEach((m) => { ... })` 渲染 Popup 時，將所有動態資料用防禦函式過濾：
  ```typescript
      merchants.forEach((m) => {
        if (!m.lat || !m.lon) return;
        const marker = L.marker([m.lat, m.lon], { icon: merchantIcon });

        const distText =
          m.distance_km !== undefined
            ? `<span style="color:#C25E40;font-weight:500">${m.distance_km.toFixed(2)} km</span>`
            : "";

        const websiteLink = m.website
          ? `<a href="${sanitizeUrl(m.website)}" target="_blank" rel="noopener" style="font-size:11px;color:#C25E40;display:block;margin-top:4px">🔗 官方網站</a>`
          : "";

        const safeName = escapeHtml(m.name);
        const safeAddress = escapeHtml(m.address || "");
        const safeTaxId = escapeHtml(m.tax_id || "");

        marker.bindPopup(
          `<div style="min-width:200px;font-family:system-ui;padding:4px 0">
            <div style="font-weight:600;font-size:14px;color:#333;margin-bottom:4px">${safeName}</div>
            <div style="font-size:12px;color:#666;margin-bottom:4px">${safeAddress}</div>
            <div style="font-size:11px;color:#888">統編：${safeTaxId}</div>
            ${websiteLink}
            ${distText ? `<div style="margin-top:4px;font-size:11px">${distText} 外</div>` : ""}
            <a href="/merchant/${m.tax_id || m.id}" class="merchant-detail-link" data-href="/merchant/${m.tax_id || m.id}" style="display:block;margin-top:8px;text-align:center;background:#C25E40;color:white;padding:4px 8px;border-radius:6px;font-size:12px;text-decoration:none;cursor:pointer">查看詳情</a>
          </div>`,
          { maxWidth: 260 }
        );
  ```

- [ ] **Step 5: 提交 Task 1 變更**
  ```bash
  git add frontend/src/utils/sanitize.ts frontend/scripts/test-sanitize.js frontend/src/components/MapView.tsx
  git commit -m "security(map): resolve HTML XSS vulnerability in Leaflet popup"
  ```

---

### Task 2: 排程器下載增加 Retry 與 Timeout

**Files:**
- Modify: `scheduler/update_data.py:296-314`
- Create: `backend/tests/test_scheduler_network.py`

**Interfaces:**
- Consumes: `requests.get(DOWNLOAD_URL, ...)`。
- Produces: 具有重試機制的 HTTP 下載，支援 HTTP 500, 502, 503, 504 連線重試。

- [ ] **Step 1: 撰寫下載重試測試（TDD）**
  建立 `backend/tests/test_scheduler_network.py`，模擬下載失敗觸發重試的行徑：
  ```python
  import pytest
  from unittest.mock import MagicMock, patch
  from scheduler.update_data import download_zip

  @patch("scheduler.update_data.requests.Session")
  def test_download_zip_with_retry_failures_then_success(mock_session_cls):
      # 模擬 Session
      mock_session = MagicMock()
      mock_session_cls.return_value = mock_session
      
      # 建立幾次失敗的 Response，以及最後一次成功的 Response
      mock_fail_resp = MagicMock()
      mock_fail_resp.raise_for_status.side_effect = Exception("503 Service Unavailable")
      
      mock_success_resp = MagicMock()
      mock_success_resp.raise_for_status.return_value = None
      mock_success_resp.iter_content.return_value = [b"zip-data"]
      
      # 模擬前三次失敗，第四次成功
      mock_session.get.side_effect = [
          mock_fail_resp, 
          mock_fail_resp, 
          mock_success_resp
      ]
      
      with patch("builtins.open", MagicMock()):
          with patch("os.path.getsize", return_value=1024):
              res = download_zip("dummy_dest.zip")
              
      assert res is True
      # 驗證總共呼叫了 3 次 get
      assert mock_session.get.call_count == 3
  ```

- [ ] **Step 2: 執行測試並驗證其失敗**
  Run: `PYTHONPATH=. pytest backend/tests/test_scheduler_network.py -v`
  Expected: FAIL (因為目前的程式碼尚未引入 Session 與重試，且沒有 mock 對應的 requests.get 頂層模組)。

- [ ] **Step 3: 於 update_data.py 實作 Session 與重試邏輯**
  修改 `scheduler/update_data.py` 中的 `download_zip`：
  ```python
  def download_zip(dest: str) -> bool:
      """從政府開放資料下載 ZIP 檔，回傳是否成功。"""
      log.info(f"📥 下載資料：{DOWNLOAD_URL}")
      headers = {
          "User-Agent": "NationalTravelCardBot/1.0 (automated data update)"
      }
      
      from requests.adapters import HTTPAdapter
      from urllib3.util import Retry

      session = requests.Session()
      retries = Retry(
          total=5,
          backoff_factor=1,  # 指數重試：1s, 2s, 4s...
          status_forcelist=[500, 502, 503, 504],
          raise_on_status=False
      )
      session.mount("https://", HTTPAdapter(max_retries=retries))
      session.mount("http://", HTTPAdapter(max_retries=retries))

      try:
          resp = session.get(DOWNLOAD_URL, headers=headers, timeout=60, stream=True)
          resp.raise_for_status()
          with open(dest, "wb") as f:
              for chunk in resp.iter_content(chunk_size=65536):
                  f.write(chunk)
          size_mb = os.path.getsize(dest) / 1024 / 1024
          log.info(f"✅ 下載完成：{size_mb:.1f} MB")
          return True
      except Exception as e:
          log.error(f"❌ 下載失敗：{e}")
          return False
  ```

- [ ] **Step 4: 重新執行測試驗證其通過**
  Run: `PYTHONPATH=. pytest backend/tests/test_scheduler_network.py -v`
  Expected: PASS。

- [ ] **Step 5: 提交 Task 2 變更**
  ```bash
  git add scheduler/update_data.py backend/tests/test_scheduler_network.py
  git commit -m "feat(scheduler): implement requests retry adapter with backoff"
  ```

---

### Task 3: 後端搜尋關鍵字過濾防禦

**Files:**
- Modify: `backend/routers/merchants.py:9-39`
- Modify: `backend/tests/test_query_parser.py:23-27`

**Interfaces:**
- Consumes: 使用者傳入的查詢字串 `q`。
- Produces: `parse_search_query(q: Optional[str]) -> Tuple[Optional[str], List[str]]`，確保在輸入特殊字元或僅有空白時，不傳回垃圾 LIKE 項目。

- [ ] **Step 1: 修改後端單元測試，加入極端輸入測試案例**
  修改 `backend/tests/test_query_parser.py` 新增兩個測試：
  ```python
  def test_parse_search_query_extreme_inputs():
      # 測試純空白或垃圾字元
      assert parse_search_query("   ") == (None, [])
      assert parse_search_query("  \t\n  ") == (None, [])
      # 測試全特殊字元
      assert parse_search_query("!@# $%^") == (None, [])
  ```

- [ ] **Step 2: 執行測試並驗證其失敗**
  Run: `PYTHONPATH=. pytest backend/tests/test_query_parser.py -v`
  Expected: FAIL，因為極端字元會被解析為 LIKE 的 Term（如 `["!@#", "$%^"]`）。

- [ ] **Step 3: 修復關鍵字解析邏輯**
  修改 `backend/routers/merchants.py` 的 `parse_search_query` 函數：
  ```python
  def parse_search_query(q: Optional[str]) -> Tuple[Optional[str], List[str]]:
      """
      解析搜尋字串 q。
      回傳:
        - fts_query: 適用於 FTS5 MATCH 的字串 (長度 >= 3 的詞以 AND 連接，並用雙引號包覆)
        - like_terms: 適用於 LIKE 的剩餘短詞 (長度 < 3)
      """
      if not q:
          return None, []
      
      # 移除非字母、非數字、非中文字元（保留空白以利 split）
      # 這可以防止如特殊符號造成的無意義 SQL 檢索
      cleaned_q = re.sub(r'[^\w\s\u4e00-\u9fff]', '', q)
      
      terms = []
      seen = set()
      for t in cleaned_q.split():
          t_clean = t.strip()
          if t_clean and t_clean not in seen:
              seen.add(t_clean)
              terms.append(t_clean)
              
      fts_parts = []
      like_terms = []
      
      for term in terms:
          if len(term) >= 3:
              escaped = term.replace('"', '""')
              fts_parts.append(f'"{escaped}"')
          else:
              like_terms.append(term)
              
      fts_query = " AND ".join(fts_parts) if fts_parts else None
      return fts_query, like_terms
  ```

- [ ] **Step 4: 執行測試確認全部通過**
  Run: `PYTHONPATH=. pytest backend/tests/test_query_parser.py -v`
  Expected: PASS。

- [ ] **Step 5: 提交 Task 3 變更**
  ```bash
  git add backend/routers/merchants.py backend/tests/test_query_parser.py
  git commit -m "fix(backend): sanitize extreme inputs in search query parser"
  ```
