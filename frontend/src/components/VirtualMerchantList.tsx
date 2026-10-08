"use client";

import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRightIcon, GlobeAltIcon, MapIcon } from "@heroicons/react/24/outline";
import { distanceLabel, locationLabel, navigationUrl } from "@/utils/coordinates";
import type { MapMerchant } from "@/utils/mapMerchants";

export interface MerchantListHandle { scrollToMerchant: (id: number) => void; }
interface Props {
  merchants: MapMerchant[];
  selectedId?: number;
  onSelectMerchant: (merchant: MapMerchant) => void;
}

const ESTIMATED_HEIGHT = 144;
const GAP = 8;
const OVERSCAN = 3;

function rowAt(offsets: number[], position: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (offsets[mid] <= position) low = mid;
    else high = mid - 1;
  }
  return Math.min(low, offsets.length - 2);
}

const VirtualMerchantList = forwardRef<MerchantListHandle, Props>(function VirtualMerchantList({ merchants, selectedId, onSelectMerchant }, ref) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [heights, setHeights] = useState<Map<number, number>>(() => new Map());
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const offsets = useMemo(() => {
    const result = [0];
    for (const merchant of merchants) result.push(result[result.length - 1] + (heights.get(merchant.id) ?? ESTIMATED_HEIGHT) + GAP);
    return result;
  }, [merchants, heights]);
  const totalHeight = offsets[offsets.length - 1];
  const viewportHeight = Math.min(520, totalHeight);
  // Clamp after a search replaces a longer result set, before the browser emits scroll.
  const position = Math.min(scrollTop, Math.max(0, totalHeight - viewportHeight));
  const start = Math.max(0, rowAt(offsets, position) - OVERSCAN);
  const end = Math.min(merchants.length, rowAt(offsets, position + viewportHeight) + OVERSCAN + 1);
  const indices = Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
  const focusedIndex = focusedId === null ? -1 : merchants.findIndex((m) => m.id === focusedId);
  if (focusedIndex >= 0 && !indices.includes(focusedIndex)) indices.push(focusedIndex);
  indices.sort((a, b) => a - b);

  useImperativeHandle(ref, () => ({
    scrollToMerchant(id) {
      const index = merchants.findIndex((merchant) => merchant.id === id);
      const viewport = viewportRef.current;
      if (index < 0 || !viewport) return;
      const top = offsets[index];
      const bottom = offsets[index + 1];
      if (top >= viewport.scrollTop && bottom <= viewport.scrollTop + viewport.clientHeight) return;
      // Immediate placement also makes a distant, previously unmounted card available.
      viewport.scrollTop = Math.min(top, Math.max(0, totalHeight - viewport.clientHeight));
      setScrollTop(viewport.scrollTop);
    },
  }), [merchants, offsets, totalHeight]);

  const measure = useCallback((entries: ResizeObserverEntry[]) => {
    const measurements = entries.map((entry) => [Number((entry.target as HTMLElement).dataset.merchantId), entry.target.getBoundingClientRect().height - GAP] as const);
    setHeights((previous) => {
      let next = previous;
      for (const [id, height] of measurements) {
        if (height <= 0 || previous.get(id) === height) continue;
        if (next === previous) next = new Map(previous);
        next.set(id, height);
      }
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    if (!rowsRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    for (const row of rowsRef.current.children) observer.observe(row);
    return () => observer.disconnect();
  }, [start, end, focusedIndex, merchants, measure]);

  return (
    <div ref={viewportRef} role="region" aria-label="附近商店列表" tabIndex={0}
      className="overflow-y-auto overscroll-contain rounded-xl focus-visible:outline-2 focus-visible:outline-accent"
      style={{ height: viewportHeight, overflowAnchor: "none" }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div ref={rowsRef} role="list" style={{ height: totalHeight, position: "relative" }}>
        {indices.map((index) => {
          const m = merchants[index];
          return (
            <div key={m.id} role="listitem" aria-posinset={index + 1} aria-setsize={merchants.length}
              data-merchant-id={m.id} style={{ position: "absolute", top: offsets[index], width: "100%", paddingBottom: GAP }}
              onFocusCapture={() => setFocusedId(m.id)}
              onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedId(null); }}>
              <article aria-label={m.name} className={`bg-card rounded-xl border p-4 transition-colors hover:shadow-md w-full ${selectedId === m.id ? "border-accent/80 ring-2 ring-accent/20 bg-accent/5 shadow-md" : "border-border/50"}`}>
                <div className="flex items-start justify-between gap-2">
                  <button type="button" aria-label={`查看 ${m.name}`} onClick={() => onSelectMerchant(m)}
                    className="flex-1 min-w-0 cursor-pointer text-left rounded-md focus-visible:outline-2 focus-visible:outline-accent">
                    <p className="font-medium text-sm text-foreground truncate">{m.name}</p>
                    <p className="text-xs text-muted mt-1 truncate">{m.address}</p>
                    {locationLabel(m) && <p className="text-xs text-muted mt-1">{locationLabel(m)}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      {m.distance_km !== undefined && <span className="text-xs text-accent font-medium">{distanceLabel(m)}</span>}
                      {m.website && <GlobeAltIcon className="w-3 h-3 text-muted opacity-70" title="有專屬網站" />}
                    </div>
                  </button>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Link href={`/merchant/${m.id}`} target="_blank" rel="noopener noreferrer" title="查看商店詳情" aria-label={`查看 ${m.name} 詳情`}
                      className="p-1.5 bg-muted-bg rounded-lg hover:bg-accent/10 hover:text-accent transition-colors text-muted flex items-center justify-center">
                      <ChevronRightIcon className="w-4 h-4" />
                    </Link>
                    {(m.address || m.lat != null) && <Link href={navigationUrl(m)} target="_blank" rel="noopener noreferrer" title="Google 地圖導航" aria-label={`導航至 ${m.name}`}
                      className="p-1.5 bg-muted-bg rounded-lg hover:bg-blue-500/10 hover:text-blue-500 transition-colors text-muted flex items-center justify-center">
                      <MapIcon className="w-4 h-4" />
                    </Link>}
                  </div>
                </div>
              </article>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default VirtualMerchantList;
