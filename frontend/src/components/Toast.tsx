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
    (input: { title: string; description?: string; variant?: ToastVariant }): number;
    success: (title: string, description?: string) => number;
    info: (title: string, description?: string) => number;
    error: (title: string, description?: string) => number;
  };
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;

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
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (title: string, description: string | undefined, variant: ToastVariant) => {
      idRef.current += 1;
      const id = idRef.current;
      setToasts((current) => [...current.slice(-2), { id, title, description, variant }]);
      const timer = setTimeout(() => {
        dismiss(id);
      }, AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);
      return id;
    },
    [dismiss]
  );

  // unmount 時清掉待觸發的自動關閉 timer，避免 setState 洩漏
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const toast = useMemo<ToastContextValue["toast"]>(() => {
    const fn = (input: { title: string; description?: string; variant?: ToastVariant }) =>
      push(input.title, input.description, input.variant ?? "success");
    fn.success = (title: string, description?: string) => push(title, description, "success");
    fn.info = (title: string, description?: string) => push(title, description, "info");
    fn.error = (title: string, description?: string) => push(title, description, "error");
    return fn;
  }, [push]);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4 sm:bottom-6"
      >
        {toasts.map((t) => {
          const style = VARIANT_STYLE[t.variant];
          return (
            <div
              key={t.id}
              role="status"
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
