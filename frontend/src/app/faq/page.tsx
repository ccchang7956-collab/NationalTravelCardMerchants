import type { Metadata } from "next";
import Link from "next/link";
import { getBackendUrl } from "@/utils/env";
import { getSiteUrl } from "@/utils/site";

const SITE_URL = getSiteUrl();

export const metadata: Metadata = {
  title: "常見問題",
  description:
    "國民旅遊卡常見問題：8000 元額度區分、特約商店查詢、刷卡失敗處理、統編查詢、外島商店與行業類別篩選完整說明。",
  alternates: {
    canonical: `${SITE_URL}/faq`,
  },
  openGraph: {
    type: "website",
    title: "常見問題｜國旅卡特約商店",
    description:
      "國民旅遊卡常見問題完整說明：額度、查詢方式、刷卡問題與行業類別篩選。",
    url: `${SITE_URL}/faq`,
    locale: "zh_TW",
    siteName: "國民旅遊卡特約商店查詢",
  },
};

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
  } | null = null;
  try {
    const res = await fetch(`${API_URL}/api/stats`, {
      next: { revalidate: 3600 },
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
        "可使用本系統的地圖功能，開啟定位後即可查看附近 1～5 公里內的特約商店。也可在首頁依縣市、行業類別進行篩選查詢。",
    },
    {
      id: "faq-3",
      question: "國民旅遊卡特約商店資料多久更新一次？",
      answer: `本系統資料來源為政府開放資料，系統每日自動比對更新，確保提供最新的特約商店清單${lastUpdatedDate ? `（截至 ${lastUpdatedDate}，共 ${statsTotal.toLocaleString()} 間）` : ""}。`,
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
        "國民旅遊卡（National Travel Card）由行政院人事行政總處推動，適用於全體公務人員及其眷屬，用於國內旅遊相關消費補助。",
    },
    {
      id: "faq-6",
      question: "國旅卡 8000 元額度如何區分觀光旅遊與自行運用？",
      answer:
        "國旅卡每年 8000 元補助額度分為「觀光旅遊」與「自行運用」兩類：觀光旅遊額度須用於旅遊相關消費（如住宿、觀光景點），自行運用額度使用範圍較廣。兩類額度的適用店家與當年度規定請以行政院人事行政總處官方公告為準；站內的消費記帳功能亦支援以這兩種類別記錄追蹤。",
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
        "在本系統首頁搜尋框直接輸入 8 碼統一編號即可找到對應商店；或直接開啟該店詳情頁（網址格式為 /merchant/{統一編號}），查看地址、行業類別與地圖位置。詳情頁同時標示統編，方便核對是否為同一店家。",
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
      answer: `特約商店涵蓋住宿、餐飲、休閒遊樂、交通運輸、文化體育等行業類別，每間商店的詳情頁均列出其行業類別（無資料者顯示為未分類）。可在首頁以行業類別代碼篩選特定業種${hasWebsiteCount > 0 ? `；另有約 ${hasWebsiteCount.toLocaleString()} 間商店提供官方網站${cutoff}，可進一步篩選查看` : "，也可篩選有官方網站的商店"}。`,
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
                （資料更新：{lastUpdatedDate}）
              </time>
            </>
          )}
        </p>
      </div>

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
          __html: JSON.stringify({
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
