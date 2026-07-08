"use client";

import dynamic from "next/dynamic";

// 動態載入地圖，避免 SSR 問題（Leaflet 需要 window）
const MerchantMiniMap = dynamic(() => import("@/components/MerchantMiniMap"), {
  ssr: false,
  loading: function MapLoading() {
    return (
      <div
        className="w-full rounded-xl bg-muted-bg border border-border/50 flex items-center justify-center"
        style={{ height: "280px" }}
      >
        <div className="flex flex-col items-center gap-2 text-muted">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">載入地圖中...</span>
        </div>
      </div>
    );
  },
});

interface MerchantMapSectionProps {
  lat: number;
  lon: number;
  name: string;
}

export default function MerchantMapSection({ lat, lon, name }: MerchantMapSectionProps) {
  return <MerchantMiniMap lat={lat} lon={lon} name={name} />;
}
