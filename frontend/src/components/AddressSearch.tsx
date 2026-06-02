"use client";

import { useState, useEffect, useRef } from "react";
import { MagnifyingGlassIcon, MapPinIcon } from "@heroicons/react/24/outline";

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
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    const controller = new AbortController();

    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=tw&limit=5`,
          {
            headers: {
              "Accept-Language": "zh-TW,zh;q=0.9",
            },
            signal: controller.signal,
          }
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setShowDropdown(true);
        }
      } catch (err) {
        // 忽略因取消造成的 AbortError
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("Geocoding fetch error:", err);
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => {
      clearTimeout(delayDebounceFn);
      controller.abort(); // 同時取消 in-flight 請求，避免 race condition
    };
  }, [query]);

  const handleSelect = (result: NominatimResult) => {
    setQuery(result.display_name.split(",")[0] || result.display_name);
    setShowDropdown(false);
    onSelect(parseFloat(result.lat), parseFloat(result.lon));
  };

  return (
    <div className="relative w-full max-w-sm" ref={dropdownRef}>
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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

      {showDropdown && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {results.map((result) => (
            <button
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
