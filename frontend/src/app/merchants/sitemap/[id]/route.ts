import { getSiteUrl } from "@/utils/site";
import { getBackendUrl } from "@/utils/env";
import { DatasetChangedError, SitemapMissingError, fetchSitemapManifest, fetchSitemapShard, sitemapXml } from "@/utils/sitemapShards";

export const dynamic = "force-dynamic";
const cache = new Map<string, { xml: string; expires: number }>();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!/^\d{1,6}\.xml$/.test(id)) return new Response("Sitemap not found", { status: 404 });
  const shardId = Number(id.slice(0, -4));
  const apiUrl = getBackendUrl();
  const siteUrl = getSiteUrl();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const manifest = await fetchSitemapManifest(apiUrl);
      if (!manifest.shards.some(shard => shard.id === shardId)) throw new SitemapMissingError("Unknown shard");
      const key = `${apiUrl}|${siteUrl}|${manifest.version}|${shardId}`;
      let cached = cache.get(key);
      if (!cached || cached.expires <= Date.now()) {
        try {
          const items = await fetchSitemapShard(manifest, shardId, apiUrl);
          cached = { xml: sitemapXml(siteUrl, manifest, items), expires: Date.now() + 300_000 };
          if (cache.size >= 64) cache.delete(cache.keys().next().value!);
          cache.set(key, cached);
        } catch (error) {
          if (error instanceof DatasetChangedError && attempt === 0) continue;
          throw error;
        }
      }
      return new Response(cached.xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-cache", ETag: `"${manifest.version}-${shardId}"` } });
    }
    throw new Error("Dataset kept changing");
  } catch (error) {
    const status = error instanceof SitemapMissingError ? 404 : 503;
    return new Response(status === 404 ? "Sitemap not found" : "Sitemap temporarily unavailable", { status, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
}
