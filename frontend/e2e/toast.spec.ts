import { test as base, expect } from "@playwright/test";

// Optional CDP lets an existing isolated Chromium verify the same interactions.
const test = base.extend({
  browser: [async ({ playwright }, runWithBrowser) => {
    const browser = process.env.SMOKE_CDP_URL
      ? await playwright.chromium.connectOverCDP(process.env.SMOKE_CDP_URL)
      : await playwright.chromium.launch();
    try { await runWithBrowser(browser); } finally { await browser.close(); }
  }, { scope: "worker" }],
});
test.use({ serviceWorkers: "block" });

test("雷達定位失敗、手動搜尋與空結果都有可關閉的通知", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: (_success: unknown, failure: (error: unknown) => void) => queueMicrotask(() => failure({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })),
    } });
  });
  await page.route("**/api/merchants?*", route => route.fulfill({ json: {
    items: new URL(route.request().url()).searchParams.get("q") === "不存在" ? [] : [{ id: 1, name: "測試咖啡店", address: "台北市中正區測試路1號", lat: null, lon: null }],
  } }));
  await page.goto("/about");
  await expect(page.getByRole("region", { name: "操作通知" }).getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "開啟周邊國旅卡特約店家雷達" }).click();
  await expect(page.getByRole("region", { name: "操作通知" }).getByRole("alert")).toContainText("定位失敗");
  await page.getByRole("button", { name: "關閉通知" }).click();
  await expect(page.getByRole("region", { name: "操作通知" }).getByRole("alert")).toHaveCount(0);
  await page.getByPlaceholder(/搜尋地址/).fill("咖啡");
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  await expect(page.getByRole("region", { name: "操作通知" }).getByRole("status")).toContainText("搜尋完成");
  await expect(page.getByRole("dialog").getByText("測試咖啡店")).toBeVisible();
  await page.getByRole("button", { name: "關閉通知" }).click();
  await page.getByPlaceholder(/搜尋地址/).fill("不存在");
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  await expect(page.getByRole("region", { name: "操作通知" }).getByRole("status")).toContainText("沒有符合的商店");
});

test.describe("手機通知", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("API 失敗及重試空結果會提示，通知位於畫面上方", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
        getCurrentPosition: (success: (position: unknown) => void) => queueMicrotask(() => success({ coords: { latitude: 25, longitude: 121 } })),
      } });
    });
    let failing = true;
    await page.route("**/api/merchants/nearby?*", route => failing
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: [] }));
    await page.goto("/about");
    await page.getByRole("button", { name: "開啟周邊國旅卡特約店家雷達" }).click();
    const notice = page.getByRole("region", { name: "操作通知" }).getByRole("alert");
    await expect(notice).toContainText("附近商店載入失敗");
    const box = await notice.boundingBox();
    expect(box!.y).toBeLessThan(150);
    await page.getByRole("button", { name: "關閉通知" }).click();
    failing = false;
    await page.getByTitle("重新定位").click();
    await expect(page.getByRole("region", { name: "操作通知" }).getByRole("status")).toContainText("附近沒有符合的商店");
  });
});
