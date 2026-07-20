'use client';

import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '@/utils/api';
import { XMarkIcon, HeartIcon, PlusIcon, TrashIcon, MapPinIcon, CheckIcon } from '@heroicons/react/24/outline';

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

export interface SelectedItineraryItem {
  merchant_id?: number | null;
  custom_name: string;
  address?: string | null;
  lat?: number | null;
  lon?: number | null;
  estimated_cost: number;
  quota_category: string;
  stay_minutes: number;
}

interface CreateItineraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CreateItineraryModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateItineraryModalProps) {
  const getTodayString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(getTodayString());
  const [notes, setNotes] = useState('');

  const [favorites, setFavorites] = useState<FavoriteMerchant[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);

  const [selectedItems, setSelectedItems] = useState<SelectedItineraryItem[]>([]);
  const [customSpotName, setCustomSpotName] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const init = async () => {
      setTitle('');
      setStartDate(getTodayString());
      setNotes('');
      setSelectedItems([]);
      setCustomSpotName('');
      setError('');
      setLoadingFavorites(true);

      try {
        const res = await fetchWithAuth('/api/assistant/favorites');
        if (res.ok) {
          const data = await res.json();
          setFavorites(data);
        }
      } catch (err) {
        console.error('Failed to load favorites in modal:', err);
      } finally {
        setLoadingFavorites(false);
      }
    };

    init();
  }, [isOpen]);

  if (!isOpen) return null;

  const isMerchantSelected = (merchantId: number) => {
    return selectedItems.some((item) => item.merchant_id === merchantId);
  };

  const handleToggleFavorite = (merchant: FavoriteMerchant) => {
    const existingIndex = selectedItems.findIndex((item) => item.merchant_id === merchant.id);
    if (existingIndex >= 0) {
      setSelectedItems((prev) => prev.filter((_, idx) => idx !== existingIndex));
    } else {
      const newItem: SelectedItineraryItem = {
        merchant_id: merchant.id,
        custom_name: merchant.name,
        address: merchant.address,
        lat: merchant.lat,
        lon: merchant.lon,
        estimated_cost: 0,
        quota_category: '觀光旅遊',
        stay_minutes: 60,
      };
      setSelectedItems((prev) => [...prev, newItem]);
    }
  };

  const handleAddCustomSpot = () => {
    if (!customSpotName.trim()) return;
    const newItem: SelectedItineraryItem = {
      merchant_id: null,
      custom_name: customSpotName.trim(),
      address: null,
      lat: null,
      lon: null,
      estimated_cost: 0,
      quota_category: '觀光旅遊',
      stay_minutes: 60,
    };
    setSelectedItems((prev) => [...prev, newItem]);
    setCustomSpotName('');
  };

  const handleRemoveItem = (index: number) => {
    setSelectedItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: keyof SelectedItineraryItem, value: string | number) => {
    setSelectedItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('請輸入行程名稱');
      return;
    }

    setLoading(true);

    try {
      const formattedItems = selectedItems.map((item, idx) => ({
        merchant_id: item.merchant_id || null,
        custom_name: item.custom_name,
        address: item.address || null,
        lat: item.lat ?? null,
        lon: item.lon ?? null,
        order_index: idx + 1,
        estimated_cost: Number(item.estimated_cost) || 0,
        quota_category: item.quota_category || '觀光旅遊',
        stay_minutes: Number(item.stay_minutes) || 60,
      }));

      const res = await fetchWithAuth('/api/itineraries', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          start_date: startDate || null,
          notes: notes.trim() || null,
          items: formattedItems,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || '建立行程失敗');
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '連線錯誤');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-card border border-border/80 rounded-2xl p-6 w-full max-w-2xl shadow-xl relative animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-muted-bg transition-colors"
          aria-label="關閉"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
          <span>🗺️</span> 建立國民旅遊卡行程規劃
        </h3>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 基本資訊 */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">
                行程標題 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：宜蘭溫泉文化漫遊二日遊"
                className="w-full px-3.5 py-2.5 rounded-xl bg-muted-bg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm transition-all text-foreground"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">出發日期</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-muted-bg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm transition-all text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1">行程備註 (可選)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="例如：使用觀光額度住宿與景點體驗"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-muted-bg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm transition-all text-foreground"
                />
              </div>
            </div>
          </div>

          {/* 選擇愛心店家 */}
          <div className="border-t border-border/80 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <HeartIcon className="w-4 h-4 text-red-500" />
                <span>從我的收藏店家挑選加入行程</span>
              </label>
              <span className="text-xs text-muted">
                已選擇 <span className="font-bold text-accent">{selectedItems.length}</span> 個景點/店家
              </span>
            </div>

            {loadingFavorites ? (
              <div className="p-4 rounded-xl bg-muted-bg text-center text-xs text-muted">
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-1" />
                載入收藏店家資料中...
              </div>
            ) : favorites.length === 0 ? (
              <div className="p-4 rounded-xl bg-muted-bg/60 border border-border/60 text-center text-xs text-muted">
                目前尚無愛心收藏店家。您可以在搜尋頁點擊愛心收藏特約商店，或在下方手動新增景點。
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-border/60 rounded-xl bg-muted-bg/30">
                {favorites.map((merchant) => {
                  const selected = isMerchantSelected(merchant.id);
                  return (
                    <button
                      key={merchant.id}
                      type="button"
                      onClick={() => handleToggleFavorite(merchant)}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                        selected
                          ? 'bg-accent/10 border-accent text-accent'
                          : 'bg-card border-border/70 hover:border-accent/40 text-foreground'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-xs truncate">{merchant.name}</div>
                        {merchant.address && (
                          <div className="text-[11px] text-muted truncate flex items-center gap-1 mt-0.5">
                            <MapPinIcon className="w-3 h-3 shrink-0" />
                            <span>{merchant.address}</span>
                          </div>
                        )}
                      </div>
                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          selected
                            ? 'bg-accent border-accent text-white'
                            : 'border-border bg-card'
                        }`}
                      >
                        {selected && <CheckIcon className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 手動新增客製景點 */}
            <div className="flex gap-2">
              <input
                type="text"
                value={customSpotName}
                onChange={(e) => setCustomSpotName(e.target.value)}
                placeholder="輸入其他景點/餐廳名稱..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomSpot();
                  }
                }}
                className="flex-1 px-3 py-2 rounded-xl bg-muted-bg border border-border text-xs focus:outline-none focus:ring-2 focus:ring-accent/20 text-foreground"
              />
              <button
                type="button"
                onClick={handleAddCustomSpot}
                className="px-3 py-2 rounded-xl bg-muted-bg border border-border hover:bg-card text-foreground text-xs font-medium transition-colors flex items-center gap-1 shrink-0"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                <span>手動新增</span>
              </button>
            </div>
          </div>

          {/* 已加入的行程項目排序與設定 */}
          {selectedItems.length > 0 && (
            <div className="border-t border-border/80 pt-4 space-y-3">
              <label className="text-sm font-bold text-foreground block">
                📍 行程路線順序與預算細節 ({selectedItems.length})
              </label>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {selectedItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-card border border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-accent text-white font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground truncate">{item.custom_name}</div>
                        {item.address && (
                          <div className="text-[11px] text-muted truncate">{item.address}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <select
                        value={item.quota_category}
                        onChange={(e) => handleItemChange(idx, 'quota_category', e.target.value)}
                        className="px-2 py-1 rounded-lg bg-muted-bg border border-border text-xs text-foreground focus:outline-none"
                      >
                        <option value="觀光旅遊">觀光旅遊</option>
                        <option value="自行運用">自行運用</option>
                        <option value="一般消費">一般消費</option>
                      </select>

                      <div className="flex items-center gap-1">
                        <span className="text-muted text-[11px]">NT$</span>
                        <input
                          type="number"
                          min={0}
                          value={item.estimated_cost}
                          onChange={(e) => handleItemChange(idx, 'estimated_cost', Number(e.target.value))}
                          placeholder="預估金額"
                          className="w-20 px-2 py-1 rounded-lg bg-muted-bg border border-border text-xs text-foreground focus:outline-none"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="p-1 rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="移除此景點"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 focus:ring-4 focus:ring-accent/20 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {loading ? '建立行程中...' : '✨ 建立行程規劃'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
