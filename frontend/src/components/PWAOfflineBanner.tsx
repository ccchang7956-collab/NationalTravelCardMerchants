'use client';

import { useSyncExternalStore } from 'react';

let isOfflineState = typeof navigator !== 'undefined' ? !navigator.onLine : false;
const listeners = new Set<() => void>();
let cleanupListeners: (() => void) | null = null;

function subscribe(callback: () => void) {
  listeners.add(callback);

  if (typeof window !== 'undefined' && listeners.size === 1) {
    isOfflineState = !navigator.onLine;
    const handleOffline = () => {
      isOfflineState = true;
      listeners.forEach((cb) => cb());
    };
    const handleOnline = () => {
      isOfflineState = false;
      listeners.forEach((cb) => cb());
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    cleanupListeners = () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }

  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && cleanupListeners) {
      cleanupListeners();
      cleanupListeners = null;
    }
  };
}

function getSnapshot() {
  if (typeof navigator !== 'undefined' && listeners.size === 0) {
    isOfflineState = !navigator.onLine;
  }
  return isOfflineState;
}

function getServerSnapshot() {
  return false;
}

export default function PWAOfflineBanner() {
  const isOffline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

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
