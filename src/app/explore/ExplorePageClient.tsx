"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Session } from "@supabase/supabase-js";
import { OnboardingOverlay } from "@/components/OnboardingOverlay";
import { TrendingStrip } from "@/components/TrendingStrip";
import { getBusynessState } from "@/lib/busyness";
import { distanceMiles } from "@/lib/distance";
import { VENUE_PHOTO_BLUR_DATA_URL } from "@/lib/imagePlaceholders";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useTrack } from "@/lib/useTrack";
import type { ConsumerVenue } from "@/types";

type BusynessFilter = "All" | "Packed" | "Moderate" | "Quiet";
type CategoryFilter = "All" | "Bar" | "Club" | "Restaurant" | "Lounge";
type SortOption = "Nearest" | "Busiest" | "A-Z" | "Open Now";
type UserLocation = { lat: number; lng: number };

const BUSYNESS_FILTERS: BusynessFilter[] = ["All", "Packed", "Moderate", "Quiet"];
const SORT_OPTIONS: SortOption[] = ["Nearest", "Busiest", "A-Z", "Open Now"];
const PAGE_SIZE = 20;
const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: "All", label: "All" },
  { value: "Bar", label: "🍸 Bar" },
  { value: "Club", label: "🎵 Club" },
  { value: "Restaurant", label: "🍔 Restaurant" },
  { value: "Lounge", label: "🛋 Lounge" },
];

function normalizeCategory(category: string | null | undefined): CategoryFilter | null {
  const value = (category ?? "").toLowerCase();
  if (value.includes("club") || value.includes("night_club") || value.includes("nightclub")) return "Club";
  if (value.includes("restaurant") || value.includes("food")) return "Restaurant";
  if (value.includes("lounge")) return "Lounge";
  if (value.includes("bar")) return "Bar";
  return null;
}

function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[_-]+/g, " ");
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return <>{text}</>;

  const matchIndex = text.toLowerCase().indexOf(trimmedQuery.toLowerCase());
  if (matchIndex === -1) return <>{text}</>;

  const beforeMatch = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + trimmedQuery.length);
  const afterMatch = text.slice(matchIndex + trimmedQuery.length);

  return (
    <>
      {beforeMatch}
      <mark className="rounded bg-white/15 px-0.5 text-white">{match}</mark>
      {afterMatch}
    </>
  );
}

function FilterChip<T extends string>({
  label,
  active,
  onSelect,
  prefersReduced,
}: {
  label: T;
  active: boolean;
  onSelect: (label: T) => void;
  prefersReduced: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(label)}
      animate={{
        backgroundColor: active ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.1)",
        borderColor: active ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0)",
      }}
      transition={{ duration: prefersReduced ? 0 : 0.16, ease: "easeOut" }}
      className="min-h-[38px] shrink-0 rounded-full border px-4 text-sm font-black text-white/60 transition-colors hover:bg-white/15 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60 data-[active=true]:text-white"
      aria-pressed={active}
      data-active={active}
    >
      {label}
    </motion.button>
  );
}

function CategoryFilterPill({
  label,
  active,
  onSelect,
  prefersReduced,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
  prefersReduced: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      animate={{
        backgroundColor: active ? "rgba(255,255,255,0.14)" : "rgba(10,10,15,0.8)",
        borderColor: active ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.1)",
      }}
      transition={{ duration: prefersReduced ? 0 : 0.16, ease: "easeOut" }}
      className="min-h-[38px] shrink-0 rounded-full border px-4 text-sm font-black text-white/50 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60 data-[active=true]:text-white"
      aria-pressed={active}
      data-active={active}
    >
      {label}
    </motion.button>
  );
}

function SortPill({
  label,
  active,
  onSelect,
  prefersReduced,
}: {
  label: SortOption;
  active: boolean;
  onSelect: () => void;
  prefersReduced: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      animate={{
        backgroundColor: active ? "rgba(0,245,212,0.2)" : "rgba(255,255,255,0.05)",
        borderColor: active ? "rgba(0,245,212,0.4)" : "rgba(255,255,255,0.1)",
      }}
      transition={{ duration: prefersReduced ? 0 : 0.16, ease: "easeOut" }}
      className="shrink-0 rounded-full border px-3 py-1 text-xs font-bold text-white/50 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60 data-[active=true]:text-[#00F5D4]"
      aria-pressed={active}
      data-active={active}
    >
      {label}
    </motion.button>
  );
}

function getCategoryIcon(category: string | null | undefined): string {
  const value = (category ?? "").toLowerCase();
  if (value.includes("night_club") || value.includes("nightclub") || value.includes("club")) return "🎵";
  if (value.includes("restaurant") || value.includes("food")) return "🍽";
  if (value.includes("bar")) return "🍺";
  return "📍";
}

function getCategoryChipLabel(category: string | null | undefined): string {
  return normalizeCategory(category) ?? "Spot";
}

function getSignalLabel(venue: ConsumerVenue): string {
  const signal = venue.signal;
  if (!signal || signal.sampleSize < 3 || signal.mfRatio == null) return "No reads yet";

  const busyness = getBusynessState(signal.busyness0To100).label;
  const malePercent = Math.min(100, Math.max(0, Math.round(signal.mfRatio)));
  const femalePercent = 100 - malePercent;

  return `${busyness} · 👨${malePercent}% 👩${femalePercent}%`;
}

function VenueFeedCard({
  venue,
  searchQuery,
  distance,
  index,
  prefersReduced,
}: {
  venue: ConsumerVenue;
  searchQuery: string;
  distance: number | null;
  index: number;
  prefersReduced: boolean;
}) {
  const categoryLabel = getCategoryChipLabel(venue.category);
  const priceLabel = "$".repeat(venue.priceLevel ?? 0) || "—";
  const ratingLabel = venue.rating?.toFixed(1) ?? "—";
  const signalLabel = getSignalLabel(venue);

  return (
    <motion.li
      className="mb-3 last:mb-0"
      role="article"
      initial={prefersReduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: prefersReduced ? 0 : 0.18,
        delay: prefersReduced || index >= 8 ? 0 : index * 0.04,
        ease: "easeOut",
      }}
    >
      <Link
        href={`/venues/${encodeURIComponent(venue.id)}`}
        className="block overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.04] transition-colors hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60"
        aria-label={`Open ${venue.name}`}
      >
        <div className="relative aspect-video w-full overflow-hidden bg-white/[0.06]">
          {venue.photoUrl ? (
            <Image
              src={venue.photoUrl}
              alt={venue.name}
              fill
              sizes="(max-width: 640px) 100vw, 400px"
              placeholder="blur"
              blurDataURL={VENUE_PHOTO_BLUR_DATA_URL}
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-5xl" aria-hidden="true">
              {getCategoryIcon(venue.category)}
            </div>
          )}
        </div>

        <div className="px-4 py-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <h2 className="min-w-0 truncate text-[17px] font-medium leading-tight text-white">
              <HighlightText text={venue.name} query={searchQuery} />
            </h2>
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[11px] font-medium leading-none text-white/60">
              {categoryLabel}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium text-white/50">
            <span>★ {ratingLabel}</span>
            <span>{priceLabel}</span>
            {distance != null ? <span>{distance.toFixed(1)} mi</span> : null}
            {venue.openNow === true ? (
              <span className="inline-flex items-center gap-1.5" aria-label="Open now">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/40 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white/55" />
                </span>
                Live
              </span>
            ) : null}
          </div>

          <p className="mt-2 truncate text-[13px] font-medium text-white/50">
            {signalLabel}
          </p>
        </div>
      </Link>
    </motion.li>
  );
}

function CardSkeleton() {
  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.04] last:mb-0">
      <div className="aspect-video w-full animate-pulse bg-white/[0.06]" />
      <div className="space-y-2 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="h-5 w-40 animate-pulse rounded bg-white/10" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="h-4 w-28 animate-pulse rounded bg-white/[0.08]" />
        <div className="h-4 w-44 animate-pulse rounded bg-white/[0.06]" />
      </div>
    </div>
  );
}

export function ExplorePageClient() {
  const track = useTrack();
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [session, setSession] = useState<Session | null>(null);
  const [venues, setVenues] = useState<ConsumerVenue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [busynessFilter, setBusynessFilter] = useState<BusynessFilter>("All");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All");
  const [sortOption, setSortOption] = useState<SortOption>("Busiest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);

  const fetchVenues = useCallback(async () => {
    setVenues(null);
    setError(null);
    try {
      const res = await fetch("/api/venues");
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setVenues(json?.data?.venues ?? []);
    } catch {
      setError("📡 Can't reach the server. Pull to refresh.");
    }
  }, []);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  useEffect(() => {
    void track("page_view", { meta: { page: "explore" } });
  }, [track]);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => undefined,
      { maximumAge: 5 * 60 * 1000, timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [busynessFilter, categoryFilter, searchQuery, sortOption]);

  useEffect(() => {
    const client = createBrowserClient();

    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const sortedVenues = useMemo(() => {
    if (venues === null) return [];
    const normalizedSearch = normalizeSearchText(searchQuery.trim());

    return venues.filter((venue) => {
      if (venue.hidden) return false;

      const busyness = getBusynessState(venue.signal?.busyness0To100).label;
      const category = normalizeCategory(venue.category);
      const searchableText = [
        venue.name,
        venue.address,
        venue.category,
      ].map(normalizeSearchText).join(" ");
      const matchesSearch = normalizedSearch.length === 0 || searchableText.includes(normalizedSearch);
      const matchesBusyness = busynessFilter === "All" || busyness === busynessFilter;
      const matchesCategory = categoryFilter === "All" || category === categoryFilter;
      const matchesOpenNow = sortOption !== "Open Now" || venue.openNow === true;

      return matchesSearch && matchesBusyness && matchesCategory && matchesOpenNow;
    }).sort((a, b) => {
      if (sortOption === "Nearest" && userLocation) {
        const aDistance = distanceMiles(userLocation.lat, userLocation.lng, a.lat, a.lng);
        const bDistance = distanceMiles(userLocation.lat, userLocation.lng, b.lat, b.lng);
        return aDistance - bDistance || a.name.localeCompare(b.name);
      }

      if (sortOption === "A-Z" || sortOption === "Nearest") {
        return a.name.localeCompare(b.name);
      }

      const aState = getBusynessState(a.signal?.busyness0To100);
      const bState = getBusynessState(b.signal?.busyness0To100);
      return bState.rank - aState.rank || a.name.localeCompare(b.name);
    });
  }, [busynessFilter, categoryFilter, searchQuery, sortOption, userLocation, venues]);

  const venueDistances = useMemo(() => {
    if (!userLocation || venues === null) return new Map<string, number>();

    return new Map(
      venues.map((venue) => [
        venue.id,
        distanceMiles(userLocation.lat, userLocation.lng, venue.lat, venue.lng),
      ]),
    );
  }, [userLocation, venues]);

  const venuesCount = venues?.length ?? 0;
  const visibleVenues = sortedVenues.slice(0, visibleCount);
  const hasMoreVenues = sortedVenues.length > visibleVenues.length;

  function clearFilters() {
    setSearchQuery("");
    setBusynessFilter("All");
    setCategoryFilter("All");
    setSortOption("Busiest");
  }

  const timeLabel = useMemo(() => (
    now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  ), [now]);

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <OnboardingOverlay />

      <header className="px-4 pb-5 pt-10" role="region" aria-label="Explore filters">
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
                className="shrink-0 text-white/45"
              >
                <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="truncate">South End Charlotte</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <time className="text-white/35">{timeLabel}</time>
              {session && (
                <Link
                  href="/profile"
                  className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60"
                >
                  Profile
                </Link>
              )}
            </div>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            South End
          </h1>
          <p className="mt-1 text-sm text-white/40">{venuesCount} spots tracked tonight</p>

          <div className="mt-5 space-y-3">
            <div className="relative">
              <label htmlFor="venue-search" className="sr-only">
                Search South End venues
              </label>
              <input
                id="venue-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search South End..."
                className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 pl-11 pr-12 text-base font-semibold text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60"
                aria-label="Search venues"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-lg font-black leading-none text-white/65 transition-colors hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {BUSYNESS_FILTERS.map((filter) => (
                <FilterChip
                  key={filter}
                  label={filter}
                  active={busynessFilter === filter}
                  onSelect={setBusynessFilter}
                  prefersReduced={prefersReduced}
                />
              ))}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CATEGORY_FILTERS.map((filter) => (
                <CategoryFilterPill
                  key={filter.value}
                  label={filter.label}
                  active={categoryFilter === filter.value}
                  onSelect={() => setCategoryFilter(filter.value)}
                  prefersReduced={prefersReduced}
                />
              ))}
            </div>

          </div>
        </div>
      </header>

      <div className="sticky top-0 z-20 border-y border-white/[0.06] bg-[#0A0A0F]/95 backdrop-blur" role="region" aria-label="Explore sort controls">
        <div className="mx-auto max-w-lg px-4 py-2">
          <div className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SORT_OPTIONS.map((option) => (
              <SortPill
                key={option}
                label={option}
                active={sortOption === option}
                onSelect={() => setSortOption(option)}
                prefersReduced={prefersReduced}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-white/30">
            Showing {visibleVenues.length} venue{visibleVenues.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <section className="mx-auto max-w-lg space-y-3 px-4 pb-32" role="region" aria-label="Venue results">
        <TrendingStrip />

        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center"
          >
            <p className="text-sm font-semibold text-white">{error}</p>
          </div>
        )}

        {venues === null && !error && (
          <div role="status" aria-label="Loading venues">
            <p className="sr-only">Loading venues...</p>
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        )}

        {venues !== null && !error && venues.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
            <p className="text-sm font-semibold text-white">
              No venues yet. Discovery job seeds South End venues.
            </p>
          </div>
        )}

        {venues !== null && !error && venues.length > 0 && sortedVenues.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
            <div className="text-5xl" aria-hidden="true">🔍</div>
            <h2 className="mt-4 text-lg font-bold text-white/40">No venues match</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-white/40">
              Try a different filter or zoom out on the map
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#00F5D4] px-5 text-sm font-black text-[#0A0A0F] shadow-[0_0_20px_rgba(0,245,212,0.24)] transition-colors hover:bg-[#22FFE1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
            >
              Clear filters
            </button>
          </div>
        )}

        {venues !== null && !error && sortedVenues.length > 0 && (
          <>
            <ul>
              {visibleVenues.map((venue, index) => (
                <VenueFeedCard
                  key={venue.id}
                  venue={venue}
                  searchQuery={searchQuery}
                  distance={venueDistances.get(venue.id) ?? null}
                  index={index}
                  prefersReduced={prefersReduced}
                />
              ))}
            </ul>

            {hasMoreVenues && (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="mt-2 w-full rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60"
              >
                Load more
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
