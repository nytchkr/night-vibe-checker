"use client";

import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { div as MotionDiv } from "framer-motion/client";
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

const variantStyles: Record<ToastVariant, { panel: string; dot: string; glow: string }> = {
  success: {
    panel: "border-[#00F5D4]/45 bg-[#00F5D4] text-[#051312]",
    dot: "bg-[#051312]",
    glow: "shadow-[0_18px_48px_rgba(0,245,212,0.28)]",
  },
  error: {
    panel: "border-[#F05656]/45 bg-[#F05656] text-white",
    dot: "bg-white",
    glow: "shadow-[0_18px_48px_rgba(240,86,86,0.28)]",
  },
  info: {
    panel: "border-[#8B6CFF]/45 bg-[#8B6CFF] text-white",
    dot: "bg-white",
    glow: "shadow-[0_18px_48px_rgba(139,108,255,0.30)]",
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
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-[10000] flex justify-center px-4 sm:bottom-6">
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
      aria-live="polite"
      aria-relevant="additions removals"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-[10000] flex flex-col-reverse items-center gap-2 px-4 sm:bottom-6"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
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
    <MotionDiv
      layout
      role={toast.variant === "error" ? "alert" : "status"}
      aria-atomic="true"
      initial={{ opacity: 0, y: 28, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
      className={[
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[14px] border px-4 py-3 text-sm font-bold leading-5",
        "backdrop-blur-xl",
        styles.panel,
        styles.glow,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${styles.dot}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words">{toast.message}</span>
      {hasAction ? (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded-full border border-current/25 px-3 py-1 text-xs font-black text-current/90 transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          {actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-current/70 transition-colors hover:bg-white/15 hover:text-current focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </MotionDiv>
  );
}

export default Toast;
