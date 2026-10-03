import { distanceLabel, hasCoordinates, locationLabel, navigationUrl } from "./coordinates";

const merchant = { name:"商店",address:"台北市中正區",lat:25,lon:121,distance_km:0.75,coord_source:"postal_estimate",coord_accuracy:"estimated" };

test("estimated and legacy locations use approximate labels and address navigation", () => {
  expect(locationLabel(merchant)).toContain("郵遞區號估算");
  expect(distanceLabel(merchant)).toBe("約 750 m");
  expect(new URL(navigationUrl(merchant)).searchParams.get("destination")).toBe(merchant.address);
  expect(locationLabel({ ...merchant,coord_source:"legacy_unknown" })).toContain("來源未確認");
  expect(locationLabel({ ...merchant,coord_source:"address_geocode" })).toContain("地址查詢");
});

test("zero coordinates are valid while invalid or incomplete pairs are rejected", () => {
  expect(hasCoordinates({ ...merchant,lat:0,lon:0 })).toBe(true);
  expect(hasCoordinates({ ...merchant,lat:null })).toBe(false);
  expect(hasCoordinates({ ...merchant,lat:NaN })).toBe(false);
  expect(hasCoordinates({ ...merchant,lon:181 })).toBe(false);
});
