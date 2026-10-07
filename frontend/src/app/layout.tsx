import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import GlobalRadar from "@/components/GlobalRadar";
import PWAOfflineBanner from "@/components/PWAOfflineBanner";
import { ToastProvider } from "@/components/Toast";
import { getSiteUrl } from "@/utils/site";
import { escapeJsonLd } from "@/utils/jsonld";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

// generateMetadata（函式內呼叫 getSiteUrl）：禁止模組頂層 const，缺 env 時
// throw 會在 import 期炸掉整站（見 utils/site.ts 註解）
export async function generateMetadata(): Promise<Metadata> {
  const SITE_URL = getSiteUrl();
  return {
    metadataBase: new URL(SITE_URL),
  title: {
    default: "國民旅遊卡特約商店查詢｜全台商店檢索系統",
    template: "%s｜國旅卡特約商店",
  },
  description:
    "快速搜尋全台國民旅遊卡特約商店，收錄超過萬間特約店家，支援店名、地址、縣市篩選與地圖定位查詢。公務員國旅消費免煩惱。",
  keywords: [
    "國民旅遊卡",
    "國旅卡",
    "特約商店",
    "公務員旅遊",
    "國旅卡商店查詢",
    "National Travel Card",
  ],
  authors: [{ name: "國旅卡商店檢索系統" }],
  manifest: "/manifest.json",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "國民旅遊卡特約商店查詢",
    title: "國民旅遊卡特約商店查詢｜全台商店檢索系統",
    description:
      "快速搜尋全台國民旅遊卡特約商店，收錄超過萬間特約店家，支援店名、地址、縣市篩選與地圖定位查詢。",
    locale: "zh_TW",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "國民旅遊卡特約商店查詢",
    description: "快速搜尋全台國民旅遊卡特約商店，收錄超過萬間特約店家。",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
    },
  },
  };
}

export const viewport: Viewport = {
  themeColor: "#C25E40",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const SITE_URL = getSiteUrl();
  return (
    <html lang="zh-TW">
      <body className={inter.className}>
        <PWAOfflineBanner />
        {/* 網站層級結構化資料：WebSite */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: escapeJsonLd({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "國民旅遊卡特約商店查詢",
              url: SITE_URL,
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: escapeJsonLd({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "國民旅遊卡特約商店查詢",
              url: SITE_URL,
              logo: `${SITE_URL}/icons/icon-512x512.png`,
              sameAs: [],
            }),
          }}
        />
        <ToastProvider>
          <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-200">
          <Navbar />
          <main className="flex-1 max-w-5xl w-full mx-auto p-6 md:py-10">
            {children}
          </main>
          <footer className="border-t border-border py-8 text-center text-sm text-muted mt-10">
            <p>
              資料來源：
              <a
                href="https://data.gov.tw/dataset/12982"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                政府開放資料
              </a>
            </p>
            <nav aria-label="網站資訊" className="flex flex-wrap justify-center gap-4 mt-3">
              <Link href="/city" className="underline hover:text-foreground">全台縣市商店</Link>
              <Link href="/faq" className="underline hover:text-foreground">常見問題</Link>
              <Link href="/about" className="underline hover:text-foreground">關於本站與資料來源</Link>
            </nav>
            <p className="mt-2">本站為非官方查詢工具，名單依政府開放資料整理。</p>
            <p className="mt-2">
              <a href="/llms.txt" className="underline hover:text-foreground">
                給 AI 的本站說明
              </a>
            </p>
          </footer>
            <GlobalRadar />
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
