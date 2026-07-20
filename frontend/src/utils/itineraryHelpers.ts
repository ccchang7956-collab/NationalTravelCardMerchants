export interface ItineraryItem {
  id?: number;
  merchant_id?: number;
  custom_name: string;
  address?: string;
  lat?: number;
  lon?: number;
  order_index?: number;
  estimated_cost?: number;
  quota_category?: string;
  stay_minutes?: number;
}

export function buildGoogleMapsUrl(items: ItineraryItem[]): string {
  if (!items || items.length === 0) return '';

  const getLocationString = (item: ItineraryItem): string => {
    if (item.lat != null && item.lon != null) {
      return `${item.lat},${item.lon}`;
    }
    return item.address || item.custom_name;
  };

  const origin = encodeURIComponent(getLocationString(items[0]));
  if (items.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${origin}`;
  }

  const destination = encodeURIComponent(getLocationString(items[items.length - 1]));
  const waypoints = items
    .slice(1, -1)
    .map((item) => encodeURIComponent(getLocationString(item)))
    .join('|');

  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
  if (waypoints) {
    url += `&waypoints=${waypoints}`;
  }
  return url;
}
