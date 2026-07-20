import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, MapPinIcon, BuildingStorefrontIcon, GlobeAltIcon, ArrowTopRightOnSquareIcon, MapIcon } from "@heroicons/react/24/outline";
import MerchantMapSection from "@/components/MerchantMapSection";
import { getBackendUrl } from "@/utils/env";

const API_URL = getBackendUrl();
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Fetch merchant data
// Next.js App Router 在同一 render 週期內會自動 memoize 相同 URL 的 fetch，
// 因此 generateMetadata 和頁面元件共用同一份請求結果（不加 cache:'no-store'）
async function getMerchant(id: string) {
  const res = await fetch(`${API_URL}/api/merchants/${id}`, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  return res.json();
}

// Generate dynamic metadata for SEO
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
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
      card: "summary",
      title,
      description,
    },
  };
}

export default async function MerchantPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const merchant = await getMerchant(resolvedParams.id);

  if (!merchant) {
    notFound();
  }

  const pageUrl = `${SITE_URL}/merchant/${merchant.tax_id || resolvedParams.id}`;
  const hasCoords = !!(merchant.lat && merchant.lon);
  const nearbyMapUrl = hasCoords
    ? `/map?lat=${merchant.lat}&lon=${merchant.lon}&radius=1`
    : null;

  // 完整的 LocalBusiness 結構化資料
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": pageUrl,
    name: merchant.name,
    url: merchant.website
      ? (merchant.website.startsWith("http") ? merchant.website : `http://${merchant.website}`)
      : pageUrl,
    address: {
      "@type": "PostalAddress",
      streetAddress: merchant.address,
      postalCode: merchant.zip_code,
      addressRegion: merchant.address ? merchant.address.substring(0, 3) : undefined,
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
    isPartOf: {
      "@type": "GovernmentService",
      name: "國民旅遊卡特約商店計畫",
      provider: {
        "@type": "GovernmentOrganization",
        name: "行政院人事行政總處",
      },
    },
  };

  return (
    <div className="animate-in fade-in duration-500 max-w-3xl mx-auto">
      <Link href="/" className="inline-flex items-center gap-2 text-muted hover:text-foreground transition-colors mb-8">
        <ArrowLeftIcon className="w-4 h-4" /> 返回列表
      </Link>
      
      <div className="bg-card rounded-2xl p-8 md:p-10 shadow-sm border border-border/60">
        <div className="flex items-center gap-3 mb-2">
          <span className="bg-accent/10 text-accent px-3 py-1 rounded-full text-xs font-medium tracking-wide">
            國民旅遊卡特約商店
          </span>
        </div>
        
        <h1 className="text-3xl md:text-4xl font-medium text-foreground mt-4 mb-8">
          {merchant.name}
        </h1>
        
        <div className="space-y-6 text-base text-foreground/80">
          <div className="flex items-start gap-3">
            <MapPinIcon className="w-5 h-5 mt-0.5 text-muted" />
            <div>
              <p className="font-medium text-foreground">商店地址</p>
              <p className="mt-1 text-muted">{merchant.zip_code} {merchant.address}</p>
              <a 
                href={hasCoords ? `https://www.google.com/maps/dir/?api=1&destination=${merchant.lat},${merchant.lon}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(merchant.name + ' ' + merchant.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-sm text-accent hover:underline"
              >
                在 Google 地圖上查看 <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              </a>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <BuildingStorefrontIcon className="w-5 h-5 mt-0.5 text-muted" />
            <div>
              <p className="font-medium text-foreground">統一編號</p>
              <p className="mt-1 text-muted">{merchant.tax_id}</p>
            </div>
          </div>
          
          {merchant.website && (
            <div className="flex items-start gap-3">
              <GlobeAltIcon className="w-5 h-5 mt-0.5 text-muted" />
              <div>
                <p className="font-medium text-foreground">官方網站</p>
                <a 
                  href={merchant.website.startsWith('http') ? merchant.website : `http://${merchant.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-accent hover:underline break-all"
                >
                  {merchant.website}
                </a>
              </div>
            </div>
          )}
        </div>

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
      </div>

      {/* LocalBusiness 結構化資料 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
