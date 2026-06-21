"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { getBusynessState } from "@/lib/busyness";
import { VENUE_PHOTO_BLUR_DATA_URL } from "@/lib/imagePlaceholders";
import type { ConsumerVenue } from "@/types";

function getCategoryIcon(category: string | null | undefined): string {
  const value = (category ?? "").toLowerCase();
  if (value.includes("night_club") || value.includes("nightclub") || value.includes("club")) return "🎵";
  if (value.includes("restaurant") || value.includes("food")) return "🍽";
  if (value.includes("bar")) return "🍺";
  return "📍";
}

function BusynessBadge({ value }: { value: number | null | undefined }) {
  const state = getBusynessState(value);

  return (
    <span
      className="inline-flex max-w-full items-center rounded-full border px-2 py-1 text-[11px] font-black leading-none"
      style={
        state.level
          ? { borderColor: `${state.color}59`, backgroundColor: `${state.color}24`, color: state.color }
          : { borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }
      }
    >
      {state.level ? state.label : "No data"}
    </span>
  );
}

function TrendingCard({ venue }: { venue: ConsumerVenue }) {
  return (
    <Link
      href={`/venues/${encodeURIComponent(venue.id)}`}
      className="flex w-[210px] shrink-0 snap-start gap-3 rounded-xl bg-white/[0.04] p-2 transition-colors hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60"
      aria-label={`Open ${venue.name}`}
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-white/[0.06]">
        {venue.photoUrl ? (
          <Image
            src={venue.photoUrl}
            alt={venue.name}
            fill
            sizes="80px"
            placeholder="blur"
            blurDataURL={VENUE_PHOTO_BLUR_DATA_URL}
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl" aria-hidden="true">
            {getCategoryIcon(venue.category)}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <h2 className="line-clamp-2 text-sm font-black leading-snug text-white">{venue.name}</h2>
        <BusynessBadge value={venue.signal?.busyness0To100} />
      </div>
    </Link>
  );
}

function TrendingSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-hidden" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-[100px] w-[80px] shrink-0 rounded-xl bg-white/[0.04] animate-pulse"
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
      <section className="space-y-3" aria-label="Trending Tonight loading">
        <TrendingSkeleton />
      </section>
    );
  }

  return (
    <section className="space-y-3" aria-label="Trending Tonight">
      <h2 className="text-sm font-black text-white">🔥 Trending Tonight</h2>
      <div className="flex snap-x gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {venues.map((venue) => (
          <TrendingCard key={venue.id} venue={venue} />
        ))}
      </div>
    </section>
  );
}
