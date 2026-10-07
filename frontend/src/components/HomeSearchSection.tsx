"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Form from "next/form";
import { useFormStatus } from "react-dom";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import FilterSheet, { FilterState } from "@/components/FilterSheet";
import { useToast } from "@/components/Toast";
import { geoErrorMessage } from "@/utils/geolocation";
import { mapSearchParams } from "@/utils/mapSearchParams";

interface HomeSearchSectionProps {
  initialQ: string;
  initialFilters: FilterState;
  cities: string[];
}

function SearchSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-live="polite"
      className="bg-accent text-white px-6 py-2.5 rounded-lg hover:bg-accent-hover transition-colors font-medium disabled:opacity-70 disabled:cursor-wait inline-flex items-center justify-center gap-2 min-w-[88px]"
    >
      {pending && (
        <span
          aria-hidden="true"
          className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin"
        />
      )}
      {pending ? "搜尋中" : "搜尋"}
    </button>
  );
}

export default function HomeSearchSection({
  initialQ,
  initialFilters,
  cities,
}: HomeSearchSectionProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [prevInitialFilters, setPrevInitialFilters] = useState<FilterState>(initialFilters);

  // initialFilters 同步至 state：必須在 useEffect 內執行，避免 render 期 setState
  /* eslint-disable react-hooks/set-state-in-effect -- props → state 單向同步 */
  useEffect(() => {
    if (
      initialFilters.city !== prevInitialFilters.city ||
      initialFilters.hasWebsite !== prevInitialFilters.hasWebsite ||
      initialFilters.radiusKm !== prevInitialFilters.radiusKm ||
      initialFilters.industryCode !== prevInitialFilters.industryCode
    ) {
      setPrevInitialFilters(initialFilters);
      setFilters(initialFilters);
    }
  }, [initialFilters, prevInitialFilters]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const qRef = useRef<HTMLInputElement>(null);


  const handleRequestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("您的瀏覽器不支援定位功能");
      toast.error("無法取得位置", "請改用縣市或地址搜尋");
      return;
    }
    setLocationLoading(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };

        setUserLocation(loc);
        toast.success("定位完成", "選擇搜尋距離後，套用篩選即可查看附近商店");
        setLocationLoading(false);
      },
      (err) => {
        const message = geoErrorMessage(err);
        setLocationError(message);
        toast.error("定位失敗", message);
        setLocationLoading(false);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, [toast]);

  const handleFilterChange = useCallback(
    (newFilters: FilterState) => {
      // 定位失敗時距離篩選無法生效：清掉 radius，避免徽章顯示有篩、結果沒篩
      const effective =
        newFilters.radiusKm !== null && !userLocation
          ? { ...newFilters, radiusKm: null }
          : newFilters;
      if (newFilters.radiusKm !== null && !userLocation) toast.info("距離篩選尚未套用", "請先允許定位；目前仍可使用其他篩選搜尋");
      setFilters(effective);

      // 用 ref 持有目前輸入框的 q，避免 URL 舊 q 凍結
      const q = qRef.current?.value || "";

      // 列表頁不做地理篩選：有定位＋距離一律導向 /map（參數名對齊 map 頁：radius/lat/lon）
      if (effective.radiusKm !== null && userLocation) {
        const mapParams = mapSearchParams(userLocation.lat, userLocation.lon, effective.radiusKm, q, effective.industryCode, effective.city, effective.hasWebsite);
        router.push(`/map?${mapParams.toString()}`);
        return;
      }

      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (effective.city) params.set("city", effective.city);
      if (effective.hasWebsite !== null)
        params.set("has_website", String(effective.hasWebsite));
      if (effective.industryCode)
        params.set("industry_code", effective.industryCode);
      params.set("page", "1");

      router.push(`/?${params.toString()}`);
    },
    [router, userLocation, toast]
  );

  return (
    <Form action="/" className="bg-card p-6 rounded-2xl shadow-sm border border-border/60">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Search input */}
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input
            key={initialQ}
            ref={qRef}
            type="text"
            name="q"
            defaultValue={initialQ}
            maxLength={50}
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

        <SearchSubmitButton />
      </div>
    </Form>
  );
}
