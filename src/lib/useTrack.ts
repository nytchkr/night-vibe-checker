"use client";

import { useCallback } from "react";

type TrackOptions = {
  venueId?: string;
  meta?: Record<string, unknown>;
};

export function useTrack() {
  return useCallback(async (event: string, opts: TrackOptions = {}) => {
    try {
      await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, ...opts }),
      });
    } catch {
      // Analytics must never block the user flow.
    }
  }, []);
}
