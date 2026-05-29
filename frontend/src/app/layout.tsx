import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Navbar from "@/components/Navbar";
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
