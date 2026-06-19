"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConsumerVenue } from "@/types";

function busynessLabel(value: number | null | undefined) {
  if (value == null) return "No read yet";
  if (value >= 75) return "Packed";
  if (value >= 40) return "Moderate";
  return "Dead";
}

function signalSubtext(venue: ConsumerVenue) {
  const signal = venue.signal;
  if (!signal?.busynessSource) return "No live reads yet";
  const source = signal.busynessSource === "crowd" ? "Crowd read" : signal.busynessSource;
  if (signal.mfRatio == null) return `${source} · M/F hidden`;
  return `${source} · ${signal.mfRatio}% male`;
}

function VenueRow({ venue }: { venue: ConsumerVenue }) {
  const busyness = venue.signal?.busyness0To100 ?? null;
  return (
    <li className="overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.04]">
      {venue.photoUrl ? (
        <img src={venue.photoUrl} alt="" className="h-36 w-full object-cover" />
      ) : (
        <div className="h-24 w-full bg-white/[0.06]" />
      )}
      <div className="flex items-center gap-3 p-4">
        <div className="flex-1 min-w-0">
          <p className="truncate text-base font-bold text-white">{venue.name}</p>
          <p className="mt-1 truncate text-xs text-white/42">{venue.address}</p>
          <p className="mt-2 text-xs font-semibold text-[#00F5D4]">
            {busynessLabel(busyness)}{busyness == null ? "" : ` · ${busyness}%`}
          </p>
          <p className="mt-1 text-[11px] text-white/35">{signalSubtext(venue)}</p>
        </div>
        <Link
          href={`/vibe-check?venueId=${encodeURIComponent(venue.id)}&venueName=${encodeURIComponent(venue.name)}`}
          className="flex min-h-[44px] shrink-0 items-center rounded-full border border-[#00F5D4]/50 px-3 text-xs font-bold text-[#00F5D4] transition-colors hover:bg-[#00F5D4]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60"
        >
          Report
        </Link>
      </div>
    </li>
  );
}

function VenueSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.04]">
      <Skeleton className="h-24 w-full rounded-none bg-white/10" />
      <div className="flex items-center gap-3 p-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3 bg-white/10" />
          <Skeleton className="h-3 w-1/2 bg-white/10" />
          <Skeleton className="h-3 w-1/3 bg-white/10" />
        </div>
        <Skeleton className="h-10 w-20 rounded-full bg-white/10" />
      </div>
    </div>
  );
}

export default function HomePage() {
  const [venues, setVenues] = useState<ConsumerVenue[]>([]);
  const [zoneName, setZoneName] = useState("South End, Charlotte");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVenues = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/venues");
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setVenues(json?.data?.venues ?? []);
      setZoneName(json?.data?.zone?.name ?? "South End, Charlotte");
    } catch {
      setError("Could not load South End venues.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchVenues(false);
  }, [fetchVenues]);

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <header className="px-4 pt-10 pb-5">
        <div className="mx-auto max-w-lg">
          <h1 className="text-[1.65rem] font-black leading-tight text-white">VibeCheck</h1>
          <p className="mt-1 text-sm text-white/42">{zoneName}</p>
          <button
            type="button"
            onClick={() => fetchVenues(true)}
            disabled={refreshing}
            className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-sm font-bold text-white/70 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh cached reads"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-3 px-4 pb-32">
        {error && (
          <div role="alert" className="rounded-2xl border border-rose-500/40 bg-rose-950/60 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-3" role="status" aria-label="Loading venues">
            {Array.from({ length: 4 }).map((_, index) => <VenueSkeleton key={index} />)}
          </div>
        )}

        {!loading && !error && venues.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
            <p className="text-sm font-semibold text-white">No venues cached yet.</p>
            <p className="mt-2 text-xs text-white/40">Run the protected Places discovery job first.</p>
          </div>
        )}

        {!loading && !error && venues.length > 0 && (
          <ul className="space-y-3">
            {venues.map((venue) => <VenueRow key={venue.id} venue={venue} />)}
          </ul>
        )}
      </main>
    </div>
  );
}
