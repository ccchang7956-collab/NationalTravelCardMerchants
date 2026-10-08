import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`2,000 map results remain virtualized and selectable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const merchants = Array.from({ length: 2000 }, (_, index) => ({
      id: index + 1, name: `大量測試商店 ${index + 1}`, address: "台北市信義區測試路1號",
      zip_code: "110", tax_id: null, website: null,
      lat: 25.0339 + index * 0.000001, lon: 121.5645,
      distance_km: index * 0.001, coord_accuracy: "verified",
    }));
    await page.route("**/*.tile.openstreetmap.org/**", route => route.abort());
    await page.context().route("**/api/merchants/nearby?*", async route => {
      const params = new URL(route.request().url()).searchParams;
      const records = params.get("q") ? [] : merchants;
      const offset = Number(params.get("offset") || 0);
      const limit = Number(params.get("limit") || 200);
      await route.fulfill({ json: records.slice(offset, offset + limit), headers: {
        "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "X-Total-Count, X-Has-More",
        "X-Total-Count": String(records.length), "X-Has-More": String(offset + limit < records.length),
      } });
    });
    await page.goto("/map?lat=25.0339&lon=121.5645&radius=2");
    const list = page.getByRole("region", { name: "附近商店列表" });
    await expect(list.getByRole("article", { name: "大量測試商店 1", exact: true })).toBeVisible();
    for (let loaded = 200; loaded < 2000; loaded += 200) {
      const button = page.getByRole("button", { name: `載入更多（已載入 ${loaded} / 2000 間）`, exact: true });
      await expect(button).toBeEnabled();
      await button.click();
    }
    await expect(page.getByRole("button", { name: /載入更多/ })).toHaveCount(0);
    await expect(list.getByRole("listitem").first()).toHaveAttribute("aria-setsize", "2000");
    expect(await list.getByRole("article").count()).toBeLessThan(20);
    await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const last = list.getByRole("article", { name: "大量測試商店 2000", exact: true });
    await expect(last).toBeVisible();
    await last.getByRole("button", { name: "查看 大量測試商店 2000", exact: true }).click();
    await expect(page.locator(".leaflet-popup-content")).toContainText("大量測試商店 2000");
    await expect(last).toHaveClass(/border-accent/);
    expect(await list.getByRole("article").count()).toBeLessThan(20);
    await page.getByPlaceholder("在附近搜尋關鍵字 (例如: 咖啡)").fill("不存在");
    await page.getByRole("button", { name: "搜尋", exact: true }).click();
    await expect(page.getByText("尚未搜尋到商店", { exact: true })).toBeVisible();
    await expect(page.locator(".leaflet-popup-content")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
