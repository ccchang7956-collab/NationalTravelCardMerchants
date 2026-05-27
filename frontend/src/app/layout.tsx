import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "國民旅遊卡特約商店檢索系統",
  description: "快速搜尋全台國民旅遊卡特約商店，支援名稱、地址、郵遞區號查詢。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className={inter.className}>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50">
            <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
              <a href="/" className="text-xl font-medium tracking-tight text-foreground flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-accent"></span>
                國旅卡商店檢索
              </a>
              <nav className="flex items-center gap-1">
                <Link href="/" className="px-3 py-1.5 text-sm rounded-lg text-muted hover:text-foreground hover:bg-muted-bg transition-colors">
                  📋 列表
                </Link>
                <Link href="/map" className="px-3 py-1.5 text-sm rounded-lg text-muted hover:text-foreground hover:bg-muted-bg transition-colors">
                  🗺️ 地圖
                </Link>
              </nav>
            </div>
          </header>
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
