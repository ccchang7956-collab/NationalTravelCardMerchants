/**
 * Phase2 Task 4: 前端安全與體驗
 * TDD red test — 實作前應 FAIL，實作後應 PASS
 */
import fs from "fs";
import path from "path";
import React from "react";
import { render } from "@testing-library/react";
import { getBackendUrl, getPublicApiUrl } from "@/utils/env";
import HomeSearchSection from "@/components/HomeSearchSection";
import type { FilterState } from "@/components/FilterSheet";

jest.mock("@ducanh2912/next-pwa", () => ({
  __esModule: true,
  default: () => (cfg: unknown) => cfg,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("next/form", () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => (
    <form action="/">{children}</form>
  ),
}));

const DEFAULT_FILTERS: FilterState = {
  city: "",
  hasWebsite: null,
  radiusKm: null,
  industryCode: "",
};

describe("Phase2 Task4: getBackendUrl 去尾 slash", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("env 有尾 slash 時不以 / 結尾，且拼接 /api 不出現 //api", () => {
    process.env.NEXT_PUBLIC_API_URL = "http://x/";
    process.env.INTERNAL_API_URL = "http://x/";
    const url = getBackendUrl();
    expect(url.endsWith("/")).toBe(false);
    expect(`${url}/api/merchants`).not.toContain("//api");
  });

  it("getPublicApiUrl 同樣去尾 slash", () => {
    process.env.NEXT_PUBLIC_API_URL = "http://x/";
    const url = getPublicApiUrl();
    expect(url.endsWith("/")).toBe(false);
  });

  it("client 未設 env 且非 localhost 時用 hostname fallback 並 warn", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.INTERNAL_API_URL;
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // 用 opts.hostname 注入取代直接 mock jsdom window.location（jsdom 禁止覆寫）
      const url = getBackendUrl(undefined, { hostname: "example.com" });
      expect(url).toBe("http://example.com:8000");
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("Phase2 Task4: HomeSearchSection key + maxLength", () => {
  it("input 有 maxLength=100", () => {
    const { container } = render(
      <HomeSearchSection
        initialQ="test"
        initialFilters={DEFAULT_FILTERS}
        cities={["台北市"]}
      />
    );
    const input = container.querySelector(
      'input[name="q"]'
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.getAttribute("maxlength")).toBe("100");
  });

  it("initialQ 改變時 input 值跟著更新（key={initialQ} 受控更新）", () => {
    const { container, rerender } = render(
      <HomeSearchSection
        initialQ="first"
        initialFilters={DEFAULT_FILTERS}
        cities={["台北市"]}
      />
    );
    const getVal = () =>
      (container.querySelector('input[name="q"]') as HTMLInputElement | null)
        ?.value;
    expect(getVal()).toBe("first");
    rerender(
      <HomeSearchSection
        initialQ="second"
        initialFilters={DEFAULT_FILTERS}
        cities={["台北市"]}
      />
    );
    expect(getVal()).toBe("second");
  });

  it("源碼使用 key={initialQ} 且 handleFilterChange 讀 ref（非 window.location.search q 凍結）", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../components/HomeSearchSection.tsx"),
      "utf8"
    );
    expect(src).toMatch(/key=\{initialQ\}/);
    expect(src).toMatch(/maxLength=\{100\}/);
    // q 來自 ref 而非每次讀 URL 的舊 q
    expect(src).not.toMatch(/window\.location\.search/);
    expect(src).toMatch(/useRef/);
  });
});

describe("Phase2 Task4: MapView/MiniMap 本地 marker", () => {
  it("MapView 無 cdnjs，改用本地 /leaflet/marker", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../components/MapView.tsx"),
      "utf8"
    );
    expect(src).not.toContain("cdnjs");
    expect(src).toContain("/leaflet/marker-icon.png");
    expect(src).toContain("/leaflet/marker-icon-2x.png");
    expect(src).toContain("/leaflet/marker-shadow.png");
  });

  it("MerchantMiniMap 無 cdnjs，改用本地 /leaflet/marker", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../components/MerchantMiniMap.tsx"),
      "utf8"
    );
    expect(src).not.toContain("cdnjs");
    expect(src).toContain("/leaflet/marker-icon.png");
  });

  it("public/leaflet/ marker 檔案存在", () => {
    const pubDir = path.join(__dirname, "../../public/leaflet");
    for (const f of [
      "marker-icon.png",
      "marker-icon-2x.png",
      "marker-shadow.png",
    ]) {
      expect(fs.existsSync(path.join(pubDir, f))).toBe(true);
    }
  });
});

describe("Phase2 Task4: next.config 安全標頭", () => {
  it("headers() 含 nosniff / referrer / SAMEORIGIN + CSP enforcing", async () => {
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
    expect(find("X-Content-Type-Options")).toBe("nosniff");
    expect(find("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(find("X-Frame-Options")).toBe("SAMEORIGIN");
    const csp = find("Content-Security-Policy");
    expect(find("Content-Security-Policy-Report-Only")).toBeUndefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("img-src 'self' data: https:");
    expect(csp).toContain("script-src 'self'");
  });
});

describe("Phase2 Task4: map/page 箝制 + a11y + useEffect", () => {
  it("lat/lon/radius 箝制在合法範圍", async () => {
    const mod = (await import("@/app/map/page")) as unknown as {
      clampLat: (v: number) => number;
      clampLon: (v: number) => number;
      clampRadiusKm: (v: number) => number;
    };
    expect(mod.clampLat(100)).toBe(90);
    expect(mod.clampLat(-100)).toBe(-90);
    expect(mod.clampLon(200)).toBe(180);
    expect(mod.clampLon(-200)).toBe(-180);
    expect(mod.clampRadiusKm(99)).toBeLessThanOrEqual(10);
    expect(mod.clampRadiusKm(0)).toBe(2);
  });

  it("商店卡用 article（內含可聚焦 button）+ aria-label，源碼無 render 期 setState", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../app/map/page.tsx"),
      "utf8"
    );
    // 卡片語意為 article，外層 article 具 aria-label，內含可聚焦 button（選取）作 sibling 而非 button 包 Link
    expect(src).toMatch(/<article[^>]*aria-label/);
    const articles = src.match(/<article[\s\S]*?<\/article>/g) ?? [];
    expect(articles.length).toBeGreaterThan(0);
    const card = articles.find(
      (a) => a.includes("<button") && a.includes("aria-label")
    );
    expect(card).toBeDefined();
    // render 期直接 setState 已移入 useEffect（不應出現 if (currentParamsKey !== prevParamsKey) { set... })
    expect(src).not.toMatch(
      /if\s*\(\s*currentParamsKey\s*!==\s*prevParamsKey\s*\)/
    );
  });
});
