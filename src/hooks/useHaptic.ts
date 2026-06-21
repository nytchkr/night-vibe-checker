"use client";

import { useCallback, useMemo } from "react";
import { triggerHapticFeedback } from "@/lib/haptics";

export function useHaptic() {
  const light = useCallback(() => triggerHapticFeedback(10), []);
  const medium = useCallback(() => triggerHapticFeedback(25), []);
  const heavy = useCallback(() => triggerHapticFeedback(50), []);
  const success = useCallback(() => triggerHapticFeedback([10, 50, 10]), []);
  const error = useCallback(() => triggerHapticFeedback([50, 30, 50]), []);

  return useMemo(() => ({ light, medium, heavy, success, error }), [error, heavy, light, medium, success]);
}
