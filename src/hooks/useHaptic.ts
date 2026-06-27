"use client";

import { useCallback, useMemo } from "react";
import { triggerHapticFeedback } from "@/lib/haptics";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export function useHaptic() {
  const prefersReducedMotion = useReducedMotion();
  const trigger = useCallback((pattern: number | number[]) => {
    if (prefersReducedMotion) return;
    triggerHapticFeedback(pattern);
  }, [prefersReducedMotion]);
  const light = useCallback(() => trigger(10), [trigger]);
  const medium = useCallback(() => trigger(25), [trigger]);
  const heavy = useCallback(() => trigger(50), [trigger]);
  const success = useCallback(() => trigger([10, 50, 10]), [trigger]);
  const error = useCallback(() => trigger([50, 30, 50]), [trigger]);

  return useMemo(() => ({ light, medium, heavy, success, error }), [error, heavy, light, medium, success]);
}
