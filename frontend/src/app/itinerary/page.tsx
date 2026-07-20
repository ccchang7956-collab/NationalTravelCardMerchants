'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { fetchWithAuth } from '@/utils/api';
import CreateItineraryModal from '@/components/CreateItineraryModal';
import AuthModal from '@/components/AuthModal';
import {
  MapIcon,
  PlusIcon,
  TrashIcon,
  CalendarIcon,
  UserCircleIcon,
  ArrowRightIcon,
  SparklesIcon,
  CurrencyDollarIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';

import { ItineraryItem } from '@/utils/itineraryHelpers';

export interface ItineraryResponse {
  id: number;
  user_id: number;
  title: string;
  start_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  total_tourist_quota: number;
  total_general_quota: number;
  items: ItineraryItem[];
}

export default function ItineraryListPage() {
  const { user, loading: authLoading } = useAuth();
  const [itineraries, setItineraries] = useState<ItineraryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchItineraries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/itineraries');
      if (res.ok) {
        const data = await res.json();
        setItineraries(data);
      }
    } catch (err) {
      console.error('Failed to fetch itineraries:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      let isMounted = true;
      Promise.resolve().then(() => {
        if (isMounted) {
          fetchItineraries();
        }
      });
      return () => {
        isMounted = false;
      };
    }
  }, [user, fetchItineraries]);

  const handleDeleteItinerary = async (id: number, title: string) => {
    if (!confirm(`確定要刪除行程「${title}」嗎？此操作無法復原。`)) return;
    setDeletingId(id);
    try {
      const res = await fetchWithAuth(`/api/itineraries/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setItineraries((prev) => prev.filter((item) => item.id !== id));
      } else {
        alert('刪除行程失敗');
      }
    } catch (err) {
      console.error('Error deleting itinerary:', err);
      alert('刪除失敗，連線錯誤');
    } finally {
      setDeletingId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-muted text-sm">載入行程規劃資料中...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-accent/10 text-accent flex items-center justify-center mb-6">
          <UserCircleIcon className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">請先登入會員帳號</h2>
        <p className="text-muted text-sm mb-6">
          登入後即可建立專屬的國民旅遊卡行程規劃、智慧路線排序優化與 Google Maps 導航匯出功能。
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="flex-1 py-3 px-6 rounded-xl bg-accent text-white font-medium hover:bg-accent/90 transition-colors shadow-sm cursor-pointer"
          >
            立即登入 / 註冊
          </button>
          <Link
            href="/"
            className="flex-1 py-3 px-6 rounded-xl border border-border text-foreground font-medium hover:bg-muted-bg transition-colors text-center"
          >
            返回首頁搜尋
          </Link>
        </div>
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      </div>
    );
  }

  // Summary statistics
  const totalItineraries = itineraries.length;
  const totalSpots = itineraries.reduce((acc, curr) => acc + (curr.items?.length || 0), 0);
  const totalTouristBudget = itineraries.reduce((acc, curr) => acc + (curr.total_tourist_quota || 0), 0);
  const totalGeneralBudget = itineraries.reduce((acc, curr) => acc + (curr.total_general_quota || 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2.5">
            <span>🗺️</span> 國民旅遊卡行程規劃
          </h1>
          <p className="text-muted text-sm mt-1">
            輕鬆規劃特約商店旅遊行程，支援自動最佳順路排序與一鍵匯出 Google Maps 導航。
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-5 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer shrink-0"
        >
          <PlusIcon className="w-5 h-5" />
          <span>建立新行程</span>
        </button>
      </div>

      {/* Summary Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-accent/10 text-accent">
            <MapIcon className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-muted font-medium block">總規劃行程數</span>
            <span className="text-2xl font-bold text-foreground">{totalItineraries} <span className="text-xs font-normal text-muted">個</span></span>
          </div>
        </div>

        <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <MapPinIcon className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-muted font-medium block">包含景點與店家</span>
            <span className="text-2xl font-bold text-foreground">{totalSpots} <span className="text-xs font-normal text-muted">處</span></span>
          </div>
        </div>

        <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CurrencyDollarIcon className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-muted font-medium block">預估觀光額度支出</span>
            <span className="text-2xl font-bold text-foreground">${totalTouristBudget.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <SparklesIcon className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-muted font-medium block">預估自行運用支出</span>
            <span className="text-2xl font-bold text-foreground">${totalGeneralBudget.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Main List Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <span>📋</span> 我的行程列表 ({itineraries.length})
          </h2>
        </div>

        {loading ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted text-sm">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            載入行程資料中...
          </div>
        ) : itineraries.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-accent/10 text-accent mx-auto flex items-center justify-center">
              <MapIcon className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-lg">尚未建立任何行程規劃</h3>
              <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
                點擊下方按鈕，挑選您的愛心收藏特約商店或客製景點，打造專屬國旅卡旅遊路線。
              </p>
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
            >
              <PlusIcon className="w-4 h-4" />
              <span>建立第一個行程</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {itineraries.map((itin) => {
              const spotCount = itin.items?.length || 0;
              const totalCost = (itin.total_tourist_quota || 0) + (itin.total_general_quota || 0);

              return (
                <div
                  key={itin.id}
                  className="bg-card border border-border/80 rounded-2xl p-6 shadow-xs hover:border-accent/40 transition-all flex flex-col justify-between space-y-5 group relative"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-bold text-lg text-foreground group-hover:text-accent transition-colors line-clamp-1">
                        <Link href={`/itinerary/${itin.id}`}>
                          {itin.title}
                        </Link>
                      </h3>
                      <button
                        onClick={() => handleDeleteItinerary(itin.id, itin.title)}
                        disabled={deletingId === itin.id}
                        className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                        title="刪除此行程"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted flex-wrap">
                      {itin.start_date && (
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="w-3.5 h-3.5 text-accent" />
                          <span>{itin.start_date}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <MapPinIcon className="w-3.5 h-3.5 text-purple-500" />
                        <span>{spotCount} 個景點/店家</span>
                      </span>
                    </div>

                    {itin.notes && (
                      <p className="text-xs text-muted line-clamp-2 bg-muted-bg/50 p-2.5 rounded-xl border border-border/50">
                        {itin.notes}
                      </p>
                    )}
                  </div>

                  {/* Quota & Cost Breakdown */}
                  <div className="space-y-3 pt-3 border-t border-border/60">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">預估總預算支出</span>
                      <span className="font-bold text-foreground text-sm">${totalCost.toLocaleString()}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
                        🏖️ 觀光: ${(itin.total_tourist_quota || 0).toLocaleString()}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-medium">
                        🛍️ 自行: ${(itin.total_general_quota || 0).toLocaleString()}
                      </span>
                    </div>

                    <div className="pt-2 flex items-center justify-end">
                      <Link
                        href={`/itinerary/${itin.id}`}
                        className="w-full py-2.5 px-4 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
                      >
                        <span>🗺️ 查看細節與地圖</span>
                        <ArrowRightIcon className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Components */}
      <CreateItineraryModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={fetchItineraries}
      />
    </div>
  );
}
