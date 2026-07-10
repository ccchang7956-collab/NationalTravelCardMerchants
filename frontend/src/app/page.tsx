import type { Metadata } from "next";
import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";
import { MagnifyingGlassIcon, MapPinIcon, BuildingStorefrontIcon, GlobeAltIcon, MapIcon } from "@heroicons/react/24/outline";
import HomeSearchSection from "@/components/HomeSearchSection";
import type { FilterState } from "@/components/FilterSheet";

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
  const hasFilters = !!(q || city || resolved.has_website || resolved.radius_km);

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

  // 新增篩選參數解析
  const hasWebsiteParam = typeof resolvedParams.has_website === "string" ? resolvedParams.has_website : undefined;
  const hasWebsite: boolean | null =
    hasWebsiteParam === "true" ? true : hasWebsiteParam === "false" ? false : null;
  const radiusKm: number | null =
    typeof resolvedParams.radius_km === "string"
      ? parseFloat(resolvedParams.radius_km) || null
      : null;
  const latParam = typeof resolvedParams.lat === "string" ? parseFloat(resolvedParams.lat) : NaN;
  const lonParam = typeof resolvedParams.lon === "string" ? parseFloat(resolvedParams.lon) : NaN;

  const query = new URLSearchParams();
  if (q) query.append("q", q);
  if (city) query.append("city", city);
  if (hasWebsite !== null) query.append("has_website", String(hasWebsite));
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
    if (hasWebsite !== null) redirectQuery.append("has_website", String(hasWebsite));
    if (radiusKm !== null && !isNaN(latParam) && !isNaN(lonParam)) {
      redirectQuery.append("radius_km", String(radiusKm));
      redirectQuery.append("lat", latParam.toFixed(5));
      redirectQuery.append("lon", lonParam.toFixed(5));
    }
    redirectQuery.append("page", totalPages.toString());
    redirect(`/?${redirectQuery.toString()}`);
  }

  const initialFilters: FilterState = {
    city,
    hasWebsite,
    radiusKm,
  };

  const buildPageUrl = (targetPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (city) params.set("city", city);
    if (hasWebsite !== null) params.set("has_website", String(hasWebsite));
    if (radiusKm !== null && !isNaN(latParam) && !isNaN(lonParam)) {
      params.set("radius_km", String(radiusKm));
      params.set("lat", latParam.toFixed(5));
      params.set("lon", lonParam.toFixed(5));
    }
    params.set("page", String(targetPage));
    return `/?${params.toString()}`;
  };

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

      {/* Search + Filter Section */}
      <HomeSearchSection
        initialQ={q}
        initialFilters={initialFilters}
        cities={TAIWAN_CITIES}
      />

      {/* Results Meta */}
      <div className="text-sm text-muted">
        找到 {total.toLocaleString()} 筆符合的結果 (第 {page} / {totalPages} 頁)
      </div>

      {/* Merchant List */}
      {merchants.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {merchants.map((m: any) => {
            const mapUrl = m.lat && m.lon
              ? `/map?lat=${m.lat}&lon=${m.lon}&radius=1`
              : `/map${city ? `?city=${encodeURIComponent(city)}` : ""}`;
            return (
              <div key={m.id} className="relative group">
                <Link href={`/merchant/${m.tax_id || m.id}`} className="block">
                  <div className="bg-card p-5 rounded-xl border border-border/50 shadow-sm hover:shadow-md hover:border-accent/40 transition-all duration-200 h-full flex flex-col">
                    <h2 className="text-lg font-medium text-foreground group-hover:text-accent transition-colors pr-8">
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
                {/* 在地圖查看按鈕（絕對定位，防止觸發卡片連結） */}
                <Link
                  href={mapUrl}
                  title="在地圖上查看附近商店"
                  className="absolute top-4 right-4 p-1.5 rounded-lg bg-muted-bg text-muted hover:bg-accent/10 hover:text-accent transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                  <MapIcon className="w-4 h-4" />
                </Link>
              </div>
            );
          })}
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
        <div className="flex flex-col items-center gap-3 pt-6">
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {/* 上一頁 */}
            {page > 1 ? (
              <Link
                href={buildPageUrl(page - 1)}
                className="px-3 py-2 rounded-lg bg-card border border-border hover:border-accent/50 hover:text-accent transition-colors text-sm"
              >
                ←
              </Link>
            ) : (
              <span className="px-3 py-2 rounded-lg text-sm text-muted/40 cursor-not-allowed">←</span>
            )}

            {/* 第一頁 */}
            {page > 3 && (
              <>
                <Link
                  href={buildPageUrl(1)}
                  className="px-3 py-2 rounded-lg bg-card border border-border hover:border-accent/50 hover:text-accent transition-colors text-sm"
                >
                  1
                </Link>
                {page > 4 && (
                  <span className="px-1 py-2 text-sm text-muted">…</span>
                )}
              </>
            )}

            {/* 前後各 2 頁的頁碼（排除已在首頁/末頁區塊顯示的頁碼，避免重複） */}
            {(() => {
              const windowStart = Math.max(1, page - 2);
              const windowEnd = Math.min(totalPages, page + 2);
              const pages: number[] = [];
              for (let p = windowStart; p <= windowEnd; p++) {
                // 跳過 page=1（若 page>3 已由首頁區塊顯示）
                if (p === 1 && page > 3) continue;
                // 跳過最後一頁（若 page<totalPages-2 已由末頁區塊顯示）
                if (p === totalPages && page < totalPages - 2) continue;
                pages.push(p);
              }
              return pages.map((p) =>
                p === page ? (
                  <span
                    key={p}
                    className="px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium min-w-[36px] text-center"
                  >
                    {p}
                  </span>
                ) : (
                  <Link
                    key={p}
                    href={buildPageUrl(p)}
                    className="px-3 py-2 rounded-lg bg-card border border-border hover:border-accent/50 hover:text-accent transition-colors text-sm min-w-[36px] text-center"
                  >
                    {p}
                  </Link>
                )
              );
            })()}


            {/* 最後一頁 */}
            {page < totalPages - 2 && (
              <>
                {page < totalPages - 3 && (
                  <span className="px-1 py-2 text-sm text-muted">…</span>
                )}
                <Link
                  href={buildPageUrl(totalPages)}
                  className="px-3 py-2 rounded-lg bg-card border border-border hover:border-accent/50 hover:text-accent transition-colors text-sm"
                >
                  {totalPages}
                </Link>
              </>
            )}

            {/* 下一頁 */}
            {page < totalPages ? (
              <Link
                href={buildPageUrl(page + 1)}
                className="px-3 py-2 rounded-lg bg-card border border-border hover:border-accent/50 hover:text-accent transition-colors text-sm"
              >
                →
              </Link>
            ) : (
              <span className="px-3 py-2 rounded-lg text-sm text-muted/40 cursor-not-allowed">→</span>
            )}
          </div>

          {/* 跳頁輸入框 */}
          {totalPages > 10 && (
            <Form action="/" className="flex items-center gap-2 text-sm text-muted">
              {q && <input type="hidden" name="q" value={q} />}
              {city && <input type="hidden" name="city" value={city} />}
              {hasWebsite !== null && <input type="hidden" name="has_website" value={String(hasWebsite)} />}
              {radiusKm !== null && !isNaN(latParam) && !isNaN(lonParam) && (
                <>
                  <input type="hidden" name="radius_km" value={String(radiusKm)} />
                  <input type="hidden" name="lat" value={latParam.toFixed(5)} />
                  <input type="hidden" name="lon" value={lonParam.toFixed(5)} />
                </>
              )}
              <span>跳至第</span>
              <input
                type="number"
                name="page"
                min={1}
                max={totalPages}
                placeholder={String(page)}
                className="w-16 px-2 py-1.5 text-center bg-muted-bg border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all text-foreground"
              />
              <span>頁</span>
              <button
                type="submit"
                className="px-3 py-1.5 bg-muted-bg border border-border rounded-lg hover:border-accent/50 hover:text-accent transition-colors"
              >
                前往
              </button>
            </Form>
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
