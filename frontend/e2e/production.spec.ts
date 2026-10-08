import { test, expect } from "@playwright/test";

const apiUrl = process.env.SMOKE_API_URL || "http://localhost:18000";

test.afterEach(async ({ request }) => {
  await request.post(`${apiUrl}/__smoke/fail`, { data: { merchants: false } });
});

test("home filters survive the form, map navigation, reload and a 20 km search", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("搜尋店名 or 地址...").fill("咖啡");
  await page.getByRole("button", { name: /^篩選/ }).click();
  await page.getByLabel("行業別").selectOption("56");
  await page.getByLabel("縣市", { exact: true }).selectOption("台北市");
  await page.getByRole("button", { name: "有", exact: true }).click();
  expect(new URL(page.url()).pathname).toBe("/");
  expect(new URL(page.url()).search).toBe("");
  const radius = page.getByRole("button", { name: "20 km", exact: true });
  await expect(radius).toBeDisabled();
  await page.getByRole("button", { name: "取得位置", exact: true }).click();
  await expect(radius).toBeEnabled();
  await radius.click();
  const result = page.waitForResponse(response => response.url().includes("/api/merchants/nearby?") && new URL(response.url()).searchParams.get("radius_km") === "20");
  await page.getByRole("button", { name: /套用篩選/ }).click();
  await expect(page).toHaveURL(/\/map\?/);
  const response = await result;
  expect(response.ok()).toBe(true);
  expect((await response.json()).map((merchant: { id: number }) => merchant.id)).toEqual([1]);
  const query = new URL(page.url()).searchParams;
  expect(query.get("radius")).toBe("20");
  expect(query.get("city")).toBe("台北市");
  expect(query.get("has_website")).toBe("true");
  expect(query.get("industry_code")).toBe("56");
  expect(query.get("q")).toBe("咖啡");
  await page.reload();
  await expect(page.getByRole("slider", { name: "搜尋半徑" })).toHaveValue("20");
  await expect(page.getByRole("article", { name: "台北咖啡商店", exact: true })).toBeVisible();
  await expect(page.getByText("約略位置（郵遞區號估算）").first()).toBeVisible();
});

test("server-side backend errors show a retry preserving the query", async ({ page, request }) => {
  await request.post(`${apiUrl}/__smoke/fail`, { data: { merchants: true } });
  const query = `smoke-${Date.now()}`;
  await page.goto(`/?q=${query}&city=${encodeURIComponent("台北市")}&has_website=true`);
  await expect(page.getByRole("heading", { name: "商店資料載入失敗" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "找不到符合的商店" })).toHaveCount(0);
  const retry = page.getByRole("link", { name: "重新載入" });
  const href = await retry.getAttribute("href");
  expect(href).toContain(query);
  expect(href).toContain("has_website=true");
  await request.post(`${apiUrl}/__smoke/fail`, { data: { merchants: false } });
  await retry.click();
  await expect(page.getByRole("heading", { name: "找不到符合的商店" })).toBeVisible();
});

test("production service worker activates and serves the offline fallback", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null && navigator.serviceWorker?.controller !== undefined);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)).toBe("activated");
  await context.setOffline(true);
  await page.goto(`/never-cached-${Date.now()}`);
  await expect(page.getByRole("heading", { name: /離線/ })).toBeVisible();
  await context.setOffline(false);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "國民旅遊卡特約商店查詢", exact: true })).toBeVisible();
});

test("online backend failures show cached data with its timestamp and a fresh search clears the notice", async ({ page, request }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller);
  await page.goto("/map?lat=25.0339&lon=121.5645&radius=2");
  await expect(page.getByRole("article", { name: "台北咖啡商店", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const cache = await caches.open("apis-v2");
    return (await cache.keys()).some(key => new URL(key.url).pathname === "/api/merchants/nearby");
  })).toBe(true);
  await request.post(`${apiUrl}/__smoke/fail`, { data: { merchants: true } });
  const cachedReply = page.waitForResponse(response => response.url().includes("/api/merchants/nearby?") && response.headers()["x-data-source"] === "cache");
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  const response = await cachedReply;
  expect(response.ok()).toBe(true);
  expect(response.headers()["x-data-fetched-at"]).toBeTruthy();
  expect(response.headers()["x-total-count"]).toBe("3");
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await expect(page.getByText(/目前顯示先前查詢資料/)).toBeVisible();
  await expect(page.getByRole("article", { name: "台北咖啡商店", exact: true })).toBeVisible();
  await request.post(`${apiUrl}/__smoke/fail`, { data: { merchants: false } });
  const liveReply = page.waitForResponse(response => response.url().includes("/api/merchants/nearby?") && !response.headers()["x-data-source"]);
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  expect((await liveReply).ok()).toBe(true);
  await expect(page.getByText(/目前顯示先前查詢資料/)).toHaveCount(0);
});

test("production robots and sitemap routes use the live shard manifest", async ({ request }) => {
  const manifestResponse = await request.get(`${apiUrl}/api/sitemaps/manifest`);
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  const robotsText = await robots.text();
  expect(robotsText).toContain("/sitemap-index.xml");
  const index = await request.get("/sitemap-index.xml");
  expect(index.ok()).toBe(true);
  const indexXml = await index.text();
  for (const shard of manifest.shards) {
    expect(indexXml).toContain(`/sitemap-merchants-${shard.id}.xml`);
    const response = await request.get(`/merchants/sitemap/${shard.id}.xml`);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("xml");
    const xml = await response.text();
    expect((xml.match(/<url>/g) || []).length).toBe(shard.count);
  }
  expect((await request.get("/merchants/sitemap/999999.xml")).status()).toBe(404);
  expect((await request.get("/sitemap.xml")).ok()).toBe(true);
});

test("production sharing image routes render valid PNGs", async ({ request }) => {
  for (const path of ["/opengraph-image", "/twitter-image", "/merchant/12345678/opengraph-image"]) {
    const response = await request.get(path, { timeout: 25_000 });
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
    const bytes = await response.body();
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.length).toBeGreaterThan(1000);
  }
});
