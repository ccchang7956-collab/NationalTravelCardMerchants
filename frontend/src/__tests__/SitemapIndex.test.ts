/** @jest-environment node */
import { GET } from "@/app/sitemap-index.xml/route";
jest.mock("@/utils/site", () => ({ getSiteUrl: () => "https://test.example" }));
jest.mock("@/utils/env", () => ({ getBackendUrl: () => "http://backend" }));

test("index publishes root-level shards without fictional timestamps", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ version: "a".repeat(32), total: 1, shard_size: 10000, shards: [{ id: 0, min_id: 1, max_id: 1, count: 1 }] }) });
  const response = await GET();
  expect(response.status).toBe(200);
  const xml = await response.text();
  expect(xml).toContain("https://test.example/sitemap.xml");
  expect(xml).toContain("https://test.example/sitemap-merchants-0.xml");
  expect(xml).not.toContain("lastmod");
});

test("backend failure returns retryable 503 rather than incomplete sitemap index", async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("30");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
