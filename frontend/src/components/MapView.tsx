"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Static CSS imports — must be at top level (Turbopack requirement)
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

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

interface MapViewProps {
  merchants: Merchant[];
  center: [number, number];
  userLocation: [number, number] | null;
  onMapClick: (lat: number, lon: number) => void;
  selectedMerchant: Merchant | null;
  onSelectMerchant: (m: Merchant) => void;
}

export default function MapView({
  merchants,
  center,
  userLocation,
  onMapClick,
  selectedMerchant,
  onSelectMerchant,
}: MapViewProps) {
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersLayerRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const centerMarkerRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const onMapClickRef = useRef(onMapClick);
  const router = useRouter();

  // 保持 onMapClickRef 永遠指向最新的 callback，避免地圖 click 的 stale closure
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  // Initialize map once on mount
  useEffect(() => {
    if (typeof window === "undefined" || mapRef.current || !mapContainerRef.current) return;

    let isMounted = true;

    const initMap = async () => {
      // Dynamically import leaflet JS (CSS already imported statically above)
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");

      if (!isMounted || !mapContainerRef.current) return;

      LRef.current = L;

      // Fix default icon paths for webpack/turbopack bundling
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const map = L.map(mapContainerRef.current!, {
        center: center,
        zoom: 14,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      map.on("click", (e: any) => {
        onMapClickRef.current(e.latlng.lat, e.latlng.lng);
      });

      const clusterGroup = (L as any).markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 60,
        spiderfyOnMaxZoom: true,
      });

      map.addLayer(clusterGroup);
      mapRef.current = map;
      markersLayerRef.current = clusterGroup;
      setMapReady(true);
    };

    initMap();

    return () => {
      isMounted = false;
      setMapReady(false);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update merchant markers when merchants list changes
  useEffect(() => {
    if (!mapReady || !mapRef.current || !markersLayerRef.current || !LRef.current) return;
    const L = LRef.current;

    markersLayerRef.current.clearLayers();

    const merchantIcon = L.divIcon({
      className: "",
      html: `<div style="
        width: 26px; height: 26px;
        background: #C25E40;
        border: 3px solid white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      "></div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 26],
      popupAnchor: [0, -28],
    });

    merchants.forEach((m) => {
      if (!m.lat || !m.lon) return;
      const marker = L.marker([m.lat, m.lon], { icon: merchantIcon });

      const distText =
        m.distance_km !== undefined
          ? `<span style="color:#C25E40;font-weight:500">${m.distance_km.toFixed(2)} km</span>`
          : "";

      const websiteLink = m.website
        ? `<a href="${m.website.startsWith("http") ? m.website : "http://" + m.website}" target="_blank" rel="noopener" style="font-size:11px;color:#C25E40;display:block;margin-top:4px">🔗 官方網站</a>`
        : "";

      marker.bindPopup(
        `<div style="min-width:200px;font-family:system-ui;padding:4px 0">
          <div style="font-weight:600;font-size:14px;color:#333;margin-bottom:4px">${m.name}</div>
          <div style="font-size:12px;color:#666;margin-bottom:4px">${m.address || ""}</div>
          <div style="font-size:11px;color:#888">統編：${m.tax_id || ""}</div>
          ${websiteLink}
          ${distText ? `<div style="margin-top:4px;font-size:11px">${distText} 外</div>` : ""}
          <a href="/merchant/${m.tax_id || m.id}" class="merchant-detail-link" data-href="/merchant/${m.tax_id || m.id}" style="display:block;margin-top:8px;text-align:center;background:#C25E40;color:white;padding:4px 8px;border-radius:6px;font-size:12px;text-decoration:none;cursor:pointer">查看詳情</a>
        </div>`,
        { maxWidth: 260 }
      );

      // 攔截原生 <a> 點擊，改用 Next.js router 進行無刷新切換
      marker.on("popupopen", (e: any) => {
        const linkElement = e.popup.getElement()?.querySelector(".merchant-detail-link");
        if (linkElement) {
          linkElement.onclick = (ev: Event) => {
            ev.preventDefault();
            const href = (ev.currentTarget as HTMLElement).getAttribute("data-href");
            if (href) {
              router.push(href);
            }
          };
        }
      });

      marker.on("click", () => onSelectMerchant(m));
      markersLayerRef.current.addLayer(marker);
    });
  }, [merchants, onSelectMerchant, mapReady]);

  // Update user location marker
  useEffect(() => {
    if (!mapRef.current || !LRef.current) return;
    const L = LRef.current;

    if (userMarkerRef.current) {
      mapRef.current.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }

    if (userLocation) {
      const userIcon = L.divIcon({
        className: "",
        html: `<div style="
          width: 20px; height: 20px;
          background: #3B82F6;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 0 0 4px rgba(59,130,246,0.25);
        "></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      userMarkerRef.current = L.marker(userLocation, {
        icon: userIcon,
        zIndexOffset: 1000,
      })
        .bindPopup(
          "<div style='font-weight:600;font-size:13px'>📍 您的位置</div>"
        )
        .addTo(mapRef.current);
    }
  }, [userLocation]);

  // Show center pin when not using user location
  useEffect(() => {
    if (!mapRef.current || !LRef.current) return;
    const L = LRef.current;

    if (centerMarkerRef.current) {
      mapRef.current.removeLayer(centerMarkerRef.current);
      centerMarkerRef.current = null;
    }

    if (!userLocation) {
      const pinIcon = L.divIcon({
        className: "",
        html: `<div style="
          width: 22px; height: 22px;
          background: #10B981;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(16,185,129,0.4);
        "></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      centerMarkerRef.current = L.marker(center, {
        icon: pinIcon,
        zIndexOffset: 999,
      })
        .bindPopup(
          "<div style='font-weight:600;font-size:13px'>🎯 搜尋中心</div>"
        )
        .addTo(mapRef.current);
    }
  }, [center, userLocation]);

  // Pan map when center changes
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView(center, mapRef.current.getZoom(), { animate: true });
  }, [center]);

  return (
    <div
      ref={mapContainerRef}
      className="w-full h-full rounded-xl overflow-hidden"
      style={{ minHeight: "480px" }}
    />
  );
}
