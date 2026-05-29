import Link from "next/link";
import Form from "next/form";
import { MagnifyingGlassIcon, MapPinIcon, BuildingStorefrontIcon, GlobeAltIcon } from "@heroicons/react/24/outline";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
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

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
  
  let data = null;
  let stats = null;
  try {
    const res = await fetch(`${API_URL}/api/merchants?${query.toString()}`, { cache: 'no-store' });
    if (res.ok) data = await res.json();
    
    const statsRes = await fetch(`${API_URL}/api/stats`, { next: { revalidate: 3600 } });
    if (statsRes.ok) stats = await statsRes.json();
  } catch (e) {
    console.error("Backend fetch error", e);
  }

  const merchants = data?.items || [];
  const totalPages = data?.total_pages || 1;
  const total = data?.total || 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Stats header */}
      <div className="flex flex-col sm:flex-row items-baseline gap-2 mb-8">
        <h1 className="text-3xl font-medium tracking-tight text-foreground">特約商店檢索</h1>
        {stats && (
          <span className="text-muted text-sm">
            共收錄 {stats.total_merchants.toLocaleString()} 間商店
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
              {stats?.cities?.map((c: any) => (
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
                <h3 className="text-lg font-medium text-foreground group-hover:text-accent transition-colors">
                  {m.name}
                </h3>
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
          <h3 className="text-lg font-medium text-foreground mb-1">找不到符合的商店</h3>
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
      
    </div>
  );
}
