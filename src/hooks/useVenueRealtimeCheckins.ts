"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";

export type RecentCheckIn = {
  id: string;
  createdAt: string;
  busyness: string;
};

type VenueRealtimeCheckinsState = {
  recentCheckIns: RecentCheckIn[];
  liveCount: number;
};

const LIVE_WINDOW_HOURS = 2;

function liveCutoffIso(): string {
  return new Date(Date.now() - LIVE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
}

function normalizeRecentCheckIn(value: unknown): RecentCheckIn | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  const createdAt = typeof row.createdAt === "string"
    ? row.createdAt
    : typeof row.created_at === "string"
      ? row.created_at
      : "";
  const busyness = typeof row.busyness === "string"
    ? row.busyness
    : typeof row.busynessLevel === "string"
      ? row.busynessLevel
      : "reported";

  if (!id || !createdAt) return null;
  return { id, createdAt, busyness };
}

function normalizePayload(payload: unknown): RecentCheckIn[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: { checkIns?: unknown } })?.data?.checkIns)
      ? (payload as { data: { checkIns: unknown[] } }).data.checkIns
      : [];

  return rows.map(normalizeRecentCheckIn).filter((item): item is RecentCheckIn => item !== null);
}

function countLive(checkIns: RecentCheckIn[]): number {
  const cutoff = new Date(liveCutoffIso()).getTime();
  return checkIns.filter((checkIn) => {
    const createdAt = new Date(checkIn.createdAt).getTime();
    return Number.isFinite(createdAt) && createdAt >= cutoff;
  }).length;
}

export function useVenueRealtimeCheckins(venueId: string | null | undefined): VenueRealtimeCheckinsState {
  const [state, setState] = useState<VenueRealtimeCheckinsState>({ recentCheckIns: [], liveCount: 0 });

  useEffect(() => {
    const normalizedVenueId = venueId?.trim();
    if (!normalizedVenueId) {
      setState({ recentCheckIns: [], liveCount: 0 });
      return;
    }
    const venueIdForRequests = normalizedVenueId;

    let cancelled = false;
    const client = createBrowserClient();

    async function refresh() {
      try {
        const res = await fetch(`/api/venues/${encodeURIComponent(venueIdForRequests)}/check-ins`);
        if (!res.ok) throw new Error(`${res.status}`);
        const recentCheckIns = normalizePayload(await res.json()).slice(0, 10);
        if (!cancelled) setState({ recentCheckIns, liveCount: countLive(recentCheckIns) });
      } catch {
        if (!cancelled) setState({ recentCheckIns: [], liveCount: 0 });
      }
    }

    void refresh();

    const channel = client
      .channel(`venue-check-ins:${venueIdForRequests}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "check_ins", filter: `venue_id=eq.${venueIdForRequests}` },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void client.removeChannel(channel);
    };
  }, [venueId]);

  return state;
}
