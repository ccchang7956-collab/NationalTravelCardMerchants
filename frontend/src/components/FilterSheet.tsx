"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AdjustmentsHorizontalIcon, XMarkIcon, MapPinIcon } from "@heroicons/react/24/outline";
import { INDUSTRY_GROUPS } from "@/utils/industryTaxonomy";

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

interface IndustrySelection {
  groupCode: string;
  detailCode: string;
}

interface FilterSheetProps {
  filters: FilterState;
  cities: string[];
  onChange: (filters: FilterState) => void;
  userLocation: { lat: number; lon: number } | null;
  onRequestLocation: () => void;
  locationLoading: boolean;
  locationError: string | null;
  mode?: "list" | "map";
}

function countActiveFilters(filters: FilterState): number {
  let count = 0;
  if (filters.city) count++;
  if (filters.hasWebsite !== null) count++;
  if (filters.radiusKm !== null) count++;
  return count;
}

export default function FilterSheet(props: FilterSheetProps) {
  const key = JSON.stringify([props.filters.city, props.filters.hasWebsite, props.filters.radiusKm, props.filters.industryCode || ""]);
  const [industrySelection, setIndustrySelection] = useState<IndustrySelection>({ groupCode: "", detailCode: "" });
  return (
    <FilterSheetPanel
      key={key}
      {...props}
      industrySelection={industrySelection}
      onIndustrySelectionChange={setIndustrySelection}
    />
  );
}

function FilterSheetPanel({
  filters,
  cities,
  onChange,
  userLocation,
  onRequestLocation,
  locationLoading,
  locationError,
  mode = "list",
  industrySelection,
  onIndustrySelectionChange,
}: FilterSheetProps & {
  industrySelection: IndustrySelection;
  onIndustrySelectionChange: (selection: IndustrySelection) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedIndustryGroup = INDUSTRY_GROUPS.find((group) => group.code === industrySelection.groupCode);

  // Local draft state — only committed on "套用"
  const [draft, setDraft] = useState<FilterState>(filters);
  // Touch state for swipe-to-close
  const touchStartY = useRef<number | null>(null);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setDraft(filters); // reset draft to match currently applied filters
  }, [filters, setDraft]);

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
  }, [filters, setDraft]);

  const handleApply = useCallback(() => {
    // Keep industry choices visible, but do not send them as active filters until merchant mappings exist.
    onChange({ ...draft, industryCode: "" });
    setIsOpen(false);
  }, [draft, onChange]);

  const handleClear = useCallback(() => {
    setDraft({ ...DEFAULT_FILTER_STATE, radiusKm: mode === "map" ? 2 : null });
    onIndustrySelectionChange({ groupCode: "", detailCode: "" });
  }, [mode, onIndustrySelectionChange, setDraft]);

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

  const activeCount = countActiveFilters(filters);

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
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
            {(countActiveFilters(draft) > 0 || industrySelection.groupCode) && (
              <button
                type="button"
                onClick={handleClear}
                className="text-sm text-muted hover:text-accent transition-colors cursor-pointer"
              >
                清除全部
              </button>
            )}
            <button
              type="button"
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
              value={industrySelection.groupCode}
              onChange={(e) => onIndustrySelectionChange({ groupCode: e.target.value, detailCode: "" })}
              className="w-full px-3 py-2.5 bg-muted-bg border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all text-sm cursor-pointer"
            >
              <option value="">所有行業</option>
              {INDUSTRY_GROUPS.map((group) => (
                <option key={group.code} value={group.code}>
                  {group.name}
                </option>
              ))}
            </select>
            <label htmlFor="filter-industry-detail" className="block text-sm font-medium text-foreground mt-4 mb-2">
              行業細項分類
            </label>
            <select
              id="filter-industry-detail"
              disabled={!selectedIndustryGroup}
              value={industrySelection.detailCode}
              onChange={(e) => onIndustrySelectionChange({ ...industrySelection, detailCode: e.target.value })}
              className="w-full px-3 py-2.5 bg-muted-bg border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">{selectedIndustryGroup ? "所有細項" : "請先選擇行業別"}</option>
              {selectedIndustryGroup?.details.map((detail) => (
                <option key={detail.code} value={detail.code}>
                  {detail.name}
                </option>
              ))}
            </select>
            <p role="status" className="text-xs text-muted mt-2">
              目前僅提供分類選擇；商家行業對照資料尚未建置，因此暫不影響搜尋結果。
            </p>
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
                  type="button"
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

            {mode === "list" && !userLocation && !locationLoading && (
              <p className="text-xs text-muted mb-2">
                需開啟位置權限才能使用距離篩選
                <button type="button" onClick={onRequestLocation} className="ml-2 text-accent underline cursor-pointer">
                  取得位置
                </button>
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

            <div className="flex flex-wrap gap-2">
              {RADIUS_STEPS.map((km) => (
                <button
                  type="button"
                  key={km}
                  onClick={() => {
                    setDraft({ ...draft, radiusKm: mode === "list" && draft.radiusKm === km ? null : km });
                  }}
                  disabled={mode === "list" && !userLocation}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all duration-150 border ${
                    draft.radiusKm === km
                      ? 'bg-accent text-white border-accent cursor-pointer'
                      : mode === "list" && !userLocation
                      ? 'bg-muted-bg text-muted/40 border-transparent cursor-not-allowed'
                      : 'bg-muted-bg text-muted border-transparent hover:border-border cursor-pointer'
                  }`}
                >
                  {km} km
                </button>
              ))}
              {mode === "list" && draft.radiusKm !== null && (
                <button
                  type="button"
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
            type="button"
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
