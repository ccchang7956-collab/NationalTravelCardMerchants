import type { Metadata } from "next";
import CityDirectory from "@/components/CityDirectory";
import { getSiteUrl } from "@/utils/site";

export function generateMetadata(): Metadata {
  const url = `${getSiteUrl()}/city`;
  const title = "全台縣市國旅卡特約商店查詢";
  const description = "依台灣 22 縣市查詢國民旅遊卡特約商店，查看各地商家名單、地址與統一編號。";
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, locale: "zh_TW" } };
}

export default function CitiesPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-medium">全台縣市國旅卡特約商店查詢</h1>
      <p className="text-muted leading-relaxed">選擇縣市，查看當地國民旅遊卡特約商店名單、地址與統一編號，再進入商家頁核對分店資訊。</p>
      <CityDirectory />
    </div>
  );
}
