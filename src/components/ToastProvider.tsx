"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

type ToastContextValue = {
  showToast: (message: string, type: ToastType) => void;
};

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const TOAST_DURATION_MS = 3000;
const MAX_TOASTS = 3;

const toastStyles: Record<ToastType, string> = {
  success: "border-[#00F5D4]/45 bg-[#062A27] text-[#DFFFFA] shadow-[#00F5D4]/20",
  error: "border-[#FF4444]/45 bg-[#351012] text-[#FFE7E7] shadow-[#FF4444]/15",
  info: "border-[#8B6CFF]/45 bg-[#17112E] text-[#EFEAFF] shadow-[#8B6CFF]/20",
};

const accentStyles: Record<ToastType, string> = {
  success: "bg-[#00F5D4]",
  error: "bg-[#FF4444]",
  info: "bg-[#8B6CFF]",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextToastId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    setToasts((current) => {
      const next = [
        ...current,
        {
          id: nextToastId.current++,
          message: trimmed,
          type,
        },
      ];
      return next.slice(-MAX_TOASTS);
    });
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions removals"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-[10000] flex flex-col items-center gap-2 px-4 sm:bottom-6"
      >
        {toasts.map((toast) => (
          <ToastNotification key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastNotification({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.id]);

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex w-full max-w-sm animate-[toast-slide-in_180ms_ease-out] items-start gap-3 rounded-[14px] border px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur ${toastStyles[toast.type]}`}
    >
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${accentStyles[toast.type]}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 leading-5">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
