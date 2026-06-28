"use client";

import { useEffect, useRef, useState } from "react";

const PULL_ACTIVATION_PX = 12;
const MAX_HORIZONTAL_DRIFT_PX = 50;
const TOP_SCROLL_TOLERANCE_PX = 2;
const TOUCH_POINTER_TYPES = new Set(["touch", "pen"]);

function isAtScrollTop() {
  return (
    window.scrollY <= TOP_SCROLL_TOLERANCE_PX ||
    document.documentElement.scrollTop <= TOP_SCROLL_TOLERANCE_PX ||
    document.body.scrollTop <= TOP_SCROLL_TOLERANCE_PX
  );
}

function isTouchLikePointer(event: PointerEvent) {
  return TOUCH_POINTER_TYPES.has(event.pointerType) || (event.pointerType === "" && navigator.maxTouchPoints > 0);
}

export function usePullToRefresh(onRefresh: () => Promise<void>, threshold = 80) {
  const startY = useRef(0);
  const startX = useRef(0);
  const activePointerId = useRef<number | null>(null);
  const isTracking = useRef(false);
  const isRefreshing = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    isRefreshing.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    const resetPull = () => {
      setPulling(false);
      setPullDistance(0);
      startY.current = 0;
      startX.current = 0;
      activePointerId.current = null;
      isTracking.current = false;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (
        !event.isPrimary ||
        !isTouchLikePointer(event) ||
        !isAtScrollTop() ||
        isRefreshing.current
      ) {
        return;
      }

      startY.current = event.clientY;
      startX.current = event.clientX;
      activePointerId.current = event.pointerId;
      isTracking.current = true;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!isTracking.current || event.pointerId !== activePointerId.current) return;

      const deltaY = event.clientY - startY.current;
      const deltaX = Math.abs(event.clientX - startX.current);

      if (deltaX > MAX_HORIZONTAL_DRIFT_PX || deltaY < 0 || !isAtScrollTop()) {
        resetPull();
        return;
      }

      if (deltaY > PULL_ACTIVATION_PX) {
        setPulling(true);
        setPullDistance(Math.min(deltaY, threshold * 1.25));
      }
    };

    const handlePointerEnd = async (event: PointerEvent) => {
      if (!isTracking.current || event.pointerId !== activePointerId.current) return;

      const deltaY = event.clientY - startY.current;
      const deltaX = Math.abs(event.clientX - startX.current);
      const shouldRefresh =
        deltaY > threshold &&
        deltaX <= MAX_HORIZONTAL_DRIFT_PX &&
        isAtScrollTop() &&
        !isRefreshing.current;

      resetPull();

      if (shouldRefresh) {
        setRefreshing(true);
        try {
          await onRefreshRef.current();
        } finally {
          setRefreshing(false);
        }
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerEnd, { passive: true });
    window.addEventListener("pointercancel", resetPull, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", resetPull);
    };
  }, [threshold]);

  return { pulling, refreshing, pullDistance };
}
