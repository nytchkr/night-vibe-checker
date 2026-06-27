"use client";

import { createContext, createElement, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ToastViewport } from "@/components/Toast";
import type { ToastItem, ToastVariant } from "@/components/Toast";

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const MAX_TOASTS = 3;

export type { ToastVariant };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextToastId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = "info") => {
    const trimmed = message.trim();
    if (!trimmed) return;

    const id = nextToastId.current++;
    setToasts((current) => [...current, { id, message: trimmed, variant }].slice(-MAX_TOASTS));

    window.setTimeout(() => {
      dismissToast(id);
    }, 3000);
  }, [dismissToast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return createElement(
    ToastContext.Provider,
    { value },
    children,
    createElement(ToastViewport, { toasts, onDismiss: dismissToast }),
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
