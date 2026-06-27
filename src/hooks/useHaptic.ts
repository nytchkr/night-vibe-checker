"use client";

import { triggerHapticFeedback } from "@/lib/haptics";

export function useHaptic() {
  const success = () => triggerHapticFeedback([50, 30, 50]);
  const error = () => triggerHapticFeedback([200]);
  const light = () => triggerHapticFeedback(10);
  const medium = () => triggerHapticFeedback(25);
  const heavy = () => triggerHapticFeedback(50);

  return { success, error, light, medium, heavy };
}
