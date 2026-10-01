/**
 * Phase5 Task4: GEO 入口 — llms.txt / Organization / 私人頁 noindex
 * TDD: 實作前 FAIL，實作後 PASS（源碼契約測試，沿用 Phase5Seo 模式）
 */
import fs from "fs";
import path from "path";

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

describe("Phase5 Task4: GEO 入口", () => {
  it("app/llms.txt/route.ts 存在且匯出 GET", () => {
    const s = readSrc("../app/llms.txt/route.ts");
    expect(s).toMatch(/export\s+async\s+function\s+GET/);
  });

  it("llms.txt 內容含 National Travel Card 與 /api/stats，且為 text/plain", () => {
    const s = readSrc("../app/llms.txt/route.ts");
    expect(s).toContain("National Travel Card");
    expect(s).toContain("/api/stats");
    expect(s).toContain("text/plain");
  });

  it("llms.txt 用 Task1 getSiteUrl（無 hardcode localhost fallback）", () => {
    const s = readSrc("../app/llms.txt/route.ts");
    expect(s).toContain("getSiteUrl");
    expect(s).not.toContain("http://localhost:3000");
  });

  it("root layout 含 Organization 結構化資料（含 logo）", () => {
    const s = readSrc("../app/layout.tsx");
    expect(s).toContain("Organization");
    expect(s).toContain("/icons/icon-512x512.png");
  });

  it("root layout footer 含 /llms.txt 連結（給 AI 的本站說明）", () => {
    const s = readSrc("../app/layout.tsx");
    expect(s).toContain("/llms.txt");
    expect(s).toContain("給 AI 的本站說明");
  });

  it("dashboard 路由已移除（純公開站，無私人頁）", () => {
    expect(fs.existsSync(path.join(__dirname, "../app/dashboard"))).toBe(false);
  });

  it("itinerary 路由已移除（純公開站，無私人頁）", () => {
    expect(fs.existsSync(path.join(__dirname, "../app/itinerary"))).toBe(false);
  });
});
