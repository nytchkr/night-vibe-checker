"use client";

import { useEffect, useState } from "react";

const VISIT_COUNT_KEY = "nv_visit_count";

function readVisitCount() {
  try {
    const value = Number.parseInt(localStorage.getItem(VISIT_COUNT_KEY) ?? "0", 10);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function PWAInstallVisitTracker({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const nextVisitCount = readVisitCount() + 1;
      localStorage.setItem(VISIT_COUNT_KEY, String(nextVisitCount));
      window.dispatchEvent(new CustomEvent("nv-pwa-visit-count-updated"));
    } catch {
      // Storage can be unavailable in private browsing; the banner will stay hidden.
    } finally {
      setIsReady(true);
    }
  }, []);

  if (!isReady) return null;

  return <>{children}</>;
}
