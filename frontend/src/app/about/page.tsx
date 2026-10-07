import type { Metadata } from "next";
import Link from "next/link";
import { getSiteUrl } from "@/utils/site";
import { POLICY_SOURCE_URL, POLICY_CHECKED_DATE } from "@/utils/travelPolicy";

export function generateMetadata(): Metadata {
  const url = `${getSiteUrl()}/about`;
  const title = "關於本站與資料來源";
  const description = "了解國旅卡特約商店查詢的政府開放資料來源、名單更新方式、座標精度及問題回報管道。";
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, locale: "zh_TW" } };
}

export default function AboutPage() {
  return (
    <article className="max-w-3xl mx-auto space-y-8 text-muted leading-relaxed">
      <h1 className="text-3xl font-medium text-foreground">關於本站與資料來源</h1>
      <section className="space-y-3">
        <h2 className="text-xl font-medium text-foreground">本站提供什麼服務？</h2>
        <p>本站是由專案維護者整理政府開放資料的國民旅遊卡特約商店查詢工具，提供縣市名單、店名與統編搜尋、商家詳細資訊及附近商店地圖。本站為非官方服務，並非政府機關、發卡銀行或店家經營者。</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-medium text-foreground">商家資料來源與更新方式</h2>
        <p>特約商店名單來自<a href="https://data.gov.tw/dataset/12982" className="text-accent underline">政府開放資料平台的國民旅遊卡特約商店資料集</a>。系統排程每日檢查來源，來源有變更且成功匯入時才更新本站資料。排程失敗或來源尚未更新時，本站可能仍顯示既有名單。</p>
        <dl className="space-y-2">
          <div><dt className="font-medium text-foreground">資料更新日期</dt><dd>目前收錄名單的更新時間，並非每間商店逐一實地確認的時間。</dd></div>
          <div><dt className="font-medium text-foreground">系統檢查狀態</dt><dd>表示排程是否檢查來源及是否有新資料；沒有新資料時，名單更新日期不會因此改變。</dd></div>
          <div><dt className="font-medium text-foreground">地圖位置</dt><dd>部分座標由地址估算或沿用舊資料，可能無法精確代表店門口。請參考商家頁的精度說明，導航與分店核對以地址為準。</dd></div>
        </dl>
        <p>同一統編可能對應不同分店，請同時核對店名與地址。實際特約資格請以<a href="https://travel.nccc.com.tw/" className="text-accent underline">國民旅遊卡官方查詢系統</a>及店家確認結果為準。</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-medium text-foreground">政策說明依據</h2>
        <p>本站常見問題的資格與額度說明依<a href={POLICY_SOURCE_URL} className="text-accent underline">行政院人事行政總處 114 年 12 月版國民旅遊卡 Q&A</a>整理，政策內容查核日期為 <time dateTime={POLICY_CHECKED_DATE}>{POLICY_CHECKED_DATE}</time>。政策查核日期與商家名單更新日期各自獨立；個人補助資格、特殊情形及核銷方式請向服務機關人事單位確認。</p>
        <Link href="/faq" className="text-accent underline">查看國旅卡常見問題</Link>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-medium text-foreground">維護與問題回報</h2>
        <p>程式碼與維護紀錄公開於<a href="https://github.com/ccchang7956-collab/NationalTravelCardMerchants" className="text-accent underline">本站 GitHub 專案</a>。如發現查詢或資料呈現問題，可至<a href="https://github.com/ccchang7956-collab/NationalTravelCardMerchants/issues" className="text-accent underline">專案 Issues</a>提供商家頁網址與錯誤說明。</p>
      </section>
    </article>
  );
}
