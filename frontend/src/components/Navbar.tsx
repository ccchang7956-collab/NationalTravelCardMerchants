"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListBulletIcon, MapIcon, ChartBarIcon, ArrowRightOnRectangleIcon, UserIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/context/AuthContext";
import AuthModal from "@/components/AuthModal";
import ThemeToggle from "@/components/ThemeToggle";

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const isListActive = pathname === "/";
  const isMapActive = pathname === "/map" || pathname?.startsWith("/map/");
  const isItineraryActive = pathname === "/itinerary" || pathname?.startsWith("/itinerary/");
  const isDashboardActive = pathname === "/dashboard";

  return (
    <>
      <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link 
            href="/" 
            className="text-xl font-medium tracking-tight text-foreground flex items-center gap-2 group transition-colors"
          >
            <span className="w-3 h-3 rounded-full bg-accent group-hover:scale-125 transition-transform duration-300"></span>
            國旅卡商店檢索
          </Link>
          <nav className="flex items-center gap-1.5 sm:gap-2">
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
            <Link
              href="/itinerary"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-all duration-200 ease-in-out hover:scale-[1.02] active:scale-[0.98] ${
                isItineraryActive
                  ? "text-accent bg-accent/10 font-medium"
                  : "text-muted hover:text-foreground hover:bg-muted-bg"
              }`}
            >
              <CalendarDaysIcon className={`w-5 h-5 transition-transform duration-300 ${isItineraryActive ? "scale-110" : "group-hover:scale-110"}`} />
              <span>行程規劃</span>
            </Link>

            <ThemeToggle />

            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-all duration-200 ease-in-out hover:scale-[1.02] active:scale-[0.98] ${
                    isDashboardActive
                      ? "text-accent bg-accent/10 font-medium"
                      : "text-muted hover:text-foreground hover:bg-muted-bg"
                  }`}
                >
                  <ChartBarIcon className={`w-5 h-5 transition-transform duration-300 ${isDashboardActive ? "scale-110" : ""}`} />
                  <span>📊 個人助手</span>
                </Link>
                <div className="flex items-center gap-2 ml-1 pl-2 border-l border-border/60">
                  <span className="text-xs font-medium text-foreground/80 hidden md:inline">
                    {user.name}
                  </span>
                  <button
                    onClick={logout}
                    title="登出帳號"
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border/80 text-muted hover:text-red-500 hover:border-red-500/40 hover:bg-red-500/10 transition-all cursor-pointer"
                  >
                    <ArrowRightOnRectangleIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">🚪 登出</span>
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-all duration-200 shadow-xs active:scale-[0.98] cursor-pointer"
              >
                <UserIcon className="w-4 h-4" />
                <span>登入 / 註冊</span>
              </button>
            )}
          </nav>
        </div>
      </header>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </>
  );
}
