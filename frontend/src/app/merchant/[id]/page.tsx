import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, MapPinIcon, BuildingStorefrontIcon, GlobeAltIcon, ArrowTopRightOnSquareIcon, MapIcon } from "@heroicons/react/24/outline";
import MerchantMapSection from "@/components/MerchantMapSection";
import MerchantActions from "@/components/MerchantActions";
import { getBackendUrl } from "@/utils/env";
import { getSiteUrl } from "@/utils/site";

const TAIWAN_CITIES = [
  "基隆市", "台北市", "新北市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
  "台中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "台南市",
  "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "台東縣", "澎湖縣", "金門縣", "連江縣",
];

// Fetch merchant data
async function getMerchant(id: string) {
  const API_URL = getBackendUrl();
  const res = await fetch(`${API_URL}/api/merchants/${encodeURIComponent(id)}`, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  return res.json();
}

// Fetch stats for last_updated（資料更新時間標示用）
async function getStats() {
  const API_URL = getBackendUrl();
  try {
    const res = await fetch(`${API_URL}/api/stats`, { next: { revalidate: 3600 } });
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
      robots: { index: false },
    };
  }

  const cityName = merchant.address ? merchant.address.substring(0, 3) : "";
  const title = `${merchant.name}｜${cityName}國旅卡特約商店`;
  const description = `${merchant.name}（${merchant.zip_code ? merchant.zip_code + " " : ""}${merchant.address}）是國民旅遊卡特約商店，統一編號 ${merchant.tax_id}。${merchant.website ? `官方網站：${merchant.website}` : ""}`;
  const pageUrl = `${SITE_URL}/merchant/${merchant.tax_id || resolvedParams.id}`;

  return {
    title,
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

  const last_updated: string | null =
    typeof statsData?.last_updated === "string" && statsData.last_updated
      ? statsData.last_updated
      : null;
  const lastUpdatedDate = last_updated ? last_updated.slice(0, 10) : null;

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

  const pageUrl = `${SITE_URL}/merchant/${merchant.tax_id || resolvedParams.id}`;
  const hasCoords = !!(merchant.lat && merchant.lon);
  const nearbyMapUrl = hasCoords
    ? `/map?lat=${merchant.lat}&lon=${merchant.lon}&radius=1`
    : null;

  // 縣市正規化：city 欄位優先，其次地址前綴比對縣市表，取不到則省略
  const city: string | undefined = (() => {
    if (merchant.city && TAIWAN_CITIES.includes(merchant.city)) return merchant.city;
    const addr: string = merchant.address || "";
    return TAIWAN_CITIES.find((c) => addr.startsWith(c));
  })();
  const normalizeWebsite = (w: string) =>
    w.startsWith("http") ? w : `http://${w}`;
  const websiteUrl: string | undefined = merchant.website
    ? normalizeWebsite(merchant.website)
    : undefined;

  // 完整的 LocalBusiness 結構化資料
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": pageUrl,
    name: merchant.name,
    url: pageUrl,
    ...(websiteUrl ? { sameAs: [websiteUrl] } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: merchant.address,
      postalCode: merchant.zip_code,
      ...(city ? { addressRegion: city } : {}),
      addressCountry: "TW",
    },
    ...(hasCoords && {
      geo: {
        "@type": "GeoCoordinates",
        latitude: merchant.lat,
        longitude: merchant.lon,
      },
      hasMap: `https://www.google.com/maps?q=${merchant.lat},${merchant.lon}`,
    }),
    taxID: merchant.tax_id,
    identifier: {
      "@type": "PropertyValue",
      name: "統一編號",
      value: merchant.tax_id,
    },
    description: `國民旅遊卡特約商店：${merchant.name}，位於${merchant.address}。`,
    ...(primaryIndustry?.industry_name
      ? { category: primaryIndustry.industry_name }
      : {}),
    ...(last_updated ? { dateModified: last_updated } : {}),
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["h1", "address"],
    },
    isPartOf: {
      "@type": "GovernmentService",
      name: "國民旅遊卡特約商店計畫",
      provider: {
        "@type": "GovernmentOrganization",
        name: "行政院人事行政總處",
      },
    },
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
        item: city
          ? `${SITE_URL}/?city=${encodeURIComponent(city)}`
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
                <time dateTime={last_updated ?? undefined}>資料更新：{lastUpdatedDate}</time>
              </p>
            )}
          </div>
          <MerchantActions merchant={{ id: merchant.id, name: merchant.name }} variant="detail" />
        </header>
        
        <dl className="space-y-6 text-base text-foreground/80">
          <div className="flex items-start gap-3">
            <MapPinIcon className="w-5 h-5 mt-0.5 text-muted shrink-0" />
            <div>
              <dt className="font-medium text-foreground">商店地址</dt>
              <dd className="mt-1 text-muted">
                <address className="not-italic">{merchant.zip_code} {merchant.address}</address>
                <a 
                  href={hasCoords ? `https://www.google.com/maps/dir/?api=1&destination=${merchant.lat},${merchant.lon}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(merchant.name + ' ' + merchant.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-sm text-accent hover:underline"
                >
                  在 Google 地圖上查看 <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </a>
              </dd>
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
          
          {merchant.website && (
            <div className="flex items-start gap-3">
              <GlobeAltIcon className="w-5 h-5 mt-0.5 text-muted shrink-0" />
              <div>
                <dt className="font-medium text-foreground">官方網站</dt>
                <dd className="mt-1">
                  <a 
                    href={merchant.website.startsWith('http') ? merchant.website : `http://${merchant.website}`}
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* BreadcrumbList 結構化資料 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
    </div>
  );
}
