"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Session } from "@supabase/supabase-js";
import { Skeleton } from "@/components/ui/skeleton";
import { MFRatioBar } from "@/components/MFRatioBar";
import { OnboardingOverlay } from "@/components/OnboardingOverlay";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { ConsumerVenue, VenueSignal } from "@/types";

const blurDataUrl =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAzMiAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjMEEwQTBGIi8+PHN0b3Agb2Zmc2V0PSIuNSIgc3RvcC1jb2xvcj0iIzJEMTk1RiIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzAwRjVENCIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSIzMiIgaGVpZ2h0PSIyNCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg==";

type BusynessState = {
  label: "No data yet" | "Quiet" | "Moderate" | "Packed";
  color: string;
  rank: number;
};

function getBusynessState(value: number | null | undefined): BusynessState {
  if (value == null) return { label: "No data yet", color: "#6B7280", rank: 0 };
  if (value <= 33) return { label: "Quiet", color: "#22C55E", rank: 1 };
  if (value <= 66) return { label: "Moderate", color: "#F59E0B", rank: 2 };
  return { label: "Packed", color: "#EF4444", rank: 3 };
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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#0A0A0F]/80 px-2.5 py-1 text-xs font-bold text-white/85 shadow-lg backdrop-blur-md">
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
      <span className="relative block h-32 w-full overflow-hidden rounded-xl">
        <Image
          src={venue.photoUrl}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, 512px"
          placeholder="blur"
          blurDataURL={blurDataUrl}
        />
      </span>
    );
  }

  return (
    <div className="flex h-32 w-full items-center justify-center rounded-xl bg-white/[0.06] text-xs font-semibold text-white/25">
      No photo
    </div>
  );
}

function reportHref(path: string, session: Session | null): string {
  return session ? path : `/login?return=${encodeURIComponent(path)}`;
}

function VenueFeedCard({ venue, session }: { venue: ConsumerVenue; session: Session | null }) {
  const signal = venue.signal;
  const busyness = getBusynessState(signal?.busyness0To100);
  const reportParams = new URLSearchParams({
    venueId: venue.id,
    venueName: venue.name,
  });
  const vibeCheckHref = `/vibe-check?${reportParams.toString()}`;

  return (
    <li
      className={`overflow-hidden rounded-2xl border bg-white/[0.04] p-3 transition-shadow ${
        busyness.label === "Packed"
          ? "border-[#EF4444]/45 shadow-[0_0_24px_rgba(239,68,68,0.16)]"
          : "border-white/[0.09]"
      }`}
    >
      <Link
        href={`/venues/${encodeURIComponent(venue.id)}`}
        className="relative block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
        aria-label={`Open ${venue.name}`}
      >
        <VenuePhoto venue={venue} />
        <span className="absolute right-2 top-2">
          <BusynessPill value={signal?.busyness0To100} />
        </span>
      </Link>

      <div className="mt-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href={`/venues/${encodeURIComponent(venue.id)}`}
              className="block truncate text-lg font-black leading-tight text-white transition-colors hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
            >
              {venue.name}
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SourceBadge source={signal?.busynessSource} />
            </div>
          </div>

          <Link
            href={reportHref(vibeCheckHref, session)}
            className="flex min-h-[44px] shrink-0 items-center rounded-full bg-[#7C3AED] px-4 text-xs font-black text-white shadow-[0_0_18px_rgba(124,58,237,0.24)] transition-colors hover:bg-[#6D28D9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/60"
          >
            {session ? "Report" : "Sign in"}
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
      <Skeleton className="h-32 rounded-xl bg-white/10" />
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
  const [session, setSession] = useState<Session | null>(null);
  const [venues, setVenues] = useState<ConsumerVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

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

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const client = createBrowserClient();

    client.auth.getSession().then(({ data }) => setSession(data.session));

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const sortedVenues = useMemo(() => {
    return [...venues].sort((a, b) => {
      const aState = getBusynessState(a.signal?.busyness0To100);
      const bState = getBusynessState(b.signal?.busyness0To100);
      return bState.rank - aState.rank || a.name.localeCompare(b.name);
    });
  }, [venues]);

  const timeLabel = useMemo(() => (
    now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  ), [now]);

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <OnboardingOverlay />

      <header className="px-4 pb-5 pt-10">
        <div className="mx-auto max-w-lg">
          <div className="mb-3 flex items-center justify-between gap-3 text-xs font-semibold text-white/45">
            <div className="flex min-w-0 items-center gap-1.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0 text-[#00F5D4]/70"
              >
                <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="truncate">South End Charlotte</span>
            </div>
            <time className="shrink-0 text-white/35">{timeLabel}</time>
          </div>
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
              <VenueFeedCard key={venue.id} venue={venue} session={session} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
