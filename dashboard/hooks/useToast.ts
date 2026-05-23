"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { ToastViewport } from "@/components/ToastViewport";

export type ToastType = "success" | "error" | "info";
export type Toast = { id: number; message: string; type: ToastType };

type ToastCtx = {
  toasts: Toast[];
  show: (message: string, type?: ToastType) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastCtx | null>(null);

const TOAST_DURATION_MS = 3500;

// Tek bir global toast store. ToastProvider'i Providers.tsx icinde root'a
// koyduk, dolayisiyla hangi component'ten cagrilirsa cagrilsin ayni stack'e
// dusurur. ToastViewport provider icinde tek sefer render ediyor.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: ToastType = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return createElement(
    ToastContext.Provider,
    { value: { toasts, show, dismiss } },
    children,
    createElement(ToastViewport, { toasts, onDismiss: dismiss }),
  );
}

// Provider yoksa no-op donen guvenli hook — eski pages still mounting standalone.
export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  return {
    toasts: [],
    show: () => {
      /* provider yok — sessiz */
    },
    dismiss: () => {
      /* provider yok — sessiz */
    },
  };
}
