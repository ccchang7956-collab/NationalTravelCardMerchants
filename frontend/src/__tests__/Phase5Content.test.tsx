/**
 * Phase5 Task5: GEO 內容 — 語意標籤/類別/FAQ/時間數字
 * TDD: 實作前 FAIL，實作後 PASS（源碼契約測試，沿用 Phase5Seo/Phase5Geo 模式）
 */
import fs from "fs";
import path from "path";

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

describe("Phase5 Task5: GEO 內容", () => {
  it("詳情頁用 article 包裝，含 header(h1)+address+dl", () => {
    const s = readSrc("../app/merchant/[id]/page.tsx");
    expect(s).toMatch(/<article[^>]*>/);
    expect(s).toMatch(/<header[^>]*>/);
    expect(s).toMatch(/<address[^>]*>/);
    expect(s).toMatch(/<dl[^>]*>/);
    expect(s).toMatch(/<dt[^>]*>/);
    expect(s).toMatch(/<dd[^>]*>/);
  });

  it("詳情頁渲染 industries/category，無資料顯示未分類", () => {
    const s = readSrc("../app/merchant/[id]/page.tsx");
    expect(s).toContain("industries");
    expect(s).toMatch(/categor/);
    expect(s).toContain("未分類");
  });

  it("詳情頁 JSON-LD 含 category + dateModified + speakable", () => {
    const s = readSrc("../app/merchant/[id]/page.tsx");
    expect(s).toMatch(/categor/);
    expect(s).toContain("dateModified");
    expect(s).toContain("speakable");
  });

  it("列表卡用 article 語意標籤", () => {
    const s = readSrc("../app/page.tsx");
    expect(s).toMatch(/<article[^>]*>/);
  });

  it("首頁無 55,000 / 1700 / 1,700 寫死數字", () => {
    const s = readSrc("../app/page.tsx");
    expect(s).not.toContain("55,000");
    expect(s).not.toContain("1700");
    expect(s).not.toContain("1,700");
  });

  it("首頁與詳情頁有 time dateTime 標示資料更新時間", () => {
    const home = readSrc("../app/page.tsx");
    const detail = readSrc("../app/merchant/[id]/page.tsx");
    expect(home).toMatch(/<time[^>]*dateTime/);
    expect(detail).toMatch(/<time[^>]*dateTime/);
    expect(home).toContain("last_updated");
    expect(detail).toContain("last_updated");
  });

  it("/faq/page.tsx 存在且 FAQPage 達 10 問（含錨點）", () => {
    const s = readSrc("../app/faq/page.tsx");
    expect(s).toContain("FAQPage");
    expect(s).toContain('"@type": "Question"');
    const ids = new Set(s.match(/faq-\d+/g) || []);
    expect(ids.size).toBeGreaterThanOrEqual(10);
    expect(s).toMatch(/id=\{|id="faq-/);
  });

  it("FAQ 含額度 8000 觀光/自行運用、刷卡失敗、統編查詢、外島", () => {
    const s = readSrc("../app/faq/page.tsx");
    expect(s).toContain("8000");
    expect(s).toContain("觀光");
    expect(s).toContain("自行運用");
    expect(s).toMatch(/刷卡失敗|刷卡|請款失敗/);
    expect(s).toMatch(/統編|統一編號/);
    expect(s).toMatch(/外島|澎湖|金門|馬祖|離島/);
  });

  it("首頁 FAQ 留 5 精華並連結到 /faq", () => {
    const s = readSrc("../app/page.tsx");
    expect(s).toContain("/faq");
    const details = s.match(/<details/g) || [];
    expect(details.length).toBeLessThanOrEqual(6);
    expect(details.length).toBeGreaterThanOrEqual(4);
  });
});
