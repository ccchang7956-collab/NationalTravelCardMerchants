export interface CoordinateMerchant {
  name: string;
  address?: string | null;
  lat?: number | null;
  lon?: number | null;
  coord_source?: string | null;
  coord_accuracy?: string | null;
  geocoded_address?: string | null;
  distance_km?: number;
}

export function hasCoordinates(merchant: CoordinateMerchant): boolean {
  return typeof merchant.lat === "number" && Number.isFinite(merchant.lat) && merchant.lat >= -90 && merchant.lat <= 90
    && typeof merchant.lon === "number" && Number.isFinite(merchant.lon) && merchant.lon >= -180 && merchant.lon <= 180;
}

export function locationLabel(merchant: CoordinateMerchant): string | null {
  if (!hasCoordinates(merchant) || merchant.coord_accuracy === "verified") return null;
  if (merchant.coord_source === "postal_estimate") return "約略位置（郵遞區號估算）";
  if (merchant.coord_source === "address_geocode") return "約略位置（地址查詢）";
  return "約略位置（來源未確認）";
}

export function distanceLabel(merchant: CoordinateMerchant): string {
  const distance = merchant.distance_km;
  if (distance === undefined || !Number.isFinite(distance)) return "";
  const value = distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(2)} km`;
  return merchant.coord_accuracy === "verified" ? value : `約 ${value}`;
}

export function navigationUrl(merchant: CoordinateMerchant): string {
  const destination = merchant.coord_accuracy === "verified" && hasCoordinates(merchant)
    ? `${merchant.lat},${merchant.lon}` : merchant.address?.trim() || merchant.name;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
