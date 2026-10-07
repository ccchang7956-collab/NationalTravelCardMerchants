import { cityFromAddress, cityPageUrl } from "@/utils/cities";
import { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeftIcon, MapPinIcon, BuildingStorefrontIcon, GlobeAltIcon, ArrowTopRightOnSquareIcon, MapIcon } from "@heroicons/react/24/outline";
import MerchantMapSection from "@/components/MerchantMapSection";
import { getBackendUrl } from "@/utils/env";
import { getSiteUrl } from "@/utils/site";
import { sanitizeUrl } from "@/utils/sanitize";
import { escapeJsonLd } from "@/utils/jsonld";
import { freshnessNote } from "@/utils/dataFreshness";
import { hasCoordinates, locationLabel, navigationUrl } from "@/utils/coordinates";

// Fetch merchant data（react cache：metadata＋page 同請求只打一次後端）
const getMerchant = cache(async (id: string) => {
  const API_URL = getBackendUrl();
  const res = await fetch(`${API_URL}/api/merchants/${encodeURIComponent(id)}`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(10000) });
  // 404 才回 null（→ notFound）；後端 500/超時直接 throw，不偽裝成 404
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`merchant API failed: ${res.status}`);
  return res.json();
});

// Fetch stats for last_updated（資料更新時間標示用）
async function getStats() {
  const API_URL = getBackendUrl();
  try {
    const res = await fetch(`${API_URL}/api/stats`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// Generate dynamic metadata for SEO
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const SITE_URL = getSiteUrl();
  const resolvedParams = await params;
  const merchant = await getMerchant(resolvedParams.id);
  
  if (!merchant) {
    return {
      title: "找不到商店",
      robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
    };
  }

  const cityName = cityFromAddress(merchant.address, merchant.city)?.name ?? "";
  const title = `${merchant.name}｜${cityName}國旅卡特約商店`;
  const description = `${merchant.name}是國民旅遊卡特約商店。${merchant.address ? `地址：${merchant.zip_code ? merchant.zip_code + " " : ""}${merchant.address}。` : "來源名單未提供地址，請向商店核對分店位置。"}${merchant.tax_id ? `統一編號 ${merchant.tax_id}。` : ""}`;
  const pageUrl = `${SITE_URL}/merchant/${merchant.id}`;

  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      type: "website",
      title,
      description,
      url: pageUrl,
      locale: "zh_TW",
      siteName: "國民旅遊卡特約商店查詢",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function MerchantPage({ params }: { params: Promise<{ id: string }> }) {
  const SITE_URL = getSiteUrl();
  const resolvedParams = await params;
  const [merchant, statsData] = await Promise.all([
    getMerchant(resolvedParams.id),
    getStats(),
  ]);

  if (!merchant) {
    notFound();
  }

  // 使用商家主鍵區分同一統編的不同分店；舊統編網址導向第一個對應分店。
  if (resolvedParams.id !== String(merchant.id)) {
    permanentRedirect(`/merchant/${merchant.id}`);
  }

  const last_updated: string | null =
    typeof statsData?.last_updated === "string" && statsData.last_updated
      ? statsData.last_updated
      : null;
  const lastUpdatedDate = last_updated ? last_updated.slice(0, 10) : null;
  const freshNote = freshnessNote(statsData?.last_checked, statsData?.last_check_result);

  // 行業別依 priority 排序（後端已排序，前端再保險排序一次）
  interface MerchantIndustry {
    industry_code: string;
    industry_name: string;
    priority: number;
  }
  const industries: MerchantIndustry[] = Array.isArray(merchant.industries)
    ? [...merchant.industries].sort(
        (a: MerchantIndustry, b: MerchantIndustry) =>
          (a.priority ?? 99) - (b.priority ?? 99)
      )
    : [];
  const primaryIndustry: MerchantIndustry | undefined = industries[0];

  const pageUrl = `${SITE_URL}/merchant/${merchant.id}`;
  const hasCoords = hasCoordinates(merchant);
  const nearbyMapUrl = hasCoords
    ? `/map?lat=${merchant.lat}&lon=${merchant.lon}&radius=1`
    : null;

  const cityEntry = cityFromAddress(merchant.address, merchant.city);
  const city = cityEntry?.name;
  const websiteUrl: string | undefined = merchant.website
    ? sanitizeUrl(merchant.website)
    : undefined;

  // 完整的 LocalBusiness 結構化資料
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": merchant.address?.trim() ? "LocalBusiness" : "Organization",
    "@id": `${pageUrl}#business`,
    name: merchant.name,
    url: pageUrl,
    ...(websiteUrl && websiteUrl !== "about:blank" ? { sameAs: [websiteUrl] } : {}),
    ...(merchant.address?.trim() ? { address: {
      "@type": "PostalAddress",
      streetAddress: merchant.address,
      postalCode: merchant.zip_code,
      ...(city ? { addressRegion: city } : {}),
      addressCountry: "TW",
    } } : {}),
    ...(hasCoords && merchant.coord_accuracy === "verified" && {
      geo: {
        "@type": "GeoCoordinates",
        latitude: merchant.lat,
        longitude: merchant.lon,
      },
      hasMap: `https://www.google.com/maps?q=${merchant.lat},${merchant.lon}`,
    }),
    ...(merchant.tax_id ? { taxID: merchant.tax_id,
    identifier: {
      "@type": "PropertyValue",
      name: "統一編號",
      value: merchant.tax_id,
    } } : {}),
    description: `國民旅遊卡特約商店：${merchant.name}${merchant.address ? `，位於${merchant.address}` : "；來源名單未提供地址"}。`,
    ...(primaryIndustry?.industry_name
      ? { category: primaryIndustry.industry_name }
      : {}),
  };
  const webPageLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": pageUrl,
    url: pageUrl,
    name: merchant.name,
    mainEntity: { "@id": `${pageUrl}#business` },
    // The visible dataset date is not a per-merchant modification timestamp.
    isPartOf: { "@type": "WebSite", url: SITE_URL },
  };

  // 麵包屑結構化資料：首頁 > {city} > {店名}（固定 3 項）
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "首頁",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: city ? `${city}特約商店` : "特約商店",
        item: cityEntry
          ? `${SITE_URL}${cityPageUrl(cityEntry.slug)}`
          : SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: merchant.name,
        item: pageUrl,
      },
    ],
  };

  return (
    <div className="animate-in fade-in duration-500 max-w-3xl mx-auto">
      <Link href="/" className="inline-flex items-center gap-2 text-muted hover:text-foreground transition-colors mb-8">
        <ArrowLeftIcon className="w-4 h-4" /> 返回列表
      </Link>
      
      <nav aria-label="麵包屑" className="flex flex-wrap gap-2 text-sm text-muted mb-5">
        <Link href="/">首頁</Link><span aria-hidden="true">／</span>
        {cityEntry && <><Link href={cityPageUrl(cityEntry.slug)}>{cityEntry.name}特約商店</Link><span aria-hidden="true">／</span></>}
        <span>{merchant.name}</span>
      </nav>
      <article className="bg-card rounded-2xl p-8 md:p-10 shadow-sm border border-border/60">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <span className="bg-accent/10 text-accent px-3 py-1 rounded-full text-xs font-medium tracking-wide">
              國民旅遊卡特約商店
            </span>
            <h1 className="text-3xl md:text-4xl font-medium text-foreground mt-3">
              {merchant.name}
            </h1>
            {lastUpdatedDate && (
              <p className="mt-2 text-xs text-muted">
                <time dateTime={last_updated ?? undefined}>資料更新：{lastUpdatedDate}{freshNote}</time>
              </p>
            )}
          </div>
        </header>
        
        <section aria-labelledby="merchant-card-question" className="merchant-confirm mb-8 space-y-3 text-sm text-muted leading-relaxed">
          <h2 id="merchant-card-question" className="text-lg font-medium text-foreground">{merchant.name}可以使用國旅卡嗎？</h2>
          <p>依本站{lastUpdatedDate ? `於 ${lastUpdatedDate} 更新的` : "目前收錄的"}政府開放資料，{merchant.name}列於國民旅遊卡特約商店名單。請核對下方地址與統編，確認是預計消費的分店。</p>
          <p>消費前請向店家或<a href="https://travel.nccc.com.tw/" className="text-accent underline">官方查詢系統</a>再次確認；是否可請領補助仍依個人資格、消費內容及核銷規定辦理。<Link href="/about" className="text-accent underline">資料來源與更新方式</Link></p>
          {cityEntry && <Link href={cityPageUrl(cityEntry.slug)} className="inline-block text-accent hover:underline">查看其他{cityEntry.name}國旅卡特約商店 →</Link>}
        </section>
        <dl className="space-y-6 text-base text-foreground/80">
          <div className="flex items-start gap-3">
            <MapPinIcon className="w-5 h-5 mt-0.5 text-muted shrink-0" />
            <div>
              <dt className="font-medium text-foreground">商店地址</dt>
              <dd className="mt-1 text-muted">
                <address className="not-italic">{merchant.zip_code} {merchant.address || "來源名單未提供地址，請向商店核對。"}</address>
                {(merchant.address || hasCoords) && <a
                  href={navigationUrl(merchant)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-sm text-accent hover:underline"
                >
                  在 Google 地圖上查看 <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </a>}
              </dd>
              {locationLabel(merchant) && <dd className="mt-2 text-xs text-muted">{locationLabel(merchant)}，導航以商店地址為準。</dd>}
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <BuildingStorefrontIcon className="w-5 h-5 mt-0.5 text-muted shrink-0" />
            <div>
              <dt className="font-medium text-foreground">統一編號</dt>
              <dd className="mt-1 text-muted">{merchant.tax_id}</dd>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <BuildingStorefrontIcon className="w-5 h-5 mt-0.5 text-muted shrink-0" />
            <div>
              <dt className="font-medium text-foreground">行業類別</dt>
              <dd className="mt-1 text-muted">
                {industries.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {industries.map((ind) => (
                      <li
                        key={`${ind.industry_code}-${ind.priority}`}
                        className="bg-muted-bg px-2.5 py-0.5 rounded-full text-sm"
                      >
                        {ind.industry_name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  "未分類"
                )}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPinIcon className="w-5 h-5 mt-0.5 text-muted shrink-0" />
            <div>
              <dt className="font-medium text-foreground">座標</dt>
              <dd className="mt-1 text-muted">
                {hasCoords
                  ? `${Number(merchant.lat).toFixed(5)}, ${Number(merchant.lon).toFixed(5)}`
                  : "未提供"}
              </dd>
            </div>
          </div>
          
          {websiteUrl && websiteUrl !== "about:blank" && (
            <div className="flex items-start gap-3">
              <GlobeAltIcon className="w-5 h-5 mt-0.5 text-muted shrink-0" />
              <div>
                <dt className="font-medium text-foreground">官方網站</dt>
                <dd className="mt-1">
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-accent hover:underline break-all"
                  >
                    {merchant.website}
                  </a>
                </dd>
              </div>
            </div>
          )}
        </dl>

        {/* 地圖區塊 */}
        {hasCoords && (
          <div className="mt-8 pt-8 border-t border-border/40">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-foreground">位置地圖</p>
              {nearbyMapUrl && (
                <Link
                  href={nearbyMapUrl}
                  className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors font-medium"
                >
                  <MapIcon className="w-4 h-4" />
                  查看附近商店
                </Link>
              )}
            </div>
            <MerchantMapSection
              lat={merchant.lat}
              lon={merchant.lon}
              name={merchant.name}
            />
          </div>
        )}
      </article>

      {/* LocalBusiness 結構化資料 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapeJsonLd(jsonLd) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: escapeJsonLd(webPageLd) }} />
      {/* BreadcrumbList 結構化資料 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: escapeJsonLd(breadcrumbLd) }}
      />
    </div>
  );
}
