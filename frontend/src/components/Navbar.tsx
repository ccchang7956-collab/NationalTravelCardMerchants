"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListBulletIcon, MapIcon } from "@heroicons/react/24/outline";

export default function Navbar() {
  const pathname = usePathname();

  const isListActive = pathname === "/";
  const isMapActive = pathname === "/map" || pathname?.startsWith("/map/");

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link 
          href="/" 
          className="text-xl font-medium tracking-tight text-foreground flex items-center gap-2 group transition-colors"
        >
          <span className="w-3 h-3 rounded-full bg-accent group-hover:scale-125 transition-transform duration-300"></span>
          國旅卡商店檢索
        </Link>
        <nav className="flex items-center gap-1.5">
          <Link
            href="/"
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-all duration-200 ease-in-out hover:scale-[1.02] active:scale-[0.98] ${
              isListActive
                ? "text-accent bg-accent/10 font-medium"
                : "text-muted hover:text-foreground hover:bg-muted-bg"
            }`}
          >
            <ListBulletIcon className={`w-5 h-5 transition-transform duration-300 ${isListActive ? "rotate-0 scale-110" : "group-hover:scale-110"}`} />
            <span>列表</span>
          </Link>
          <Link
            href="/map"
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-all duration-200 ease-in-out hover:scale-[1.02] active:scale-[0.98] ${
              isMapActive
                ? "text-accent bg-accent/10 font-medium"
                : "text-muted hover:text-foreground hover:bg-muted-bg"
            }`}
          >
            <MapIcon className={`w-5 h-5 transition-transform duration-300 ${isMapActive ? "rotate-3 scale-110" : "group-hover:scale-110"}`} />
            <span>地圖</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
