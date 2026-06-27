"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { VenuePhoto } from "@/components/VenuePhoto";
import type { APIResponse, ConsumerVenue } from "@/types";

const VIOLET = "#8B6CFF";
const PINK = "#F0568C";

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

function TrendingVenueCard({ venue }: { venue: ConsumerVenue }) {
  const busyness = clampBusyness(venue.signal?.busyness0To100);
  const isLive = venue.signal?.busynessSource === "live";
  const barWidth = busyness ?? 0;

  return (
    <Link
      href={`/venues/${encodeURIComponent(venue.id)}`}
      className="group flex min-h-[148px] w-40 shrink-0 snap-start flex-col overflow-hidden rounded-[18px] border border-white/[0.06] bg-white/[0.035] shadow-lg shadow-black/10 backdrop-blur-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      aria-label={`Open ${venue.name}`}
    >
      <VenuePhoto
        name={venue.name}
        photoUrl={venue.photoUrl ?? venue.photoUrls?.[0]}
        className="h-16 w-full border-b border-white/[0.06]"
        sizes="160px"
      />
      <div className="flex items-start justify-between gap-2 px-3 pt-3">
        <span className="rounded-full border border-white/[0.08] bg-white/[0.06] px-2 py-1 text-[11px] font-black leading-none text-white/70">
          {busyness == null ? "No data" : `${busyness}%`}
        </span>
        {isLive ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black leading-none text-[#0A0A0E]"
            style={{ backgroundColor: PINK }}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0A0A0E]" aria-hidden="true" />
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
            className="h-full rounded-full transition-[width]"
            style={{ width: `${barWidth}%`, backgroundColor: VIOLET }}
          />
        </div>
      </div>
    </Link>
  );
}

export function TrendingRow() {
  const [venues, setVenues] = useState<ConsumerVenue[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTrending() {
      try {
        const res = await fetch("/api/venues/trending", { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error(`${res.status}`);
        const json = (await res.json()) as APIResponse<{ venues?: ConsumerVenue[] }>;
        setVenues(Array.isArray(json.data?.venues) ? json.data.venues.slice(0, 5) : []);
      } catch {
        if (!controller.signal.aborted) setVenues([]);
      }
    }

    void loadTrending();
    return () => controller.abort();
  }, []);

  return (
    <section className="space-y-3" aria-label="Trending Now">
      <h2 className="font-display text-sm font-black tracking-tight text-white">Trending Now 🔥</h2>
      {venues === null ? (
        <TrendingSkeleton />
      ) : venues.length === 0 ? (
        <div className="rounded-[18px] border border-white/[0.06] bg-white/[0.035] p-4 text-sm font-semibold text-white/55 shadow-lg shadow-black/10 backdrop-blur-sm">
          Check back tonight for trending spots
        </div>
      ) : (
        <div className="scroll-touch flex snap-x gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [will-change:scroll-position] [&::-webkit-scrollbar]:hidden">
          {venues.map((venue) => (
            <TrendingVenueCard key={venue.id} venue={venue} />
          ))}
        </div>
      )}
    </section>
  );
}

export default TrendingRow;
