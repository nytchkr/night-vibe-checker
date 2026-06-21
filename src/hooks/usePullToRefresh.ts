"use client";

import { useEffect, useRef, useState } from "react";

export function usePullToRefresh(onRefresh: () => Promise<void>, threshold = 80) {
  const startY = useRef(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) startY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = async (e: TouchEvent) => {
      const delta = e.changedTouches[0].clientY - startY.current;

      if (delta > threshold && window.scrollY === 0 && !refreshing) {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }

      setPulling(false);
      startY.current = 0;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 10 && window.scrollY === 0) setPulling(true);
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onRefresh, threshold, refreshing]);

  return { pulling, refreshing };
}
