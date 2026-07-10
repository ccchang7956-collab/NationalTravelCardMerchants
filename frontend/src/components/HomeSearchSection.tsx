"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Form from "next/form";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import FilterSheet, { FilterState } from "@/components/FilterSheet";

interface HomeSearchSectionProps {
  initialQ: string;
  initialFilters: FilterState;
  cities: string[];
}

export default function HomeSearchSection({
  initialQ,
  initialFilters,
  cities,
}: HomeSearchSectionProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<FilterState>(initialFilters);

  useEffect(() => {
    setFilters(initialFilters);
  }, [
    initialFilters.city,
    initialFilters.hasWebsite,
    initialFilters.radiusKm,
    initialFilters.industryCode
  ]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);


  const handleRequestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("您的瀏覽器不支援定位功能");
      return;
    }
    setLocationLoading(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };

        setUserLocation(loc);
        setLocationLoading(false);
      },
      (err) => {
        setLocationError("定位失敗：" + err.message);
        setLocationLoading(false);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, []);

  const handleFilterChange = useCallback(
    (newFilters: FilterState) => {
      setFilters(newFilters);

      // Build new URL with filter params (preserve existing q)
      const currentSearch = new URLSearchParams(window.location.search);
      const q = currentSearch.get("q") || "";

      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (newFilters.city) params.set("city", newFilters.city);
      if (newFilters.hasWebsite !== null)
        params.set("has_website", String(newFilters.hasWebsite));
      if (newFilters.industryCode)
        params.set("industry_code", newFilters.industryCode);
      if (newFilters.radiusKm !== null && userLocation) {
        params.set("radius_km", String(newFilters.radiusKm));
        params.set("lat", userLocation.lat.toFixed(5));
        params.set("lon", userLocation.lon.toFixed(5));
      }
      params.set("page", "1");

      router.push(`/?${params.toString()}`);
    },
    [router, userLocation]
  );

  return (
    <Form action="/" className="bg-card p-6 rounded-2xl shadow-sm border border-border/60">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Search input */}
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input
            type="text"
            name="q"
            defaultValue={initialQ}
            placeholder="搜尋店名 or 地址..."
            className="w-full pl-10 pr-4 py-2.5 bg-muted-bg border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
          />
        </div>

        {/* Hidden inputs to carry filter state through form submit */}
        {filters.city && <input type="hidden" name="city" value={filters.city} />}
        {filters.hasWebsite !== null && (
          <input type="hidden" name="has_website" value={String(filters.hasWebsite)} />
        )}
        {filters.industryCode && (
          <input type="hidden" name="industry_code" value={filters.industryCode} />
        )}
        {filters.radiusKm !== null && userLocation && (
          <>
            <input type="hidden" name="radius_km" value={String(filters.radiusKm)} />
            <input type="hidden" name="lat" value={userLocation.lat.toFixed(5)} />
            <input type="hidden" name="lon" value={userLocation.lon.toFixed(5)} />
          </>
        )}

        {/* Filter Sheet trigger */}
        <FilterSheet
          filters={filters}
          cities={cities}
          onChange={handleFilterChange}
          userLocation={userLocation}
          onRequestLocation={handleRequestLocation}
          locationLoading={locationLoading}
          locationError={locationError}
        />

        <button
          type="submit"
          className="bg-accent text-white px-6 py-2.5 rounded-lg hover:bg-accent-hover transition-colors font-medium"
        >
          搜尋
        </button>
      </div>
    </Form>
  );
}
