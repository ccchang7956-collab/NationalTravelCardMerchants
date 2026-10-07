import React from "react";
import { render, screen } from "@testing-library/react";
import CityPage, { generateMetadata } from "@/app/city/[slug]/page";
import CityDirectory from "@/components/CityDirectory";
import FaqPage from "@/app/faq/page";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { CITIES, cityFromAddress } from "@/utils/cities";
import nextConfig from "../../next.config";
import { CARD_ALLOWANCE, CARD_ELIGIBILITY } from "@/utils/travelPolicy";

jest.mock("@ducanh2912/next-pwa", () => ({ __esModule: true, default: () => (config: unknown) => config }));
jest.mock("react", () => ({ ...jest.requireActual("react"), cache: (fn: unknown) => fn }));
jest.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

const originalEnv = process.env;
const originalFetch = global.fetch;
const merchant = { id: 123, name: "台北測試旅館", address: "臺北市中正區測試路1號", zip_code: "100", tax_id: "12345678", website: null, lat: null, lon: null };
const props = (slug = "taipei", page?: string | string[]) => ({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(page === undefined ? {} : { page }) });

function mockData(total = 81) {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/merchants") {
      const page = Number(url.searchParams.get("page"));
      return { ok: true, json: async () => ({ items: total ? [merchant] : [], total, total_pages: total ? 3 : 1, page }) } as Response;
    }
    if (url.pathname === "/api/sitemaps/manifest") {
      return { ok: true, json: async () => ({ version: "a".repeat(32), total: 1, shard_size: 10000, shards: [{ id: 0, min_id: 123, max_id: 123, count: 1 }] }) } as Response;
    }
    return { ok: true, json: async () => ({ total_merchants: total, cities: [{ city: "台北市", count: total }], last_updated: "2026-10-01T03:00:00+08:00" }) } as Response;
  });
}

beforeEach(() => {
  process.env = { ...originalEnv, NEXT_PUBLIC_SITE_URL: "https://test.example", INTERNAL_API_URL: "http://backend.test" };
  mockData();
});
afterEach(() => { process.env = originalEnv; global.fetch = originalFetch; });

test("縣市清單包含全部 22 縣市且臺／台地址連到相同頁面", () => {
  render(<CityDirectory />);
  expect(screen.getAllByRole("link")).toHaveLength(22);
  expect(new Set(CITIES.map(city => city.slug)).size).toBe(22);
  expect(cityFromAddress(" 臺北市中正區" )?.slug).toBe("taipei");
  expect(cityFromAddress("台北市中正區")?.slug).toBe("taipei");
  expect(cityFromAddress("不明地址")).toBeUndefined();
});

test("縣市頁輸出商家與可爬取的分頁，schema 與當頁內容一致", async () => {
  const { container } = render(await CityPage(props("taipei", "2")));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("台北市");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("第 2 頁");
  expect(screen.getByRole("link", { name: merchant.name })).toHaveAttribute("href", "/merchant/123");
  expect(screen.getByRole("link", { name: "上一頁" })).toHaveAttribute("href", "/city/taipei");
  expect(screen.getByRole("link", { name: "下一頁" })).toHaveAttribute("href", "/city/taipei?page=3");
  const schema = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
  expect(schema.url).toBe("https://test.example/city/taipei?page=2");
  expect(schema.mainEntity.numberOfItems).toBe(1);
  expect(schema.mainEntity.itemListElement[0]).toMatchObject({ position: 41, name: merchant.name, url: "https://test.example/merchant/123" });
  const fetchCalls = (global.fetch as jest.Mock).mock.calls.map(call => String(call[0]));
  expect(fetchCalls.some(url => url.includes("city=%E5%8F%B0%E5%8C%97%E5%B8%82&page=2&per_page=40"))).toBe(true);
});

test("縣市與分頁可索引並指向自己的 canonical", async () => {
  expect((await generateMetadata(props())).alternates?.canonical).toBe("https://test.example/city/taipei");
  const metadata = await generateMetadata(props("taipei", "2"));
  expect(metadata.alternates?.canonical).toBe("https://test.example/city/taipei?page=2");
  expect(metadata.robots).toMatchObject({ index: true, googleBot: { index: true } });
});

test.each(["unknown", "Taipei", "__proto__"])("不存在的縣市 %s 回傳 notFound 且不查 API", async slug => {
  await expect(CityPage(props(slug))).rejects.toThrow("NEXT_NOT_FOUND");
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each(["0", "-1", "2junk", "1.5", "10001", "9007199254740992", ["1", "2"]])("非法頁碼 %s 不查 API", async page => {
  await expect(CityPage(props("taipei", page))).rejects.toThrow("NEXT_NOT_FOUND");
  expect(global.fetch).not.toHaveBeenCalled();
});

test("超出範圍頁碼為 notFound，空名單不索引", async () => {
  await expect(CityPage(props("taipei", "4"))).rejects.toThrow("NEXT_NOT_FOUND");
  mockData(0);
  expect((await generateMetadata(props())).robots).toMatchObject({ index: false, googleBot: { index: false } });
});

test("API 故障不能被呈現成空名單或不存在的縣市", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
  await expect(CityPage(props())).rejects.toThrow("無法取得縣市商家資料");
  await expect(generateMetadata(props())).rejects.toThrow("無法取得縣市商家資料");
});

test("sitemap 包含全部縣市及說明頁，不捏造說明頁更新日期", async () => {
  const entries = await sitemap();
  const urls = entries.map(entry => entry.url);
  for (const city of CITIES) expect(urls).toContain(`https://test.example/city/${city.slug}`);
  for (const page of ["city", "faq", "about"]) expect(urls).toContain(`https://test.example/${page}`);
  expect(entries.find(entry => entry.url.endsWith("/about"))?.lastModified).toBeUndefined();
  expect(entries.find(entry => entry.url.endsWith("/city/taipei"))?.lastModified).toBe("2026-10-01T03:00:00+08:00");
});

test("robots 允許公開頁與 noindex 頁被讀取，且保留商家分片", async () => {
  const result = await robots();
  expect(result.rules).toEqual([{ userAgent: "*", allow: "/" }]);
  expect(result.sitemap).toBe("https://test.example/sitemap-index.xml");
});

test("FAQ 可見答案與 JSON-LD 使用同一份資格與額度說明", async () => {
  const { container } = render(await FaqPage());
  expect(screen.getByText(CARD_ALLOWANCE)).toBeInTheDocument();
  expect(screen.getByText(CARD_ELIGIBILITY)).toBeInTheDocument();
  const schema = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
  const answers = schema.mainEntity.map((item: { acceptedAnswer: { text: string } }) => item.acceptedAnswer.text);
  expect(answers).toContain(CARD_ALLOWANCE);
  expect(answers).toContain(CARD_ELIGIBILITY);
  expect(container.textContent).not.toContain("/merchant/{統一編號}");
  expect(container.textContent).not.toContain("暫不會篩選結果");
});


test("搜尋與分享爬蟲收到 blocking metadata，保留一般使用者串流", () => {
  const pattern = nextConfig.htmlLimitedBots!;
  for (const agent of ["Googlebot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Claude-SearchBot", "Bingbot", "Twitterbot", "Slackbot", "facebookexternalhit", "WhatsApp"]) {
    expect(pattern.test(agent)).toBe(true);
  }
  expect(pattern.test("Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36")).toBe(false);
});


test("不存在的縣市與越界頁碼同時覆寫 robots 和 googlebot 為 noindex", async () => {
  for (const request of [props("unknown"), props("taipei", "0"), props("taipei", "4")]) {
    expect((await generateMetadata(request)).robots).toMatchObject({ index: false, googleBot: { index: false } });
  }
});
