"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MapPin, Locate, ArrowLeft, List, ChevronRight, Globe, Building, SlidersHorizontal } from "lucide-react";

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

// Default center: Taipei 101 area
const DEFAULT_CENTER: [number, number] = [25.0339, 121.5645];

export default function MapPage() {
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(false);
  const [radius, setRadius] = useState(2);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>("點擊地圖或使用「定位」按鈕搜尋附近商店");
  const [geoError, setGeoError] = useState<string | null>(null);

  const fetchNearby = useCallback(async (lat: number, lon: number, r: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `http://127.0.0.1:8000/api/merchants/nearby?lat=${lat}&lon=${lon}&radius_km=${r}&limit=200`
      );
      if (res.ok) {
        const data: Merchant[] = await res.json();
        setMerchants(data);
        setLocationStatus(`找到 ${data.length} 間商店（半徑 ${r} km 內）`);
      } else {
        setLocationStatus("查詢失敗，請稍後再試");
      }
    } catch (e) {
      setLocationStatus("無法連線後端 API");
    } finally {
      setLoading(false);
    }
  }, []);

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
        fetchNearby(loc[0], loc[1], radius);
      },
      (err) => {
        setGeoError("定位失敗：" + err.message);
        setLocationStatus("定位失敗，請手動點擊地圖選擇位置");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [fetchNearby, radius]);

  const handleMapClick = useCallback((lat: number, lon: number) => {
    setUserLocation(null);
    setCenter([lat, lon]);
    fetchNearby(lat, lon, radius);
    setLocationStatus(`已選擇地點：${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  }, [fetchNearby, radius]);

  const handleRadiusChange = useCallback((newRadius: number) => {
    setRadius(newRadius);
    fetchNearby(center[0], center[1], newRadius);
  }, [center, fetchNearby]);

  return (
    <div className="flex flex-col gap-4 h-full -mx-2">

      {/* Header Row */}
      <div className="flex items-center gap-3 flex-wrap px-2">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </Link>
        <span className="text-border">|</span>
        <h1 className="text-lg font-medium text-foreground">地圖模式</h1>
        <span className="text-xs text-muted bg-muted-bg px-2 py-0.5 rounded-full">
          地圖資料 © OpenStreetMap
        </span>
      </div>

      {/* Controls */}
      <div className="bg-card border border-border/60 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 shadow-sm mx-2">
        {/* Locate button */}
        <button
          onClick={handleLocate}
          className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium shrink-0"
        >
          <Locate className="w-4 h-4" /> 定位我的位置
        </button>

        {/* Radius control */}
        <div className="flex items-center gap-3 flex-1">
          <SlidersHorizontal className="w-4 h-4 text-muted shrink-0" />
          <span className="text-sm text-muted shrink-0">搜尋半徑</span>
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.5}
            value={radius}
            onChange={(e) => handleRadiusChange(parseFloat(e.target.value))}
            className="flex-1 accent-accent"
          />
          <span className="text-sm font-medium text-foreground w-16 text-right shrink-0">{radius} km</span>
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

      {/* Hint */}
      <p className="text-xs text-muted px-2">
        💡 提示：點擊地圖上任意位置，即可搜尋該地點附近的特約商店。
      </p>

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
          />
        </div>

        {/* Sidebar merchant list */}
        <div className="lg:w-80 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "520px" }}>
          {merchants.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-muted bg-card rounded-xl border border-border/50">
              <MapPin className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">請定位或點擊地圖<br />以搜尋附近商店</p>
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
                      {m.website && <Globe className="w-3 h-3 text-muted opacity-70" />}
                    </div>
                  </div>
                  <Link
                    href={`/merchant/${m.tax_id}`}
                    target="_blank"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 p-1 hover:text-accent transition-colors text-muted"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
