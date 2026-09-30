import { getSiteUrl } from "@/utils/site";

export const dynamic = "force-static";

export async function GET() {
  const SITE_URL = getSiteUrl();
  const body = `# National Travel Card Merchants

本站：國民旅遊卡特約商店查詢（${SITE_URL}）
用途：全台國旅卡特約商店查詢，支援店名關鍵字、縣市、行業別篩選與地圖定位。
資料來源：人事行政總處開放資料，每日比對更新；商家頁載明資料更新時間。
API: /api/stats /api/data-info
查詢: /?q=關鍵字&city=台北市
商家頁: /merchant/{tax_id}
網站說明（給 AI 摘要用）: /llms.txt
`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
