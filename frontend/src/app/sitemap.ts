import { MetadataRoute } from "next";
import { getSiteUrl } from "@/utils/site";

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// 每次重新驗證間隔：24 小時（商店資料更新頻率低）
export const revalidate = 86400;

// 單檔 sitemap 上限：Google 規定單一 sitemap 檔最多 50000 個 URL。
// PER_PAGE=100 × MAX_PAGES=600 = 最多 60000 筆，覆蓋目前約 55k 商家；
// while 迴圈以 MAX_PAGES 截斷，保證不會無限抓取、單檔產出有上限。
// 若商家數持續成長超過單檔 50000 上限，後續以 generateSitemaps 拆多檔（可選）。
const PER_PAGE = 100;
const MAX_PAGES = 600;

// 後端 /api/data-info 的 last_updated 是資料真實更新時間；
// 取不到或格式無效時回傳 undefined，由呼叫端 fallback new Date()。
async function fetchDataLastUpdated(): Promise<string | undefined> {
  try {
    const res = await fetch(`${API_URL}/api/data-info`, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return undefined;
    const info: { last_updated?: unknown } = await res.json();
    if (typeof info.last_updated === "string" && info.last_updated && !isNaN(Date.parse(info.last_updated))) {
      return info.last_updated;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const SITE_URL = getSiteUrl();
  // lastModified 用真值：data-info.last_updated；fetch 失敗才用 new Date()
  const lastModified: string | Date = (await fetchDataLastUpdated()) ?? new Date();
  // 靜態頁面
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "daily",
      priority: 1.0,
      lastModified,
    },
  ];

  // 動態商店頁面：分頁抓取所有商店的 tax_id
  const merchantRoutes: MetadataRoute.Sitemap = [];

  try {
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= MAX_PAGES) {
      const res = await fetch(
        `${API_URL}/api/merchants?page=${page}&per_page=${PER_PAGE}`,
        { next: { revalidate: 86400 }, signal: AbortSignal.timeout(3000) }
      );

      if (!res.ok) break;

      const data = await res.json();
      const items: Array<{ id: number; tax_id: string | null }> = data.items || [];

      for (const item of items) {
        const slug = item.tax_id || String(item.id);
        merchantRoutes.push({
          url: `${SITE_URL}/merchant/${slug}`,
          changeFrequency: "monthly",
          priority: 0.7,
          lastModified,
        });
      }

      // 檢查是否還有下一頁
      if (page >= (data.total_pages || 1)) {
        hasMore = false;
      } else {
        page++;
      }
    }
  } catch (e) {
    console.error("[sitemap] Failed to fetch merchants:", e);
  }

  return [...staticRoutes, ...merchantRoutes];
}
