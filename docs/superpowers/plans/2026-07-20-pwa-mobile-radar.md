# PWA 行動端體驗、離線快取與周邊雷達 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為國民旅遊卡平台加入 PWA 獨立手機 App 安裝 (Manifest)、Service Worker 離線快取與 `/offline` 備用控制台，以及手機端「📡 附近雷達」GPS 一鍵透視周邊特約店家抽屜卡片。

**Architecture:** 前端使用 `@ducanh2912/next-pwa` 與 Network-First 策略配置 PWA 離線快取；新建 `/offline` 離線頁面與 `RadarFab.tsx` / `RadarSheet.tsx` 手機近鄰雷達探索元件。

**Tech Stack:** Next.js 15, React, Tailwind CSS, Lucide Icons, HTML5 Geolocation API, Service Worker CacheStorage.

## Global Constraints

- PWA Theme Color: `#2563eb`
- App Name: "國民旅遊卡特約商店導航秘書"
- Radar radii options: 0.5km, 1.0km, 2.0km
- Mobile radar FAB position: `bottom-20 right-4 z-40`

---

### Task 1: PWA Manifest & App Metadata Scaffolding

**Files:**
- Create: `frontend/public/manifest.json`
- Create: `frontend/public/icons/icon-192x192.png` (or SVG/PNG asset)
- Create: `frontend/public/icons/icon-512x512.png`
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Consumes: W3C PWA Manifest Standard.
- Produces: Installable Web App metadata for iOS & Android.

- [ ] **Step 1: Create frontend/public/manifest.json**

```json
{
  "name": "國民旅遊卡特約商店導航秘書",
  "short_name": "國旅卡秘書",
  "description": "全台國民旅遊卡特約商店查詢、雙額度補助統計與周邊地圖導航助手",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f8fafc",
  "theme_color": "#2563eb",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 2: Create placeholder icon assets**

Generate standard icon PNG files or SVG placeholders in `frontend/public/icons/icon-192x192.png` and `frontend/public/icons/icon-512x512.png`.

- [ ] **Step 3: Update metadata in frontend/src/app/layout.tsx**

Add `manifest: '/manifest.json'` and `themeColor: '#2563eb'` to Next.js `metadata` object in `layout.tsx`.

- [ ] **Step 4: Commit**

```bash
git add frontend/public/manifest.json frontend/public/icons/ frontend/src/app/layout.tsx
git commit -m "feat: add PWA manifest.json and app icon metadata"
```

---

### Task 2: Service Worker & Offline Fallback Page (`/offline`)

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/next.config.ts`
- Create: `frontend/src/app/offline/page.tsx`

**Interfaces:**
- Consumes: Service Worker CacheStorage API.
- Produces: `/offline` route displaying offline alert & cached favorite merchants.

- [ ] **Step 1: Create frontend/src/app/offline/page.tsx**

```tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { WifiOff, Heart, Home } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function OfflinePage() {
  const { favoriteIds } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
      <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4 shadow-sm animate-pulse">
        <WifiOff size={32} />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">目前處於離線狀態</h1>
      <p className="text-slate-600 max-w-md mb-6">
        您目前沒有網路連線。沒關係，您仍可存取先前瀏覽過的快取內容與「我的收藏」店家資料。
      </p>
      
      <div className="flex flex-wrap gap-3 justify-center">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
        >
          <Heart size={18} /> 查看我的收藏 ({favoriteIds.length})
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition font-medium"
        >
          <Home size={18} /> 返回首頁
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Install @ducanh2912/next-pwa and configure next.config.ts**

Run: `npm install @ducanh2912/next-pwa` in `frontend/`.
Configure `next.config.ts`:
```typescript
import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  fallbacks: {
    document: '/offline',
  },
});

export default withPWA({
  /* config options here */
});
```

- [ ] **Step 3: Test build**

Run: `npm run build` in `frontend/` to verify PWA Service Worker compiles without error.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/next.config.ts frontend/src/app/offline/page.tsx
git commit -m "feat: add next-pwa service worker and offline fallback page"
```

---

### Task 3: Mobile Radar Floating Action Button (`RadarFab.tsx`)

**Files:**
- Create: `frontend/src/components/RadarFab.tsx`

**Interfaces:**
- Consumes: User click action.
- Produces: Floating Radar Button with pulse ring animation that triggers `onOpenRadar()` callback.

- [ ] **Step 1: Create frontend/src/components/RadarFab.tsx**

```tsx
'use client';

import React from 'react';
import { Radio } from 'lucide-react';

interface RadarFabProps {
  onClick: () => void;
}

export default function RadarFab({ onClick }: RadarFabProps) {
  return (
    <button
      onClick={onClick}
      aria-label="開啟周邊國旅卡特約店家雷達"
      className="fixed bottom-20 right-4 sm:bottom-8 sm:right-8 z-40 flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all group"
    >
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-300 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-200"></span>
      </span>
      <Radio className="w-5 h-5 group-hover:rotate-12 transition-transform" />
      <span className="font-semibold text-sm tracking-wide">周邊雷達</span>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/RadarFab.tsx
git commit -m "feat: add RadarFab pulsing floating action button component"
```

---

### Task 4: Mobile Radar Bottom Sheet Component (`RadarSheet.tsx`) & Global Integration

**Files:**
- Create: `frontend/src/components/RadarSheet.tsx`
- Modify: `frontend/src/app/layout.tsx` (or `page.tsx` global container)

**Interfaces:**
- Consumes: HTML5 `navigator.geolocation`, GET `/api/merchants/nearby`, `AuthContext`.
- Produces: Interactive mobile bottom sheet listing nearby merchants within 0.5km / 1.0km / 2.0km with navigation, favorites, and quick expense actions.

- [ ] **Step 1: Create frontend/src/components/RadarSheet.tsx**

Implement `RadarSheet.tsx`:
- Props: `isOpen: boolean`, `onClose: () => void`.
- Radius tabs: `0.5`, `1.0`, `2.0` (in km).
- Geolocation handling: calls `navigator.geolocation.getCurrentPosition()`.
- Fetches `/api/merchants/nearby?lat=${lat}&lon=${lon}&radius_km=${radius}&limit=30`.
- Renders list of nearby merchants sorted by distance (`distance_km`).
- Displays heart favorite toggle, quick expense button (`AddExpenseModal`), and Google Maps directions link (`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`).

- [ ] **Step 2: Integrate RadarFab and RadarSheet into layout/global page**

Embed `<RadarFab onClick={() => setRadarOpen(true)} />` and `<RadarSheet isOpen={radarOpen} onClose={() => setRadarOpen(false)} />` in global layout or main view.

- [ ] **Step 3: Test build & lint**

Run: `npm run lint` and `npm run build` in `frontend/`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/RadarSheet.tsx frontend/src/app/layout.tsx
git commit -m "feat: add RadarSheet bottom drawer and integrate global mobile radar feature"
```

---

### Task 5: System-wide End-to-End Verification

**Files:**
- None (verification phase)

- [ ] **Step 1: Run frontend linter and build**

Run: `npm run lint && npm run build` inside `frontend/`.
Expected: 0 errors, 0 warnings, build succeeded.

- [ ] **Step 2: Run backend test suite**

Run: `PYTHONPATH=. .venv/bin/pytest backend/tests/` inside root.
Expected: 100% PASS (33/33 tests).

- [ ] **Step 3: Final commit**

```bash
git commit --allow-empty -m "chore: verify PWA mobile radar feature complete and all tests passing"
```
