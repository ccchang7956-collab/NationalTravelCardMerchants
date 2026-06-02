import { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/merchant/"],
        // 地圖頁為純 client-side render，爬蟲無法取得有意義內容
        // 搜尋結果頁（含查詢參數）不索引，避免重複內容
        disallow: ["/map", "/?q=", "/?city=", "/?page="],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
