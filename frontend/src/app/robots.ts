import { MetadataRoute } from "next";
import { getSiteUrl } from "@/utils/site";

export default function robots(): MetadataRoute.Robots {
  const SITE_URL = getSiteUrl();
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
    // 根 sitemap 只含首頁；商家分片在 /merchants/sitemap/<id>.xml（共 6 片，見 app/merchants/sitemap.ts）
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      ...Array.from({ length: 6 }, (_, id) => `${SITE_URL}/merchants/sitemap/${id}.xml`),
    ],
  };
}
