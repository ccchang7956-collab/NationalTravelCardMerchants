import { fetchSitemapManifest, loadSitemapShard, sitemapXml, type SitemapManifest } from "@/utils/sitemapShards";

const manifest: SitemapManifest = { version: "a".repeat(32), total: 10000, shard_size: 10000, last_updated: "2026-10-01T03:00:00+08:00", shards: [{ id: 0, min_id: 3, max_id: 30000, count: 10000 }] };
const merchants = Array.from({ length: 10000 }, (_, i) => ({ id: (i+1)*3, tax_id: null }));
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value });

test("10,000 gapped IDs require exactly two compact batches", async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(ok(manifest))
    .mockResolvedValueOnce(ok({ version: manifest.version, items: merchants.slice(0,5000), next_cursor:15000 }))
    .mockResolvedValueOnce(ok({ version: manifest.version, items: merchants.slice(5000), next_cursor:null }));
  const result = await loadSitemapShard(0,"http://test");
  expect(result.items).toEqual(merchants);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(sitemapXml("https://test", result.manifest, result.items).match(/<url>/g)).toHaveLength(10000);
});

test("second-batch failure rejects the entire shard", async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(ok(manifest))
    .mockResolvedValueOnce(ok({ version: manifest.version, items: merchants.slice(0,5000), next_cursor:15000 }))
    .mockResolvedValueOnce({ ok:false,status:503 });
  await expect(loadSitemapShard(0,"http://test")).rejects.toThrow("503");
});

test("version changes discard old rows and retry the entire shard", async () => {
  const updated = { ...manifest, version:"b".repeat(32) };
  global.fetch = jest.fn().mockResolvedValueOnce(ok(manifest))
    .mockResolvedValueOnce(ok({ version:manifest.version,items:merchants.slice(0,5000),next_cursor:15000 }))
    .mockResolvedValueOnce({ ok:false,status:409 })
    .mockResolvedValueOnce(ok(updated))
    .mockResolvedValueOnce(ok({ version:updated.version,items:merchants.slice(0,5000),next_cursor:15000 }))
    .mockResolvedValueOnce(ok({ version:updated.version,items:merchants.slice(5000),next_cursor:null }));
  const result = await loadSitemapShard(0,"http://test");
  expect(result.manifest.version).toBe(updated.version);
  expect(result.items).toHaveLength(10000);
  expect(fetch).toHaveBeenCalledTimes(6);
});

test("new shards can be discovered without a rebuild", async () => {
  const seven = { ...manifest, total:60001, shards:Array.from({length:7}, (_,id) => ({id,min_id:id*30000+3,max_id:id===6?180003:(id+1)*30000,count:id===6?1:10000})) };
  global.fetch = jest.fn().mockResolvedValue(ok(seven));
  expect((await fetchSitemapManifest("http://test")).shards).toHaveLength(7);
});

test("merchant IDs are encoded and invalid dates are omitted", () => {
  const xml = sitemapXml("https://test",{ ...manifest,last_updated:"invalid" },[{id:"a&b" as unknown as number,tax_id:"legacy-tax-id"}]);
  expect(xml).toContain("a%26b");
  expect(xml).not.toContain("legacy-tax-id");
  expect(xml).not.toContain("<lastmod>");
});
