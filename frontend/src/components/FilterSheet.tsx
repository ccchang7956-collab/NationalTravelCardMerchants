"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AdjustmentsHorizontalIcon, XMarkIcon, MapPinIcon } from "@heroicons/react/24/outline";

export interface FilterState {
  city: string;
  hasWebsite: boolean | null;
  radiusKm: number | null;
  industryCode?: string;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  city: "",
  hasWebsite: null,
  radiusKm: null,
  industryCode: "",
};

const RADIUS_STEPS = [0.5, 1, 2, 5, 10, 20];
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

interface FilterSheetProps {
  filters: FilterState;
  cities: string[];
  onChange: (filters: FilterState) => void;
  userLocation: { lat: number; lon: number } | null;
  onRequestLocation: () => void;
  locationLoading: boolean;
  locationError: string | null;
}

function countActiveFilters(filters: FilterState): number {
  let count = 0;
  if (filters.city) count++;
  if (filters.hasWebsite !== null) count++;
  if (filters.radiusKm !== null) count++;
  if (filters.industryCode) count++;
  return count;
}

export default function FilterSheet({
  filters,
  cities,
  onChange,
  userLocation,
  onRequestLocation,
  locationLoading,
  locationError,
}: FilterSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [industries, setIndustries] = useState<Array<{ industry_code: string; industry_name: string }>>([]);
  const [industriesLoading, setIndustriesLoading] = useState(false);

  // Local draft state — only committed on "套用"
  const [draft, setDraft] = useState<FilterState>(filters);
  // Touch state for swipe-to-close
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen || industries.length > 0 || industriesLoading) return;
    let isMounted = true;

    Promise.resolve().then(() => {
      if (!isMounted) return;
      setIndustriesLoading(true);
      fetch(`${API_URL}/api/industries`)
        .then((res) => res.json())
        .then((data) => {
          if (isMounted && Array.isArray(data)) {
            setIndustries(data);
          }
        })
        .catch((err) => console.error("Failed to fetch industries:", err))
        .finally(() => {
          if (isMounted) setIndustriesLoading(false);
        });
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, industries.length, industriesLoading]);

  // Sync draft when filters change externally (e.g. URL navigation)
  const [prevFilters, setPrevFilters] = useState<FilterState>(filters);
  if (
    filters.city !== prevFilters.city ||
    filters.hasWebsite !== prevFilters.hasWebsite ||
    filters.radiusKm !== prevFilters.radiusKm ||
    filters.industryCode !== prevFilters.industryCode
  ) {
    setPrevFilters(filters);
    setDraft(filters);
  }

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setDraft(filters); // reset draft to match currently applied filters
  }, [filters]);

  // Focus trap & Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleClose]);

  const handleOpen = useCallback(() => {
    setDraft(filters); // Reset draft to current applied filters
    setIsOpen(true);
  }, [filters]);

  const handleApply = useCallback(() => {
    onChange(draft);
    setIsOpen(false);
  }, [draft, onChange]);

  const handleClear = useCallback(() => {
    setDraft(DEFAULT_FILTER_STATE);
  }, []);

  const handleOverlayClick = handleClose;

  // Swipe-to-close handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if (delta > 80) setIsOpen(false);
    touchStartY.current = null;
  }, []);

  const handleRadiusSliderClick = useCallback(() => {
    if (!userLocation && !locationLoading) {
      onRequestLocation();
    }
  }, [userLocation, locationLoading, onRequestLocation]);

  const activeCount = countActiveFilters(filters);

  return (
    <>
      {/* Trigger Button */}
      <button
        id="filter-sheet-trigger"
        onClick={handleOpen}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer shrink-0 ${
          activeCount > 0
            ? "bg-accent text-white hover:bg-accent-hover"
            : "bg-muted-bg text-muted hover:bg-border hover:text-foreground border border-border"
        }`}
      >
        <AdjustmentsHorizontalIcon className="w-4 h-4" />
        篩選
        {activeCount > 0 && (
          <span className="ml-0.5 bg-white text-accent text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
            {activeCount}
          </span>
        )}
      </button>

      {/* Overlay */}
      <div
        className={`filter-sheet-overlay ${isOpen ? "open" : ""}`}
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* Bottom Sheet Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-sheet-title"
        aria-hidden={!isOpen}
        inert={!isOpen || undefined}
        className={`filter-sheet-panel ${isOpen ? "open" : ""}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div
            className="w-10 h-1 rounded-full bg-border"
            aria-label="拖曳以關閉"
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
          <h2 id="filter-sheet-title" className="text-base font-semibold text-foreground">
            篩選條件
          </h2>
          <div className="flex items-center gap-3">
            {countActiveFilters(draft) > 0 && (
              <button
                onClick={handleClear}
                className="text-sm text-muted hover:text-accent transition-colors cursor-pointer"
              >
                清除全部
              </button>
            )}
            <button
              onClick={handleClose}
              aria-label="關閉篩選面板"
              className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-muted-bg transition-colors cursor-pointer"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-6">
          {/* City */}
          <div>
            <label htmlFor="filter-city" className="block text-sm font-medium text-foreground mb-2">
              縣市
            </label>
            <div className="relative">
              <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <select
                id="filter-city"
                value={draft.city}
                onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                className="w-full pl-9 pr-4 py-2.5 bg-muted-bg border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all appearance-none text-sm"
              >
                <option value="">所有縣市</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 行業別 */}
          <div>
            <label htmlFor="filter-industry" className="block text-sm font-medium text-foreground mb-2">
              行業別
            </label>
            <select
              id="filter-industry"
              value={draft.industryCode || ""}
              onChange={(e) => setDraft({ ...draft, industryCode: e.target.value })}
              className="w-full px-3 py-2.5 bg-muted-bg border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all text-sm cursor-pointer"
            >
              <option value="">所有行業</option>
              {industries.map((ind) => (
                <option key={ind.industry_code} value={ind.industry_code}>
                  {ind.industry_name} ({ind.industry_code})
                </option>
              ))}
            </select>
          </div>

          {/* Has Website */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">有無官網</p>
            <div className="flex gap-2">
              {[
                { label: "不限", value: null },
                { label: "有", value: true },
                { label: "無", value: false },
              ].map(({ label, value }) => (
                <button
                  key={label}
                  onClick={() => setDraft({ ...draft, hasWebsite: value })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer border ${
                    draft.hasWebsite === value
                      ? "bg-accent text-white border-accent"
                      : "bg-muted-bg text-muted border-transparent hover:border-border"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Radius */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-foreground">距離範圍</p>
              {draft.radiusKm !== null && (
                <span className="text-sm text-accent font-medium">{draft.radiusKm} km</span>
              )}
            </div>

            {!userLocation && !locationLoading && (
              <p className="text-xs text-muted mb-2">
                需開啟位置權限才能使用距離篩選
              </p>
            )}
            {locationLoading && (
              <p className="text-xs text-muted mb-2 flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin inline-block" />
                定位中...
              </p>
            )}
            {locationError && (
              <p className="text-xs text-red-500 mb-2">{locationError}</p>
            )}

            <div className="flex flex-wrap gap-2" onClick={handleRadiusSliderClick}>
              {RADIUS_STEPS.map((km) => (
                <button
                  key={km}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!userLocation) {
                      onRequestLocation();
                      return;
                    }
                    setDraft({ ...draft, radiusKm: draft.radiusKm === km ? null : km });
                  }}
                  aria-disabled={!userLocation}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all duration-150 border ${
                    draft.radiusKm === km
                      ? 'bg-accent text-white border-accent cursor-pointer'
                      : !userLocation
                      ? 'bg-muted-bg text-muted/40 border-transparent cursor-not-allowed'
                      : 'bg-muted-bg text-muted border-transparent hover:border-border cursor-pointer'
                  }`}
                >
                  {km} km
                </button>
              ))}
              {draft.radiusKm !== null && (
                <button
                  onClick={() => setDraft({ ...draft, radiusKm: null })}
                  className="px-3 py-1.5 rounded-lg text-sm text-muted border border-transparent hover:border-border bg-muted-bg transition-all cursor-pointer"
                >
                  不限
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-6 pt-2">
          <button
            id="filter-sheet-apply"
            onClick={handleApply}
            className="w-full py-3 bg-accent text-white rounded-xl font-semibold text-sm hover:bg-accent-hover transition-colors cursor-pointer"
          >
            套用篩選
            {countActiveFilters(draft) > 0 && (
              <span className="ml-2 opacity-80">（{countActiveFilters(draft)} 項）</span>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
