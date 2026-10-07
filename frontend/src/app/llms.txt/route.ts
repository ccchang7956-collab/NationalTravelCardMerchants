import { getSiteUrl } from "@/utils/site";
import { CITIES, cityPageUrl } from "@/utils/cities";

export const dynamic = "force-dynamic";
export const revalidate = 86400;

export async function GET() {
  const SITE_URL = getSiteUrl();
  const body = `# 國民旅遊卡特約商店查詢（National Travel Card Merchants）

> 非官方查詢工具，依政府開放資料整理台灣國旅卡特約商店。提供商家名單、分店地址與統編查詢。

資料來源：https://data.gov.tw/dataset/12982
系統每日檢查來源，有新資料且成功匯入時才更新名單；商家頁標示名單資料更新時間。
同一統編可能有多間分店，請核對商家 id、店名與地址。
行業分類結果依已匯入的對照資料，未分類商家請改用店名或統編搜尋。
特約資格請向店家或官方系統 https://travel.nccc.com.tw/ 確認；補助資格與額度請向服務機關人事單位確認。

## 主要頁面
- [首頁](${SITE_URL}/)：店名、地址、統編與篩選查詢。
- [縣市入口](${SITE_URL}/city)：全台 22 縣市名單。
- [常見問題](${SITE_URL}/faq)：查詢方式、資格與額度說明及官方依據。
- [資料來源與更新方式](${SITE_URL}/about)：維護、資料限制與問題回報。

## 縣市名單
${CITIES.map(city => `- [${city.name}國旅卡特約商店](${SITE_URL}${cityPageUrl(city.slug)})`).join("\n")}

## 商家與資料
商家正式網址：${SITE_URL}/merchant/{id}；id 為本站商家識別碼，非統一編號。
縣市頁的下一頁連結提供更多商家，分頁網址為 /city/{slug}?page=2。
統計：${SITE_URL}/api/stats
資料狀態：${SITE_URL}/api/data-info
Sitemap index：${SITE_URL}/sitemap-index.xml（含一般頁面與根目錄商家分片）。
縣市住宿名單：/city/{slug}/accommodation；餐飲名單：/city/{slug}/dining。
分類依統一編號的稅籍行業別對照，不保證各分店提供相同服務。
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
