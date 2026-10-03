import { getBackendUrl } from "@/utils/env";

export const SITEMAP_SHARD_SIZE = 10_000;
export const SITEMAP_BATCH_SIZE = 5_000;

export interface SitemapShard { id: number; min_id: number; max_id: number; count: number }
export interface SitemapManifest { version: string; total: number; shard_size: number; last_updated: string | null; shards: SitemapShard[] }
export interface SitemapMerchant { id: number; tax_id: string | null }
interface SitemapBatch { version: string; items: SitemapMerchant[]; next_cursor: number | null }
export class DatasetChangedError extends Error {}
export class SitemapMissingError extends Error {}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (response.status === 409) throw new DatasetChangedError("Dataset changed");
  if (!response.ok) throw new Error(`Sitemap API response ${response.status}`);
  return response.json();
}

export async function fetchSitemapManifest(apiUrl = getBackendUrl()): Promise<SitemapManifest> {
  const manifest = await fetchJson(`${apiUrl}/api/sitemaps/manifest`) as SitemapManifest;
  if (!manifest || typeof manifest.version !== "string" || manifest.shard_size !== SITEMAP_SHARD_SIZE || !Array.isArray(manifest.shards)) throw new Error("Invalid sitemap manifest");
  let count = 0;
  let previous = 0;
  manifest.shards.forEach((shard, index) => {
    if (shard.id !== index || !Number.isSafeInteger(shard.min_id) || !Number.isSafeInteger(shard.max_id) || shard.min_id <= previous || shard.max_id < shard.min_id || !Number.isInteger(shard.count) || shard.count < 1 || shard.count > SITEMAP_SHARD_SIZE) throw new Error("Invalid sitemap boundaries");
    count += shard.count;
    previous = shard.max_id;
  });
  if (count !== manifest.total) throw new Error("Incomplete sitemap manifest");
  return manifest;
}

export async function fetchSitemapShard(manifest: SitemapManifest, id: number, apiUrl = getBackendUrl()): Promise<SitemapMerchant[]> {
  const shard = manifest.shards.find(item => item.id === id);
  if (!shard) throw new SitemapMissingError("Unknown sitemap shard");
  const items: SitemapMerchant[] = [];
  let cursor = 0;
  const batches = Math.ceil(shard.count / SITEMAP_BATCH_SIZE);
  for (let batchNumber = 0; batchNumber < batches; batchNumber++) {
    const query = new URLSearchParams({ version: manifest.version, min_id: String(shard.min_id), max_id: String(shard.max_id), after_id: String(cursor), limit: String(SITEMAP_BATCH_SIZE) });
    const batch = await fetchJson(`${apiUrl}/api/sitemaps/merchants?${query}`) as SitemapBatch;
    if (batch.version !== manifest.version) throw new DatasetChangedError("Dataset changed");
    if (!Array.isArray(batch.items) || batch.items.length === 0 || batch.items.length > SITEMAP_BATCH_SIZE) throw new Error("Invalid sitemap batch");
    for (const merchant of batch.items) {
      if (!Number.isSafeInteger(merchant.id) || merchant.id <= cursor || merchant.id < shard.min_id || merchant.id > shard.max_id || (merchant.tax_id !== null && typeof merchant.tax_id !== "string")) throw new Error("Invalid sitemap cursor");
      items.push(merchant);
      cursor = merchant.id;
    }
    const expectedCursor = cursor < shard.max_id ? cursor : null;
    if (batch.next_cursor !== expectedCursor) throw new Error("Incomplete sitemap batch");
  }
  if (items.length !== shard.count || cursor !== shard.max_id) throw new Error("Incomplete sitemap shard");
  return items;
}

export async function loadSitemapShard(id: number, apiUrl = getBackendUrl()): Promise<{ manifest: SitemapManifest; items: SitemapMerchant[] }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const manifest = await fetchSitemapManifest(apiUrl);
      return { manifest, items: await fetchSitemapShard(manifest, id, apiUrl) };
    } catch (error) {
      if (!(error instanceof DatasetChangedError) || attempt === 1) throw error;
    }
  }
  throw new Error("Dataset kept changing");
}

export function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function sitemapXml(siteUrl: string, manifest: SitemapManifest, items: SitemapMerchant[]): string {
  const modified = manifest.last_updated && Number.isFinite(Date.parse(manifest.last_updated)) ? `<lastmod>${escapeXml(manifest.last_updated)}</lastmod>` : "";
  const urls = items.map(item => `<url><loc>${escapeXml(`${siteUrl}/merchant/${encodeURIComponent(item.tax_id || String(item.id))}`)}</loc>${modified}<changefreq>monthly</changefreq><priority>0.7</priority></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}
