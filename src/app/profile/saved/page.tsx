"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Heart } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { UpgradeButton } from "@/components/UpgradeButton";
import { Skeleton } from "@/components/ui/skeleton";
import { useSavedVenues, type SavedVenue } from "@/hooks/useSavedVenues";

type SavedCategoryFilter = "All" | "Bars" | "Clubs" | "Lounges" | "Restaurants";

type SavedVenueItem = {
  id: string;
  name: string;
  category: string;
  address?: string;
};

const CATEGORY_FILTERS: SavedCategoryFilter[] = ["All", "Bars", "Clubs", "Lounges", "Restaurants"];

const CATEGORY_MATCHERS: Record<Exclude<SavedCategoryFilter, "All">, string[]> = {
  Bars: ["bar", "pub", "brewery", "taproom"],
  Clubs: ["club", "dance", "nightclub"],
  Lounges: ["lounge", "cocktail"],
  Restaurants: ["restaurant", "food", "dining", "kitchen"],
};

function toSavedVenueItem(savedVenue: SavedVenue): SavedVenueItem {
  const venue = savedVenue.venue;
  if (!venue) return { id: savedVenue.venueId, name: savedVenue.venueId, category: "Saved venue" };

  return {
    id: venue.id,
    name: venue.name,
    category: venue.category,
    address: venue.address,
  };
}

function venueMatchesCategory(venue: SavedVenueItem, filter: SavedCategoryFilter): boolean {
  if (filter === "All") return true;

  const category = venue.category.toLowerCase().replace(/[_-]+/g, " ");
  return CATEGORY_MATCHERS[filter].some((term) => category.includes(term));
}

function LoadingRows() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading...">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-20 rounded-[18px]" />
      ))}
    </div>
  );
}

export default function ProfileSavedPage() {
  const { error, loading, savedVenues } = useSavedVenues();
  const [activeFilter, setActiveFilter] = useState<SavedCategoryFilter>("All");

  const venueItems = useMemo(() => savedVenues.map(toSavedVenueItem), [savedVenues]);
  const filteredVenues = useMemo(
    () => venueItems.filter((venue) => venueMatchesCategory(venue, activeFilter)),
    [activeFilter, venueItems],
  );

  return (
    <PageTransition>
      <div className="min-h-screen-safe bg-[#0A0A0E] text-white">
        <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0A0A0E]/92 px-4 backdrop-blur-xl">
          <div className="mx-auto max-w-lg py-4">
            <Link
              href="/profile"
              className="inline-flex min-h-11 items-center text-[13px] font-semibold text-[#9CA2AE] transition-colors hover:text-[#F4F5F8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              &larr; You
            </Link>
            <h1 className="mt-2 font-display text-[30px] font-semibold tracking-normal text-[#F4F5F8]">
              Saved venues
            </h1>
            <p className="mt-1 text-sm font-semibold text-white/55">
              {savedVenues.length} saved
            </p>
            <div className="mt-4">
              <UpgradeButton />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-lg px-4 py-6 pb-20">
          {loading && <LoadingRows />}

          {!loading && error && (
            <p className="rounded-[18px] border border-[#F0568C]/25 bg-[#F0568C]/10 p-4 text-[13px] font-medium text-[#F0568C]">
              {error}
            </p>
          )}

          {!loading && !error && venueItems.length === 0 && (
            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#FF2D78]/25 bg-[#FF2D78]/10 text-[#FF8AB0]" aria-hidden="true">
                <Heart size={24} strokeWidth={1.9} />
              </div>
              <h2 className="mt-4 text-[17px] font-black leading-6 text-white">
                No saved venues yet
              </h2>
              <p className="mt-1 text-sm font-semibold leading-5 text-white/60">
                Tap the heart on any venue to save it for later.
              </p>
              <Link
                href="/explore"
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-[13px] font-semibold text-[#0A0A0E] transition-colors hover:bg-[#9B82FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
              >
                Browse South End venues
              </Link>
            </section>
          )}

          {!loading && !error && venueItems.length > 0 && (
            <section className="space-y-4" aria-label="Saved venues list">
              <div className="scroll-touch flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Saved venue category filter">
                {CATEGORY_FILTERS.map((filter) => {
                  const active = activeFilter === filter;
                  return (
                    <button
                      key={filter}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setActiveFilter(filter)}
                      className={`inline-flex min-h-[38px] shrink-0 items-center rounded-full border px-4 text-sm font-semibold backdrop-blur-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
                        active
                          ? "border-[#8B6CFF]/50 bg-[#8B6CFF]/20 text-[#8B6CFF]"
                          : "border-white/[0.08] text-white/60 hover:border-white/20 hover:text-white"
                      }`}
                    >
                      {filter}
                    </button>
                  );
                })}
              </div>

              {filteredVenues.length > 0 ? (
                <ul className="space-y-3">
                  {filteredVenues.map((venue) => (
                    <li key={venue.id}>
                      <Link
                        href={`/venues/${encodeURIComponent(venue.id)}`}
                        className="group flex items-center justify-between gap-4 rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-4 transition-colors hover:bg-white/[0.055] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-semibold text-[#F4F5F8]">{venue.name}</span>
                          <span className="mt-1 block truncate text-[12px] font-medium text-[#9CA2AE]">
                            {venue.category}
                          </span>
                          {venue.address && (
                            <span className="mt-1 block truncate text-[12px] font-medium text-[#9CA2AE]">
                              {venue.address}
                            </span>
                          )}
                        </span>
                        <ChevronRight
                          className="h-5 w-5 shrink-0 text-[#9CA2AE] transition-colors group-hover:text-[#F4F5F8]"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-4 text-sm font-semibold text-white/60">
                  No saved venues match this category.
                </p>
              )}
            </section>
          )}
        </main>
      </div>
    </PageTransition>
  );
}
