"use client";

import type * as L from "leaflet";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

interface MerchantMiniMapProps {
  lat: number;
  lon: number;
  name: string;
}

export default function MerchantMiniMap({ lat, lon, name }: MerchantMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 儲存 { map, marker } 以便後續更新
  const instanceRef = useRef<{ map: L.Map; marker: L.Marker } | null>(null);

  // ── 初始化地圖（只執行一次）────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    // 若已建立則不重複初始化
    if (instanceRef.current) return;

    let cancelled = false;

    const initMap = async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      // Fix default icon paths（webpack/turbopack bundling 需要）
      delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current, {
        center: [lat, lon],
        zoom: 16,
        zoomControl: true,
        scrollWheelZoom: false,
        dragging: true,
        attributionControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const merchantIcon = L.divIcon({
        className: "",
        html: `<div style="
          width: 32px; height: 32px;
          background: #C25E40;
          border: 3px solid white;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 3px 10px rgba(194,94,64,0.4);
        "></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -34],
      });

      // ── 安全建立 popup 內容（避免 XSS：用 DOM API 而非 innerHTML 插值）──────
      const popupContainer = document.createElement("div");
      popupContainer.style.cssText = "font-family:system-ui;padding:4px 0";

      const nameEl = document.createElement("div");
      nameEl.style.cssText = "font-weight:600;font-size:13px;color:#333";
      nameEl.textContent = name; // textContent 不會解析 HTML，安全
      popupContainer.appendChild(nameEl);

      const labelEl = document.createElement("div");
      labelEl.style.cssText = "font-size:11px;color:#888;margin-top:2px";
      labelEl.textContent = "國民旅遊卡特約商店";
      popupContainer.appendChild(labelEl);

      const marker = L.marker([lat, lon], { icon: merchantIcon })
        .addTo(map)
        .bindPopup(popupContainer, { maxWidth: 220 })
        .openPopup();

      // 確認 cleanup 尚未觸發才儲存 instance
      if (!cancelled) {
        instanceRef.current = { map, marker };
      } else {
        // cleanup 已先觸發，立即銷毀
        map.remove();
      }
    };

    initMap();

    return () => {
      cancelled = true;
      if (instanceRef.current) {
        instanceRef.current.map.remove();
        instanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 當 lat/lon/name 改變時更新標記位置（不重建整個地圖）──────────────────
  useEffect(() => {
    if (!instanceRef.current) return;
    const { map, marker } = instanceRef.current;
    const newLatLng = [lat, lon] as [number, number];
    marker.setLatLng(newLatLng);
    map.setView(newLatLng, map.getZoom(), { animate: true });
  }, [lat, lon]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl overflow-hidden border border-border/50"
      style={{ height: "280px" }}
    />
  );
}
