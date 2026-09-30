"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MapPinIcon,
  PaperAirplaneIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
  GlobeAltIcon,
  AdjustmentsHorizontalIcon,
  MagnifyingGlassIcon,
  MapIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon
} from "@heroicons/react/24/outline";
import AddressSearch from "@/components/AddressSearch";
import FilterSheet, { FilterState, DEFAULT_FILTER_STATE } from "@/components/FilterSheet";
import { getPublicApiUrl } from "@/utils/env";

// Dynamically import the map to avoid SSR issues (Leaflet needs window)
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-muted-bg rounded-xl" style={{ minHeight: "480px" }}>
      <div className="flex flex-col items-center gap-3 text-muted">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm">載入地圖中...</span>
      </div>
    </div>
  ),
});

interface Merchant {
  id: number;
  name: string;
  address: string | null;
  zip_code: string | null;
  tax_id: string | null;
  website: string | null;
  lat: number | null;
  lon: number | null;
  distance_km?: number;
}

const DEFAULT_CENTER: [number, number] = [25.0339, 121.5645];
const API_URL = getPublicApiUrl();

export function clampLat(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_CENTER[0];
  return Math.min(90, Math.max(-90, v));
}

export function clampLon(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_CENTER[1];
  return Math.min(180, Math.max(-180, v));
}

export function clampRadiusKm(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 2;
  return Math.min(10, v);
}

function MapContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastFetchedRef = useRef<string>("");
  const merchantRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(false);
  const [radius, setRadius] = useState(2);
  const [tempRadius, setTempRadius] = useState(2);
  const [keyword, setKeyword] = useState("");
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>("請輸入地址、定位，或點擊地圖搜尋");
  const [geoError, setGeoError] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationGeoError, setLocationGeoError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Sync state to URL
  const updateURL = useCallback((lat: number, lon: number, r: number, q: string, indCode: string = "") => {
    const currentLat = searchParams.get("lat");
    const currentLon = searchParams.get("lon");
    const currentR = searchParams.get("radius");
    const currentQ = searchParams.get("q") || "";
    const currentIndCode = searchParams.get("industry_code") || "";

    if (
      currentLat && parseFloat(currentLat).toFixed(5) === lat.toFixed(5) &&
      currentLon && parseFloat(currentLon).toFixed(5) === lon.toFixed(5) &&
      currentR && parseFloat(currentR) === r &&
      currentQ === q &&
      currentIndCode === indCode
    ) {
      return;
    }

    const params = new URLSearchParams();
    params.set("lat", lat.toFixed(5));
    params.set("lon", lon.toFixed(5));
    params.set("radius", r.toString());
    if (q) params.set("q", q);
    if (indCode) params.set("industry_code", indCode);
    router.replace(`/map?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const fetchNearby = useCallback(async (lat: number, lon: number, r: number, q: string, indCode: string = "") => {
    const fetchKey = `${lat.toFixed(5)},${lon.toFixed(5)},${r},${q},${indCode}`;
    lastFetchedRef.current = fetchKey;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setApiError(null);
    updateURL(lat, lon, r, q, indCode);
    try {
      const qParam = q ? `&q=${encodeURIComponent(q)}` : "";
      const indParam = indCode ? `&industry_code=${encodeURIComponent(indCode)}` : "";
      const res = await fetch(
        `${API_URL}/api/merchants/nearby?lat=${lat}&lon=${lon}&radius_km=${r}&limit=200${qParam}${indParam}`,
        { signal: controller.signal }
      );
      if (res.ok) {
        const data: Merchant[] = await res.json();
        setMerchants(data);
        setLocationStatus(`找到 ${data.length} 間商店（半徑 ${r} km 內）`);
      } else {
        setLocationStatus("查詢失敗，請稍後再試");
        setApiError(`後端 API 回應錯誤 (${res.status})`);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setLocationStatus("無法連線後端 API");
      setApiError("無法連線後端 API，請確認網路連線或後端服務狀態");
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, [updateURL]);

  // Parse URL query params
  const latParam = searchParams.get("lat");
  const lonParam = searchParams.get("lon");
  const radiusParam = searchParams.get("radius");
  const qParam = searchParams.get("q");
  const indCodeParam = searchParams.get("industry_code");

  const parsedLat = latParam ? parseFloat(latParam) : DEFAULT_CENTER[0];
  const parsedLon = lonParam ? parseFloat(lonParam) : DEFAULT_CENTER[1];
  const parsedRadius = radiusParam ? parseFloat(radiusParam) : 2;

  const targetLat = clampLat(parsedLat);
  const targetLon = clampLon(parsedLon);
  const targetRadius = clampRadiusKm(parsedRadius);
  const targetKeyword = qParam || "";
  const targetIndCode = indCodeParam || "";

  const [prevParamsKey, setPrevParamsKey] = useState<string>("");
  const currentParamsKey = `${targetLat.toFixed(5)},${targetLon.toFixed(5)},${targetRadius},${targetKeyword},${targetIndCode}`;

  // URL 參數同步至 state：必須在 useEffect 內執行，避免 render 期 setState
  /* eslint-disable react-hooks/set-state-in-effect -- URL query params → state 單向同步 */
  useEffect(() => {
    if (prevParamsKey === currentParamsKey) return;
    setPrevParamsKey(currentParamsKey);
    setCenter([targetLat, targetLon]);
    setRadius(targetRadius);
    setTempRadius(targetRadius);
    setKeyword(targetKeyword);
    setFilterState(prev => prev.industryCode === targetIndCode ? prev : { ...prev, industryCode: targetIndCode });
  }, [currentParamsKey, prevParamsKey, targetLat, targetLon, targetRadius, targetKeyword, targetIndCode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Trigger fetch when URL parameters change or initial load
  useEffect(() => {
    let isCancelled = false;
    Promise.resolve().then(() => {
      if (!isCancelled) {
        fetchNearby(targetLat, targetLon, targetRadius, targetKeyword, targetIndCode);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [fetchNearby, targetLat, targetLon, targetRadius, targetKeyword, targetIndCode]);

  // Debounced radius slider effect
  useEffect(() => {
    if (tempRadius === radius) return;

    const timer = setTimeout(() => {
      setRadius(tempRadius);
      fetchNearby(center[0], center[1], tempRadius, keyword, filterState.industryCode || "");
    }, 300);

    return () => clearTimeout(timer);
  }, [tempRadius, radius, center, keyword, filterState.industryCode, fetchNearby]);

  // Scroll active merchant item into view in sidebar
  useEffect(() => {
    if (selectedMerchant && merchantRefs.current[selectedMerchant.id]) {
      merchantRefs.current[selectedMerchant.id]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedMerchant]);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("您的瀏覽器不支援定位功能");
      return;
    }
    setLocationStatus("定位中...");
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(loc);
        setCenter(loc);
        fetchNearby(loc[0], loc[1], radius, keyword, filterState.industryCode || "");
      },
      (err) => {
        setGeoError("定位失敗：" + err.message);
        setLocationStatus("定位失敗，請手動點擊地圖選擇位置");
      },
      { enableHighAccuracy: false, timeout: 5000 }
    );
  }, [fetchNearby, radius, keyword, filterState.industryCode]);

  const handleFilterRequestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationGeoError("您的瀏覽器不支援定位功能");
      return;
    }
    setLocationLoading(true);
    setLocationGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(loc);
        setCenter(loc);
        setLocationLoading(false);
      },
      (err) => {
        setLocationGeoError("定位失敗：" + err.message);
        setLocationLoading(false);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, []);

  const handleFilterChange = useCallback(
    (newFilters: FilterState) => {
      setFilterState(newFilters);
      const newRadius = newFilters.radiusKm ?? radius;
      if (newFilters.radiusKm !== null) {
        setRadius(newFilters.radiusKm);
        setTempRadius(newFilters.radiusKm);
      }
      fetchNearby(center[0], center[1], newRadius, keyword, newFilters.industryCode || "");
    },
    [fetchNearby, center, radius, keyword]
  );

  const handleMapClick = useCallback((clickLat: number, clickLon: number) => {
    setUserLocation(null);
    setCenter([clickLat, clickLon]);
    fetchNearby(clickLat, clickLon, radius, keyword, filterState.industryCode || "");
    setLocationStatus(`已選擇地點：${clickLat.toFixed(4)}, ${clickLon.toFixed(4)}`);
  }, [fetchNearby, radius, keyword, filterState.industryCode]);

  const handleAddressSelect = useCallback((selectLat: number, selectLon: number) => {
    setUserLocation(null);
    setCenter([selectLat, selectLon]);
    fetchNearby(selectLat, selectLon, radius, keyword, filterState.industryCode || "");
    setLocationStatus(`已切換至搜尋地址`);
  }, [fetchNearby, radius, keyword, filterState.industryCode]);

  const handleKeywordSearch = useCallback(() => {
    fetchNearby(center[0], center[1], radius, keyword, filterState.industryCode || "");
  }, [center, radius, keyword, filterState.industryCode, fetchNearby]);

  const handleResetFilters = useCallback(() => {
    setKeyword("");
    setTempRadius(2);
    setRadius(2);
    setCenter(DEFAULT_CENTER);
    setFilterState(DEFAULT_FILTER_STATE);
    fetchNearby(DEFAULT_CENTER[0], DEFAULT_CENTER[1], 2, "", "");
  }, [fetchNearby]);

  return (
    <div className="flex flex-col gap-4 h-full -mx-2">
      {/* Header Row */}
      <div className="flex items-center gap-3 flex-wrap px-2">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors">
          <ArrowLeftIcon className="w-4 h-4" /> 返回列表
        </Link>
        <span className="text-border">|</span>
        <h1 className="text-lg font-medium text-foreground">地圖模式</h1>
        <span className="text-xs text-muted bg-muted-bg px-2 py-0.5 rounded-full">
          地圖資料 © OpenStreetMap
        </span>
      </div>

      {/* Controls */}
      <div className="bg-card border border-border/60 rounded-xl p-4 flex flex-col gap-4 shadow-sm mx-2">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full">
          <AddressSearch onSelect={handleAddressSelect} />

          <button
            onClick={handleLocate}
            className="inline-flex items-center justify-center gap-2 bg-accent text-white px-4 py-2 rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium shrink-0 cursor-pointer"
          >
            <PaperAirplaneIcon className="w-4 h-4 -rotate-45" /> 定位我的位置
          </button>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full">
          {/* Keyword filter */}
          <div className="flex items-center gap-2 flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleKeywordSearch()}
              placeholder="在附近搜尋關鍵字 (例如: 咖啡)"
              className="w-full pl-9 pr-4 py-2 bg-muted-bg border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all text-sm"
            />
            <button
              onClick={handleKeywordSearch}
              className="shrink-0 bg-accent px-4 py-2 rounded-lg text-sm text-white font-medium hover:bg-accent-hover transition-colors cursor-pointer"
            >
              搜尋
            </button>
            <FilterSheet
              filters={filterState}
              cities={[
                "基隆市", "台北市", "新北市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
                "台中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "台南市",
                "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "台東縣", "澎湖縣", "金門縣", "連江縣"
              ]}
              onChange={handleFilterChange}
              userLocation={userLocation ? { lat: userLocation[0], lon: userLocation[1] } : null}
              onRequestLocation={handleFilterRequestLocation}
              locationLoading={locationLoading}
              locationError={locationGeoError}
            />
          </div>

          {/* Radius control */}
          <div className="flex items-center gap-3 flex-1 bg-muted-bg/50 px-3 py-1.5 rounded-lg border border-border/40">
            <AdjustmentsHorizontalIcon className="w-4 h-4 text-muted shrink-0" />
            <span className="text-sm text-muted shrink-0">半徑</span>
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.5}
              value={tempRadius}
              onChange={(e) => setTempRadius(parseFloat(e.target.value))}
              className="flex-1 accent-accent cursor-pointer"
              aria-label="搜尋半徑"
            />
            <span className="text-sm font-medium text-foreground w-16 text-right shrink-0">{tempRadius} km</span>
          </div>
        </div>

        {/* Status */}
        <div className="text-sm text-muted flex items-center gap-2">
          {loading && <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>}
          <span>{locationStatus}</span>
        </div>
      </div>

      {geoError && (
        <div className="mx-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg flex items-center justify-between">
          <span>⚠️ {geoError}</span>
          <button onClick={() => setGeoError(null)} className="text-xs underline cursor-pointer">關閉</button>
        </div>
      )}

      {apiError && (
        <div className="mx-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="w-5 h-5 shrink-0 text-red-500" />
            <span>{apiError}</span>
          </div>
          <button
            onClick={() => fetchNearby(center[0], center[1], radius, keyword, filterState.industryCode || "")}
            className="inline-flex items-center gap-1 text-xs bg-red-100 hover:bg-red-200 text-red-800 px-2.5 py-1 rounded transition-colors cursor-pointer font-medium"
          >
            <ArrowPathIcon className="w-3.5 h-3.5" /> 重試
          </button>
        </div>
      )}

      {/* Map + Sidebar */}
      <div className="flex gap-4 flex-col lg:flex-row px-2" style={{ minHeight: "520px" }}>
        {/* Map */}
        <div className="flex-1 relative rounded-xl overflow-hidden border border-border/50 shadow-sm min-h-[380px] lg:min-h-[480px]">
          <MapView
            merchants={merchants}
            center={center}
            userLocation={userLocation}
            onMapClick={handleMapClick}
            selectedMerchant={selectedMerchant}
            onSelectMerchant={setSelectedMerchant}
            radius={radius}
            tempRadius={tempRadius}
          />
        </div>

        {/* Sidebar merchant list */}
        <div className="lg:w-80 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "520px" }}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border/50 p-4 animate-pulse space-y-2.5">
                <div className="h-4 bg-muted-bg rounded w-3/4"></div>
                <div className="h-3 bg-muted-bg rounded w-5/6"></div>
                <div className="flex justify-between items-center pt-1">
                  <div className="h-3 bg-muted-bg rounded w-1/4"></div>
                  <div className="h-6 bg-muted-bg rounded w-6"></div>
                </div>
              </div>
            ))
          ) : merchants.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 text-center text-muted bg-card rounded-xl border border-border/50 gap-3">
              <MapPinIcon className="w-12 h-12 text-muted/30" />
              <div>
                <p className="font-medium text-foreground text-sm">尚未搜尋到商店</p>
                <p className="text-xs text-muted mt-1">半徑 {radius} km 內未找到相關商店</p>
              </div>
              <button
                onClick={handleResetFilters}
                className="mt-2 text-xs bg-accent/10 text-accent hover:bg-accent hover:text-white px-3 py-1.5 rounded-lg transition-colors font-medium cursor-pointer"
              >
                重設搜尋條件
              </button>
            </div>
          ) : (
            merchants.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-label={`查看 ${m.name}`}
                ref={(el) => { merchantRefs.current[m.id] = el; }}
                onClick={() => setSelectedMerchant(m)}
                className={`bg-card rounded-xl border p-4 cursor-pointer transition-all duration-150 hover:shadow-md text-left w-full ${
                  selectedMerchant?.id === m.id
                    ? "border-accent/80 ring-2 ring-accent/20 bg-accent/5 shadow-md"
                    : "border-border/50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{m.name}</p>
                    <p className="text-xs text-muted mt-1 truncate">{m.address}</p>
                    <div className="flex items-center gap-3 mt-2">
                      {m.distance_km !== undefined && (
                        <span className="text-xs text-accent font-medium">{m.distance_km.toFixed(2)} km</span>
                      )}
                      {m.website && <GlobeAltIcon className="w-3 h-3 text-muted opacity-70" title="有專屬網站" />}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Link
                      href={`/merchant/${m.tax_id || m.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="查看商店詳情"
                      className="p-1.5 bg-muted-bg rounded-lg hover:bg-accent/10 hover:text-accent transition-colors text-muted flex items-center justify-center"
                    >
                      <ChevronRightIcon className="w-4 h-4" />
                    </Link>
                    {m.lat && m.lon && (
                      <Link
                        href={`https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Google 地圖導航"
                        className="p-1.5 bg-muted-bg rounded-lg hover:bg-blue-500/10 hover:text-blue-500 transition-colors text-muted flex items-center justify-center"
                      >
                        <MapIcon className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted animate-pulse">正在載入地圖元件...</div>}>
      <MapContent />
    </Suspense>
  );
}
