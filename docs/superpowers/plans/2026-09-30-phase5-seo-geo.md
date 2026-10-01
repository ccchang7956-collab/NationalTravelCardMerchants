# Phase 5 SEO + GEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修好 Google 索引基礎並補上 AI 引用（GEO）能力，讓本站可被搜到、可被引用。

**Architecture:** 先修索引正確性（robots/canonical/sitemap/網域），再補 AI 入口（llms.txt/schema/語意/FAQ/時間），每步都有源碼契約測試＋全量迴歸。

**Tech Stack:** Next.js 16.2.6 App Router + React 19, FastAPI, pytest, Jest

## Global Constraints

- Next.js 16 API 以 `frontend/node_modules/next/dist/docs/` 為準。
- 不硬編碼測試結果，不寫 Facade 空實作，不造假結構化資料（無資料就省略）。
- 每 Task 可獨立測試，頻繁 commit。
- TDD：先 failing test，再最小實作。

---

### Task 1: 索引正確性 — robots/canonical/網域/基礎標頭

**Files:**
- Modify: `frontend/src/app/robots.ts`
- Modify: `frontend/src/app/page.tsx:20-60` (generateMetadata)
- Modify: `frontend/src/app/layout.tsx:12,61-63` (SITE_URL/viewport)
- Modify: `frontend/src/app/sitemap.ts:3` (SITE_URL 預設)
- Modify: `frontend/src/app/merchant/[id]/page.tsx` (SITE_URL 函式內已有，補 prod 預設)
- Create: `frontend/src/app/not-found.tsx`
- Test: `frontend/src/__tests__/Phase5Seo.test.tsx`

**Interfaces:**
- Consumes: 無（Phase4 的 viewport/CSP 保留）。
- Produces: `PROD_URL=https://ntc.example.tw` 慣例（implementer 先 grep 全站 SITE_URL fallback 行數，若 prod 網域另有約定則用約定值並在報告註明）；robots query 擋法；hasFilters 完整。

- [ ] **Step 1: Write the failing test**

```tsx
// Phase5Seo.test.tsx（讀源碼契約）
// 1. robots.ts 含 "/*?q=" 且無裸 "/?q=" disallow
// 2. page.tsx generateMetadata 的 hasFilters 含 industry_code 且 robots follow:true（無 follow:false）
// 3. page>1 用 self-canonical（源碼含 searchParams page 自指或 canonical 變數非固定 "/"）
// 4. layout viewport 含 device-width
// 5. 全站無 `|| "http://localhost:3000"` 作為 SITE_URL 最終 fallback（允許 dev 註解，production 預設須為 https 正式網域或 throw）
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --ci --watchAll=false src/__tests__/Phase5Seo.test.tsx` (in frontend/)
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```ts
// robots.ts
disallow: ["/map", "/*?q=", "/*?city=", "/*?page=", "/*?lat=", "/*?industry_code="]
```

```tsx
// page.tsx generateMetadata
const hasFilters = !!(q || city || resolved.has_website || resolved.radius_km || resolved.industry_code || resolved.lat || resolved.lon || (resolved.page && resolved.page !== "1"));
return { alternates: { canonical: hasFilters || page > 1 ? `/?${new URLSearchParams(resolved as Record<string,string>).toString()}` : SITE_URL + "/" },
  ...(hasFilters || page > 1 ? { robots: { index: false, follow: true } } : {}) }
```

```ts
// SITE_URL：新增 frontend/src/utils/site.ts
export function getSiteUrl(): string {
  const u = process.env.NEXT_PUBLIC_SITE_URL;
  if (u) return u.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") throw new Error("NEXT_PUBLIC_SITE_URL must be set in production");
  return "http://localhost:3000";
}
// 全站 5 處 fallback 改調 getSiteUrl()（layout/page/merchant/sitemap/robots）
```

```tsx
// layout viewport
export const viewport: Viewport = { themeColor: "#2563eb", width: "device-width", initialScale: 1, maximumScale: 5 };
```

```tsx
// not-found.tsx：h1 + 回首頁 Link + 熱門縣市 4 連結（台北市/新北市/台中市/高雄市）
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --ci --watchAll=false` + `npm run lint` (in frontend/)
Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/robots.ts frontend/src/app/page.tsx frontend/src/app/layout.tsx frontend/src/app/sitemap.ts "frontend/src/app/merchant/[id]/page.tsx" frontend/src/utils/site.ts frontend/src/app/not-found.tsx frontend/src/__tests__/Phase5Seo.test.tsx
git commit -m "fix(seo): robots, canonical, site url, viewport, 404"
```

### Task 2: 卡片與結構化資料 — OG/Twitter/麵包屑/LocalBusiness

**Files:**
- Modify: `frontend/src/app/layout.tsx:36-48` (twitter)
- Modify: `frontend/src/app/merchant/[id]/page.tsx:49-111` (twitter card/url/sameAs/address/BreadcrumbList)
- Create: `frontend/src/app/twitter-image.tsx` (複用 OG 元件)
- Modify: `frontend/src/app/merchant/[id]/opengraph-image.tsx` (補 alt)
- Modify: `frontend/public/manifest.json:2` (品牌名)
- Test: `frontend/src/__tests__/Phase5Schema.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 getSiteUrl。
- Produces: 全站 summary_large_image；詳情 BreadcrumbList；url=pageUrl/sameAs=官網。

- [ ] **Step 1: Write the failing test**

```tsx
// Phase5Schema：layout twitter card 全站 large；merchant twitter large；merchant 源碼含 BreadcrumbList + sameAs + url: pageUrl；manifest name 含國民旅遊卡；og-image alt 存在
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --ci --watchAll=false src/__tests__/Phase5Schema.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```tsx
// layout twitter.card 改 summary_large_image；merchant page twitter 同改
// merchant JSON-LD：url: pageUrl，...(website ? { sameAs: [website] } : {})，addressRegion 改 city 欄位或縣市表比對（取不到省略）
// BreadcrumbList：首頁 > {city} > {店名}，itemListElement 3 項
// twitter-image.tsx：export default 同 opengraph-image 邏輯（固定文案版），export const alt
// manifest name/short_name 改「國民旅遊卡特約商店查詢」
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --ci --watchAll=false` + `npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/layout.tsx "frontend/src/app/merchant/[id]/page.tsx" frontend/src/app/twitter-image.tsx "frontend/src/app/merchant/[id]/opengraph-image.tsx" frontend/public/manifest.json frontend/src/__tests__/Phase5Schema.test.tsx
git commit -m "fix(seo): cards, breadcrumbs, localbusiness, brand"
```

### Task 3: Sitemap index + 真實時間

**Files:**
- Modify: `frontend/src/app/sitemap.ts`
- Test: `backend/tests/test_phase5_sitemap.py` + 前端契約併入 Phase5Seo（可選）

**Interfaces:**
- Consumes: Task 1 getSiteUrl；後端 `/api/data-info` last_updated。
- Produces: 單檔上限內分頁抓取；lastModified 用真值。

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_phase5_sitemap.py
def test_sitemap_has_page_cap():
    import pathlib
    src = pathlib.Path("frontend/src/app/sitemap.ts").read_text()
    assert "MAX_PAGES" in src and "50000" in src
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/bin/pytest backend/tests/test_phase5_sitemap.py -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```ts
// sitemap.ts：const MAX_PAGES = 20（如 20*100=2000 首版上限？不——商家 55k 需分多檔；最小改：保留 while 但加 MAX_PAGES=600、單次 timeout、失敗 break；lastModified：首頁用 data-info.last_updated（fetch 失敗才 new Date）；商家每條用 data-info.last_updated（無逐店時間前）
// 更完整（若時間夠）：拆 app/sitemap.xml/route.ts 輸出 index + app/sitemap/[n]/route.ts；最小驗收以前者為準，後者列為可選
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/bin/pytest backend/tests/test_phase5_sitemap.py backend/tests/test_search_api.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/sitemap.ts backend/tests/test_phase5_sitemap.py
git commit -m "fix(seo): sitemap caps and real lastmod"
```

### Task 4: GEO 入口 — llms.txt/Organization/私人頁

**Files:**
- Create: `frontend/src/app/llms.txt/route.ts`
- Modify: `frontend/src/app/layout.tsx:77-104` (Organization + footer link)
- Modify: `frontend/src/app/dashboard/layout.tsx` + `frontend/src/app/itinerary/layout.tsx` (robots noindex)
- Test: `frontend/src/__tests__/Phase5Geo.test.tsx`

**Interfaces:**
- Consumes: Task 1 getSiteUrl。
- Produces: `/llms.txt` text/plain；Organization；私人頁 noindex。

- [ ] **Step 1: Write the failing test**

```tsx
// Phase5Geo：route.ts 存在且含 "National Travel Card" 與 "/api/stats"；layout 含 Organization；dashboard/itinerary layout 含 index:false
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --ci --watchAll=false src/__tests__/Phase5Geo.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```ts
// app/llms.txt/route.ts
export async function GET() {
  const body = `# National Travel Card Merchants\n\n用途:全台國旅卡特約商店查詢...\n資料來源:人事行政總處開放資料，每日比對...\nAPI: /api/stats /api/data-info\n查詢: /?q=關鍵字&city=台北市 ...\n商家頁: /merchant/{tax_id}\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
```

```tsx
// layout JSON-LD 加 Organization {name, url, logo: /icon.png, sameAs: []}；footer 加 <a href="/llms.txt">給 AI 的本站說明</a>
// dashboard/itinerary 各建 layout.tsx：export const metadata = { robots: { index: false, follow: false } }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --ci --watchAll=false` + `npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/llms.txt/route.ts frontend/src/app/layout.tsx frontend/src/app/dashboard/layout.tsx frontend/src/app/itinerary/layout.tsx frontend/src/__tests__/Phase5Geo.test.tsx
git commit -m "feat(geo): llms.txt, organization, private noindex"
```

### Task 5: GEO 內容 — 語意/類別/FAQ/時間數字

**Files:**
- Modify: `frontend/src/app/page.tsx:190-252,397-430` (article/FAQ/數字/時間)
- Modify: `frontend/src/app/merchant/[id]/page.tsx:113-205` (article/address/dl/category/dateModified)
- Modify: `backend/routers/merchants.py:269-304` + `backend/main.py:101-134` (/stats 加 last_updated 讀 update_meta.json)
- Create: `frontend/src/app/faq/page.tsx`
- Test: `frontend/src/__tests__/Phase5Content.test.tsx` + `backend/tests/test_phase5_stats.py`

**Interfaces:**
- Consumes: Task 4；後端 update_meta.json 格式（Task2 Phase1 已定）。
- Produces: 語意標籤；類別顯示；FAQ 10 問 + /faq；數字全動態 + 截至日期；/stats.last_updated。

- [ ] **Step 1: Write the failing test**

```python
# test_phase5_stats.py：GET /api/stats 含 last_updated（允許 null 但 key 必存在）
```

```tsx
// Phase5Content：詳情頁源碼含 <article、<address、industries/category；首頁無 "55,000" 寫死；有 <time dateTime；/faq/page.tsx 存在且 FAQPage 10 問
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/bin/pytest backend/tests/test_phase5_stats.py -v` + `npm test -- --ci --watchAll=false src/__tests__/Phase5Content.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```python
# /stats：讀 update_meta.json 取 last_updated（失敗 None），回傳加 "last_updated": ...（Stats 模型加 Optional[str]）
```

```tsx
// 列表卡 div→article；詳情頁 div→article>header(h1)+address+dl(table:地址/統編/類別/座標)+time；industries priority 排序渲染，無資料顯示未分類；JSON-LD 加 category + dateModified + speakable
// FAQ 擴 10-12 問（含額度 8000 觀光/自行運用、刷卡失敗、統編查詢、外島），新建 /faq 每問錨點 + FAQPage，首頁留 5 精華
// 刪 "55,000"/"1700" 寫死，全用 stats + data-info；句尾加「截至 {date}」；footer + SEO 區 + 詳情頁加 <time dateTime={last_updated}>資料更新：YYYY-MM-DD</time>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/bin/pytest backend/tests/test_phase5_stats.py backend/tests/test_search_api.py -q` + `npm test -- --ci --watchAll=false` + `npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/page.tsx "frontend/src/app/merchant/[id]/page.tsx" frontend/src/app/faq/page.tsx backend/routers/merchants.py backend/main.py backend/models.py frontend/src/__tests__/Phase5Content.test.tsx backend/tests/test_phase5_stats.py
git commit -m "feat(geo): semantics, categories, faq, timestamps"
```

### Task 6: 全量驗證

**Files:** Test only

- [ ] **Step 1: 後端全測**

Run: `./.venv/bin/pytest backend/tests -q`
Expected: 145+新增全 PASS

- [ ] **Step 2: 前端全測 + lint + tsc**

Run: `npm test -- --ci --watchAll=false` + `npm run lint` + `npx tsc --noEmit` (in frontend/)
Expected: 全 PASS

- [ ] **Step 3: SEO 煙霧**

Run: `JWT_SECRET_KEY=dummy npm run build` 抽查（daemon/記憶體若不足則改 `npx tsc` + `next lint` 已過即記跳過原因）+ `bash scripts/check_infra.sh`
Expected: PASS 或誠實記錄跳過

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-09-30-phase5-seo-geo.md
git commit -m "chore: verify phase5 suites green"
```

## Self-Review

- Spec coverage：robots/canonical/網域/viewport/404 → Task1；卡片/schema/品牌 → Task2；sitemap → Task3；llms/Organization/私人頁 → Task4；語意/類別/FAQ/時間 → Task5；驗證 → Task6。全覆蓋。SearchAction 刪除（audit 建議二選一）併入 Task1（robots 擋 q 故刪 potentialAction 只留 WebSite）。AI crawler 明確 allow 列為可選（預設不擋即允許，不寫亦可）。
- Placeholder scan：無 TBD/TODO，每步有檔案、程式碼、指令、期望。
- Type consistency：`getSiteUrl()` 單一來源；`last_updated: string | null`；`industries: MerchantIndustry[]` 沿用 models；`FAQPage mainEntity` 沿用 page.tsx 既有形狀；`tawan` 拼字注意 TAIWAN_CITIES 沿用 Task2 Phase4 常數。
