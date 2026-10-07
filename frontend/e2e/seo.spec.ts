import { expect, test } from "@playwright/test";

test("sitemap index and root merchant shards cover the same canonical URLs", async ({ request }) => {
  const index = await request.get("/sitemap-index.xml");
  expect(index.status()).toBe(200);
  const xml = await index.text();
  expect(xml).toContain("/sitemap.xml</loc>");
  expect(xml).toContain("/sitemap-merchants-0.xml</loc>");
  const shard = await request.get("/sitemap-merchants-0.xml");
  expect(shard.status()).toBe(200);
  const body = await shard.text();
  expect(body).toContain("/merchant/");
  expect(body).not.toContain("<lastmod>");
  const legacy = await request.get("/merchants/sitemap/0.xml");
  expect(legacy.status()).toBe(200);
  expect(await legacy.text()).toBe(body);
});

for (const agent of ["Mozilla/5.0", "Googlebot", "OAI-SearchBot", "Bingbot"]) {
  test(`${agent}: missing pages return HTTP 404 and noindex`, async ({ request }) => {
    for (const path of ["/city/unknown", "/city/taipei/unknown", "/city/taipei?page=9999", "/merchant/999999999999999999"]) {
      const response = await request.get(path, { headers: { "User-Agent": agent } });
      expect(response.status(), path).toBe(404);
      expect(await response.text()).toMatch(/name="robots" content="[^"]*noindex/);
    }
  });
}

test("classification is available without JavaScript and pagination keeps the category", async ({ request }) => {
  const response = await request.get("/city/taipei/dining", { headers: { "User-Agent": "OAI-SearchBot" } });
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("台北市國民旅遊卡餐飲特約商店");
  expect(html).toContain("/city/taipei/dining?page=2");
  expect(html).toContain('application/ld+json');
  const index = await request.get("/sitemap.xml");
  expect(await index.text()).toContain("/city/taipei/dining</loc>");
});
