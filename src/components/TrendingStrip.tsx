"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBusynessState } from "@/lib/busyness";
import type { ConsumerVenue } from "@/types";

function getCategoryIcon(category: string | null | undefined): string {
  const value = (category ?? "").toLowerCase();
  if (value.includes("night_club") || value.includes("nightclub") || value.includes("club")) return "🎵";
  if (value.includes("restaurant") || value.includes("food")) return "🍽";
  if (value.includes("bar")) return "🍺";
  return "📍";
}

function TrendingCard({ venue }: { venue: ConsumerVenue }) {
  const busyness = venue.signal?.busyness0To100 ?? 0;
  const roundedBusyness = Math.round(Math.min(100, Math.max(0, busyness)));
  const state = getBusynessState(roundedBusyness);

  return (
    <Link
      href={`/venues/${encodeURIComponent(venue.id)}`}
      className="flex min-h-[92px] w-[156px] shrink-0 snap-start flex-col justify-between rounded-2xl border border-white/[0.08] bg-white/[0.045] p-3 transition-colors hover:border-white/[0.16] hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
      aria-label={`Open ${venue.name}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-lg" aria-hidden="true">
          {getCategoryIcon(venue.category)}
        </span>
        <span
          className="shrink-0 rounded-full border px-2 py-1 text-[12px] font-black leading-none"
          style={{ borderColor: `${state.color}59`, backgroundColor: `${state.color}24`, color: state.color }}
        >
          {roundedBusyness}%
        </span>
      </div>
      <h2 className="mt-3 line-clamp-2 font-display text-[15px] font-black leading-tight text-white">
        {venue.name}
      </h2>
    </Link>
  );
}

function TrendingSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-hidden" role="status" aria-label="Loading Trending Now">
      <span className="sr-only">Loading Trending Now...</span>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-[92px] w-[156px] shrink-0 rounded-2xl border border-white/[0.08] bg-white/[0.04] animate-pulse"
        />
      ))}
    </div>
  );
}

export function TrendingStrip() {
  const [venues, setVenues] = useState<ConsumerVenue[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTrending() {
      try {
        const res = await fetch("/api/venues/trending");
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        if (!cancelled) setVenues(json?.data?.venues ?? []);
      } catch {
        if (!cancelled) setVenues([]);
      }
    }

    void fetchTrending();
    return () => {
      cancelled = true;
    };
  }, []);

  if (venues !== null && venues.length === 0) {
    return null;
  }

  if (venues === null) {
    return (
      <section className="space-y-3" aria-label="Trending Now loading">
        <h2 className="font-display text-sm font-black text-white">Trending Now</h2>
        <TrendingSkeleton />
      </section>
    );
  }

  return (
    <section className="space-y-3" aria-label="Trending Now">
      <h2 className="font-display text-sm font-black text-white">Trending Now</h2>
      <div className="scroll-touch flex snap-x gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [will-change:scroll-position] [&::-webkit-scrollbar]:hidden">
        {venues.map((venue) => (
          <TrendingCard key={venue.id} venue={venue} />
        ))}
      </div>
    </section>
  );
}
