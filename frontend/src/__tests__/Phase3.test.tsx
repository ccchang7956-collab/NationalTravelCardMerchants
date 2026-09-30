/**
 * Phase3: merchant card 語意 + CSP enforce
 * TDD: 實作前 FAIL，實作後 PASS
 */
import fs from "fs";
import path from "path";

jest.mock("@ducanh2912/next-pwa", () => ({
  __esModule: true,
  default: () => (cfg: unknown) => cfg,
}));

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

describe("Phase3: CSP enforce", () => {
  it("next.config 無 Report-Only，且有 enforcing CSP 含 frame-ancestors/object-src", async () => {
    const raw = readSrc("../../next.config.ts");
    expect(raw).not.toContain("Content-Security-Policy-Report-Only");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cfg = require("../../next.config.ts") as unknown;
    const resolved = (cfg as { default?: unknown }).default ?? cfg;
    const headersFn = (resolved as { headers?: () => Promise<unknown> })
      .headers;
    expect(typeof headersFn).toBe("function");
    const rules = (await headersFn!()) as Array<{
      source: string;
      headers: Array<{ key: string; value: string }>;
    }>;
    const all = rules.flatMap((r) => r.headers);
    const find = (k: string) => all.find((h) => h.key === k)?.value;
    // 保留既有標頭
    expect(find("X-Content-Type-Options")).toBe("nosniff");
    expect(find("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(find("X-Frame-Options")).toBe("SAMEORIGIN");
    // enforcing CSP
    const csp = find("Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("img-src 'self' data: https:");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
});

describe("Phase3: merchant card 語意（article + 內部 button，Link 為 sibling）", () => {
  const src = () => readSrc("../app/map/page.tsx");

  it("外層用 article 作卡片容器", () => {
    expect(src()).toMatch(/<article/);
  });

  it("button 內無 Link 嵌套（所有 <button>…</button> 區塊皆不含 <Link）", () => {
    const s = src();
    const blocks = s.match(/<button[\s\S]*?<\/button>/g) ?? [];
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      expect(b).not.toContain("<Link");
    }
    // 卡片 article 內同時有 button（選取）與 Link（詳情/導航）為 sibling
    const articles = s.match(/<article[\s\S]*?<\/article>/g) ?? [];
    expect(articles.length).toBeGreaterThan(0);
    const card = articles.find(
      (a) => a.includes("<button") && a.includes("<Link")
    );
    expect(card).toBeDefined();
  });

  it("內部 button 保留 type/aria-label/onClick，Link 保留 target=_blank rel=noopener 且無 stopPropagation", () => {
    const s = src();
    expect(s).toMatch(/<button[^>]*type="button"[^>]*aria-label/);
    expect(s).toMatch(/onClick=\{\(\) => setSelectedMerchant\(m\)\}/);
    expect(s).toContain('target="_blank"');
    expect(s).toContain("noopener");
    expect(s).not.toContain("stopPropagation");
  });

  it("merchantRefs 型別相容（HTMLElement 或 HTMLButtonElement）", () => {
    const s = src();
    expect(s).toMatch(
      /merchantRefs\s*=\s*useRef<Record<number,\s*(HTMLElement|HTMLButtonElement)\s*\|\s*null>>/
    );
    expect(s).toContain("scrollIntoView");
  });
});
