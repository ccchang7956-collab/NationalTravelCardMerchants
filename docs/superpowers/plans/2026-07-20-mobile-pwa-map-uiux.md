# 移動端 Map-First UI/UX 升級與 PWA 離線快取 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為國民旅遊卡特約商店系統構建 Map-First 移動端介面、Framer Motion 三段式拖曳面板、深淺色主題切換與 PWA Service Worker 離線地圖與資料快取機制。

**Architecture:** 前端 Next.js / Tailwind CSS 採用全螢幕地圖 Viewport 為底層，疊加 `MobileBottomSheet` (Framer Motion) 及 Glassmorphic Navbar。離線機制使用 Workbox Service Worker 與 IndexedDB/CacheStorage 儲存 API 與 Leaflet Tile 地圖圖片。

**Tech Stack:** Next.js, React, Tailwind CSS, Framer Motion, Leaflet, Workbox, Jest, React Testing Library.

## Global Constraints

- 介面與測試提示一律使用繁體中文 (Traditional Chinese)。
- 遵守 Mobile-First 響應式佈局及 Safe Area (`env(safe-area-inset-bottom)`) 邊界保護。
- 所有 UI 變更必須通過 Jest / React Testing Library 單元測試驗證。

---

### Task 1: 深淺色主題系統 (Theme Provider & Toggle)

**Files:**
- Create: `frontend/src/components/ThemeProvider.tsx`
- Create: `frontend/src/components/ThemeToggle.tsx`
- Modify: `frontend/src/app/layout.tsx`
- Test: `frontend/src/__tests__/ThemeProvider.test.tsx`

**Interfaces:**
- Consumes: Next.js Layout, LocalStorage, `window.matchMedia`
- Produces: `useTheme()` hook providing `{ theme: 'light' | 'dark', toggleTheme: () => void }`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/__tests__/ThemeProvider.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../components/ThemeProvider';
import React from 'react';

const TestComponent = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button onClick={toggleTheme}>Toggle Theme</button>
    </div>
  );
};

describe('ThemeProvider', () => {
  test('toggles theme and updates document element class', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const themeSpan = screen.getByTestId('current-theme');
    const button = screen.getByRole('button');

    expect(themeSpan.textContent).toBe('light');

    fireEvent.click(button);
    expect(themeSpan.textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test frontend/src/__tests__/ThemeProvider.test.tsx`
Expected: FAIL with "Cannot find module '../components/ThemeProvider'"

- [ ] **Step 3: Implement minimal ThemeProvider and ThemeToggle**

```tsx
// frontend/src/components/ThemeProvider.tsx
'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === 'dark') document.documentElement.classList.add('dark');
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend test frontend/src/__tests__/ThemeProvider.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ThemeProvider.tsx frontend/src/__tests__/ThemeProvider.test.tsx
git commit -m "feat: add ThemeProvider and dark mode state management"
```

---

### Task 2: 三段式移動端拖曳面板 (`MobileBottomSheet.tsx`)

**Files:**
- Create: `frontend/src/components/MobileBottomSheet.tsx`
- Test: `frontend/src/__tests__/MobileBottomSheet.test.tsx`

**Interfaces:**
- Consumes: Framer Motion (`framer-motion`)
- Produces: `<MobileBottomSheet snapState={snapState} onSnapChange={setSnapState}>{children}</MobileBottomSheet>`

- [ ] **Step 1: Write failing test for MobileBottomSheet snap points**

```tsx
// frontend/src/__tests__/MobileBottomSheet.test.tsx
import { render, screen } from '@testing-library/react';
import MobileBottomSheet from '../components/MobileBottomSheet';
import React from 'react';

describe('MobileBottomSheet Component', () => {
  test('renders drag handle and default collapsed state content', () => {
    render(
      <MobileBottomSheet snapState="collapsed" onSnapChange={jest.fn()}>
        <div data-testid="sheet-content">特約店家列表</div>
      </MobileBottomSheet>
    );

    expect(screen.getByTestId('drag-handle')).toBeInTheDocument();
    expect(screen.getByTestId('sheet-content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test frontend/src/__tests__/MobileBottomSheet.test.tsx`
Expected: FAIL with "Cannot find module '../components/MobileBottomSheet'"

- [ ] **Step 3: Implement MobileBottomSheet component**

```tsx
// frontend/src/components/MobileBottomSheet.tsx
'use client';

import React from 'react';
import { motion } from 'framer-motion';

export type SnapState = 'collapsed' | 'half' | 'full';

interface MobileBottomSheetProps {
  snapState: SnapState;
  onSnapChange: (state: SnapState) => void;
  children: React.ReactNode;
}

const heightMap: Record<SnapState, string> = {
  collapsed: '80px',
  half: '45vh',
  full: '90vh',
};

export default function MobileBottomSheet({ snapState, onSnapChange, children }: MobileBottomSheetProps) {
  return (
    <motion.div
      className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-slate-900 shadow-2xl rounded-t-2xl border-t border-slate-200 dark:border-slate-800 transition-all duration-300 ease-out"
      style={{ height: heightMap[snapState] }}
    >
      <div
        data-testid="drag-handle"
        className="w-full flex justify-center items-center py-2.5 cursor-grab active:cursor-grabbing"
        onClick={() => {
          if (snapState === 'collapsed') onSnapChange('half');
          else if (snapState === 'half') onSnapChange('full');
          else onSnapChange('collapsed');
        }}
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
      </div>
      <div className="h-[calc(100%-20px)] overflow-y-auto px-4 pb-6">
        {children}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend test frontend/src/__tests__/MobileBottomSheet.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MobileBottomSheet.tsx frontend/src/__tests__/MobileBottomSheet.test.tsx
git commit -m "feat: add MobileBottomSheet component with snap point support"
```

---

### Task 3: PWA 離線偵測與狀態提示 (`PWAOfflineBanner.tsx`)

**Files:**
- Create: `frontend/src/components/PWAOfflineBanner.tsx`
- Test: `frontend/src/__tests__/PWAOfflineBanner.test.tsx`

**Interfaces:**
- Consumes: Browser `navigator.onLine`, `window.addEventListener('offline' | 'online')`
- Produces: Alert banner when system goes offline.

- [ ] **Step 1: Write failing test for PWAOfflineBanner**

```tsx
// frontend/src/__tests__/PWAOfflineBanner.test.tsx
import { render, screen, act } from '@testing-library/react';
import PWAOfflineBanner from '../components/PWAOfflineBanner';
import React from 'react';

describe('PWAOfflineBanner Component', () => {
  test('displays banner when offline and hides when online', () => {
    render(<PWAOfflineBanner />);

    expect(screen.queryByText(/目前為離線模式/i)).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByText(/目前為離線模式/i)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.queryByText(/目前為離線模式/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test frontend/src/__tests__/PWAOfflineBanner.test.tsx`
Expected: FAIL with "Cannot find module '../components/PWAOfflineBanner'"

- [ ] **Step 3: Implement PWAOfflineBanner**

```tsx
// frontend/src/components/PWAOfflineBanner.tsx
'use client';

import React, { useEffect, useState } from 'react';

export default function PWAOfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    setIsOffline(!navigator.onLine);

    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="w-full bg-amber-500 text-slate-900 text-xs font-semibold px-4 py-1.5 text-center flex items-center justify-center gap-2 shadow-sm">
      <span className="w-2 h-2 rounded-full bg-amber-900 animate-ping" />
      目前為離線模式（讀取快取地圖與店家資料）
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend test frontend/src/__tests__/PWAOfflineBanner.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PWAOfflineBanner.tsx frontend/src/__tests__/PWAOfflineBanner.test.tsx
git commit -m "feat: add PWAOfflineBanner component for network status warning"
```
