import { merchantCategory, MERCHANT_CATEGORIES, paginationPages } from "@/utils/merchantCategories";
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cityBySlug, cityPageNumber, cityPageUrl } from "@/utils/cities";
import { getBackendUrl } from "@/utils/env";
import { getSiteUrl } from "@/utils/site";
import { loadHomeData } from "@/utils/homeData";
import { freshnessNote } from "@/utils/dataFreshness";
import { escapeJsonLd } from "@/utils/jsonld";

type Props = {
  params: Promise<{ slug: string; category?: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

// 同一請求的 metadata 與頁面共用資料；API 失敗不能偽裝成空名單或 404。
const getCityData = cache(async (slug: string, page: number, categorySlug = "") => {
  const city = cityBySlug(slug);
  const category = categorySlug ? merchantCategory(categorySlug) : undefined;
  if (!city || (categorySlug && !category)) notFound();
  const query = new URLSearchParams({ city: city.name, page: String(page), per_page: "40" });
  if (category) query.set("industry_code", category.code);
  const result = await loadHomeData(getBackendUrl(), query);
  if (!result.data) throw new Error("無法取得縣市商家資料");
  return { city, category, data: result.data, stats: result.stats };
});

async function resolvePage(props: Props) {
  const { slug, category: categorySlug = "" } = await props.params;
  const search = await props.searchParams;
  const page = cityPageNumber(search.page);
  if (page === null) notFound();
  const result = await getCityData(slug, page, categorySlug);
  if (page > result.data.total_pages) notFound();
  return { slug, categorySlug, page, ...result };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug, category: categorySlug = "" } = await props.params;
  const page = cityPageNumber((await props.searchParams).page);
  const city = cityBySlug(slug);
  const category = categorySlug ? merchantCategory(categorySlug) : undefined;
  const missing: Metadata = {
    title: "找不到縣市頁面",
    robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
  };
  // 在 metadata 明確覆寫 googleBot，避免串流 notFound 沿用根 layout 的 index。
  if (!city || page === null || (categorySlug && !category)) return missing;
  const { data } = await getCityData(slug, page, categorySlug);
  if (page > data.total_pages) return missing;
  const url = `${getSiteUrl()}${cityPageUrl(slug, page, categorySlug)}`;
  const title = `${city.name}國民旅遊卡${category?.name ?? ""}特約商店查詢${page > 1 ? `（第 ${page} 頁）` : ""}`;
  const description = `查詢${city.name} ${data.total.toLocaleString()} 間國旅卡${category?.name ?? ""}特約商店，查看商家名單、地址與統一編號${page > 1 ? `，第 ${page} 頁` : ""}。資料來源為政府開放資料，消費前請核對分店資訊。`;
  return {
    title, description,
    alternates: { canonical: url },
    robots: { index: data.total > 0, follow: true, googleBot: { index: data.total > 0, follow: true } },
    openGraph: { type: "website", title, description, url, locale: "zh_TW", siteName: "國民旅遊卡特約商店查詢" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CityPage(props: Props) {
  const { slug, categorySlug, category, page, city, data, stats } = await resolvePage(props);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${cityPageUrl(slug, page, categorySlug)}`;
  const updated = stats?.last_updated;
  const searchParams = new URLSearchParams({ city: city.name });
  if (category) searchParams.set("industry_code", category.code);
  const searchUrl = `/?${searchParams}`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": pageUrl,
    name: `${city.name}國民旅遊卡${category?.name ?? ""}特約商店查詢`,
    url: pageUrl,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: data.items.length,
      itemListElement: data.items.map((merchant, index) => ({
        "@type": "ListItem",
        position: (page - 1) * 40 + index + 1,
        name: merchant.name,
        url: `${siteUrl}/merchant/${merchant.id}`,
      })),
    },
  };
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首頁", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "全台縣市", item: `${siteUrl}/city` },
      { "@type": "ListItem", position: 3, name: `${city.name}特約商店`, item: `${siteUrl}${cityPageUrl(slug)}` },
      ...(category ? [{ "@type": "ListItem", position: 4, name: `${city.name}國旅卡${category.name}`, item: `${siteUrl}${cityPageUrl(slug, 1, category.slug)}` }] : []),
    ],
  };
  return (
    <div className="space-y-8">
      <nav aria-label="麵包屑" className="text-sm text-muted flex flex-wrap gap-2">
        <Link href="/">首頁</Link><span aria-hidden="true">／</span>
        <Link href="/city">全台縣市</Link><span aria-hidden="true">／</span><span>{city.name}</span>
      </nav>
      <header className="space-y-3">
        <h1 className="text-3xl font-medium">{city.name}國民旅遊卡{category?.name ?? ""}特約商店查詢{page > 1 ? `（第 ${page} 頁）` : ""}</h1>
        <p className="text-muted leading-relaxed">{city.name}有哪些國旅卡{category?.name ?? ""}特約商店？本站收錄 {data.total.toLocaleString()} 間{city.name}{category?.name ?? ""}特約商店，可查看下方名單，依店名、地址與統一編號核對實際分店。</p>
        {updated && <p className="text-sm text-muted">名單資料更新：<time dateTime={updated}>{updated.slice(0, 10)}</time>{freshnessNote(stats?.last_checked, stats?.last_check_result)}</p>}
        <p className="text-sm text-muted">名單來源為<a href="https://data.gov.tw/dataset/12982" className="underline">政府開放資料</a>。消費前請向商店或<a href="https://travel.nccc.com.tw/" className="underline">官方查詢系統</a>確認；補助資格及額度依個人核定條件辦理。</p>
        <div className="flex flex-wrap gap-4 text-accent text-sm">
          <Link href={searchUrl}>搜尋{city.name}店名與統編</Link>
          <Link href={`/map?${searchParams}`}>查看{city.name}商店地圖</Link>
          <Link href="/faq">國旅卡常見問題</Link>
        </div>
      </header>
      <nav aria-label="商店分類" className="flex flex-wrap gap-4 text-accent">
        <Link href={cityPageUrl(slug)} aria-current={!category ? "page" : undefined}>{city.name}全部商店</Link>
        {MERCHANT_CATEGORIES.map(item => <Link key={item.slug} href={cityPageUrl(slug, 1, item.slug)} aria-current={category?.slug === item.slug ? "page" : undefined}>{city.name}國旅卡{item.name}</Link>)}
      </nav>
      {category && <section className="space-y-2 text-muted" aria-label="分類依據">
        <h2 className="text-lg text-foreground">{city.name}國旅卡{category.name}名單如何整理？</h2>
        <p>{category.explanation}商家須同時列於國旅卡特約名單；行業分類依統一編號對照，未能對照的商家可能不在此分類中，可返回全部商店查詢。</p>
        <p>同一統編的各分店服務可能不同，消費前請確認實際分店、刷卡資格及提供的服務。分類不代表個人補助項目已獲核定。</p>
      </section>}
      <section aria-label={`${city.name}特約商店名單`} className="space-y-4">
        <h2 className="text-xl font-medium">商家名單</h2>
        <p className="text-sm text-muted">第 {page}／{data.total_pages} 頁，共 {data.total.toLocaleString()} 間</p>
        {data.items.length === 0 ? <p>目前名單未收錄此縣市的商家，請至官方系統確認。</p> : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.items.map((merchant) => (
              <li key={merchant.id}>
                <article className="h-full bg-card border border-border rounded-xl p-5 space-y-2">
                  <h3 className="text-lg font-medium"><Link href={`/merchant/${merchant.id}`} prefetch={false} className="hover:text-accent">{merchant.name}</Link></h3>
                  <address className="not-italic text-sm text-muted">{merchant.zip_code} {merchant.address || "地址未提供"}</address>
                  {merchant.tax_id && <p className="text-sm text-muted">統一編號：{merchant.tax_id}</p>}
                  <Link href={`/merchant/${merchant.id}`} prefetch={false} className="text-sm text-accent">查看分店詳細資訊</Link>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
      {data.total_pages > 1 && (
        <nav aria-label="商家名單分頁" className="flex flex-wrap gap-4 text-accent">
          {page > 1 && <Link href={cityPageUrl(slug, 1, categorySlug)}>第一頁</Link>}
          {page > 1 && <Link href={cityPageUrl(slug, page - 1, categorySlug)} rel="prev">上一頁</Link>}
          {paginationPages(page, data.total_pages).map(number => number === page
            ? <span key={number} className="text-muted" aria-current="page">第 {page} 頁</span>
            : <Link key={number} href={cityPageUrl(slug, number, categorySlug)} aria-label={`第 ${number} 頁`}>{number}</Link>)}
          {page < data.total_pages && <Link href={cityPageUrl(slug, page + 1, categorySlug)} rel="next">下一頁</Link>}
          {page < data.total_pages && <Link href={cityPageUrl(slug, data.total_pages, categorySlug)}>最後一頁</Link>}
        </nav>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: escapeJsonLd(schema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: escapeJsonLd(breadcrumb) }} />
    </div>
  );
}
