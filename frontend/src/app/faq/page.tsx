import type { Metadata } from "next";
import Link from "next/link";
import { CARD_ELIGIBILITY, CARD_ALLOWANCE, POLICY_SOURCE_URL, POLICY_CHECKED_DATE } from "@/utils/travelPolicy";
import { getBackendUrl } from "@/utils/env";
import { getSiteUrl } from "@/utils/site";
import { escapeJsonLd } from "@/utils/jsonld";
import { freshnessNote } from "@/utils/dataFreshness";

export async function generateMetadata(): Promise<Metadata> {
  const SITE_URL = getSiteUrl();
  return {
    title: "常見問題",
  description:
    "國民旅遊卡常見問題：16,000 元補助與兩類額度、特約商店查詢、刷卡失敗處理、統編查詢、外島商店與行業分類選項說明。",
  alternates: {
    canonical: `${SITE_URL}/faq`,
  },
  openGraph: {
    type: "website",
    title: "常見問題｜國旅卡特約商店",
    description:
      "國民旅遊卡常見問題完整說明：額度、查詢方式、刷卡問題與行業分類選項。",
    url: `${SITE_URL}/faq`,
    locale: "zh_TW",
    siteName: "國民旅遊卡特約商店查詢",
    },
  };
}

interface CityStat {
  city: string;
  count: number;
}

export default async function FaqPage() {
  const API_URL = getBackendUrl();

  let stats: {
    total_merchants?: number;
    has_website?: number;
    cities?: CityStat[];
    last_updated?: string;
    last_checked?: string;
    last_check_result?: string;
  } | null = null;
  try {
    const res = await fetch(`${API_URL}/api/stats`, {
      next: { revalidate: 300 },
    });
    if (res.ok) stats = await res.json();
  } catch {
    stats = null;
  }

  const last_updated: string | null =
    typeof stats?.last_updated === "string" && stats.last_updated
      ? stats.last_updated
      : null;
  const lastUpdatedDate = last_updated ? last_updated.slice(0, 10) : null;
  const freshNote = freshnessNote(stats?.last_checked, stats?.last_check_result);
  const statsTotal = Number(stats?.total_merchants ?? 0);
  const hasWebsiteCount = Number(stats?.has_website ?? 0);
  const topCities: CityStat[] = Array.isArray(stats?.cities)
    ? stats.cities.slice(0, 3)
    : [];
  const outlyingCount = Array.isArray(stats?.cities)
    ? stats.cities
        .filter((c) => ["澎湖縣", "金門縣", "連江縣"].includes(c.city))
        .reduce((sum, c) => sum + c.count, 0)
    : 0;
  const cutoff = lastUpdatedDate ? `（截至 ${lastUpdatedDate}）` : "";

  const faqItems: { id: string; question: string; answer: string }[] = [
    {
      id: "faq-1",
      question: "國民旅遊卡可以在哪裡使用？",
      answer: `國民旅遊卡（國旅卡）可在全台${stats ? `超過 ${statsTotal.toLocaleString()} 間` : "眾多"}特約商店使用${cutoff}，涵蓋住宿、餐飲、休閒遊樂、文化體育、交通運輸等類別。本系統提供即時查詢服務，支援縣市篩選與店名搜尋。`,
    },
    {
      id: "faq-2",
      question: "如何查詢附近的國旅卡特約商店？",
      answer:
        "可使用本系統的地圖功能，開啟定位後即可查看附近 1～5 公里內的特約商店。也可在首頁依縣市進行篩選查詢。",
    },
    {
      id: "faq-3",
      question: "國民旅遊卡特約商店資料多久更新一次？",
      answer: `本系統資料來源為政府開放資料，系統每日檢查來源，有新資料且成功匯入時更新名單${lastUpdatedDate ? `（截至 ${lastUpdatedDate}，共 ${statsTotal.toLocaleString()} 間）` : ""}。`,
    },
    {
      id: "faq-4",
      question: "哪個縣市的國旅卡特約商店最多？",
      answer:
        topCities.length > 0
          ? `根據最新資料${cutoff}，${topCities.map((c) => `${c.city}（${c.count.toLocaleString()} 間）`).join("、")}為特約商店數量最多的縣市。`
          : "根據最新資料，各主要縣市均有數千間特約商店，實際數量請以站內統計為準。",
    },
    {
      id: "faq-5",
      question: "誰可以使用國民旅遊卡？",
      answer:
        CARD_ELIGIBILITY,
    },
    {
      id: "faq-6",
      question: "國旅卡最高 16,000 元補助與兩類各 8000 元額度如何區分？",
      answer:
        CARD_ALLOWANCE,
    },
    {
      id: "faq-7",
      question: "刷卡失敗或店家說不能刷國旅卡怎麼辦？",
      answer: `請先確認該店家仍在最新特約名單內${stats ? `（截至 ${lastUpdatedDate ?? "最新資料"}，全台共 ${statsTotal.toLocaleString()} 間）` : ""}：店家可能已下架或更名，可用店名或統編在本系統重新查詢。其次確認卡片額度是否用罄、消費類別是否符合規定。若仍無法刷卡，請聯繫發卡銀行確認卡片狀態，或向服務機關人事單位洽詢。`,
    },
    {
      id: "faq-8",
      question: "如何用統一編號（統編）查詢特約商店？",
      answer:
        "在首頁搜尋框輸入 8 碼統一編號，查看對應商店與分店，再開啟詳情頁核對店名、地址與統編。正式商家網址使用 /merchant/{id}，其中 id 為本站商家識別碼；同一統編可能有多間分店，不能只以統編判定同一營業地點。",
    },
    {
      id: "faq-9",
      question: "外島（澎湖、金門、馬祖）也有國旅卡特約商店嗎？",
      answer:
        outlyingCount > 0
          ? `有的${cutoff}，澎湖縣、金門縣、連江縣（馬祖）合計約有 ${outlyingCount.toLocaleString()} 間特約商店，可在首頁以縣市篩選查詢，或用地圖定位查看當地商店。`
          : "有的，澎湖縣、金門縣、連江縣（馬祖）均有特約商店，可在首頁以縣市篩選查詢，或用地圖定位查看當地商店。",
    },
    {
      id: "faq-10",
      question: "特約商店的行業類別有哪些？如何篩選？",
      answer: `本站提供行業別大類與細項分類篩選，結果以已匯入的商家行業對照資料為準；未分類商家可能不會出現在分類結果中，找不到時可改用店名、地址或統編查詢${hasWebsiteCount > 0 ? `。另有約 ${hasWebsiteCount.toLocaleString()} 間商店提供官方網站${cutoff}，可進一步篩選查看` : "。商店仍可依其他條件查詢"}`,
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-medium tracking-tight text-foreground">
          常見問題
        </h1>
        <p className="text-muted text-sm mt-2">
          國民旅遊卡額度、查詢方式與特約商店完整說明
          {lastUpdatedDate && (
            <>
              {" "}
              <time dateTime={last_updated ?? undefined}>
                （資料更新：{lastUpdatedDate}{freshNote}）
              </time>
            </>
          )}
        </p>
      </div>

      <p className="text-sm text-muted leading-relaxed">
        資格與額度說明依<a href={POLICY_SOURCE_URL} className="text-accent underline">官方 114 年 12 月版 Q&A</a>整理；政策查核日期：<time dateTime={POLICY_CHECKED_DATE}>{POLICY_CHECKED_DATE}</time>。
        個人核定條件請向服務機關人事單位確認。<Link href="/about" className="text-accent underline">資料來源與更新方式</Link>
      </p>

      <nav aria-label="問題目錄" className="text-sm">
        <ul className="list-disc list-inside space-y-1 text-accent">
          {faqItems.map((f) => (
            <li key={f.id}>
              <a href={`#${f.id}`} className="hover:underline">
                {f.question}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-6">
        {faqItems.map((f) => (
          <section
            key={f.id}
            id={f.id}
            aria-label={f.question}
            className="bg-card p-5 rounded-xl border border-border/50 scroll-mt-24"
          >
            <h2 className="text-lg font-medium text-foreground">{f.question}</h2>
            <p className="mt-2 text-sm text-muted leading-relaxed">{f.answer}</p>
          </section>
        ))}
      </div>

      <p className="text-sm">
        <Link href="/" className="text-accent hover:underline">
          ← 回商店查詢首頁
        </Link>
      </p>

      {/* FAQPage JSON-LD Schema（與上方 10 問一致） */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: escapeJsonLd({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqItems.map((f) => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: f.answer,
              },
            })),
          }),
        }}
      />
    </div>
  );
}
