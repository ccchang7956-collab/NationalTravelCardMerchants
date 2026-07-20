'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  XMarkIcon,
  MapPinIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  ArrowTopRightOnSquareIcon,
  BuildingStorefrontIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { getPublicApiUrl } from '@/utils/env';
import MerchantActions from '@/components/MerchantActions';

interface RadarSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Merchant {
  id: number;
  name: string;
  address: string | null;
  zip_code: string | null;
  tax_id: string | null;
  website: string | null;
  lat: number | null;
  lon: number | null;
  distance_km?: number;
  industry_name?: string;
}

const RADIUS_OPTIONS = [
  { label: '0.5 km', value: 0.5 },
  { label: '1.0 km', value: 1.0 },
  { label: '2.0 km', value: 2.0 },
];

export default function RadarSheet({ isOpen, onClose }: RadarSheetProps) {
  const [radius, setRadius] = useState<number>(1.0);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  
  // 手動地址搜尋備援
  const [manualQuery, setManualQuery] = useState<string>('');
  const [isSearchingManual, setIsSearchingManual] = useState<boolean>(false);

  // 檢查網路連線狀態
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  // 抓取周邊店家 API
  const fetchNearbyMerchants = useCallback(async (lat: number, lon: number, radiusKm: number) => {
    setLoading(true);
    setGeoError(null);
    try {
      const baseUrl = getPublicApiUrl();
      const res = await fetch(
        `${baseUrl}/api/merchants/nearby?lat=${lat}&lon=${lon}&radius_km=${radiusKm}&limit=30`
      );
      if (!res.ok) {
        throw new Error(`伺服器回應錯誤 (${res.status})`);
      }
      const data: Merchant[] = await res.json();
      setMerchants(data);
    } catch (err: unknown) {
      console.error('Fetch nearby merchants failed:', err);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsOffline(true);
      } else {
        setGeoError(err instanceof Error ? err.message : '載入周邊店家失敗');
      }
      setMerchants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 觸發 GPS 定位與查詢
  const requestLocationAndFetch = useCallback(
    (selectedRadius: number) => {
      if (typeof window === 'undefined') return;
      if (!navigator.geolocation) {
        setGeoError('您的裝置或瀏覽器不支援 GPS 地理定位');
        return;
      }
      setLoading(true);
      setGeoError(null);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          setCoords(newCoords);
          fetchNearbyMerchants(newCoords.lat, newCoords.lon, selectedRadius);
        },
        (err) => {
          setLoading(false);
          let errMsg = '無法取得 GPS 定位';
          if (err.code === err.PERMISSION_DENIED) {
            errMsg = '存取 GPS 位置已被拒絕，請允許定位權限或使用下方地址搜尋';
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            errMsg = '暫時無法獲取目前的地理位置座標';
          } else if (err.code === err.TIMEOUT) {
            errMsg = 'GPS 定位逾時，請再試一次或手動輸入搜尋';
          }
          setGeoError(errMsg);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    },
    [fetchNearbyMerchants]
  );

  // 當開啟抽屜時自動取得定位
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      if (!coords) {
        requestLocationAndFetch(radius);
      } else {
        fetchNearbyMerchants(coords.lat, coords.lon, radius);
      }
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, coords, radius, requestLocationAndFetch, fetchNearbyMerchants]);

  // 切換半徑
  const handleRadiusChange = (newRadius: number) => {
    setRadius(newRadius);
    if (coords) {
      fetchNearbyMerchants(coords.lat, coords.lon, newRadius);
    } else {
      requestLocationAndFetch(newRadius);
    }
  };

  // 手動地址 / 關鍵字搜尋備援
  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualQuery.trim()) return;
    setIsSearchingManual(true);
    setLoading(true);
    setGeoError(null);
    try {
      const baseUrl = getPublicApiUrl();
      const res = await fetch(
        `${baseUrl}/api/merchants?q=${encodeURIComponent(manualQuery.trim())}&per_page=30`
      );
      if (!res.ok) throw new Error('搜尋店家失敗');
      const data = await res.json();
      setMerchants(data.items || []);
    } catch (err: unknown) {
      setGeoError(err instanceof Error ? err.message : '手動搜尋發生錯誤');
    } finally {
      setLoading(false);
      setIsSearchingManual(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      {/* 點擊遮罩關閉 */}
      <div className="flex-1" onClick={onClose} aria-hidden="true" />

      {/* Sheet 底盤 Modal */}
      <div className="bg-card border-t border-border shadow-2xl rounded-t-3xl max-h-[85vh] flex flex-col w-full max-w-2xl mx-auto overflow-hidden animate-in slide-in-from-bottom duration-300">
        {/* Handle Bar 頂部拉桿 */}
        <div className="w-full flex justify-center py-2.5 cursor-grab active:cursor-grabbing" onClick={onClose}>
          <div className="w-12 h-1.5 bg-muted/40 rounded-full" />
        </div>

        {/* 標題與關閉按鈕 */}
        <div className="px-5 pb-3 flex items-center justify-between border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <SparklesIcon className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                📡 行動周邊雷達
              </h2>
              <p className="text-xs text-muted">即時探索附近的國民旅遊卡特約店家</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => requestLocationAndFetch(radius)}
              disabled={loading}
              title="重新定位"
              className="p-2 rounded-xl text-muted hover:text-foreground hover:bg-muted-bg transition-colors disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin text-accent' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-muted hover:text-foreground hover:bg-muted-bg transition-colors"
              aria-label="關閉周邊雷達"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 離線或 GPS 錯誤提示區塊 */}
        {isOffline && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs">
            <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
            <span>目前處於離線狀態，若您先前景入過資料可檢視快取的周邊或收藏店家。</span>
          </div>
        )}

        {geoError && (
          <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-3 text-xs text-red-600 dark:text-red-400">
            <div className="flex items-center gap-2 font-medium mb-1">
              <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
              <span>{geoError}</span>
            </div>
            <p className="text-[11px] text-muted">您可以在下方搜尋框手動輸入路段或店家名稱來探索周邊商店。</p>
          </div>
        )}

        {/* 控制列：半徑選擇 Tab + 手動搜尋備援 */}
        <div className="p-4 space-y-3 bg-muted-bg/30 border-b border-border/40">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted flex items-center gap-1">
              <MapPinIcon className="w-3.5 h-3.5 text-accent" />
              搜尋半徑範圍：
            </span>
            <div className="flex items-center bg-muted-bg p-1 rounded-xl border border-border/50">
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleRadiusChange(opt.value)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                    radius === opt.value
                      ? 'bg-accent text-white shadow-xs font-semibold'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 手動地址/店名搜尋列 */}
          <form onSubmit={handleManualSearch} className="relative flex items-center">
            <MagnifyingGlassIcon className="absolute left-3.5 w-4 h-4 text-muted pointer-events-none" />
            <input
              type="text"
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder="搜尋地址、地標或店名 (例：信義區、四季飯店)..."
              className="w-full pl-9 pr-20 py-2 text-xs rounded-xl bg-card border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all text-foreground"
            />
            <button
              type="submit"
              disabled={isSearchingManual || !manualQuery.trim()}
              className="absolute right-1.5 px-3 py-1 text-xs bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40 transition-all font-medium"
            >
              {isSearchingManual ? '搜尋中' : '搜尋'}
            </button>
          </form>
        </div>

        {/* 店家清單列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[240px]">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted gap-3">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">正在雷達掃描周邊特約店家...</p>
            </div>
          ) : merchants.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center p-6 text-muted gap-2">
              <BuildingStorefrontIcon className="w-12 h-12 text-muted/50 mb-1" />
              <p className="text-sm font-medium text-foreground">未找到周邊國旅卡特約店家</p>
              <p className="text-xs text-muted max-w-xs">
                試著放大搜尋半徑至 2.0 km，或在上方搜尋框輸入具體地址與關鍵字進行尋找。
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-muted flex items-center justify-between px-1">
                <span>共找到 <strong className="text-accent">{merchants.length}</strong> 間特約商店</span>
                {coords && <span className="text-[11px]">已依距離由近至遠排序</span>}
              </div>

              {merchants.map((merchant) => {
                const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${
                  merchant.lat && merchant.lon
                    ? `${merchant.lat},${merchant.lon}`
                    : encodeURIComponent(merchant.address || merchant.name)
                }`;

                return (
                  <div
                    key={merchant.id}
                    className="p-4 rounded-2xl bg-card border border-border/80 hover:border-accent/40 shadow-2xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                  >
                    {/* 左側店家主要資訊 */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {merchant.distance_km != null && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full shrink-0">
                            <MapPinIcon className="w-3 h-3" />
                            {merchant.distance_km < 1
                              ? `${Math.round(merchant.distance_km * 1000)} m`
                              : `${merchant.distance_km.toFixed(2)} km`}
                          </span>
                        )}
                        {merchant.industry_name && (
                          <span className="text-[11px] text-muted bg-muted-bg border border-border/50 px-2 py-0.5 rounded-full shrink-0">
                            {merchant.industry_name}
                          </span>
                        )}
                        {merchant.zip_code && (
                          <span className="text-[11px] text-muted/70">
                            [{merchant.zip_code}]
                          </span>
                        )}
                      </div>

                      <h3 className="font-semibold text-sm text-foreground truncate group-hover:text-accent transition-colors">
                        {merchant.name}
                      </h3>

                      <p className="text-xs text-muted truncate flex items-center gap-1">
                        <MapPinIcon className="w-3.5 h-3.5 shrink-0 text-muted/60" />
                        <span className="truncate">{merchant.address || '未提供詳細地址'}</span>
                      </p>
                    </div>

                    {/* 右側操作按鈕區（導航 + 收藏 + 記帳） */}
                    <div className="flex items-center gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40 shrink-0 justify-between sm:justify-end">
                      {/* Google Maps 導航按鈕 */}
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 hover:bg-blue-600/20 font-medium transition-all"
                        title="開啟 Google 地圖導航"
                      >
                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                        <span>導航</span>
                      </a>

                      {/* 收藏與記帳功能 */}
                      <MerchantActions merchant={{ id: merchant.id, name: merchant.name }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
