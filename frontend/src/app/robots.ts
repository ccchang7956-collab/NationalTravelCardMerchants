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
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
