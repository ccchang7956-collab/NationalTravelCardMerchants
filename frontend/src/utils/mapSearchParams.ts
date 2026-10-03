export const DEFAULT_CENTER: [number, number] = [25.0339, 121.5645];
export const DEFAULT_RADIUS_KM = 2;

export function clampLat(value: number): number {
  return Number.isFinite(value) ? Math.min(90, Math.max(-90, value)) : DEFAULT_CENTER[0];
}

export function clampLon(value: number): number {
  return Number.isFinite(value) ? Math.min(180, Math.max(-180, value)) : DEFAULT_CENTER[1];
}

export function clampRadiusKm(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_RADIUS_KM;
  return Math.min(20, Math.max(0.5, value));
}

export function parseHasWebsite(value: string | null): boolean | null {
  return value === "true" ? true : value === "false" ? false : null;
}

export function mapSearchParams(lat: number, lon: number, radius: number, q = "", industryCode = "", city = "", hasWebsite: boolean | null = null): URLSearchParams {
  const params = new URLSearchParams({ lat: clampLat(lat).toFixed(5), lon: clampLon(lon).toFixed(5), radius: String(clampRadiusKm(radius)) });
  if (q) params.set("q", q);
  if (industryCode) params.set("industry_code", industryCode);
  if (city) params.set("city", city);
  if (hasWebsite !== null) params.set("has_website", String(hasWebsite));
  return params;
}

export function mapSearchKey(lat: number, lon: number, radius: number, q = "", industryCode = "", city = "", hasWebsite: boolean | null = null): string {
  return mapSearchParams(lat, lon, radius, q, industryCode, city, hasWebsite).toString();
}
