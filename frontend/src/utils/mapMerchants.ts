import type { HomeMerchant } from "./homeData";

export interface MapMerchant extends HomeMerchant {
  distance_km?: number;
}
