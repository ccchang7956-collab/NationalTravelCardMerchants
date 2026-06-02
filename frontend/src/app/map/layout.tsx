import { Metadata } from "next";

export const metadata: Metadata = {
  title: "地圖搜尋附近特約商店",
  description: "以互動地圖搜尋附近的國民旅遊卡特約商店，支援 GPS 定位、地址搜尋與半徑範圍篩選。",
  // 地圖頁為動態 client-side 功能頁，不需要被搜尋引擎索引
  robots: { index: false, follow: false },
};

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
