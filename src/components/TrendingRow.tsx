"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flame } from "lucide-react";
import { prefetchRoute } from "@/components/RoutePrefetch";
import { SignalFreshnessLabel } from "@/components/SignalFreshnessLabel";
import { VenuePhoto } from "@/components/VenuePhoto";
import type { APIResponse, ConsumerVenue } from "@/types";

const VIOLET = "#8B6CFF";
const PINK = "#F0568C";
const TRENDING_RERANK_DEBOUNCE_MS = 450;
const CHECK_IN_CREATED_EVENT = "nightvibe:check-in-created";

function clampBusyness(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function TrendingSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" role="status" aria-label="Loading Trending Now">
      <span className="sr-only">Loading Trending Now...</span>
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-[112px] w-40 shrink-0 rounded-[18px] border border-white/[0.08] bg-white/[0.045] p-3"
        >
          <div className="h-3 w-20 animate-pulse rounded-full bg-white/[0.08]" />
          <div className="mt-3 h-4 w-28 animate-pulse rounded-full bg-white/[0.1]" />
          <div className="mt-6 h-2 w-full animate-pulse rounded-full bg-white/[0.08]" />
        </div>
      ))}
    </div>
  );
}

function TrendingBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#F0568C]/40 bg-[#F0568C]/12 px-2 py-1 text-[10px] font-black uppercase leading-none text-[#F0568C]">
      <Flame className="h-3 w-3 fill-[#F0568C] text-[#F0568C]" aria-hidden="true" />
      Trending
    </span>
  );
}

function TrendingVenueCard({ venue, trendingRank }: { venue: ConsumerVenue; trendingRank: number }) {
  const busyness = clampBusyness(venue.signal?.busyness0To100);
  const isLive = venue.signal?.busynessSource === "live";
  const barWidth = busyness ?? 0;
  const showTrendingBadge = trendingRank <= 3;

  return (
    <Link
      href={`/venues/${encodeURIComponent(venue.id)}`}
      className="venue-card-motion group flex min-h-[148px] w-40 shrink-0 snap-start flex-col overflow-hidden rounded-[18px] border border-white/[0.06] bg-white/[0.035] shadow-lg shadow-black/10 backdrop-blur-sm hover:-translate-y-0.5 hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      aria-label={`Open ${venue.name}`}
    >
      <VenuePhoto
        name={venue.name}
        photoUrl={venue.photoUrl ?? venue.photoUrls?.[0]}
        className="h-16 w-full border-b border-white/[0.06]"
        sizes="(max-width: 640px) 160px, 180px"
        loading="lazy"
      />
      <div className="flex items-start justify-between gap-2 px-3 pt-3">
        <span className="rounded-full border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[11px] font-black leading-none text-white/70">
          {busyness == null ? "No data" : `${busyness}%`}
        </span>
        {showTrendingBadge ? (
          <TrendingBadge />
        ) : isLive ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black leading-none text-[#0A0A0E]"
            style={{ backgroundColor: PINK }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#0A0A0E] venue-trending-dot" aria-hidden="true" />
            LIVE
          </span>
        ) : null}
      </div>

      <h2 className="mt-3 line-clamp-2 px-3 text-[15px] font-black leading-tight tracking-tight text-white">
        {venue.name}
      </h2>

      <div className="mt-auto px-3 pb-3 pt-3" aria-label={busyness == null ? "No busyness data" : `${busyness}% busy`}>
        <div className="h-2 overflow-hidden rounded-full bg-white/[0.09]">
          <div
            className="venue-fill-motion h-full rounded-full"
            style={{ width: `${barWidth}%`, backgroundColor: VIOLET }}
          />
        </div>
        {busyness == null ? null : (
          <SignalFreshnessLabel signal={venue.signal} className="mt-2 block" />
        )}
      </div>
    </Link>
  );
}

export function TrendingRow() {
  const router = useRouter();
  const [venues, setVenues] = useState<ConsumerVenue[] | null>(null);
  const rerankTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTrending() {
      try {
        const res = await fetch("/api/venues/trending", { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error(`${res.status}`);
        const json = (await res.json()) as APIResponse<{ venues?: ConsumerVenue[] }>;
        const nextVenues = Array.isArray(json.data?.venues) ? json.data.venues.slice(0, 5) : [];
        if (rerankTimerRef.current) window.clearTimeout(rerankTimerRef.current);
        rerankTimerRef.current = window.setTimeout(() => {
          setVenues(nextVenues);
          rerankTimerRef.current = null;
        }, TRENDING_RERANK_DEBOUNCE_MS);
      } catch {
        if (!controller.signal.aborted) setVenues([]);
      }
    }

    void loadTrending();
    window.addEventListener(CHECK_IN_CREATED_EVENT, loadTrending);

    return () => {
      controller.abort();
      window.removeEventListener(CHECK_IN_CREATED_EVENT, loadTrending);
      if (rerankTimerRef.current) window.clearTimeout(rerankTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!venues?.length) return;

    for (const venue of venues) {
      prefetchRoute(router, `/venues/${encodeURIComponent(venue.id)}`);
    }
  }, [router, venues]);

  return (
    <section className="space-y-3" aria-label="Trending Now">
      <h2 className="font-display text-sm font-black tracking-tight text-white">Trending Now</h2>
      {venues === null ? (
        <TrendingSkeleton />
      ) : venues.length === 0 ? (
        <div className="rounded-[18px] border border-white/[0.06] bg-white/[0.035] p-4 text-sm font-semibold text-white/55 shadow-lg shadow-black/10 backdrop-blur-sm">
          Check back tonight for trending spots
        </div>
      ) : (
        <div className="scroll-touch flex snap-x gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [will-change:scroll-position] [&::-webkit-scrollbar]:hidden">
          {venues.map((venue, index) => (
            <TrendingVenueCard key={venue.id} venue={venue} trendingRank={index + 1} />
          ))}
        </div>
      )}
    </section>
  );
}

export default TrendingRow;
