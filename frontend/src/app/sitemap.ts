import { MetadataRoute } from "next";
import { getSiteUrl } from "@/utils/site";

// 根 sitemap（/sitemap.xml）：只含靜態首頁。
// 商家 URL 拆到 /merchants/sitemap/<id>.xml（見 app/merchants/sitemap/[id]/route.ts），
// 避免單檔超過 Google 50000 URL 上限，且避開 Next.js 16 metadata 與
// app/sitemap.xml/route.ts 共佔 /sitemap.xml 的衝突。
export const dynamic = "force-dynamic";

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
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "daily",
      priority: 1.0,
      lastModified,
    },
  ];
}
