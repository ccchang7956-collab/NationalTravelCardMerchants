import type { Metadata } from "next";
import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";
import { MagnifyingGlassIcon, MapPinIcon, BuildingStorefrontIcon, GlobeAltIcon, MapIcon } from "@heroicons/react/24/outline";
import HomeSearchSection from "@/components/HomeSearchSection";
import MerchantActions from "@/components/MerchantActions";
import type { FilterState } from "@/components/FilterSheet";
import { getBackendUrl } from "@/utils/env";
import { getSiteUrl } from "@/utils/site";

const TAIWAN_CITIES = [
  "基隆市", "台北市", "新北市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
  "台中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "台南市",
  "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "台東縣", "澎湖縣", "金門縣", "連江縣"
];

interface CityStat {
  city: string;
  count: number;
}

interface Merchant {
  id: number;
  name: string;
  address: string | null;
  zip_code: string | null;
  tax_id: string | null;
  website: string | null;
  lat: number | null;
  lon: number | null;
  distance_km?: number;
}

// 動態 metadata：有篩選條件時不索引（避免重複內容），並設定 canonical
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const SITE_URL = getSiteUrl();
  const resolved = await searchParams;
  const q = typeof resolved.q === "string" ? resolved.q.slice(0, 50) : "";
  const city = typeof resolved.city === "string" ? resolved.city : "";
  const parsedMetaPage = typeof resolved.page === "string" ? parseInt(resolved.page, 10) : 1;
  const page = isNaN(parsedMetaPage) || parsedMetaPage < 1 ? 1 : parsedMetaPage;

  // 有搜尋條件或翻頁時不索引，避免搜尋結果頁稀釋首頁
  const hasFilters = !!(q || city || resolved.has_website || resolved.radius_km || resolved.industry_code || resolved.lat || resolved.lon || (resolved.page && resolved.page !== "1"));

  return {
    alternates: {
      canonical: hasFilters || page > 1 ? `/?${new URLSearchParams(resolved as Record<string, string>).toString()}` : SITE_URL + "/",
    },
    ...((hasFilters || page > 1) && {
      robots: { index: false, follow: true },
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
  const q = typeof resolvedParams.q === "string" ? resolvedParams.q.slice(0, 50) : "";
  const parsedPage = typeof resolvedParams.page === "string" ? parseInt(resolvedParams.page, 10) : 1;
  const page = isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
  const city = typeof resolvedParams.city === "string" ? resolvedParams.city : "";

  // 新增篩選參數解析
  const hasWebsiteParam = typeof resolvedParams.has_website === "string" ? resolvedParams.has_website : undefined;
  const hasWebsite: boolean | null =
    hasWebsiteParam === "true" ? true : hasWebsiteParam === "false" ? false : null;
  const industryCode = typeof resolvedParams.industry_code === "string" ? resolvedParams.industry_code : "";
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
  if (industryCode) query.append("industry_code", industryCode);
  query.append("page", page.toString());
  query.append("per_page", "20");

  const API_URL = getBackendUrl();
  
  let data = null;
  let stats = null;
  try {
    const [mRes, sRes] = await Promise.all([
      fetch(`${API_URL}/api/merchants?${query.toString()}`, { next: { revalidate: 300 } }),
      fetch(`${API_URL}/api/stats`, { next: { revalidate: 3600 } }),
    ]);
    if (mRes.ok) data = await mRes.json();
    if (sRes.ok) stats = await sRes.json();
  } catch (e) {
    console.error("Backend fetch error", e);
  }

  const merchants = data?.items || [];
  const _total = Number(data?.total ?? 0);
  const total = Number.isFinite(_total) && _total >= 0 ? Math.floor(_total) : 0;
  const _tp = Number(data?.total_pages ?? 1);
  const totalPages = Number.isFinite(_tp) && _tp >= 1 ? Math.floor(_tp) : 1;

  if (page > totalPages && totalPages > 0) {
    const redirectQuery = new URLSearchParams();
    if (q) redirectQuery.append("q", q);
    if (city) redirectQuery.append("city", city);
    if (hasWebsite !== null) redirectQuery.append("has_website", String(hasWebsite));
    if (industryCode) redirectQuery.append("industry_code", industryCode);
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
    industryCode,
  };

  const buildPageUrl = (targetPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (city) params.set("city", city);
    if (hasWebsite !== null) params.set("has_website", String(hasWebsite));
    if (industryCode) params.set("industry_code", industryCode);
    if (radiusKm !== null && !isNaN(latParam) && !isNaN(lonParam)) {
      params.set("radius_km", String(radiusKm));
      params.set("lat", latParam.toFixed(5));
      params.set("lon", lonParam.toFixed(5));
    }
    params.set("page", String(targetPage));
    return `/?${params.toString()}`;
  };

  let sortedCities: CityStat[] = stats?.cities || [];
  if (sortedCities.length > 0) {
    sortedCities = [...sortedCities].sort((a: CityStat, b: CityStat) => {
      const idxA = TAIWAN_CITIES.indexOf(a.city);
      const idxB = TAIWAN_CITIES.indexOf(b.city);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
  }

  const last_updated: string | null =
    typeof stats?.last_updated === "string" && stats.last_updated
      ? stats.last_updated
      : null;
  const lastUpdatedDate = last_updated ? last_updated.slice(0, 10) : null;
  const statsTotal = Number(stats?.total_merchants ?? 0);
  // 後端 /stats cities 已依筆數降序，取前三名動態呈現（無寫死數字）
  const topCities: CityStat[] = Array.isArray(stats?.cities)
    ? stats.cities.slice(0, 3)
    : [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Stats header */}
      <div className="flex flex-col sm:flex-row items-baseline gap-2 mb-8">
        <h1 className="text-3xl font-medium tracking-tight text-foreground">
          國民旅遊卡特約商店查詢
        </h1>
        {stats && (
          <span className="text-muted text-sm">
            收錄 {statsTotal.toLocaleString()} 間全台特約商店
            {lastUpdatedDate && (
              <>
                {" "}·{" "}
                <time dateTime={last_updated ?? undefined}>
                  資料更新：{lastUpdatedDate}
                </time>
              </>
            )}
          </span>
        )}
      </div>

      {/* Search + Filter Section */}
      <HomeSearchSection
        initialQ={q}
        initialFilters={initialFilters}
        cities={TAIWAN_CITIES}
        initialLat={isNaN(latParam) ? undefined : latParam}
        initialLon={isNaN(lonParam) ? undefined : lonParam}
      />

      {/* Results Meta */}
      <div className="text-sm text-muted">
        找到 {total.toLocaleString()} 筆符合的結果 (第 {page} / {totalPages} 頁)
      </div>

      {/* Merchant List */}
      {merchants.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {merchants.map((m: Merchant) => {
            const mapParams = new URLSearchParams();
            if (m.lat && m.lon) {
              mapParams.set("lat", m.lat.toString());
              mapParams.set("lon", m.lon.toString());
              mapParams.set("radius", "1");
            } else if (city) {
              mapParams.set("city", city);
            }
            if (industryCode) {
              mapParams.set("industry_code", industryCode);
            }
            const mapUrl = `/map?${mapParams.toString()}`;
            return (
              <div key={m.id} className="relative group">
                <article className="bg-card p-5 rounded-xl border border-border/50 shadow-sm hover:shadow-md hover:border-accent/40 transition-all duration-200 h-full flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/merchant/${m.tax_id || m.id}`} className="block flex-1 group-hover:text-accent transition-colors">
                        <h2 className="text-lg font-medium text-foreground pr-2">
                          {m.name}
                        </h2>
                      </Link>
                      <MerchantActions merchant={{ id: m.id, name: m.name }} variant="card" />
                    </div>
                    <Link href={`/merchant/${m.tax_id || m.id}`} className="block mt-3">
                      <div className="space-y-2 text-sm text-muted">
                        <div className="flex items-start gap-2">
                          <MapPinIcon className="w-4 h-4 mt-0.5 shrink-0 opacity-70" />
                          <span>{String(m.zip_code ?? "")} {String(m.address ?? "")}</span>
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
                    </Link>
                  </div>
                  
                  {/* 地圖查看連結 */}
                  <div className="mt-4 pt-3 border-t border-border/40 flex justify-end">
                    <Link
                      href={mapUrl}
                      title="在地圖上查看附近商店"
                      className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors"
                    >
                      <MapIcon className="w-3.5 h-3.5" />
                      <span>查看附近商店</span>
                    </Link>
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 px-4 bg-card rounded-2xl border border-border/60 shadow-sm space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto text-accent">
            <MagnifyingGlassIcon className="w-7 h-7" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h2 className="text-xl font-semibold text-foreground">找不到符合的商店</h2>
            <p className="text-sm text-muted">
              {q ? `找不到包含「${q}」的結果。` : "無符合當前篩選條件的特約商店。"}
              請嘗試簡化關鍵字或重設篩選條件。
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors shadow-sm"
            >
              重設所有搜尋與篩選
            </Link>
          </div>
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
                aria-label="上一頁"
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

            {/* 前後各 2 頁的頁碼 */}
            {(() => {
              const windowStart = Math.max(1, page - 2);
              const windowEnd = Math.min(totalPages, page + 2);
              const pages: number[] = [];
              for (let p = windowStart; p <= windowEnd; p++) {
                if (p === 1 && page > 3) continue;
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
                aria-label="下一頁"
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
              {industryCode && <input type="hidden" name="industry_code" value={industryCode} />}
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

      {/* SEO 靜態說明區塊 + FAQ Schema */}
      {!q && !city && page === 1 && (
        <>
          <section
            aria-label="關於國民旅遊卡特約商店"
            className="seo-intro mt-12 pt-8 border-t border-border/40 text-sm text-muted space-y-4 leading-relaxed"
          >
            <h2 className="text-base font-medium text-foreground/70">
              關於國民旅遊卡特約商店查詢
            </h2>
            <p>
              <strong>國民旅遊卡（National Travel Card）</strong>
              為行政院人事行政總處推動之國內旅遊補助方案，全體公務人員及其眷屬可持國旅卡於全台
              {stats ? `超過 ${statsTotal.toLocaleString()} 間` : "眾多"}
              特約商店消費
              {lastUpdatedDate ? `（截至 ${lastUpdatedDate}）` : ""}。
            </p>
            <p>
              特約商店涵蓋多種類別：
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>🏨 住宿（飯店、民宿、旅館）</li>
              <li>🍽️ 餐飲（餐廳、咖啡廳）</li>
              <li>🎡 休閒遊樂（主題樂園、溫泉、觀光景點）</li>
              <li>🚌 交通運輸（租車、客運）</li>
              <li>🛍️ 文化體育（書店、運動中心）</li>
            </ul>
            <p>
              本系統收錄最新政府開放資料，每日自動比對更新，提供全台特約商店即時查詢服務，
              支援店名搜尋、縣市篩選，以及地圖定位查看附近商店。
            </p>
            <p className="text-xs text-muted/60">
              資料來源：行政院人事行政總處政府開放資料
              {lastUpdatedDate && (
                <>
                 ；
                  <time dateTime={last_updated ?? undefined}>
                    資料更新：{lastUpdatedDate}
                  </time>
                </>
              )}
              。如有疑問請以官方公告為準。
            </p>
          </section>

          {/* FAQ 常見問題（精華 5 問，完整版見 /faq） */}
          <section
            aria-label="國旅卡常見問題"
            className="mt-8 pt-6 border-t border-border/40 space-y-4"
          >
            <h2 className="text-base font-medium text-foreground/70 text-sm">
              常見問題
            </h2>
            <div className="space-y-3 text-sm text-muted leading-relaxed">
              <details className="group">
                <summary className="cursor-pointer text-foreground/80 hover:text-foreground transition-colors font-medium">
                  國民旅遊卡可以在哪裡使用？
                </summary>
                <p className="mt-2 ml-4">
                  國民旅遊卡（國旅卡）可在全台
                  {stats ? `超過 ${statsTotal.toLocaleString()} 間` : "眾多"}
                  特約商店使用，涵蓋住宿、餐飲、休閒遊樂、文化體育、交通運輸等類別。本系統提供即時查詢服務，支援縣市篩選與店名搜尋
                  {lastUpdatedDate ? `（截至 ${lastUpdatedDate}）` : ""}。
                </p>
              </details>
              <details className="group">
                <summary className="cursor-pointer text-foreground/80 hover:text-foreground transition-colors font-medium">
                  如何查詢附近的國旅卡特約商店？
                </summary>
                <p className="mt-2 ml-4">
                  可使用本系統的地圖功能，開啟定位後即可查看附近 1～5
                  公里內的特約商店。也可在首頁依縣市、行業類別進行篩選查詢。
                </p>
              </details>
              <details className="group">
                <summary className="cursor-pointer text-foreground/80 hover:text-foreground transition-colors font-medium">
                  國民旅遊卡特約商店資料多久更新一次？
                </summary>
                <p className="mt-2 ml-4">
                  本系統資料來源為政府開放資料，系統每日自動比對更新，確保提供最新的特約商店清單
                  {lastUpdatedDate ? `（截至 ${lastUpdatedDate}，共 ${statsTotal.toLocaleString()} 間）` : ""}。
                </p>
              </details>
              <details className="group">
                <summary className="cursor-pointer text-foreground/80 hover:text-foreground transition-colors font-medium">
                  哪個縣市的國旅卡特約商店最多？
                </summary>
                <p className="mt-2 ml-4">
                  根據最新資料
                  {lastUpdatedDate ? `（截至 ${lastUpdatedDate}）` : ""}
                  {topCities.length > 0
                    ? `，${topCities.map((c) => `${c.city}（${c.count.toLocaleString()} 間）`).join("、")}為特約商店數量最多的縣市。`
                    : "，各主要縣市均有數千間特約商店，實際數量請以站內統計為準。"}
                </p>
              </details>
              <details className="group">
                <summary className="cursor-pointer text-foreground/80 hover:text-foreground transition-colors font-medium">
                  誰可以使用國民旅遊卡？
                </summary>
                <p className="mt-2 ml-4">
                  國民旅遊卡（National Travel Card）由行政院人事行政總處推動，適用於全體公務人員及其眷屬，用於國內旅遊相關消費補助。
                </p>
              </details>
            </div>
            <p className="text-sm">
              <Link href="/faq" className="text-accent hover:underline">
                查看完整常見問題 →
              </Link>
            </p>
          </section>

          {/* FAQPage JSON-LD Schema（與上方 5 則精華問答一致） */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: [
                  {
                    "@type": "Question",
                    name: "國民旅遊卡可以在哪裡使用？",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: `國民旅遊卡（國旅卡）可在全台${stats ? `超過 ${statsTotal.toLocaleString()} 間` : "眾多"}特約商店使用，涵蓋住宿、餐飲、休閒遊樂、文化體育、交通運輸等類別。本系統提供即時查詢服務，支援縣市篩選與店名搜尋${lastUpdatedDate ? `（截至 ${lastUpdatedDate}）` : ""}。`,
                    },
                  },
                  {
                    "@type": "Question",
                    name: "如何查詢附近的國旅卡特約商店？",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "可使用本系統的地圖功能，開啟定位後即可查看附近 1～5 公里內的特約商店。也可依縣市、行業類別進行篩選查詢。",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "國民旅遊卡特約商店資料多久更新一次？",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: `本系統資料來源為政府開放資料，系統每日自動比對更新，確保提供最新的特約商店清單${lastUpdatedDate ? `（截至 ${lastUpdatedDate}，共 ${statsTotal.toLocaleString()} 間）` : ""}。`,
                    },
                  },
                  {
                    "@type": "Question",
                    name: "哪個縣市的國旅卡特約商店最多？",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: topCities.length > 0
                        ? `根據最新資料${lastUpdatedDate ? `（截至 ${lastUpdatedDate}）` : ""}，${topCities.map((c) => `${c.city}（${c.count.toLocaleString()} 間）`).join("、")}為特約商店數量最多的縣市。`
                        : "根據最新資料，各主要縣市均有數千間特約商店，實際數量請以站內統計為準。",
                    },
                  },
                  {
                    "@type": "Question",
                    name: "誰可以使用國民旅遊卡？",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: "國民旅遊卡（National Travel Card）由行政院人事行政總處推動，適用於全體公務人員及其眷屬，用於國內旅遊相關消費補助。",
                    },
                  },
                ],
              }),
            }}
          />
        </>
      )}

    </div>
  );
}
