import { MetadataRoute } from "next";
import { getSiteUrl } from "@/utils/site";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const SITE_URL = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        // 功能頁由頁面 noindex 控制；允許讀取指令及探索商家連結。
        // Googlebot 與 OAI-SearchBot 等公開搜尋爬蟲適用此規則。
        allow: "/",
      },
    ],
    sitemap: `${SITE_URL}/sitemap-index.xml`,
  };
}
