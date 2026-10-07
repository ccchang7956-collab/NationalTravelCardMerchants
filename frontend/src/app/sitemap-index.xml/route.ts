import { getSiteUrl } from "@/utils/site";
import { escapeXml, fetchSitemapManifest } from "@/utils/sitemapShards";

export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  try {
    const site = getSiteUrl();
    const manifest = await fetchSitemapManifest();
    const urls = [`${site}/sitemap.xml`, ...manifest.shards.map(shard => `${site}/sitemap-merchants-${shard.id}.xml`)];
    const xml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url => `<sitemap><loc>${escapeXml(url)}</loc></sitemap>`).join("")}</sitemapindex>`;
    return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-cache" } });
  } catch {
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
}
