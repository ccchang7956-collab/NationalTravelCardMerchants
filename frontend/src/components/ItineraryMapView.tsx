'use client';

import { useEffect, useRef } from 'react';
import type * as LType from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ItineraryItem } from '@/utils/itineraryHelpers';

interface Props {
  items: ItineraryItem[];
}

export default function ItineraryMapView({ items }: Props) {
  const mapRef = useRef<LType.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;

    let isMounted = true;

    const renderMap = async () => {
      const L = (await import('leaflet')).default;
      if (!isMounted || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current).setView([23.97387, 120.982024], 7);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;
      // Clear previous markers/polylines
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker || layer instanceof L.Polyline) {
          map.removeLayer(layer);
        }
      });

      const validItems = items.filter((i) => i.lat != null && i.lon != null);
      if (validItems.length === 0) return;

      const latLngs: LType.LatLngTuple[] = [];

      validItems.forEach((item, index) => {
        const pos: LType.LatLngTuple = [item.lat!, item.lon!];
        latLngs.push(pos);

        const customIcon = L.divIcon({
          className: 'custom-number-icon',
          html: `<div style="background-color: #2563eb; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${index + 1}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        L.marker(pos, { icon: customIcon })
          .addTo(map)
          .bindPopup(`<b>${index + 1}. ${item.custom_name}</b><br/>${item.quota_category || ''}`);
      });

      if (latLngs.length > 1) {
        L.polyline(latLngs, { color: '#2563eb', weight: 4, opacity: 0.8, dashArray: '8, 8' }).addTo(map);
      }

      if (latLngs.length > 0) {
        const bounds = L.latLngBounds(latLngs);
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    };

    renderMap();

    return () => {
      isMounted = false;
    };
  }, [items]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} className="w-full h-[350px] md:h-full rounded-2xl overflow-hidden shadow-inner" />;
}
