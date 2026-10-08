"use client";

import { useState, useEffect, useRef } from "react";
import { MagnifyingGlassIcon, MapPinIcon } from "@heroicons/react/24/outline";
import { getPublicApiUrl } from "@/utils/env";

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
}

interface AddressSearchProps {
  onSelect: (lat: number, lon: number) => void;
}

export default function AddressSearch({ onSelect }: AddressSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      activeRequest.current?.abort();
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    activeRequest.current?.abort();
    activeRequest.current = null;
    setLoading(false);
    setQuery(val);
    setSearchError(null);
    setResults([]);
    setShowDropdown(false);
  };

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (query.trim().length < 2 || loading) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(new Error("timeout")), 12000);
    setLoading(true);
    setSearchError(null);
    setResults([]);
    setShowDropdown(false);
    try {
      const res = await fetch(
        `${getPublicApiUrl()}/api/geocoding/search?q=${encodeURIComponent(query.trim())}`,
        { signal: controller.signal, cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        if (activeRequest.current !== controller) return;
        if (!Array.isArray(data) || !data.every((item) =>
          typeof item.display_name === "string" &&
          Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)) &&
          Math.abs(Number(item.lat)) <= 90 && Math.abs(Number(item.lon)) <= 180
        )) throw new Error("Invalid address search response");
        setResults(data);
        setShowDropdown(data.length > 0);
        if (!data.length) setSearchError("找不到符合的地址，請換個關鍵字或直接點地圖定位");
      } else {
        if (activeRequest.current !== controller) return;
        setSearchError(res.status === 429
          ? "地址搜尋忙碌中，請稍後再試或直接點地圖定位"
          : `地址搜尋暫時不可用（${res.status}），請稍後再試或直接點地圖定位`);
      }
    } catch (err) {
      // 忽略因取消造成的 AbortError
      if (activeRequest.current !== controller || (err instanceof Error && err.name === "AbortError")) return;
      console.error("Geocoding fetch error:", err);
      setSearchError("地址搜尋連線失敗，請檢查網路後再試，或直接點地圖定位");
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  };

  const handleSelect = (result: NominatimResult) => {
    setQuery(result.display_name.split(",")[0] || result.display_name);
    setShowDropdown(false);
    onSelect(parseFloat(result.lat), parseFloat(result.lon));
  };

  return (
    <div className="relative w-full max-w-sm" ref={dropdownRef}>
      <form onSubmit={handleSearch} className="relative flex gap-2">
        <div className="relative flex-1 min-w-0">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            aria-label="地址搜尋"
            maxLength={200}
            value={query}
            onChange={handleInputChange}
            onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
            placeholder="輸入地址輔助定位..."
            className="w-full pl-9 pr-8 py-2 bg-muted-bg border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all text-sm"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
        <button type="submit" disabled={loading || query.trim().length < 2} className="px-3 py-2 rounded-lg bg-accent text-white text-sm disabled:opacity-50">
          {loading ? "搜尋中" : "搜尋地址"}
        </button>
      </form>
      <p className="mt-1 text-xs text-muted">
        輸入後按 Enter 或搜尋按鈕。地址資料 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap</a>
      </p>

      {searchError && !loading && (
        <p className="mt-1.5 text-xs text-red-500" role="alert">{searchError}</p>
      )}

      {showDropdown && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {results.map((result) => (
            <button
              type="button"
              key={result.place_id}
              onClick={() => handleSelect(result)}
              className="w-full text-left px-4 py-2 text-sm hover:bg-muted-bg transition-colors flex items-start gap-2 border-b border-border/30 last:border-0"
            >
              <MapPinIcon className="w-4 h-4 text-muted shrink-0 mt-0.5" />
              <span className="text-foreground leading-tight truncate">{result.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
