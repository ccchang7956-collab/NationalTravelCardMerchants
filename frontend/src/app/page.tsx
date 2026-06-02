import type { Metadata } from "next";
import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";
import { MagnifyingGlassIcon, MapPinIcon, BuildingStorefrontIcon, GlobeAltIcon } from "@heroicons/react/24/outline";

const TAIWAN_CITIES = [
  "基隆市", "台北市", "新北市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
  "台中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "台南市",
  "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "台東縣", "澎湖縣", "金門縣", "連江縣"
];

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// 動態 metadata：有篩選條件時不索引（避免重複內容），並設定 canonical
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const resolved = await searchParams;
  const q = typeof resolved.q === "string" ? resolved.q : "";
  const city = typeof resolved.city === "string" ? resolved.city : "";

  // 有搜尋條件或翻頁時不索引，避免搜尋結果頁稀釋首頁
  const hasFilters = !!(q || city);

  return {
    alternates: {
      canonical: SITE_URL + "/",
    },
    ...(hasFilters && {
      robots: { index: false, follow: false },
    }),
    ...(q && {
      title: `搜尋「${q}」的特約商店結果`,
      description: `在${city || "全台"}搜尋「${q}」的國民旅遊卡特約商店查詢結果。`,
    }),
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await searchParams;
  const q = typeof resolvedParams.q === "string" ? resolvedParams.q : "";
  const parsedPage = typeof resolvedParams.page === "string" ? parseInt(resolvedParams.page, 10) : 1;
  const page = isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
  const city = typeof resolvedParams.city === "string" ? resolvedParams.city : "";
  
  const query = new URLSearchParams();
  if (q) query.append("q", q);
  if (city) query.append("city", city);
  query.append("page", page.toString());
  query.append("per_page", "20");

  const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
  
  let data = null;
  let stats = null;
  try {
    const res = await fetch(`${API_URL}/api/merchants?${query.toString()}`, { next: { revalidate: 300 } });
    if (res.ok) data = await res.json();
    
    const statsRes = await fetch(`${API_URL}/api/stats`, { next: { revalidate: 3600 } });
    if (statsRes.ok) stats = await statsRes.json();
  } catch (e) {
    console.error("Backend fetch error", e);
  }

  const merchants = data?.items || [];
  const totalPages = data?.total_pages || 1;
  const total = data?.total || 0;

  if (page > totalPages && totalPages > 0) {
    const redirectQuery = new URLSearchParams();
    if (q) redirectQuery.append("q", q);
    if (city) redirectQuery.append("city", city);
    redirectQuery.append("page", totalPages.toString());
    redirect(`/?${redirectQuery.toString()}`);
  }

  let sortedCities = stats?.cities || [];
  if (sortedCities.length > 0) {
    sortedCities = [...sortedCities].sort((a: any, b: any) => {
      const idxA = TAIWAN_CITIES.indexOf(a.city);
      const idxB = TAIWAN_CITIES.indexOf(b.city);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Stats header */}
      <div className="flex flex-col sm:flex-row items-baseline gap-2 mb-8">
        <h1 className="text-3xl font-medium tracking-tight text-foreground">
          國民旅遊卡特約商店查詢
        </h1>
        {stats && (
          <span className="text-muted text-sm">
            收錄 {stats.total_merchants.toLocaleString()} 間全台特約商店
          </span>
        )}
      </div>

      {/* Search Form - Submitting to current URL */}
      <Form action="/" className="bg-card p-6 rounded-2xl shadow-sm border border-border/60">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input 
              type="text" 
              name="q"
              defaultValue={q}
              placeholder="搜尋店名 or 地址..." 
              className="w-full pl-10 pr-4 py-2.5 bg-muted-bg border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
            />
          </div>
          
          <div className="relative md:w-48">
            <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <select 
              name="city"
              defaultValue={city}
              className="w-full pl-10 pr-4 py-2.5 bg-muted-bg border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all appearance-none"
            >
              <option value="">所有縣市</option>
              {sortedCities.map((c: any) => (
                <option key={c.city} value={c.city}>{c.city} ({c.count})</option>
              ))}
            </select>
          </div>
          
          <button type="submit" className="bg-accent text-white px-6 py-2.5 rounded-lg hover:bg-accent-hover transition-colors font-medium">
            搜尋
          </button>
        </div>
      </Form>

      {/* Results Meta */}
      <div className="text-sm text-muted">
        找到 {total.toLocaleString()} 筆符合的結果 (第 {page} / {totalPages} 頁)
      </div>

      {/* Merchant List */}
      {merchants.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {merchants.map((m: any) => (
            <Link href={`/merchant/${m.tax_id || m.id}`} key={m.id} className="block group">
              <div className="bg-card p-5 rounded-xl border border-border/50 shadow-sm hover:shadow-md hover:border-accent/40 transition-all duration-200 h-full flex flex-col">
                <h2 className="text-lg font-medium text-foreground group-hover:text-accent transition-colors">
                  {m.name}
                </h2>
                <div className="mt-3 space-y-2 text-sm text-muted flex-1">
                  <div className="flex items-start gap-2">
                    <MapPinIcon className="w-4 h-4 mt-0.5 shrink-0 opacity-70" />
                    <span>{m.zip_code} {m.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BuildingStorefrontIcon className="w-4 h-4 shrink-0 opacity-70" />
                    <span>統編：{m.tax_id}</span>
                  </div>
                  {m.website && (
                    <div className="flex items-center gap-2 text-accent">
                      <GlobeAltIcon className="w-4 h-4 shrink-0 opacity-70" />
                      <span className="truncate">有專屬網站</span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-card rounded-2xl border border-border/60">
          <MagnifyingGlassIcon className="w-12 h-12 text-muted/30 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-foreground mb-1">找不到符合的商店</h2>
          <p className="text-muted">請嘗試使用其他關鍵字或變更縣市篩選條件。</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-6">
          {page > 1 && (
            <Link 
              href={`/?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}&page=${page - 1}`}
              className="px-4 py-2 rounded-lg bg-card border border-border hover:border-accent/50 transition-colors text-sm"
            >
              上一頁
            </Link>
          )}
          
          <div className="text-sm font-medium text-foreground px-4 py-2 bg-muted-bg rounded-lg">
            {page}
          </div>
          
          {page < totalPages && (
            <Link 
              href={`/?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}&page=${page + 1}`}
              className="px-4 py-2 rounded-lg bg-card border border-border hover:border-accent/50 transition-colors text-sm"
            >
              下一頁
            </Link>
          )}
        </div>
      )}

      {/* SEO 靜態說明區塊：幫助 Google 理解頁面主題 */}
      {!q && !city && page === 1 && (
        <section
          aria-label="關於國民旅遊卡特約商店"
          className="mt-12 pt-8 border-t border-border/40 text-sm text-muted space-y-3 leading-relaxed"
        >
          <h2 className="text-base font-medium text-foreground/70">關於國民旅遊卡特約商店查詢</h2>
          <p>
            國民旅遊卡（National Travel Card）為行政院人事行政總處推動之國內旅遊補助方案，
            公務人員及其眷屬可持國旅卡於全台特約商店消費，涵蓋住宿、餐飲、休閒遊樂、
            交通運輸等各類別。
          </p>
          <p>
            本系統收錄最新政府開放資料，提供全台特約商店即時查詢服務，
            支援店名搜尋、縣市篩選，以及地圖定位查看附近商店。
          </p>
        </section>
      )}

    </div>
  );
}
