"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { MFRatioBar } from "@/components/MFRatioBar";
import type { ConsumerVenue, VenueSignal } from "@/types";

type BusynessState = {
  label: "No data yet" | "Quiet" | "Moderate" | "Packed";
  color: string;
};

function getBusynessState(value: number | null | undefined): BusynessState {
  if (value == null) return { label: "No data yet", color: "#6B7280" };
  if (value <= 33) return { label: "Quiet", color: "#22C55E" };
  if (value <= 66) return { label: "Moderate", color: "#F59E0B" };
  return { label: "Packed", color: "#EF4444" };
}

function SourceBadge({ source }: { source: VenueSignal["busynessSource"] | undefined }) {
  if (!source) return null;
  const isLive = source === "live";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/55">
      {isLive && (
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22C55E] opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
        </span>
      )}
      {source}
    </span>
  );
}

function BusynessPill({ value }: { value: number | null | undefined }) {
  const state = getBusynessState(value);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs font-bold text-white/75">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: state.color, boxShadow: `0 0 10px ${state.color}80` }}
        aria-hidden="true"
      />
      {state.label}
    </span>
  );
}

function VenuePhoto({ venue }: { venue: ConsumerVenue }) {
  if (venue.photoUrl) {
    return (
      <img
        src={venue.photoUrl}
        alt=""
        className="h-20 w-full rounded-lg object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <div className="flex h-20 w-full items-center justify-center rounded-lg bg-white/[0.06] text-xs font-semibold text-white/25">
      No photo
    </div>
  );
}

function VenueFeedCard({ venue }: { venue: ConsumerVenue }) {
  const signal = venue.signal;
  const reportParams = new URLSearchParams({
    venueId: venue.id,
    venueName: venue.name,
  });
  const vibeCheckHref = `/vibe-check?${reportParams.toString()}`;

  return (
    <li className="overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.04] p-3">
      <Link
        href={`/venues/${encodeURIComponent(venue.id)}`}
        className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
        aria-label={`Open ${venue.name}`}
      >
        <VenuePhoto venue={venue} />
      </Link>

      <div className="mt-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href={`/venues/${encodeURIComponent(venue.id)}`}
              className="block truncate text-base font-bold text-white transition-colors hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
            >
              {venue.name}
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <BusynessPill value={signal?.busyness0To100} />
              <SourceBadge source={signal?.busynessSource} />
            </div>
          </div>

          <Link
            href={vibeCheckHref}
            className="flex min-h-[44px] shrink-0 items-center rounded-full border border-[#7C3AED]/60 px-3 text-xs font-bold text-[#C4B5FD] transition-colors hover:bg-[#7C3AED]/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/60"
          >
            Report →
          </Link>
        </div>

        {signal?.mfRatio != null ? (
          <MFRatioBar
            malePercent={signal.mfRatio}
            confidence={signal.confidence0To1}
            sampleSize={Math.max(signal.sampleSize, 3)}
          />
        ) : (
          <p className="text-xs font-medium text-white/32">No reads yet</p>
        )}
      </div>
    </li>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-3">
      <Skeleton className="h-20 rounded-lg bg-white/10" />
      <div className="mt-3 space-y-3">
        <Skeleton className="h-4 w-2/3 bg-white/10" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-24 rounded-full bg-white/10" />
          <Skeleton className="h-5 w-16 rounded-full bg-white/10" />
        </div>
        <Skeleton className="h-2 w-full rounded-full bg-white/10" />
      </div>
    </div>
  );
}

export default function HomePage() {
  const [venues, setVenues] = useState<ConsumerVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVenues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/venues");
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setVenues(json?.data?.venues ?? []);
    } catch {
      setError("Could not load venues.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  const sortedVenues = useMemo(() => {
    return [...venues].sort((a, b) => {
      const aBusy = a.signal?.busyness0To100;
      const bBusy = b.signal?.busyness0To100;
      if (aBusy == null && bBusy == null) return a.name.localeCompare(b.name);
      if (aBusy == null) return 1;
      if (bBusy == null) return -1;
      return bBusy - aBusy || a.name.localeCompare(b.name);
    });
  }, [venues]);

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <header className="px-4 pb-5 pt-10">
        <div className="mx-auto max-w-lg">
          <h1 className="text-[1.65rem] font-black leading-tight text-white">
            How&apos;s South End tonight?
          </h1>
          <p className="mt-1 text-sm text-white/42">Live and forecast crowd reads from local venues</p>
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
          <div className="space-y-3" role="status" aria-label="Loading venues">
            <p className="sr-only">Loading venues...</p>
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        )}

        {!loading && !error && sortedVenues.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
            <p className="text-sm font-semibold text-white">
              No venues yet. Discovery job seeds South End venues.
            </p>
          </div>
        )}

        {!loading && !error && sortedVenues.length > 0 && (
          <ul className="space-y-3">
            {sortedVenues.map((venue) => (
              <VenueFeedCard key={venue.id} venue={venue} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
