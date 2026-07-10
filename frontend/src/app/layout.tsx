import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Navbar from "@/components/Navbar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className={inter.className}>
        {/* 網站層級結構化資料：WebSite + SearchAction */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "國民旅遊卡特約商店查詢",
              url: SITE_URL,
              description:
                "全台國民旅遊卡特約商店查詢系統，收錄超過萬間特約店家。",
              inLanguage: "zh-TW",
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate: `${SITE_URL}/?q={search_term_string}`,
                },
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
        <div className="min-h-screen flex flex-col">
          <Navbar />
          <main className="flex-1 max-w-5xl w-full mx-auto p-6 md:py-10">
            {children}
          </main>
          <footer className="border-t border-border py-8 text-center text-sm text-muted mt-10">
            <p>資料來源：政府開放資料</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
