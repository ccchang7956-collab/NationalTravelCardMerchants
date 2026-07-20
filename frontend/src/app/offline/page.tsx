import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "目前處於離線狀態",
  description: "您目前處於離線狀態，請檢查您的網路連線。",
};

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mb-6 text-accent">
        <svg
          className="w-10 h-10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="2.5" />
        </svg>
      </div>

      <h1 className="text-2xl font-bold text-foreground mb-3">
        目前處於離線狀態
      </h1>
      
      <p className="text-muted max-w-md mb-8 text-sm leading-relaxed">
        您目前沒有連線至網際網路。別擔心，部分先前開啟過的頁面與「我的最愛」仍可在離線時查閱。
      </p>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs justify-center">
        <Link
          href="/dashboard"
          className="px-5 py-2.5 rounded-lg bg-accent text-white font-medium text-sm hover:bg-accent-hover transition-colors shadow-xs flex items-center justify-center gap-2"
        >
          <span>查看我的最愛</span>
        </Link>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-lg border border-border text-foreground font-medium text-sm hover:bg-muted-bg transition-colors flex items-center justify-center gap-2"
        >
          <span>返回首頁</span>
        </Link>
      </div>
    </div>
  );
}
