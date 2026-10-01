/**
 * Phase5 Task2: 卡片與結構化資料 — OG/Twitter/麵包屑/LocalBusiness
 * TDD: 實作前 FAIL，實作後 PASS（源碼契約測試，沿用 Phase5Seo 模式）
 */
import fs from "fs";
import path from "path";

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

describe("Phase5 Task2: 卡片與結構化資料", () => {
  it("layout twitter card 全站 summary_large_image", () => {
    const s = readSrc("../app/layout.tsx");
    expect(s).toContain("summary_large_image");
  });

  it("merchant twitter card 為 summary_large_image", () => {
    const s = readSrc("../app/merchant/[id]/page.tsx");
    expect(s).toContain('card: "summary_large_image"');
  });

  it("merchant 源碼含 BreadcrumbList + sameAs + url: pageUrl", () => {
    const s = readSrc("../app/merchant/[id]/page.tsx");
    expect(s).toContain("BreadcrumbList");
    expect(s).toContain("itemListElement");
    expect(s).toContain("position: 1");
    expect(s).toContain("position: 2");
    expect(s).toContain("position: 3");
    expect(s).toContain("sameAs");
    expect(s).toMatch(/url:\s*pageUrl/);
  });

  it("merchant addressRegion 取不到時省略（非 substring 硬切）", () => {
    const s = readSrc("../app/merchant/[id]/page.tsx");
    // 不允許直接 substring(0, 3) 作為 addressRegion
    expect(s).not.toMatch(/addressRegion:\s*merchant\.address\s*\?\s*merchant\.address\.substring/);
  });

  it("manifest name/short_name 為品牌名", () => {
    const raw = readSrc("../../public/manifest.json");
    const m = JSON.parse(raw);
    expect(m.name).toBe("國民旅遊卡特約商店查詢");
    expect(m.short_name).toBe("國民旅遊卡特約商店查詢");
  });

  it("merchant og-image 有 alt 匯出", () => {
    const s = readSrc("../app/merchant/[id]/opengraph-image.tsx");
    expect(s).toMatch(/export\s+const\s+alt\s*=/);
  });

  it("layout WebSite 無 SearchAction（robots 已 disallow /*?q=，避免自相矛盾）", () => {
    const s = readSrc("../app/layout.tsx");
    expect(s).toContain('"@type": "WebSite"');
    expect(s).not.toContain("SearchAction");
    expect(s).not.toContain("potentialAction");
  });

  it("twitter-image.tsx 存在且有 alt + default 匯出", () => {
    const s = readSrc("../app/twitter-image.tsx");
    expect(s).toMatch(/export\s+const\s+alt\s*=/);
    expect(s).toMatch(/export\s+default/);
  });

  it("twitter-image 無寫死商店數字（避免與首頁動態數字脫鉤）", () => {
    const s = readSrc("../app/twitter-image.tsx");
    expect(s).not.toContain("55,000");
    expect(s).not.toContain("55000");
    expect(s).toContain("全台特約商店查詢");
  });
});
