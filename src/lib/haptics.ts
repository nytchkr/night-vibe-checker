"use client";

export const HAPTICS_STORAGE_KEY = "nightvibe.haptics";

export type HapticsPreference = "on" | "off";
export type HapticPattern = number | number[];

export function getHapticsPreference(): HapticsPreference {
  if (typeof window === "undefined") return "on";

  try {
    return window.localStorage.getItem(HAPTICS_STORAGE_KEY) === "off" ? "off" : "on";
  } catch {
    return "on";
  }
}

export function setHapticsPreference(preference: HapticsPreference) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(HAPTICS_STORAGE_KEY, preference);
  } catch {
    // Local storage can be unavailable in private or constrained browser contexts.
  }
}

export function triggerHapticFeedback(pattern: HapticPattern) {
  if (typeof navigator === "undefined") return;
  if (getHapticsPreference() !== "on") return;

  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Haptics are progressive enhancement only.
  }
}
