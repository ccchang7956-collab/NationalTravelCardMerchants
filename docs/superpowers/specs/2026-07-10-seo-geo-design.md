# SEO / GEO 提升設計文件

**專案**：國民旅遊卡特約商店查詢系統  
**目標受眾**：公務員 / 軍公教人員  
**日期**：2026-07-10  
**作者**：Antigravity Brainstorming Session  

---

## 一、現況審計（Audit）

### ✅ 已做好的部分

| 項目 | 現狀 |
|------|------|
| `<title>` 與 `<meta description>` | ✅ 首頁、商家詳細頁皆有動態生成 |
| Canonical URL | ✅ 所有頁面設定正確 |
| robots.txt | ✅ 正確封鎖搜尋結果頁、地圖頁 |
| sitemap.xml | ✅ 動態生成包含所有商家頁 |
| OpenGraph / Twitter Card | ✅ 有設定（但缺 `og:image`） |
| `lang="zh-TW"` | ✅ HTML 標籤正確設定 |
| JSON-LD WebSite | ✅ layout.tsx 有 SearchAction |
| JSON-LD LocalBusiness | ✅ 商家詳細頁完整實作 |
| 語意 HTML（h1/h2） | ✅ 基本正確 |
| 搜尋結果頁不索引 | ✅ robots noindex 正確設定 |

### ❌ 現有缺口與問題

| 問題 | 嚴重度 | 說明 |
|------|--------|------|
| **缺 `og:image`** | 🔴 高 | 社群分享與 AI 引擎顯示無預覽圖，降低點擊率 |
| **商家頁缺行業別資訊** | 🔴 高 | JSON-LD LocalBusiness 沒有 `@type` 細分（餐廳、住宿等） |
| **無縣市靜態入口頁** | 🔴 高 | 「台北市國旅卡商店」等關鍵字無對應可索引頁面 |
| **H1 僅有一個，層次薄** | 🟡 中 | 商家列表頁沒有結構化的 `ItemList` JSON-LD |
| **footer 資訊太少** | 🟡 中 | 缺乏 FAQ、使用說明等 E-E-A-T 支撐內容 |
| **圖片缺 alt 屬性** | 🟡 中 | 使用 Heroicons 但無文字說明 |
| **地圖頁完全不可爬** | 🟡 中 | 雖已 disallow，但附近商店功能完全無 SEO 價值 |
| **無 FAQ Schema** | 🟡 中 | AI 引擎偏好 Q&A 格式，缺少 FAQPage JSON-LD |
| **無 BreadcrumbList** | 🟠 低 | 商家詳細頁缺麵包屑結構化資料 |
| **OpenGraph image 尺寸** | 🟠 低 | twitter card 使用 `summary` 而非 `summary_large_image` |
| **網站介紹文字過短** | 🟠 低 | 首頁 SEO 說明區塊僅 2 段，深度不足 |
| **無城市分類頁** | 🔴 高 | 缺少 `/city/台北市` 等可被索引的靜態分類頁 |
| **商家頁缺使用說明** | 🟡 中 | AI 問「這家店能用國旅卡嗎」時，頁面沒有明確確認文字 |

---

## 二、目標受眾搜尋行為分析

### 公務員典型搜尋情境

```
情境 A：出差前確認附近餐廳
  搜尋詞：「台中市 國旅卡 餐廳」、「國旅卡特約商店 台中」

情境 B：不確定某家店是否符合
  搜尋詞：「[店名] 國旅卡」、「[店名] 國民旅遊卡」

情境 C：旅遊前規劃
  搜尋詞：「花蓮 國旅卡 住宿」、「九份 國旅卡 景點」

情境 D：向 AI 助理詢問
  提問：「有哪些台北的國旅卡特約商店？」
  提問：「[店名] 可以用國民旅遊卡嗎？」
```

### 目標關鍵字矩陣

| 搜尋意圖 | 核心關鍵字 | 長尾關鍵字 |
|----------|-----------|-----------|
| 工具查詢 | 國旅卡商店查詢、國民旅遊卡特約商店 | 國旅卡商店列表、國旅卡特約商店清冊 |
| 地區導向 | {縣市} 國旅卡、{縣市} 國民旅遊卡 | {縣市} {行業} 國旅卡（住宿/餐廳/景點） |
| 品牌確認 | {店名} 國旅卡 | {店名} 可以用國旅卡嗎 |
| AI 問答 | 哪些店可以用國旅卡 | 國旅卡可以在哪裡用 |

---

## 三、方案比較

### 方案 A：最小修補（Patch Only）

**做法**：只修補現有頁面的缺口（og:image、JSON-LD 補充、FAQ 區塊）  
**優點**：改動最小，風險低，一週內完成  
**缺點**：無法攻佔地區關鍵字，SEO 天花板低  
**適合**：時間極緊或不希望改架構

### 方案 B：加城市靜態分類頁（推薦 ⭐）

**做法**：新增 `/city/[slug]` 靜態分類頁 + 修補現有缺口 + GEO 優化  
**優點**：
- 可索引「台北市 國旅卡」等高價值地區關鍵字
- 每縣市一頁，55K 商家分散到 22 個有意義的入口
- AI 引擎容易引用結構化的「台北市有 X 間特約商店」內容
- 不打破現有架構，用 Next.js 動態路由實作即可

**缺點**：需新增 22 頁靜態路由 + backend stats API 擴充  
**時程**：2～3 週

### 方案 C：全面內容擴充（Content Marketing）

**做法**：方案 B + 新增行業別分類頁 + Blog/使用指南  
**優點**：建立長期流量護城河，E-E-A-T 最強  
**缺點**：需要持續的內容產製，工程量大  
**適合**：長期運營計畫

---

## 四、設計規格（採用方案 B）

### 4.1 OG Image 生成（緊急修補）

**問題**：所有頁面無 `og:image`，社群分享無預覽，AI 引擎無視覺錨點

**解法**：使用 Next.js 的 `opengraph-image.tsx` 動態生成 OG 圖

```
frontend/src/app/
├── opengraph-image.tsx          ← 首頁預設 OG 圖（1200x630）
└── merchant/[id]/
    └── opengraph-image.tsx      ← 商家詳細頁動態 OG 圖
```

**首頁 OG 圖內容**：
- 背景：品牌暗褐紅色（#C25E40）漸層
- 主標題：「國民旅遊卡特約商店查詢」
- 副標題：「收錄 55,000+ 間全台特約商店」
- 小字：「支援店名、縣市、行業類別搜尋」

**商家 OG 圖動態內容**：
- 商家名稱（大字）
- 地址
- 「國民旅遊卡特約商店 ✓」標記
- 縣市 badge

> Twitter card 同步改為 `summary_large_image` 以顯示大圖預覽

---

### 4.2 城市分類頁 `/city/[slug]`（核心 SEO）

**路由結構**：
```
/city/taipei          → 台北市國旅卡特約商店
/city/new-taipei      → 新北市國旅卡特約商店
/city/taichung        → 台中市國旅卡特約商店
... (22 個縣市)
```

**頁面內容規格**：

1. **H1**：`{縣市名稱} 國民旅遊卡特約商店（{筆數} 間）`
2. **描述文字**：介紹該縣市的特約商店分布與行業類別
3. **行業分類快捷鈕**：住宿、餐飲、休閒遊樂、交通等
4. **商家列表**：前 20 筆（SSR），分頁連結到首頁篩選
5. **靜態 SEO 說明**：200 字說明國旅卡在此縣市的使用方式

**Metadata 規格**：
```typescript
title: `${cityName} 國旅卡特約商店查詢（${count} 間）｜國旅卡商店`
description: `查詢 ${cityName} 所有 ${count} 間國民旅遊卡特約商店，包含住宿、餐廳、景點等各類別。公務員持國旅卡即可消費。`
canonical: `${SITE_URL}/city/${slug}`
```

**JSON-LD**：
```json
{
  "@type": "ItemList",
  "name": "台北市國民旅遊卡特約商店",
  "numberOfItems": 1234,
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "item": { "@type": "LocalBusiness", ... } }
  ]
}
```

**城市 slug 對照表**：
```typescript
const CITY_SLUG_MAP = {
  "taipei": "台北市",
  "new-taipei": "新北市",
  "taoyuan": "桃園市",
  "taichung": "台中市",
  "tainan": "台南市",
  "kaohsiung": "高雄市",
  "keelung": "基隆市",
  "hsinchu-city": "新竹市",
  "hsinchu-county": "新竹縣",
  "miaoli": "苗栗縣",
  "changhua": "彰化縣",
  "nantou": "南投縣",
  "yunlin": "雲林縣",
  "chiayi-city": "嘉義市",
  "chiayi-county": "嘉義縣",
  "pingtung": "屏東縣",
  "yilan": "宜蘭縣",
  "hualien": "花蓮縣",
  "taitung": "台東縣",
  "penghu": "澎湖縣",
  "kinmen": "金門縣",
  "lienchiang": "連江縣",
}
```

---

### 4.3 FAQ Schema（GEO 核心）

> **GEO（Generative Engine Optimization）**：讓 ChatGPT、Perplexity、Gemini 等 AI 在回答問題時引用本站內容

**在首頁底部新增 FAQPage JSON-LD**，同時渲染為可視文字（雙效）：

```json
{
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "國民旅遊卡可以在哪裡使用？",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "國民旅遊卡（國旅卡）可在全台超過 55,000 間特約商店使用，涵蓋住宿、餐飲、休閒遊樂、文化體育、交通運輸等類別。本系統提供即時查詢服務，支援縣市篩選與店名搜尋。"
      }
    },
    {
      "@type": "Question",
      "name": "如何查詢附近的國旅卡特約商店？",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "可使用本系統的地圖功能，開啟定位後即可查看附近 1～5 公里內的特約商店。也可依縣市、行業類別進行篩選。"
      }
    },
    {
      "@type": "Question",
      "name": "國民旅遊卡特約商店資料多久更新一次？",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "本系統資料來源為政府開放資料，系統每日自動比對更新，確保提供最新的特約商店清單。"
      }
    },
    {
      "@type": "Question", 
      "name": "哪個縣市的國旅卡特約商店最多？",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "根據最新資料，台北市（中山區為最密集，超過 1,700 間）、新北市、台中市為特約商店數量最多的縣市，各有數千間特約商店。"
      }
    },
    {
      "@type": "Question",
      "name": "誰可以使用國民旅遊卡？",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "國民旅遊卡（National Travel Card）由行政院人事行政總處推動，適用於全體公務人員及其眷屬，用於國內旅遊相關消費補助。"
      }
    }
  ]
}
```

---

### 4.4 商家詳細頁強化

**現狀問題**：
- JSON-LD `@type` 固定為 `LocalBusiness`，應根據行業別細化
- 缺少 `BreadcrumbList`
- 缺少「此商店為國旅卡特約商店」的明確文字

**行業別 @type 對應**：
```typescript
const INDUSTRY_TYPE_MAP: Record<string, string> = {
  "7011": "Hotel",           // 住宿
  "5812": "Restaurant",      // 餐飲
  "7999": "AmusementPark",   // 休閒遊樂
  "4111": "LocalBusiness",   // 交通
  // fallback: "LocalBusiness"
}
```

**BreadcrumbList JSON-LD**：
```json
{
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "position": 1, "name": "首頁", "item": "https://..." },
    { "position": 2, "name": "台北市特約商店", "item": "https://.../city/taipei" },
    { "position": 3, "name": "{商家名稱}", "item": "https://.../merchant/..." }
  ]
}
```

**頁面文字強化**：
在商家詳細頁「國民旅遊卡特約商店」badge 下方加入：
```html
<p>本商店為國民旅遊卡（National Travel Card）官方認定特約商店，
   公務員及眷屬可持國旅卡於此消費。</p>
```

---

### 4.5 首頁 SEO 說明區塊擴充

**現狀**：2 段 ~200 字  
**目標**：5 段 ~500 字 + 結構化清單

**新增內容**：

1. 什麼是國民旅遊卡（介紹 + 受眾）
2. 特約商店類別（住宿、餐飲、景點、交通...）  
3. 如何查詢（步驟式說明）
4. 熱門縣市快速入口（22 縣市卡片，連結到 `/city/` 頁）
5. 資料來源說明（政府開放資料，增加 E-E-A-T 可信度）

---

### 4.6 效能優化（Core Web Vitals）

**目標**：Google 排名近年越來越重視 LCP、CLS、FID

| 項目 | 現況 | 改善方向 |
|------|------|---------|
| LCP | 未知 | 加 `<link rel="preload">` 給首屏字體 |
| 地圖頁 | CSR，爬蟲無內容 | 已封鎖索引（正確），無需改動 |
| 圖片 | 無圖片 | OG 圖使用 Next.js Image 或 Satori |
| 字體 | Inter via Google Fonts | 考慮 subset 或 preload |

---

### 4.7 Navbar 與內部連結強化

**現狀**：Navbar 只有首頁和地圖連結  
**新增**：
- 縣市下拉快選（點選進入 `/city/xxx`）
- Footer 加入縣市索引（全部 22 縣市連結）

**理由**：內部連結結構幫助 Google 理解網站層次，城市頁需要從首頁有連結進來才能被高效爬取。

---

## 五、GEO 優化專項

GEO（Generative Engine Optimization）讓 AI 引擎（ChatGPT、Gemini、Perplexity）在回答相關問題時引用本站。

### 核心原則

1. **成為權威資料來源**：明確標注「政府開放資料」、「每日更新」
2. **回答式內容**：頁面要直接回答「XXX 可以用國旅卡嗎？」
3. **數據具體化**：「超過 55,000 間」比「許多商家」更容易被 AI 引用
4. **結構清晰**：FAQ、表格、條列式內容比長段落更易被 AI 摘取

### GEO 具體做法

| 做法 | 實作位置 | 預期效果 |
|------|---------|---------|
| FAQPage Schema | 首頁底部 | AI 直接引用 Q&A 格式 |
| 明確的 `dateModified` | sitemap + JSON-LD | AI 優先選擇新鮮內容 |
| `speakable` Schema | 首頁和城市頁 | 語音搜尋和 AI 擷取 |
| 商家確認語句 | 商家詳細頁 | 回答「XXX 可以用國旅卡嗎」 |
| 縣市統計數據 | 城市頁 H1 | 回答「台北市有多少間國旅卡商店」 |

### `speakable` Schema（GEO 新增）

```json
{
  "@type": "WebPage",
  "speakable": {
    "@type": "SpeakableSpecification",
    "cssSelector": [".seo-intro", ".city-stats", ".merchant-confirm"]
  }
}
```

---

## 六、實作計畫（3 Phases）

### Phase 1：緊急修補（約 3 天）

| 任務 | 檔案 | 說明 |
|------|------|------|
| 1. 新增首頁 OG Image | `app/opengraph-image.tsx` | Satori 生成靜態圖 |
| 2. 新增商家 OG Image | `app/merchant/[id]/opengraph-image.tsx` | 動態帶商家名稱 |
| 3. Twitter card 改為 large | `layout.tsx` | `summary` → `summary_large_image` |
| 4. 首頁加 FAQPage JSON-LD | `app/page.tsx` | 5 個 Q&A |
| 5. 首頁 SEO 說明文字擴充 | `app/page.tsx` | 2段→5段 |
| 6. 商家詳細頁加 BreadcrumbList | `app/merchant/[id]/page.tsx` | JSON-LD |
| 7. 商家詳細頁加確認語句 | `app/merchant/[id]/page.tsx` | HTML 文字 |

### Phase 2：城市分類頁（約 1 週）

| 任務 | 檔案 | 說明 |
|------|------|------|
| 1. 建立 `/city/[slug]` 路由 | `app/city/[slug]/page.tsx` | SSR 頁面 |
| 2. 建立城市 slug 對照工具 | `utils/cities.ts` | slug ↔ 縣市名 |
| 3. Backend `/api/city-stats` | `routers/merchants.py` | 各城市統計 API |
| 4. 城市頁 metadata | `app/city/[slug]/page.tsx` | 動態 title/desc |
| 5. 城市頁 ItemList JSON-LD | `app/city/[slug]/page.tsx` | 結構化商家列表 |
| 6. 城市頁 speakable Schema | `app/city/[slug]/page.tsx` | GEO 優化 |
| 7. sitemap 加入城市頁 | `app/sitemap.ts` | 22 個城市 URL |
| 8. robots.ts 開放 `/city/` | `app/robots.ts` | 允許索引 |
| 9. 首頁加城市入口卡片 | `app/page.tsx` | 22 縣市快速入口 |
| 10. Navbar 加城市下拉 | `components/Navbar.tsx` | 快速導航 |
| 11. Footer 加城市索引 | `app/layout.tsx` | 完整連結網 |

### Phase 3：進階 GEO（約 1 週）

| 任務 | 檔案 | 說明 |
|------|------|------|
| 1. 行業別 @type 對應 | `app/merchant/[id]/page.tsx` | Hotel/Restaurant/等 |
| 2. `dateModified` 加入 JSON-LD | 商家頁 + 城市頁 | 新鮮度信號 |
| 3. speakable Schema 全站 | layout.tsx | AI 語音擷取 |
| 4. 首頁縣市統計卡片 | `app/page.tsx` | 帶數字的卡片 |
| 5. 圖片 alt 屬性補全 | 全站 | 無障礙 + SEO |
| 6. Core Web Vitals 稽核 | lighthouse | LCP/CLS 優化 |

---

## 七、成功指標

| 指標 | 現狀 | 目標（3 個月後） |
|------|------|----------------|
| Google Search Console 索引頁數 | ~55K | ~55K + 22 城市頁 |
| 「{縣市} 國旅卡」關鍵字排名 | 無 | 前 10 |
| AI 引用次數（Perplexity/ChatGPT）| 0 | 可量測引用 |
| 商家詳細頁 organic 流量 | 未知 | +30% |
| OG 圖有率 | 0% | 100% |

---

## 八、不做的事（YAGNI）

- ❌ 不建行業別分類頁（數量太多，效益未知）
- ❌ 不做 Blog/文章（需持續維護，超出本次範疇）
- ❌ 不改地圖頁 SSR（Leaflet 限制，成本高）
- ❌ 不導入 AMP（Next.js 生態已不推薦）
- ❌ 不建多語言（受眾為台灣公務員，中文足夠）

---

*本設計文件由 Antigravity Brainstorming 工作階段產生，2026-07-10*
