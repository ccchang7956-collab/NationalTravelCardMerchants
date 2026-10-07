import React from "react";
import { render, screen } from "@testing-library/react";
import CityPage, { generateMetadata as cityMetadata } from "@/components/CityMerchantPage";
import MerchantPage, { generateMetadata as merchantMetadata } from "@/app/merchant/[id]/page";
import { sitemapXml } from "@/utils/sitemapShards";
import { paginationPages } from "@/utils/merchantCategories";

jest.mock("next/link", () => ({ __esModule: true, default: ({ children, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => { void _prefetch; return <a {...props}>{children}</a>; } }));
jest.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, permanentRedirect: () => { throw new Error("REDIRECT"); } }));
jest.mock("@/components/MerchantMapSection", () => ({ __esModule: true, default: () => null }));
jest.mock("@/utils/env", () => ({ getBackendUrl: () => "http://backend" }));
jest.mock("@/utils/site", () => ({ getSiteUrl: () => "https://test.example" }));

const merchant = { id: 1, name: "測試商家", address: null, tax_id: null, zip_code: null, website: null, lat: null, lon: null };
const manifest = { version: "a".repeat(32), total: 1, shard_size: 10000, last_updated: "2026-10-07T03:00:00+08:00", shards: [{ id: 0, min_id: 1, max_id: 1, count: 1 }] };
const props = (category: string, page?: string) => ({ params: Promise.resolve({ slug: "taipei", category }), searchParams: Promise.resolve(page ? { page } : {}) });
beforeEach(() => {
  global.fetch = jest.fn(async (input) => {
    const url = String(input);
    let data;
    if (url.includes("manifest")) data = manifest;
    else if (url.includes("/api/merchants/")) data = merchant;
    else if (url.includes("/api/merchants?")) data = { items: [merchant], total: 1000, total_pages: 25 };
    else data = { total_merchants: 1000, cities: [], last_updated: manifest.last_updated };
    return { ok: true, status: 200, json: async () => data } as Response;
  });
});

test("分類 metadata、API 條件及分頁連結保留分類", async () => {
  const metadata = await cityMetadata(props("accommodation", "2"));
  expect(metadata.alternates?.canonical).toBe("https://test.example/city/taipei/accommodation?page=2");
  render(await CityPage(props("accommodation", "2")));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("台北市國民旅遊卡住宿特約商店");
  expect(screen.getByRole("link", { name: "下一頁" })).toHaveAttribute("href", "/city/taipei/accommodation?page=3");
  expect(screen.getByRole("link", { name: "第 12 頁" })).toHaveAttribute("href", "/city/taipei/accommodation?page=12");
  expect((fetch as jest.Mock).mock.calls.some(call => String(call[0]).includes("industry_code=55"))).toBe(true);
});

test("不存在分類直接 404，不向 API 發送查詢", async () => {
  await expect(CityPage(props("unknown"))).rejects.toThrow("NEXT_NOT_FOUND");
  expect((await cityMetadata(props("unknown"))).robots).toMatchObject({ index: false });
  expect(fetch).not.toHaveBeenCalled();
});

test("缺地址、統編時不產生空地址 LocalBusiness、不捏造商家更新時間", async () => {
  const args = { params: Promise.resolve({ id: "1" }) };
  const metadata = await merchantMetadata(args);
  expect(metadata.description).not.toMatch(/null|undefined/);
  const { container } = render(await MerchantPage(args));
  const schemas = [...container.querySelectorAll('script[type="application/ld+json"]')].map(script => JSON.parse(script.textContent!));
  const business = schemas.find(schema => schema["@id"]?.endsWith("#business"));
  expect(business["@type"]).toBe("Organization");
  expect(business.address).toBeUndefined();
  expect(schemas.find(schema => schema["@type"] === "WebPage").dateModified).toBeUndefined();
  expect(container.textContent).toContain("來源名單未提供地址");
});

test("商家 XML 不把全站時間當成每筆 lastmod", () => {
  expect(sitemapXml("https://test.example", manifest, [{ id: 1, tax_id: null }])).not.toContain("lastmod");
});

test("長名單可以每十頁跳轉且不產生越界頁碼", () => {
  expect(paginationPages(89, 178)).toEqual([1,79,88,89,90,99,178]);
  expect(paginationPages(1, 3)).toEqual([1,2,3]);
});
