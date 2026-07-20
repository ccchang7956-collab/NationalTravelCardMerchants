'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/context/AuthContext';
import { fetchWithAuth } from '@/utils/api';
import AddExpenseModal from '@/components/AddExpenseModal';
import AuthModal from '@/components/AuthModal';
import {
  CreditCardIcon,
  HeartIcon,
  PlusIcon,
  TrashIcon,
  MapPinIcon,
  BuildingStorefrontIcon,
  ArrowRightIcon,
  MapIcon,
  Squares2X2Icon,
  UserCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';

// 動態載入 MapView 以避免 Leaflet SSR 問題
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-80 rounded-2xl bg-muted-bg border border-border flex items-center justify-center text-muted">
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">載入地圖中...</span>
      </div>
    </div>
  ),
});

interface QuotaDetail {
  target: number;
  spent: number;
  remaining: number;
  percentage: number;
}

interface AssistantSummary {
  tourist_quota: QuotaDetail;
  general_quota: QuotaDetail;
  total_spent: number;
  favorites_count: number;
}

interface ExpenseItem {
  id: number;
  user_id: number;
  merchant_id: number | null;
  merchant_name: string;
  amount: number;
  category: '觀光旅遊' | '自行運用';
  expense_date: string;
  note: string | null;
  created_at: string;
}

interface FavoriteMerchant {
  id: number;
  name: string;
  address: string | null;
  zip_code: string | null;
  tax_id: string | null;
  website: string | null;
  lat: number | null;
  lon: number | null;
}

export default function DashboardPage() {
  const { user, loading: authLoading, toggleFavorite } = useAuth();

  const [summary, setSummary] = useState<AssistantSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteMerchant[]>([]);

  const [activeTab, setActiveTab] = useState<'expenses' | 'favorites'>('expenses');
  const [dataLoading, setDataLoading] = useState(true);

  // Modals state
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [selectedMerchantForExpense, setSelectedMerchantForExpense] = useState<{
    id: number | null;
    name: string;
  }>({ id: null, name: '' });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Favorites Map view toggle
  const [favViewMode, setFavViewMode] = useState<'grid' | 'map'>('grid');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/assistant/summary');
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.error('Failed to fetch summary:', err);
    }
  }, []);

  const fetchExpenses = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/assistant/expenses');
      if (res.ok) {
        const data = await res.json();
        setExpenses(data);
      }
    } catch (err) {
      console.error('Failed to fetch expenses:', err);
    }
  }, []);

  const fetchFavorites = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/assistant/favorites');
      if (res.ok) {
        const data = await res.json();
        setFavorites(data);
      }
    } catch (err) {
      console.error('Failed to fetch favorites:', err);
    }
  }, []);

  const loadAllData = useCallback(async () => {
    setDataLoading(true);
    await Promise.all([fetchSummary(), fetchExpenses(), fetchFavorites()]);
    setDataLoading(false);
  }, [fetchSummary, fetchExpenses, fetchFavorites]);

  useEffect(() => {
    if (user) {
      let isMounted = true;
      Promise.resolve().then(() => {
        if (isMounted) {
          loadAllData();
        }
      });
      return () => {
        isMounted = false;
      };
    }
  }, [user, loadAllData]);

  const handleDeleteExpense = async (id: number) => {
    if (!confirm('確定要刪除這筆刷卡記帳明細嗎？')) return;
    setDeletingId(id);
    try {
      const res = await fetchWithAuth(`/api/assistant/expenses/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await Promise.all([fetchExpenses(), fetchSummary()]);
      } else {
        alert('刪除失敗，請稍後再試');
      }
    } catch (err) {
      console.error('Delete expense error:', err);
      alert('刪除失敗，連線錯誤');
    } finally {
      setDeletingId(null);
    }
  };

  const handleUnfavorite = async (merchantId: number) => {
    const success = await toggleFavorite(merchantId);
    if (success) {
      setFavorites((prev) => prev.filter((m) => m.id !== merchantId));
      fetchSummary();
    }
  };

  const handleOpenAddExpenseForMerchant = (id: number, name: string) => {
    setSelectedMerchantForExpense({ id, name });
    setIsAddExpenseOpen(true);
  };

  const handleOpenAddExpenseGeneral = () => {
    setSelectedMerchantForExpense({ id: null, name: '' });
    setIsAddExpenseOpen(true);
  };

  // Auth Protection Check
  if (authLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-muted text-sm">載入個人數據中...</p>
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
          登入後即可享有國民旅遊卡 8,000 元觀光額度與 8,000 元自行運用額度進度追蹤、刷卡記帳及商店愛心收藏功能。
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="flex-1 py-3 px-6 rounded-xl bg-accent text-white font-medium hover:bg-accent-hover transition-colors shadow-sm"
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

  const touristQuota = summary?.tourist_quota || {
    target: 8000,
    spent: 0,
    remaining: 8000,
    percentage: 0,
  };
  const generalQuota = summary?.general_quota || {
    target: 8000,
    spent: 0,
    remaining: 8000,
    percentage: 0,
  };

  // Map markers for favorites
  const mapMerchants = favorites.filter((m) => m.lat !== null && m.lon !== null);
  const defaultCenter: [number, number] =
    mapMerchants.length > 0 && mapMerchants[0].lat && mapMerchants[0].lon
      ? [mapMerchants[0].lat, mapMerchants[0].lon]
      : [23.7, 121.0];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-300">
      {/* User Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            💳 國民旅遊卡個人助手 Dashboard
          </h1>
          <p className="text-muted text-sm mt-1">
            歡迎回來，<span className="font-semibold text-foreground">{user.name}</span> (
            {user.email})！隨時掌握雙額度報支進度與我的愛心特約商店。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenAddExpenseGeneral}
            className="px-4 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent-hover transition-colors flex items-center gap-2 shadow-xs"
          >
            <PlusIcon className="w-4 h-4" />
            <span>➕ 手動新增記帳</span>
          </button>
        </div>
      </div>

      {/* Top Quota Dashboard Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: 觀光旅遊額度 */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                🏖️ 觀光旅遊額度
              </span>
              <span className="text-xs text-muted">上限 NT$ 8,000</span>
            </div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-2xl font-bold text-foreground">
                ${touristQuota.spent.toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {touristQuota.percentage}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-muted-bg rounded-full h-3 overflow-hidden border border-border/40">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, touristQuota.percentage)}%` }}
              />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted">
            <span>剩餘額度:</span>
            <span className="font-semibold text-foreground">
              ${touristQuota.remaining.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Card 2: 自行運用額度 */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                🛍️ 自行運用額度
              </span>
              <span className="text-xs text-muted">上限 NT$ 8,000</span>
            </div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-2xl font-bold text-foreground">
                ${generalQuota.spent.toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                {generalQuota.percentage}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-muted-bg rounded-full h-3 overflow-hidden border border-border/40">
              <div
                className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, generalQuota.percentage)}%` }}
              />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted">
            <span>剩餘額度:</span>
            <span className="font-semibold text-foreground">
              ${generalQuota.remaining.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Card 3: 總刷卡金額 */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-xs font-medium text-muted block mb-1">💰 總刷卡報支金額</span>
            <div className="text-3xl font-bold text-foreground">
              ${(summary?.total_spent || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted mt-1">合計觀光旅遊與自行運用支出</p>
          </div>
          <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted">
            <span>可申請補助總計</span>
            <span className="font-semibold text-accent">NT$ 16,000</span>
          </div>
        </div>

        {/* Card 4: 收藏店家統計 */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-xs font-medium text-muted block mb-1">❤️ 愛心收藏店家</span>
            <div className="text-3xl font-bold text-foreground">
              {summary?.favorites_count || 0} <span className="text-sm font-normal text-muted">家</span>
            </div>
            <p className="text-xs text-muted mt-1">方便隨時地圖導航與快速記帳</p>
          </div>
          <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted">
            <span>快速切換收藏頁籤</span>
            <button
              onClick={() => setActiveTab('favorites')}
              className="text-xs text-accent font-semibold hover:underline flex items-center gap-1"
            >
              檢視全部 <ArrowRightIcon className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border">
        <nav className="flex space-x-8" aria-label="Dashboard Tabs">
          <button
            onClick={() => setActiveTab('expenses')}
            className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'expenses'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            <CreditCardIcon className="w-5 h-5" />
            <span>💳 記帳明細</span>
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-muted-bg border border-border text-muted">
              {expenses.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('favorites')}
            className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'favorites'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            <HeartIcon className="w-5 h-5" />
            <span>❤️ 我的收藏</span>
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-muted-bg border border-border text-muted">
              {favorites.length}
            </span>
          </button>
        </nav>
      </div>

      {/* Expenses Tab Content */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <span>💳</span> 國民旅遊卡刷卡紀錄表
            </h2>
            <button
              onClick={handleOpenAddExpenseGeneral}
              className="px-3.5 py-1.5 rounded-xl bg-accent/10 border border-accent/20 text-accent font-medium text-xs hover:bg-accent/20 transition-colors flex items-center gap-1.5"
            >
              <PlusIcon className="w-4 h-4" />
              <span>手動新增記帳</span>
            </button>
          </div>

          {dataLoading ? (
            <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted text-sm">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              載入記帳明細中...
            </div>
          ) : expenses.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-muted-bg text-muted mx-auto flex items-center justify-center">
                <CreditCardIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">尚無任何記帳紀錄</h3>
                <p className="text-xs text-muted mt-1">
                  點擊右上角「➕ 手動新增記帳」開始規劃與記錄您的觀光旅遊及自行運用額度支出。
                </p>
              </div>
              <button
                onClick={handleOpenAddExpenseGeneral}
                className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors"
              >
                新增第一筆記帳
              </button>
            </div>
          ) : (
            <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted-bg/60 border-b border-border/70 text-xs font-semibold text-muted">
                    <tr>
                      <th className="px-5 py-3.5">消費日期</th>
                      <th className="px-5 py-3.5">額度類別</th>
                      <th className="px-5 py-3.5">商店名稱</th>
                      <th className="px-5 py-3.5 text-right">金額 (TWD)</th>
                      <th className="px-5 py-3.5">備註說明</th>
                      <th className="px-5 py-3.5 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50 text-foreground">
                    {expenses.map((item) => (
                      <tr key={item.id} className="hover:bg-muted-bg/30 transition-colors">
                        <td className="px-5 py-4 whitespace-nowrap text-xs text-muted">
                          {item.expense_date}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          {item.category === '觀光旅遊' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              🏖️ 觀光旅遊
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                              🛍️ 自行運用
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 font-medium">
                          {item.merchant_id ? (
                            <Link
                              href={`/merchant/${item.merchant_id}`}
                              className="text-foreground hover:text-accent hover:underline flex items-center gap-1.5 group"
                            >
                              <span>{item.merchant_name}</span>
                              <BuildingStorefrontIcon className="w-3.5 h-3.5 text-muted group-hover:text-accent transition-colors" />
                            </Link>
                          ) : (
                            <span>{item.merchant_name}</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-foreground">
                          ${item.amount.toLocaleString()}
                        </td>
                        <td className="px-5 py-4 text-xs text-muted max-w-xs truncate">
                          {item.note || '-'}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button
                            onClick={() => handleDeleteExpense(item.id)}
                            disabled={deletingId === item.id}
                            className="p-1.5 rounded-lg text-muted hover:text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                            title="刪除記帳"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Favorites Tab Content */}
      {activeTab === 'favorites' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <span>❤️</span> 我的特約商店愛心收藏 ({favorites.length})
            </h2>

            {favorites.length > 0 && (
              <div className="flex items-center bg-muted-bg p-1 rounded-xl border border-border self-start sm:self-auto">
                <button
                  onClick={() => setFavViewMode('grid')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    favViewMode === 'grid'
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  <Squares2X2Icon className="w-4 h-4" />
                  <span>列表檢視</span>
                </button>
                <button
                  onClick={() => setFavViewMode('map')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    favViewMode === 'map'
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  <MapIcon className="w-4 h-4" />
                  <span>地圖檢視 ({mapMerchants.length})</span>
                </button>
              </div>
            )}
          </div>

          {dataLoading ? (
            <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted text-sm">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              載入收藏清單中...
            </div>
          ) : favorites.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 mx-auto flex items-center justify-center">
                <HeartIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">尚無收藏的特約商店</h3>
                <p className="text-xs text-muted mt-1">
                  在全台特約商店搜尋頁面中點擊愛心圖示，即可將優質飯店、餐廳或休閒商店收藏至此。
                </p>
              </div>
              <Link
                href="/"
                className="inline-block px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors"
              >
                前往搜尋特約商店
              </Link>
            </div>
          ) : favViewMode === 'map' ? (
            <div className="bg-card border border-border rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-xs text-muted px-1">
                <span>共有 {mapMerchants.length} 家店家具備地圖座標</span>
                <span className="flex items-center gap-1">
                  <InformationCircleIcon className="w-4 h-4" /> 點擊標記可查看商店詳情
                </span>
              </div>
              <div className="h-[450px] w-full rounded-xl overflow-hidden border border-border/80 relative">
                <MapView
                  merchants={mapMerchants}
                  center={defaultCenter}
                  userLocation={null}
                  onMapClick={() => {}}
                  selectedMerchant={null}
                  onSelectMerchant={() => {}}
                  radius={0}
                  tempRadius={0}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {favorites.map((merchant) => (
                <div
                  key={merchant.id}
                  className="bg-card border border-border/80 rounded-2xl p-5 shadow-xs hover:border-accent/40 transition-all flex flex-col justify-between space-y-4 group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Link
                        href={`/merchant/${merchant.id}`}
                        className="font-bold text-foreground hover:text-accent transition-colors line-clamp-1 text-base"
                      >
                        {merchant.name}
                      </Link>
                      <button
                        onClick={() => handleUnfavorite(merchant.id)}
                        className="p-1 rounded-full text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                        title="取消收藏"
                      >
                        <HeartSolidIcon className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="space-y-1.5 text-xs text-muted">
                      {merchant.address && (
                        <div className="flex items-center gap-1.5">
                          <MapPinIcon className="w-3.5 h-3.5 shrink-0 text-muted" />
                          <span className="truncate">{merchant.address}</span>
                        </div>
                      )}
                      {merchant.tax_id && (
                        <div className="flex items-center gap-1.5">
                          <BuildingStorefrontIcon className="w-3.5 h-3.5 shrink-0 text-muted" />
                          <span>統一編號: {merchant.tax_id}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                    <Link
                      href={`/merchant/${merchant.id}`}
                      className="text-xs text-accent font-medium hover:underline flex items-center gap-1"
                    >
                      <span>查看細節</span>
                      <ArrowRightIcon className="w-3 h-3" />
                    </Link>

                    <button
                      onClick={() => handleOpenAddExpenseForMerchant(merchant.id, merchant.name)}
                      className="px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent font-medium text-xs transition-colors flex items-center gap-1"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                      <span>快速記帳</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <AddExpenseModal
        isOpen={isAddExpenseOpen}
        onClose={() => setIsAddExpenseOpen(false)}
        defaultMerchantId={selectedMerchantForExpense.id}
        defaultMerchantName={selectedMerchantForExpense.name}
        onSuccess={() => {
          fetchSummary();
          fetchExpenses();
        }}
      />

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
