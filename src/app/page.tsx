"use client";

// ============================================================
// Home — Map-first venue feed  (NV-071)
//
// Fetches GET /api/check-ins?limit=20 to get recent crowd
// reports, then renders a scrollable card list with:
//   • busyness color bar
//   • venue name
//   • M/F ratio placeholder (gray "No reads yet")
//   • "Report →" deep-link into /vibe-check
//
// No Mapbox yet — map integration is a future ticket.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { MFRatioBar } from "@/components/MFRatioBar";
import type { ConsumerCheckIn } from "@/types";

// --------------- Busyness helpers ----------------------------

type BusynessLevel = "dead" | "moderate" | "packed";

function busynessColor(busyness: BusynessLevel): string {
  switch (busyness) {
    case "packed":   return "#EF4444";
    case "moderate": return "#F59E0B";
    case "dead":     return "#22C55E";
  }
}

function busynessLabel(busyness: BusynessLevel): string {
  switch (busyness) {
    case "packed":   return "Packed";
    case "moderate": return "Moderate";
    case "dead":     return "Quiet";
  }
}

function CrowdBar({ busyness }: { busyness: BusynessLevel }) {
  const color = busynessColor(busyness);
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}80` }}
        aria-hidden="true"
      />
      <span className="text-xs font-semibold" style={{ color }}>
        {busynessLabel(busyness)}
      </span>
    </div>
  );
}

// --------------- Helpers for de-duplicating check-ins --------

interface VenueRollup {
  venueId: string;
  venueName: string;
  latestBusyness: BusynessLevel;
  latestCheckin: ConsumerCheckIn;
}

function rollupByVenue(checkIns: ConsumerCheckIn[]): VenueRollup[] {
  const seen = new Map<string, VenueRollup>();
  for (const ci of checkIns) {
    if (!seen.has(ci.venueId)) {
      seen.set(ci.venueId, {
        venueId: ci.venueId,
        venueName: ci.venueName ?? ci.venueId,
        latestBusyness: ci.busyness as BusynessLevel,
        latestCheckin: ci,
      });
    }
  }
  return Array.from(seen.values());
}

// --------------- Card component ------------------------------

function CheckInCard({ rollup }: { rollup: VenueRollup }) {
  const params = new URLSearchParams({
    venueId: rollup.venueId,
    venueName: rollup.venueName,
  });

  return (
    <li className="overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.04]">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="truncate text-base font-bold text-white">{rollup.venueName}</p>
            <div className="mt-2">
              <CrowdBar busyness={rollup.latestBusyness} />
            </div>
            <div className="mt-3">
              <MFRatioBar malePercent={null} confidence={null} sampleSize={0} />
            </div>
          </div>
          <Link
            href={`/vibe-check?${params.toString()}`}
            className="flex min-h-[44px] shrink-0 items-center rounded-full border border-[#7C3AED]/60 px-3 text-xs font-bold text-[#7C3AED] transition-colors hover:bg-[#7C3AED]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/60"
          >
            Report →
          </Link>
        </div>
      </div>
    </li>
  );
}

// --------------- Loading skeleton ---------------------------

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-4 w-2/3 bg-white/10" />
          <Skeleton className="h-3 w-1/4 bg-white/10" />
          <Skeleton className="h-2 w-full bg-white/10 rounded-full" />
        </div>
        <Skeleton className="h-9 w-20 rounded-full bg-white/10" />
      </div>
    </div>
  );
}

// --------------- Page ----------------------------------------

export default function HomePage() {
  const [rollups, setRollups] = useState<VenueRollup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/check-ins?limit=20");
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      const checkIns: ConsumerCheckIn[] = json?.data?.checkIns ?? [];
      setRollups(rollupByVenue(checkIns));
    } catch {
      setError("Could not load tonight's reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <header className="px-4 pt-10 pb-5">
        <div className="mx-auto max-w-lg">
          <h1 className="text-[1.65rem] font-black leading-tight text-white">
            How&apos;s South End tonight?
          </h1>
          <p className="mt-1 text-sm text-white/42">Live crowd reads from the last 20 reports</p>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4">
        <div
          className="mb-5 flex h-28 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03]"
          aria-label="Map coming soon"
        >
          <p className="text-sm text-white/25">Map view — coming soon</p>
        </div>
      </div>

      <main className="mx-auto max-w-lg space-y-3 px-4 pb-32">
        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-sm text-rose-300"
          >
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-3" role="status" aria-label="Loading reports">
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        )}

        {!loading && !error && rollups.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
            <p className="text-sm font-semibold text-white">
              No reports tonight — be the first
            </p>
            <Link
              href="/vibe-check"
              className="mt-4 inline-flex min-h-[44px] items-center rounded-full bg-[#7C3AED] px-5 text-sm font-bold text-white transition-all hover:bg-[#6D28D9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/60"
            >
              Report the Vibe
            </Link>
          </div>
        )}

        {!loading && !error && rollups.length > 0 && (
          <ul className="space-y-3">
            {rollups.map((r) => (
              <CheckInCard key={r.venueId} rollup={r} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
