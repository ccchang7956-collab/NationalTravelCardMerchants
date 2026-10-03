export interface HomeMerchant {
  id: number;
  name: string;
  address: string | null;
  zip_code: string | null;
  tax_id: string | null;
  website: string | null;
  lat: number | null;
  lon: number | null;
  coord_source?: string | null;
  coord_accuracy?: string | null;
  geocoded_address?: string | null;
}

interface MerchantPage {
  items: HomeMerchant[];
  total: number;
  total_pages: number;
}

interface HomeStats {
  total_merchants: number;
  cities: { city: string; count: number }[];
  last_updated?: string | null;
  last_checked?: string | null;
  last_check_result?: string | null;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Backend response ${response.status}`);
  return response.json();
}

export async function loadHomeData(apiUrl: string, query: URLSearchParams): Promise<{ data: MerchantPage | null; stats: HomeStats | null }> {
  const [merchants, statistics] = await Promise.allSettled([
    fetchJson(`${apiUrl}/api/merchants?${query}`),
    fetchJson(`${apiUrl}/api/stats`),
  ]);
  const data = merchants.status === "fulfilled" ? merchants.value as MerchantPage : null;
  const stats = statistics.status === "fulfilled" ? statistics.value as HomeStats : null;
  return {
    data: data && Array.isArray(data.items) && Number.isFinite(data.total) && Number.isFinite(data.total_pages) ? data : null,
    stats: stats && Array.isArray(stats.cities) && Number.isFinite(stats.total_merchants) ? stats : null,
  };
}
