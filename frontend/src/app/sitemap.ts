import { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// 每次重新驗證間隔：24 小時（商店資料更新頻率低）
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 靜態頁面
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "daily",
      priority: 1.0,
      lastModified: new Date(),
    },
  ];

  // 動態商店頁面：分頁抓取所有商店的 tax_id
  const merchantRoutes: MetadataRoute.Sitemap = [];

  try {
    const PER_PAGE = 100;
    let page = 1;
    let hasMore = true;

    while (hasMore) {
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
