"use client";

// ============================================================
// Toast
//
// Fixed bottom-center notification.
// Fades in immediately, fades out after 2.5s then calls onDone.
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
}

export function Toast({ message, onDone }: ToastProps) {
  // visible drives the opacity transition; we start visible and
  // switch to false after 2s so the 0.5s fade-out finishes at ~2.5s.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const hideTimer = setTimeout(() => setVisible(false), 2000);
    const doneTimer = setTimeout(() => onDone(), 2500);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(doneTimer);
    };
    // onDone is intentionally excluded — it should be a stable ref
    // (useCallback) at the call-site; re-running would reset timers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{ transition: "opacity 0.5s ease" }}
      className={`
        fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999]
        px-5 py-3 rounded-xl
        text-sm font-semibold text-white
        bg-zinc-900
        border border-[#00F5D4]
        shadow-[0_0_16px_rgba(0,245,212,0.35)]
        pointer-events-none select-none
        whitespace-nowrap
        ${visible ? "opacity-100" : "opacity-0"}
      `}
    >
      {message}
    </div>
  );
}

export default Toast;
