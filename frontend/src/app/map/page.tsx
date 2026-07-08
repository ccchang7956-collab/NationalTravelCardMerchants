"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPinIcon, PaperAirplaneIcon, ArrowLeftIcon, ChevronRightIcon, GlobeAltIcon, AdjustmentsHorizontalIcon, MagnifyingGlassIcon, MapIcon } from "@heroicons/react/24/outline";
import AddressSearch from "@/components/AddressSearch";

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
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function MapContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const abortControllerRef = useRef<AbortController | null>(null);

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

  // Sync state to URL
  const updateURL = useCallback((lat: number, lon: number, r: number, q: string) => {
    const currentLat = searchParams.get("lat");
    const currentLon = searchParams.get("lon");
    const currentR = searchParams.get("radius");
    const currentQ = searchParams.get("q") || "";

    // Check if URL query params match the new values to avoid infinite routing loop
    if (
      currentLat && parseFloat(currentLat).toFixed(5) === lat.toFixed(5) &&
      currentLon && parseFloat(currentLon).toFixed(5) === lon.toFixed(5) &&
      currentR && parseFloat(currentR) === r &&
      currentQ === q
    ) {
      return;
    }

    const params = new URLSearchParams();
    params.set("lat", lat.toFixed(5));
    params.set("lon", lon.toFixed(5));
    params.set("radius", r.toString());
    if (q) params.set("q", q);
    router.replace(`/map?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const fetchNearby = useCallback(async (lat: number, lon: number, r: number, q: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    updateURL(lat, lon, r, q);
    try {
      const qParam = q ? `&q=${encodeURIComponent(q)}` : "";
      const res = await fetch(
        `${API_URL}/api/merchants/nearby?lat=${lat}&lon=${lon}&radius_km=${r}&limit=200${qParam}`,
        { signal: controller.signal }
      );
      if (res.ok) {
        const data: Merchant[] = await res.json();
        setMerchants(data);
        setLocationStatus(`找到 ${data.length} 間商店（半徑 ${r} km 內）`);
      } else {
        setLocationStatus("查詢失敗，請稍後再試");
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setLocationStatus("無法連線後端 API");
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, [updateURL]);

  useEffect(() => {
    const lat = searchParams.get("lat");
    const lon = searchParams.get("lon");
    const r = searchParams.get("radius");
    const q = searchParams.get("q");

    const currentLat = lat ? parseFloat(lat) : DEFAULT_CENTER[0];
    const currentLon = lon ? parseFloat(lon) : DEFAULT_CENTER[1];
    const currentRadius = r ? parseFloat(r) : 2;
    const currentKeyword = q || "";

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCenter([currentLat, currentLon]);
    setRadius(currentRadius);
    setTempRadius(currentRadius);
    setKeyword(currentKeyword);

    if (lat && lon) {
      fetchNearby(currentLat, currentLon, currentRadius, currentKeyword);
    }
  }, [searchParams, fetchNearby]); // 監聽 searchParams 的變化以支援雙向綁定與歷史導航

  useEffect(() => {
    if (tempRadius === radius) return;
    
    const timer = setTimeout(() => {
      setRadius(tempRadius);
      fetchNearby(center[0], center[1], tempRadius, keyword);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [tempRadius, radius, center, keyword, fetchNearby]);


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
        fetchNearby(loc[0], loc[1], radius, keyword);
      },
      (err) => {
        setGeoError("定位失敗：" + err.message);
        setLocationStatus("定位失敗，請手動點擊地圖選擇位置");
      },
      { enableHighAccuracy: false, timeout: 5000 }
    );
  }, [fetchNearby, radius, keyword]);

  const handleMapClick = useCallback((lat: number, lon: number) => {
    setUserLocation(null);
    setCenter([lat, lon]);
    fetchNearby(lat, lon, radius, keyword);
    setLocationStatus(`已選擇地點：${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  }, [fetchNearby, radius, keyword]);

  const handleAddressSelect = useCallback((lat: number, lon: number) => {
    setUserLocation(null);
    setCenter([lat, lon]);
    fetchNearby(lat, lon, radius, keyword);
    setLocationStatus(`已切換至搜尋地址`);
  }, [fetchNearby, radius, keyword]);

  const handleKeywordSearch = useCallback(() => {
    fetchNearby(center[0], center[1], radius, keyword);
  }, [center, radius, keyword, fetchNearby]);

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
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 w-full">
          <AddressSearch onSelect={handleAddressSelect} />
          
          <button
            onClick={handleLocate}
            className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium shrink-0 cursor-pointer"
          >
            <PaperAirplaneIcon className="w-4 h-4 -rotate-45" /> 定位我的位置
          </button>
        </div>

        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 w-full">
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
            <button onClick={handleKeywordSearch} className="shrink-0 bg-accent px-4 py-2 rounded-lg text-sm text-white font-medium hover:bg-accent-hover transition-colors">
              篩選
            </button>
          </div>

          {/* Radius control */}
          <div className="flex items-center gap-3 flex-1">
            <AdjustmentsHorizontalIcon className="w-4 h-4 text-muted shrink-0" />
            <span className="text-sm text-muted shrink-0">半徑</span>
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.5}
              value={tempRadius}
              onChange={(e) => setTempRadius(parseFloat(e.target.value))}
              className="flex-1 accent-accent"
            />
            <span className="text-sm font-medium text-foreground w-16 text-right shrink-0">{tempRadius} km</span>
          </div>
        </div>

        {/* Status */}
        <div className="text-sm text-muted flex items-center gap-2">
          {loading && <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>}
          <span>{locationStatus}</span>
        </div>
      </div>

      {geoError && (
        <div className="mx-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg">
          ⚠️ {geoError}
        </div>
      )}

      {/* Map + Sidebar */}
      <div className="flex gap-4 flex-col lg:flex-row px-2" style={{ minHeight: "520px" }}>
        {/* Map */}
        <div className="flex-1 relative rounded-xl overflow-hidden border border-border/50 shadow-sm" style={{ minHeight: "480px" }}>
          <MapView
            merchants={merchants}
            center={center}
            userLocation={userLocation}
            onMapClick={handleMapClick}
            selectedMerchant={selectedMerchant}
            onSelectMerchant={setSelectedMerchant}
            radius={radius}
          />
        </div>

        {/* Sidebar merchant list */}
        <div className="lg:w-80 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "520px" }}>
          {merchants.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-muted bg-card rounded-xl border border-border/50">
              <MapPinIcon className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">尚未搜尋到商店</p>
            </div>
          ) : (
            merchants.map((m) => (
              <div
                key={m.id}
                onClick={() => setSelectedMerchant(m)}
                className={`bg-card rounded-xl border p-4 cursor-pointer transition-all duration-150 hover:shadow-md ${
                  selectedMerchant?.id === m.id
                    ? "border-accent/60 shadow-md"
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
                        onClick={(e) => e.stopPropagation()}
                        title="Google 地圖導航"
                        className="p-1.5 bg-muted-bg rounded-lg hover:bg-blue-500/10 hover:text-blue-500 transition-colors text-muted flex items-center justify-center"
                      >
                        <MapIcon className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
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
