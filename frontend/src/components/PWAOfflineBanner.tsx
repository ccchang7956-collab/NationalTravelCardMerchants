'use client';

import React, { useState, useEffect } from 'react';

export default function PWAOfflineBanner() {
  const [isOffline, setIsOffline] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      setIsOffline(!navigator.onLine);
    }

    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!isOffline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-500 text-white px-4 py-2 text-sm text-center flex items-center justify-center space-x-2 font-medium shadow-md z-50 w-full"
    >
      <span className="h-2.5 w-2.5 rounded-full bg-amber-200 animate-pulse inline-block" aria-hidden="true" />
      <span>目前為離線模式（讀取快取地圖與店家資料）</span>
    </div>
  );
}
