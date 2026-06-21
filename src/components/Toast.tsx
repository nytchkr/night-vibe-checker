"use client";

// ============================================================
// Toast
//
// Fixed bottom-center notification.
// Fades in immediately, fades out after 3s then calls onDone.
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
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const hideTimer = setTimeout(() => setVisible(false), 2500);
    const doneTimer = setTimeout(() => onDone(), 3000);
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
        rounded-xl bg-white/10 px-4 py-3
        text-sm font-medium text-white backdrop-blur
        border border-white/10 shadow-xl
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
