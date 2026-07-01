"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export type ToastVariant = "success" | "error" | "info";

export type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastProps = {
  message: string;
  onDone: () => void;
  variant?: ToastVariant;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
  className?: string;
};

type ToastViewportProps = {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
};

const TOAST_DURATION_MS = 3000;

const variantStyles: Record<ToastVariant, { accent: string; icon: string; glow: string }> = {
  success: {
    accent: "border-l-[#00F5D4]",
    icon: "bg-[#00F5D4] shadow-[0_0_10px_rgba(0,245,212,0.65)]",
    glow: "shadow-[0_18px_48px_rgba(0,245,212,0.14)]",
  },
  error: {
    accent: "border-l-[#F0568C]",
    icon: "bg-[#F0568C] shadow-[0_0_10px_rgba(240,86,140,0.65)]",
    glow: "shadow-[0_18px_48px_rgba(240,86,140,0.16)]",
  },
  info: {
    accent: "border-l-[#8B6CFF]",
    icon: "bg-[#8B6CFF] shadow-[0_0_10px_rgba(139,108,255,0.7)]",
    glow: "shadow-[0_18px_48px_rgba(139,108,255,0.18)]",
  },
};

export function Toast({
  message,
  onDone,
  variant = "info",
  actionLabel,
  onAction,
  durationMs = TOAST_DURATION_MS,
  className = "",
}: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, onDone]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[10000] flex justify-center px-4">
      <ToastCard
        toast={{ id: 0, message, variant }}
        onDismiss={onDone}
        actionLabel={actionLabel}
        onAction={onAction}
        className={className}
      />
    </div>
  );
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-relevant="additions removals"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[10000] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
  actionLabel,
  onAction,
  className = "",
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  const styles = variantStyles[toast.variant];
  const hasAction = Boolean(actionLabel && onAction);

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      aria-live={toast.variant === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      className={[
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[14px] border border-l-4 border-white/[0.08] bg-[#14141A]/86 px-4 py-3 text-sm font-semibold leading-5 text-[#F4F5F8]",
        "animate-in fade-in slide-in-from-top-2 duration-200 backdrop-blur-xl transition ease-out",
        styles.accent,
        styles.glow,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${styles.icon}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words">{toast.message}</span>
      {hasAction ? (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded-full border border-white/[0.12] px-3 py-1 text-xs font-semibold text-[#F4F5F8] transition-colors hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          {actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#9CA2AE] transition-colors hover:bg-white/[0.08] hover:text-[#F4F5F8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default Toast;
