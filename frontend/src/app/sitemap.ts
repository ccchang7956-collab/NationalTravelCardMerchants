import { MetadataRoute } from "next";
import { getSiteUrl } from "@/utils/site";

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// 每次重新驗證間隔：24 小時（商店資料更新頻率低）
export const revalidate = 86400;

// Google 規定單一 sitemap 檔最多 50000 個 URL；本站約 55k 商家，
// 單檔（PER_PAGE=100 × MAX_PAGES=600 = 60000）會超過上限，
// 故以 generateSitemaps 拆成 sitemap index + 多子檔（保守每子檔取 10000 上限）。
// PER_PAGE=100 × PAGES_PER_FILE=100 = 每子檔最多 10000 條商家 URL；
// NUM_SITEMAPS=6 → 最多 60000 筆，覆蓋目前約 55k 商家。
// Next.js 會讓 /sitemap.xml 成為 sitemap index，子檔位於 /sitemap/<id>.xml。
const PER_PAGE = 100;
const PAGES_PER_FILE = 100;
const URLS_PER_FILE = PER_PAGE * PAGES_PER_FILE; // 10000 ≤ 50000
const NUM_SITEMAPS = 6;
const MAX_PAGES = NUM_SITEMAPS * PAGES_PER_FILE; // 600：全部分片合计抓取上限

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

export async function generateSitemaps() {
  return Array.from({ length: NUM_SITEMAPS }, (_, id) => ({ id }));
}

// Next.js 16：generateSitemaps 回傳的 id 以 Promise<string> 傳入。
// id=0 的子檔另含靜態首頁；其餘子檔只含商家 URL。
// 每子檔 while 迴圈以該分片頁區間截斷（PAGES_PER_FILE 頁），
// 保證單檔 ≤ URLS_PER_FILE（10000）條、不會無限抓取。
export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const SITE_URL = getSiteUrl();
  const parsed = Number(await props.id);
  const shard = Number.isInteger(parsed) && parsed >= 0 && parsed < NUM_SITEMAPS ? parsed : 0;
  // lastModified 用真值：data-info.last_updated；fetch 失敗才用 new Date()
  const lastModified: string | Date = (await fetchDataLastUpdated()) ?? new Date();
  // 靜態頁面（只在第 0 個子檔輸出，避免 index 下各子檔重複）
  const staticRoutes: MetadataRoute.Sitemap =
    shard === 0
      ? [
          {
            url: `${SITE_URL}/`,
            changeFrequency: "daily",
            priority: 1.0,
            lastModified,
          },
        ]
      : [];

  // 動態商店頁面：只抓取屬於本分片的頁區間
  const merchantRoutes: MetadataRoute.Sitemap = [];
  const startPage = shard * PAGES_PER_FILE + 1;
  const endPage = startPage + PAGES_PER_FILE - 1;

  try {
    let page = startPage;
    let hasMore = true;

    while (hasMore && page <= endPage && page <= MAX_PAGES) {
      const res = await fetch(
        `${API_URL}/api/merchants?page=${page}&per_page=${PER_PAGE}`,
        { next: { revalidate: 86400 }, signal: AbortSignal.timeout(3000) }
      );

      if (!res.ok) break;

      const data = await res.json();
      const items: Array<{ id: number; tax_id: string | null }> = data.items || [];
      if (items.length === 0) break;

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

  // 防禦性截斷：單檔輸出絕不超過 URLS_PER_FILE（10000）條
  return [...staticRoutes, ...merchantRoutes.slice(0, URLS_PER_FILE)];
}
