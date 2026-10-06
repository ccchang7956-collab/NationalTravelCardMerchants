import { MetadataRoute } from "next";
import { getSiteUrl } from "@/utils/site";
import { fetchSitemapManifest } from "@/utils/sitemapShards";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const SITE_URL = getSiteUrl();
  let shards: string[] = [];
  try {
    const manifest = await fetchSitemapManifest();
    shards = manifest.shards.map(shard => `${SITE_URL}/merchants/sitemap/${shard.id}.xml`);
  } catch {
    shards = [];
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/merchant/"],
        // 地圖頁為純 client-side render，爬蟲無法取得有意義內容
        // 搜尋結果頁（含查詢參數）不索引，避免重複內容（wildcard 擋所有帶參數的 /）
        disallow: ["/map", "/*?q=", "/*?city=", "/*?page=", "/*?lat=", "/*?industry_code="],
      },
    ],
    // 根 sitemap 只含首頁；商家分片在 /merchants/sitemap/<id>.xml（片數見 sitemapShards）
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      ...shards,
    ],
  };
}
