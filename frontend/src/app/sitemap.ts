import { MERCHANT_CATEGORIES } from "@/utils/merchantCategories";
import { getBackendUrl } from "@/utils/env";
import { MetadataRoute } from "next";
import { CITIES, cityPageUrl } from "@/utils/cities";
import { getSiteUrl } from "@/utils/site";

// 根 sitemap（/sitemap.xml）：含首頁、縣市入口與說明頁。
// 商家 URL 由根目錄 /sitemap-merchants-<id>.xml 提供（見 app/merchants/sitemap/[id]/route.ts），
// 避免單檔超過 Google 50000 URL 上限，且避開 Next.js 16 metadata 與
// app/sitemap.xml/route.ts 共佔 /sitemap.xml 的衝突。
export const dynamic = "force-dynamic";
export const revalidate = 86400;

async function fetchDataLastUpdated(): Promise<string | undefined> {
  const API_URL =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${API_URL}/api/data-info`, {
      // 依請求讀取資料日期，避免後端未就緒時的結果被建置或路由快取。
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return undefined;
    const info: { last_updated?: unknown } = await res.json();
    if (
      typeof info.last_updated === "string" &&
      info.last_updated &&
      !isNaN(Date.parse(info.last_updated))
    ) {
      return info.last_updated;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const SITE_URL = getSiteUrl();
  const lastModified = await fetchDataLastUpdated();
  const categoryEntries: MetadataRoute.Sitemap = [];
  for (const category of MERCHANT_CATEGORIES) {
    // Limit each batch to 22 cached, lightweight one-item responses.
    const pages = await Promise.all(CITIES.map(async city => {
      try {
        const query = new URLSearchParams({ city: city.name, industry_code: category.code, per_page: "1" });
        const response = await fetch(`${getBackendUrl()}/api/merchants?${query}`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(10000) });
        if (!response.ok) return null;
        const data = await response.json();
        return typeof data.total === "number" && data.total > 0 ? { url: `${SITE_URL}${cityPageUrl(city.slug, 1, category.slug)}` } : null;
      } catch { return null; }
    }));
    for (const entry of pages) if (entry) categoryEntries.push(entry);
  }
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "daily",
      priority: 1.0,
      lastModified,
    },
    { url: `${SITE_URL}/city`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    ...categoryEntries,
    ...CITIES.map((city) => ({
      url: `${SITE_URL}${cityPageUrl(city.slug)}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
