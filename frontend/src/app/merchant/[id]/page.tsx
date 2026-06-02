import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, MapPinIcon, BuildingStorefrontIcon, GlobeAltIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

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
      title: "找不到商店 - 國民旅遊卡特約商店檢索系統",
    };
  }

  return {
    title: `${merchant.name} - ${merchant.zip_code || ''} ${merchant.address || ''} | 國民旅遊卡特約商店`,
    description: `國民旅遊卡特約商店：${merchant.name}。地址：${merchant.address}。統一編號：${merchant.tax_id}。${merchant.website ? `官方網站：${merchant.website}` : ''}`,
  };
}

export default async function MerchantPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const merchant = await getMerchant(resolvedParams.id);

  if (!merchant) {
    return (
      <div className="text-center py-20 bg-card rounded-2xl border border-border/60">
        <h3 className="text-xl font-medium text-foreground mb-4">找不到此商店資訊</h3>
        <Link href="/" className="text-accent hover:underline flex items-center justify-center gap-2">
          <ArrowLeftIcon className="w-4 h-4" /> 返回搜尋首頁
        </Link>
      </div>
    );
  }

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
                href={merchant.lat && merchant.lon ? `https://www.google.com/maps/dir/?api=1&destination=${merchant.lat},${merchant.lon}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(merchant.name + ' ' + merchant.address)}`}
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
      </div>
      
      {/* SEO hidden schema markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": merchant.name,
            "address": {
              "@type": "PostalAddress",
              "streetAddress": merchant.address,
              "addressCountry": "TW"
            },
            "taxID": merchant.tax_id,
            "url": merchant.website || undefined
          })
        }}
      />
    </div>
  );
}
