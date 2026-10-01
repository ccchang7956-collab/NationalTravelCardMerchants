/**
 * Phase5 Task1: 索引正確性 — robots/canonical/網域/基礎標頭
 * TDD: 實作前 FAIL，實作後 PASS（源碼契約測試，沿用 Phase4 模式）
 */
import fs from "fs";
import path from "path";

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

/** 移除 // 單行註解後再檢查（dev 註解允許提及 localhost） */
function codeLines(src: string): string[] {
  return src.split("\n").filter((l) => !l.trim().startsWith("//"));
}

describe("Phase5 Task1: 索引正確性", () => {
  it("robots.ts 用 /*?param= 擋查詢頁，無裸 /?q= disallow", () => {
    const s = readSrc("../app/robots.ts");
    expect(s).toContain("/*?q=");
    expect(s).not.toContain('"/?q="');
  });

  it("page.tsx generateMetadata 的 hasFilters 含 industry_code 且 robots follow:true（無 follow:false）", () => {
    const s = readSrc("../app/page.tsx");
    const metaIdx = s.indexOf("generateMetadata");
    expect(metaIdx).toBeGreaterThan(-1);
    const metaBlock = s.slice(metaIdx, s.indexOf("export default async function Home"));
    expect(metaBlock).toMatch(/hasFilters[\s\S]*?industry_code/);
    expect(s).toContain("follow: true");
    expect(s).not.toContain("follow: false");
  });

  it("page>1 用 self-canonical（非固定指回 /，絕對網址）", () => {
    const s = readSrc("../app/page.tsx");
    const metaIdx = s.indexOf("generateMetadata");
    const metaBlock = s.slice(metaIdx, s.indexOf("export default async function Home"));
    expect(metaBlock).toContain("canonical");
    // canonical 由當頁 searchParams 自指（URLSearchParams）且處理 page>1
    expect(metaBlock).toContain("URLSearchParams");
    expect(metaBlock).toMatch(/page\s*>\s*1/);
    // 自指 canonical 須為絕對網址（SITE_URL + "/?..."），避免驗證工具誤判
    expect(metaBlock).toContain("SITE_URL}/?");
    expect(metaBlock).not.toContain("canonical: `/?");
  });

  it("layout viewport 含 device-width", () => {
    const s = readSrc("../app/layout.tsx");
    expect(s).toContain("device-width");
  });

  it("全站無 `|| \"http://localhost:3000\"` 作為 SITE_URL 最終 fallback", () => {
    const files = [
      "../app/layout.tsx",
      "../app/page.tsx",
      "../app/merchant/[id]/page.tsx",
      "../app/sitemap.ts",
      "../app/robots.ts",
      "../utils/site.ts",
    ];
    for (const f of files) {
      let s: string;
      try {
        s = readSrc(f);
      } catch {
        continue;
      }
      const code = codeLines(s).join("\n");
      expect(code).not.toContain('|| "http://localhost:3000"');
      expect(code).not.toContain("?? \"http://localhost:3000\"");
    }
    // 中央 helper 存在：production 缺 env 直接 throw
    const helper = readSrc("../utils/site.ts");
    expect(helper).toContain("getSiteUrl");
    expect(helper).toMatch(/NODE_ENV.*production/);
    expect(helper).toContain("throw");
  });

  it("not-found.tsx 有 h1 + 回首頁 Link + 熱門縣市 4 連結", () => {
    const s = readSrc("../app/not-found.tsx");
    expect(s).toMatch(/<h1[^>]*>/);
    expect(s).toContain('href="/"');
    for (const city of ["台北市", "新北市", "台中市", "高雄市"]) {
      expect(s).toContain(city);
    }
  });
});
