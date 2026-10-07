"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

export type ToastVariant = "success" | "info" | "error";

export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: {
    show: (input: { title: string; description?: string; variant?: ToastVariant }) => number;
    success: (title: string, description?: string) => number;
    info: (title: string, description?: string) => number;
    error: (title: string, description?: string) => number;
  };
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;
const ERROR_DISMISS_MS = 8000;
type PauseReason = "pointer" | "focus";
interface ToastTimer { timer: ReturnType<typeof setTimeout> | null; remaining: number; started: number; pauses: Set<PauseReason> }

const VARIANT_STYLE: Record<ToastVariant, { icon: React.ReactNode }> = {
  success: {
    icon: <CheckCircleIcon className="w-5 h-5 text-green-600 shrink-0" aria-hidden="true" />,
  },
  info: {
    icon: <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />,
  },
  error: {
    icon: <XCircleIcon className="w-5 h-5 text-red-600 shrink-0" aria-hidden="true" />,
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ToastTimer>>(new Map());
  const activeRef = useRef<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    activeRef.current = activeRef.current.filter(item => item.id !== id);
    setToasts(activeRef.current);
    const entry = timersRef.current.get(id);
    if (entry?.timer) clearTimeout(entry.timer);
    timersRef.current.delete(id);
  }, []);

  const pause = useCallback((id: number, reason: PauseReason) => {
    const entry = timersRef.current.get(id);
    if (!entry) return;
    if (entry.pauses.size === 0) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.started));
      entry.timer = null;
    }
    entry.pauses.add(reason);
  }, []);

  const resume = useCallback((id: number, reason: PauseReason) => {
    const entry = timersRef.current.get(id);
    if (!entry || !entry.pauses.delete(reason) || entry.pauses.size > 0) return;
    entry.started = Date.now();
    entry.timer = setTimeout(() => dismiss(id), entry.remaining);
  }, [dismiss]);

  const push = useCallback((title: string, description: string | undefined, variant: ToastVariant) => {
    const existing = activeRef.current.find(item => item.title === title && item.description === description && item.variant === variant);
    if (existing) return existing.id;
    if (activeRef.current.length >= 3) dismiss(activeRef.current[0].id);
    const id = ++idRef.current;
    activeRef.current = [...activeRef.current, { id, title, description, variant }];
    setToasts(activeRef.current);
    const duration = variant === "error" ? ERROR_DISMISS_MS : AUTO_DISMISS_MS;
    timersRef.current.set(id, { timer: setTimeout(() => dismiss(id), duration), remaining: duration, started: Date.now(), pauses: new Set() });
    return id;
  }, [dismiss]);

  useEffect(() => {
    const timers = timersRef.current;
    // Restore timers after development Strict Mode's effect replay.
    timers.forEach((entry, id) => {
      if (!entry.timer && entry.pauses.size === 0) {
        entry.started = Date.now();
        entry.timer = setTimeout(() => dismiss(id), entry.remaining);
      }
    });
    return () => {
      timers.forEach(entry => {
        if (entry.timer) {
          clearTimeout(entry.timer);
          entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.started));
          entry.timer = null;
        }
      });
    };
  }, [dismiss]);

  const toast = useMemo<ToastContextValue["toast"]>(() => ({
    show: (input: { title: string; description?: string; variant?: ToastVariant }) => push(input.title, input.description, input.variant ?? "success"),
    success: (title: string, description?: string) => push(title, description, "success"),
    info: (title: string, description?: string) => push(title, description, "info"),
    error: (title: string, description?: string) => push(title, description, "error"),
  }), [push]);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="操作通知"
        className="pointer-events-none fixed top-[max(4.5rem,env(safe-area-inset-top))] left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4 sm:top-auto sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        {toasts.map((t) => {
          const style = VARIANT_STYLE[t.variant];
          return (
            <div
              key={t.id}
              role={t.variant === "error" ? "alert" : "status"}
              aria-atomic="true"
              onMouseEnter={() => pause(t.id, "pointer")}
              onMouseLeave={() => resume(t.id, "pointer")}
              onFocusCapture={() => pause(t.id, "focus")}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) resume(t.id, "focus");
              }}
              className="toast-enter pointer-events-auto flex w-full items-start gap-2.5 rounded-xl border border-border bg-card px-4 py-3 shadow-lg"
            >
              {style.icon}
              <div
                className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-sm text-muted">{t.description}</p>
                )}
              </div>
              <button
                type="button"
                aria-label="關閉通知"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-muted-bg hover:text-foreground"
              >
                <XMarkIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): { toast: ToastContextValue["toast"]; dismiss: (id: number) => void } {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast 必須在 <ToastProvider> 內使用");
  }
  return ctx;
}
