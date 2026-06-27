"use client";

// ============================================================
// Toast
//
// Fixed bottom-center notification.
// Fades in immediately, fades out after durationMs then calls onDone.
//
// Props:
//   message  — text to display
//   onDone   — called when the animation completes so the
//              parent can clear the toast from state
// ============================================================

import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  onDone: () => void;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
  fadeMs?: number;
  className?: string;
}

export function Toast({ message, onDone, actionLabel, onAction, durationMs = 2500, fadeMs = 500, className = "" }: ToastProps) {
  const [visible, setVisible] = useState(true);
  const hasAction = Boolean(actionLabel && onAction);

  useEffect(() => {
    const hideTimer = setTimeout(() => setVisible(false), durationMs);
    const doneTimer = setTimeout(() => onDone(), durationMs + fadeMs);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(doneTimer);
    };
  }, [durationMs, fadeMs, onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{ transition: `opacity ${fadeMs}ms ease` }}
      className={`
        fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999]
        rounded-xl bg-white/10 px-4 py-3
        text-sm font-medium text-white backdrop-blur
        border border-white/10 shadow-xl
        ${hasAction ? "pointer-events-auto" : "pointer-events-none select-none"}
        whitespace-nowrap
        ${visible ? "opacity-100" : "opacity-0"}
        ${className}
      `}
    >
      <span>{message}</span>
      {hasAction ? (
        <button
          type="button"
          onClick={onAction}
          className="ml-3 rounded-full border border-white/25 px-3 py-1 text-xs font-black text-white transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export default Toast;
