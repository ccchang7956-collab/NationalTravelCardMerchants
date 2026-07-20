'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { fetchWithAuth } from '@/utils/api';
import { buildGoogleMapsUrl, ItineraryItem } from '@/utils/itineraryHelpers';
import AuthModal from '@/components/AuthModal';
import {
  ArrowLeftIcon,
  SparklesIcon,
  MapPinIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  PlusIcon,
  ArrowTopRightOnSquareIcon,
  CalendarIcon,
  UserCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

// Dynamic import for ItineraryMapView to avoid Leaflet SSR issues
const ItineraryMapView = dynamic(() => import('@/components/ItineraryMapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-80 md:h-full min-h-[350px] rounded-2xl bg-muted-bg border border-border flex items-center justify-center text-muted">
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">載入地圖中...</span>
      </div>
    </div>
  ),
});

interface ItineraryDetail {
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

export default function ItineraryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const itineraryId = resolvedParams.id;
  const router = useRouter();

  const { user, loading: authLoading } = useAuth();
  const [itinerary, setItinerary] = useState<ItineraryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // New item form state
  const [newItemName, setNewItemName] = useState('');
  const [newItemAddress, setNewItemAddress] = useState('');
  const [newItemCost, setNewItemCost] = useState<number>(0);
  const [newItemCategory, setNewItemCategory] = useState<string>('觀光旅遊');
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth(`/api/itineraries/${itineraryId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('找不到指定的行程');
        } else {
          setError('載入行程失敗');
        }
        return;
      }
      const data = await res.json();
      setItinerary(data);
    } catch (err) {
      console.error('Failed to fetch itinerary detail:', err);
      setError('連線錯誤');
    } finally {
      setLoading(false);
    }
  }, [itineraryId]);

  useEffect(() => {
    if (user) {
      let isMounted = true;
      Promise.resolve().then(() => {
        if (isMounted) {
          fetchDetail();
        }
      });
      return () => {
        isMounted = false;
      };
    }
  }, [user, fetchDetail]);

  const saveUpdatedItems = async (updatedItems: ItineraryItem[]) => {
    if (!itinerary) return;
    setSaving(true);
    try {
      const formattedItems = updatedItems.map((item, idx) => ({
        merchant_id: item.merchant_id || null,
        custom_name: item.custom_name,
        address: item.address || null,
        lat: item.lat ?? null,
        lon: item.lon ?? null,
        order_index: idx,
        estimated_cost: Number(item.estimated_cost) || 0,
        quota_category: item.quota_category || '觀光旅遊',
        stay_minutes: Number(item.stay_minutes) || 60,
      }));

      const res = await fetchWithAuth(`/api/itineraries/${itinerary.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: itinerary.title,
          start_date: itinerary.start_date,
          notes: itinerary.notes,
          items: formattedItems,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setItinerary(data);
      } else {
        alert('更新行程順序失敗');
      }
    } catch (err) {
      console.error('Save updated items error:', err);
      alert('更新行程連線失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveUp = (index: number) => {
    if (!itinerary || index <= 0) return;
    const newItems = [...itinerary.items];
    const temp = newItems[index - 1];
    newItems[index - 1] = newItems[index];
    newItems[index] = temp;
    setItinerary({ ...itinerary, items: newItems });
    saveUpdatedItems(newItems);
  };

  const handleMoveDown = (index: number) => {
    if (!itinerary || index >= itinerary.items.length - 1) return;
    const newItems = [...itinerary.items];
    const temp = newItems[index + 1];
    newItems[index + 1] = newItems[index];
    newItems[index] = temp;
    setItinerary({ ...itinerary, items: newItems });
    saveUpdatedItems(newItems);
  };

  const handleDeleteItem = (index: number) => {
    if (!itinerary) return;
    if (!confirm('確定要從此行程中移除該景點嗎？')) return;
    const newItems = itinerary.items.filter((_, idx) => idx !== index);
    setItinerary({ ...itinerary, items: newItems });
    saveUpdatedItems(newItems);
  };

  const handleOptimizeRoute = async () => {
    if (!itinerary || itinerary.items.length < 2) {
      alert('行程景點至少需要 2 個以上才能進行最佳化排序');
      return;
    }

    setOptimizing(true);
    setToastMessage('');
    try {
      const res = await fetchWithAuth('/api/itineraries/optimize', {
        method: 'POST',
        body: JSON.stringify({ points: itinerary.items }),
      });

      if (res.ok) {
        const result = await res.json();
        const reorderedItems: ItineraryItem[] = result.points || [];
        const distanceKm = result.total_distance_km;

        setItinerary({ ...itinerary, items: reorderedItems });
        await saveUpdatedItems(reorderedItems);

        setToastMessage(`✨ 已自動優化順序為最短路徑！預估總行車/行走距離：${distanceKm} 公里`);
        setTimeout(() => setToastMessage(''), 6000);
      } else {
        alert('路線優化失敗，請稍後再試');
      }
    } catch (err) {
      console.error('Optimize route error:', err);
      alert('路線優化連線失敗');
    } finally {
      setOptimizing(false);
    }
  };

  const handleExportGoogleMaps = () => {
    if (!itinerary || itinerary.items.length === 0) {
      alert('尚無任何行程景點可匯出導航');
      return;
    }
    const url = buildGoogleMapsUrl(itinerary.items);
    if (!url) {
      alert('無法產生 Google Maps 導航網址');
      return;
    }
    window.open(url, '_blank');
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itinerary || !newItemName.trim()) return;

    const newItem: ItineraryItem = {
      merchant_id: null,
      custom_name: newItemName.trim(),
      address: newItemAddress.trim() || undefined,
      estimated_cost: newItemCost,
      quota_category: newItemCategory,
      stay_minutes: 60,
    };

    const newItems = [...itinerary.items, newItem];
    setItinerary({ ...itinerary, items: newItems });
    await saveUpdatedItems(newItems);

    setNewItemName('');
    setNewItemAddress('');
    setNewItemCost(0);
    setShowAddForm(false);
  };

  const handleDeleteItinerary = async () => {
    if (!itinerary) return;
    if (!confirm(`確定要刪除行程「${itinerary.title}」嗎？此操作無法復原。`)) return;

    try {
      const res = await fetchWithAuth(`/api/itineraries/${itinerary.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        router.push('/itinerary');
      } else {
        alert('刪除行程失敗');
      }
    } catch (err) {
      console.error('Delete itinerary error:', err);
      alert('連線失敗');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-muted text-sm">載入行程細節中...</p>
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
          檢視行程細節與路線地圖需要登入您的國旅卡助手帳號。
        </p>
        <button
          onClick={() => setIsAuthModalOpen(true)}
          className="w-full py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent/90 transition-colors shadow-sm cursor-pointer mb-3"
        >
          立即登入 / 註冊
        </button>
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-muted text-sm">讀取行程路線與地圖資料...</p>
      </div>
    );
  }

  if (error || !itinerary) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center space-y-6">
        <div className="text-red-500 text-5xl">⚠️</div>
        <h2 className="text-2xl font-bold text-foreground">{error || '行程不存在'}</h2>
        <Link
          href="/itinerary"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          <span>返回行程列表</span>
        </Link>
      </div>
    );
  }

  const totalCost = (itinerary.total_tourist_quota || 0) + (itinerary.total_general_quota || 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-300">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/itinerary"
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" /> <span>返回行程列表</span>
        </Link>
        <button
          onClick={handleDeleteItinerary}
          className="px-3.5 py-1.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <TrashIcon className="w-4 h-4" />
          <span>刪除整個行程</span>
        </button>
      </div>

      {/* Header Banner */}
      <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-accent mb-1">
              <span>🗺️ 行程規劃路線</span>
              {saving && <span className="text-muted text-[11px] animate-pulse">(儲存中...)</span>}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{itinerary.title}</h1>
            {itinerary.start_date && (
              <div className="flex items-center gap-1.5 text-xs text-muted mt-2">
                <CalendarIcon className="w-4 h-4 text-accent" />
                <span>預計出發日期：{itinerary.start_date}</span>
              </div>
            )}
            {itinerary.notes && (
              <p className="text-xs text-muted mt-2 bg-muted-bg/50 p-2.5 rounded-xl border border-border/50">
                {itinerary.notes}
              </p>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={handleOptimizeRoute}
              disabled={optimizing || itinerary.items.length < 2}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="使用 TSP 最短路徑演算法自動排序"
            >
              <SparklesIcon className={`w-4 h-4 ${optimizing ? 'animate-spin' : ''}`} />
              <span>{optimizing ? '計算最佳順序中...' : '✨ 自動順序優化'}</span>
            </button>

            <button
              onClick={handleExportGoogleMaps}
              className="px-4 py-2.5 rounded-xl bg-accent text-white font-medium text-xs hover:bg-accent/90 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              title="在 Google 地圖開啓全路徑導航"
            >
              <span>🗺️ 匯出 Google Maps 導航</span>
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quota & Cost Header Stats */}
        <div className="pt-4 border-t border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
            <span className="text-[11px] block font-medium">觀光旅遊額度預估</span>
            <span className="text-lg font-bold">${(itinerary.total_tourist_quota || 0).toLocaleString()}</span>
          </div>

          <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300">
            <span className="text-[11px] block font-medium">自行運用/一般額度預估</span>
            <span className="text-lg font-bold">${(itinerary.total_general_quota || 0).toLocaleString()}</span>
          </div>

          <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 text-accent">
            <span className="text-[11px] block font-medium">總行程預估支出</span>
            <span className="text-lg font-bold">${totalCost.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Toast Alert Notification */}
      {toastMessage && (
        <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
          <SparklesIcon className="w-4 h-4 shrink-0 text-purple-500" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Grid: Interactive Timeline (Left) & Map View (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Timeline list */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <span>📍</span> 路線景點時間軸 ({itinerary.items.length})
            </h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-1.5 rounded-xl bg-muted-bg hover:bg-card border border-border text-foreground text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>{showAddForm ? '取消新增' : '新增景點'}</span>
            </button>
          </div>

          {/* Add Item Form */}
          {showAddForm && (
            <form
              onSubmit={handleAddItem}
              className="p-4 rounded-2xl bg-card border border-accent/40 shadow-xs space-y-3 animate-in fade-in duration-200"
            >
              <h3 className="text-xs font-bold text-accent">➕ 手動加入新景點/店家</h3>
              <div className="space-y-2 text-xs">
                <div>
                  <label className="block text-muted mb-1">景點或店家名稱 *</label>
                  <input
                    type="text"
                    required
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="例如：羅東夜市小吃"
                    className="w-full px-3 py-2 rounded-xl bg-muted-bg border border-border text-foreground focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-muted mb-1">地址 (有地址可在地圖標示)</label>
                  <input
                    type="text"
                    value={newItemAddress}
                    onChange={(e) => setNewItemAddress(e.target.value)}
                    placeholder="例如：宜蘭縣羅東鎮興東路"
                    className="w-full px-3 py-2 rounded-xl bg-muted-bg border border-border text-foreground focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-muted mb-1">預估金額 (TWD)</label>
                    <input
                      type="number"
                      min={0}
                      value={newItemCost}
                      onChange={(e) => setNewItemCost(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-muted-bg border border-border text-foreground focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-muted mb-1">額度分類</label>
                    <select
                      value={newItemCategory}
                      onChange={(e) => setNewItemCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-muted-bg border border-border text-foreground focus:outline-none"
                    >
                      <option value="觀光旅遊">觀光旅遊</option>
                      <option value="自行運用">自行運用</option>
                      <option value="一般消費">一般消費</option>
                    </select>
                  </div>
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-accent text-white font-medium text-xs hover:bg-accent/90 transition-colors cursor-pointer"
              >
                加入行程順序
              </button>
            </form>
          )}

          {/* Timeline Items List */}
          {itinerary.items.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted text-xs">
              此行程尚無點位。請點擊右上角「新增景點」手動添加！
            </div>
          ) : (
            <div className="space-y-3 relative">
              {/* Connecting line background */}
              <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-border/60 -z-0 hidden sm:block" />

              {itinerary.items.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-card border border-border/80 rounded-2xl p-4 shadow-xs relative z-10 hover:border-accent/40 transition-all flex items-start gap-3"
                >
                  {/* Spot Number Pin */}
                  <div className="w-7 h-7 rounded-full bg-accent text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                    {idx + 1}
                  </div>

                  {/* Spot Content */}
                  <div className="flex-1 min-w-0 space-y-1 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-foreground text-sm truncate">
                        {item.custom_name}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 bg-accent/10 text-accent border border-accent/20">
                        {item.quota_category || '觀光旅遊'}
                      </span>
                    </div>

                    {item.address && (
                      <div className="text-muted text-[11px] truncate flex items-center gap-1">
                        <MapPinIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>{item.address}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-muted text-[11px] pt-1">
                      <span className="font-semibold text-foreground">
                        預估 NT$ {(item.estimated_cost || 0).toLocaleString()}
                      </span>
                      {item.stay_minutes != null && (
                        <span className="flex items-center gap-1">
                          <ClockIcon className="w-3 h-3 text-muted" />
                          <span>停留 {item.stay_minutes} 分鐘</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions: Move Up / Move Down / Delete */}
                  <div className="flex items-center gap-1 shrink-0 bg-muted-bg/60 p-1 rounded-xl border border-border/50">
                    <button
                      onClick={() => handleMoveUp(idx)}
                      disabled={idx === 0 || saving}
                      className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-card transition-colors disabled:opacity-30 cursor-pointer"
                      title="往上搬移"
                    >
                      <ChevronUpIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleMoveDown(idx)}
                      disabled={idx === itinerary.items.length - 1 || saving}
                      className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-card transition-colors disabled:opacity-30 cursor-pointer"
                      title="往下搬移"
                    >
                      <ChevronDownIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(idx)}
                      disabled={saving}
                      className="p-1 rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="移除此景點"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Map View */}
        <div className="lg:col-span-6 space-y-3 sticky top-24">
          <div className="flex items-center justify-between text-xs text-muted px-1">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <span>🗺️</span> 路線地圖與點位標記
            </span>
            <span>共 {itinerary.items.filter((i) => i.lat != null && i.lon != null).length} 處具地圖座標</span>
          </div>

          <div className="h-[450px] lg:h-[550px] w-full rounded-2xl overflow-hidden border border-border/80 shadow-xs relative bg-card">
            <ItineraryMapView items={itinerary.items} />
          </div>
        </div>
      </div>
    </div>
  );
}
