// Workbox serializes these callbacks into the generated service worker.
// Keep each callback self-contained; imported constants are unavailable there.
export const apiCachePlugin = {
  fetchDidSucceed: async ({ response }: { response: Response }) => {
    if (response.status >= 500) throw new Error("API unavailable");
    return response;
  },
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    if (response.status !== 200) return null;
    const headers = new Headers(response.headers);
    headers.set("X-Data-Fetched-At", new Date().toISOString());
    return new Response(response.clone().body, { status: response.status, statusText: response.statusText, headers });
  },
  cachedResponseWillBeUsed: async ({ cachedResponse }: { cachedResponse?: Response }) => {
    if (!cachedResponse) return null;
    const fetchedAt = Date.parse(cachedResponse.headers.get("X-Data-Fetched-At") || "");
    const age = Date.now() - fetchedAt;
    if (!Number.isFinite(fetchedAt) || age < 0 || age >= 86400000) return null;
    const headers = new Headers(cachedResponse.headers);
    headers.set("X-Data-Source", "cache");
    return new Response(cachedResponse.clone().body, { status: cachedResponse.status, statusText: cachedResponse.statusText, headers });
  },
};

export function cachedResponseTime(response: Response): string | null {
  if (response.headers?.get("X-Data-Source") !== "cache") return null;
  const value = response.headers.get("X-Data-Fetched-At");
  return value && Number.isFinite(Date.parse(value)) ? value : null;
}
