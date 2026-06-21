"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { motion } from "framer-motion";
import type { Session } from "@supabase/supabase-js";
import { TrendingStrip } from "@/components/TrendingStrip";
import { getBusynessState } from "@/lib/busyness";
import { distanceMiles } from "@/lib/distance";
import { useHaptic } from "@/hooks/useHaptic";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { VENUE_PHOTO_BLUR_DATA_URL } from "@/lib/imagePlaceholders";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useTrack } from "@/lib/useTrack";
import type { ConsumerVenue } from "@/types";

type BusynessFilter = "All" | "Packed" | "Moderate" | "Quiet";
type CategoryFilter = "All" | "Bar" | "Club" | "Restaurant" | "Lounge";
type NeighborhoodFilter = "All Areas" | "South End" | "NoDa" | "Uptown";
type SortOption = "Nearest" | "Busiest" | "A-Z" | "Open Now";
type UserLocation = { lat: number; lng: number };

const BUSYNESS_FILTERS: BusynessFilter[] = ["All", "Packed", "Moderate", "Quiet"];
const NEIGHBORHOOD_FILTERS: NeighborhoodFilter[] = ["All Areas", "South End", "NoDa", "Uptown"];
const SORT_OPTIONS: SortOption[] = ["Nearest", "Busiest", "A-Z", "Open Now"];
const PAGE_SIZE = 20;
const VIEWED_VENUES_STORAGE_KEY = "nightvibe.viewed_venues";
const EXPLORE_VENUES_EVENT = "nightvibe:explore-venues-updated";
const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: "All", label: "All" },
  { value: "Bar", label: "🍸 Bar" },
  { value: "Club", label: "🎵 Club" },
  { value: "Restaurant", label: "🍔 Restaurant" },
  { value: "Lounge", label: "🛋 Lounge" },
];

function trackAnalytics(event: string, properties: Record<string, string | number | boolean | null>) {
  try {
    track(event, properties);
  } catch {
    // Analytics must never break the UI.
  }
}

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

function parseStoredVenueIds(value: string | null): Set<string> {
  if (!value) return new Set();

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0))
      : new Set();
  } catch {
    return new Set();
  }
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
  const haptic = useHaptic();

  return (
    <motion.button
      type="button"
      onClick={() => {
        haptic.light();
        onSelect(label);
      }}
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
  const haptic = useHaptic();

  return (
    <motion.button
      type="button"
      onClick={() => {
        haptic.light();
        onSelect();
      }}
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

function NeighborhoodFilterPill({
  label,
  active,
  onSelect,
  prefersReduced,
}: {
  label: NeighborhoodFilter;
  active: boolean;
  onSelect: (label: NeighborhoodFilter) => void;
  prefersReduced: boolean;
}) {
  const haptic = useHaptic();

  return (
    <motion.button
      type="button"
      onClick={() => {
        haptic.light();
        onSelect(label);
      }}
      animate={{
        backgroundColor: active ? "#00F5D4" : "rgba(255,255,255,0.06)",
        color: active ? "#0A0A0F" : "rgba(255,255,255,0.6)",
      }}
      transition={{ duration: prefersReduced ? 0 : 0.16, ease: "easeOut" }}
      className="min-h-[38px] shrink-0 rounded-full px-4 text-sm font-black transition-colors hover:bg-white/[0.1] hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60"
      aria-pressed={active}
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
  const haptic = useHaptic();

  return (
    <motion.button
      type="button"
      onClick={() => {
        haptic.light();
        onSelect();
      }}
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

function getBusynessColor(busyness: number | null | undefined): string {
  if (busyness == null) return "#52525B";
  if (busyness < 40) return "#22C55E";
  if (busyness <= 70) return "#EAB308";
  return "#EF4444";
}

function getBusynessPill(busyness: number | null | undefined): string {
  if (busyness == null) return "⚫ No data";
  const rounded = Math.round(busyness);
  const indicator = busyness < 40 ? "🟢" : busyness <= 70 ? "🟡" : "🔴";
  return `${indicator} ${rounded}% busy`;
}

function getCrowdFeelLabel(venue: ConsumerVenue): string {
  const signal = venue.signal;
  if (!signal || signal.sampleSize < 3 || signal.mfRatio == null) return "⚫ No crowd read";

  const malePercent = Math.min(100, Math.max(0, Math.round(signal.mfRatio)));
  if (malePercent >= 60) return "👨 Mostly guys";
  if (malePercent <= 40) return "👩 Mostly girls";
  return "⚖ Balanced";
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
  const busyness = venue.signal?.busyness0To100 ?? null;
  const busynessColor = getBusynessColor(busyness);
  const rating = venue.rating ?? venue.googleRating;
  const ratingLabel = rating?.toFixed(1);
  const crowdFeelLabel = getCrowdFeelLabel(venue);

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
        className="group relative block h-auto w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.04] transition-colors hover:border-white/[0.14] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60"
        aria-label={`Open ${venue.name}`}
      >
        <div
          className="absolute left-0 top-0 z-10 h-full w-1"
          style={{ backgroundColor: busynessColor }}
          aria-hidden="true"
        />

        <div className="relative aspect-video w-full overflow-hidden bg-[linear-gradient(135deg,rgba(17,17,24,1),rgba(28,19,36,0.94)_50%,rgba(6,28,32,0.86))]">
          {venue.photoUrl ? (
            <Image
              src={venue.photoUrl}
              alt={venue.name}
              fill
              sizes="(max-width: 640px) 100vw, 400px"
              loading="lazy"
              placeholder="blur"
              blurDataURL={VENUE_PHOTO_BLUR_DATA_URL}
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_25%,rgba(0,245,212,0.14),transparent_32%),radial-gradient(circle_at_70%_80%,rgba(255,45,120,0.12),transparent_34%)] text-5xl" aria-hidden="true">
              {getCategoryIcon(venue.category)}
            </div>
          )}
        </div>

        <div className="bg-[#111118] px-4 py-3 pl-5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-black leading-tight text-white">
                <HighlightText text={venue.name} query={searchQuery} />
              </h2>
              <p className="mt-1 truncate text-xs font-semibold uppercase tracking-wide text-white/40">
                {categoryLabel}
              </p>
            </div>
            {distance != null ? (
              <span className="shrink-0 pt-0.5 text-xs font-semibold text-white/30">
                {distance.toFixed(1)} mi
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-7 items-center rounded-full bg-white/[0.07] px-2.5 text-xs font-bold text-white/70">
              {getBusynessPill(busyness)}
            </span>
            {venue.openNow === true ? (
              <span className="inline-flex min-h-7 items-center rounded-full bg-white/[0.05] px-2.5 text-xs font-bold text-white/35">
                Live
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
            <span className="min-w-0 truncate text-xs font-semibold text-white/45">
              {crowdFeelLabel}
            </span>
            {ratingLabel ? (
              <span className="shrink-0 text-xs font-bold text-white/50" aria-label={`${ratingLabel} star rating`}>
                ★ {ratingLabel}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </motion.li>
  );
}

function CardSkeleton() {
  return (
    <div className="relative mb-3 h-auto w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.04] last:mb-0">
      <div className="absolute left-0 top-0 z-10 h-full w-1 animate-pulse bg-white/10" />
      <div className="aspect-video w-full animate-pulse bg-white/[0.06]" />
      <div className="space-y-3 bg-[#111118] px-4 py-3 pl-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-5 w-44 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-20 animate-pulse rounded bg-white/[0.08]" />
          </div>
          <div className="h-3 w-12 animate-pulse rounded bg-white/[0.08]" />
        </div>
        <div className="h-7 w-28 animate-pulse rounded-full bg-white/[0.08]" />
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
          <div className="h-3 w-28 animate-pulse rounded bg-white/[0.08]" />
          <div className="h-3 w-12 animate-pulse rounded bg-white/[0.08]" />
        </div>
      </div>
    </div>
  );
}

export function ExplorePageClient() {
  const trackPageView = useTrack();
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
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<NeighborhoodFilter>("All Areas");
  const [sortOption, setSortOption] = useState<SortOption>("Busiest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);

  const fetchVenues = useCallback(async ({ reset = false }: { reset?: boolean } = {}) => {
    if (reset) setVenues(null);
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

  const refreshVenues = useCallback(async () => {
    await fetchVenues();
  }, [fetchVenues]);

  const { pulling, refreshing } = usePullToRefresh(refreshVenues);

  useEffect(() => {
    fetchVenues({ reset: true });
  }, [fetchVenues]);

  useEffect(() => {
    void trackPageView("page_view", { meta: { page: "explore" } });
  }, [trackPageView]);

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
    if (venues === null) return;

    const venueIds = venues
      .map((venue) => venue.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const viewedVenueIds = parseStoredVenueIds(localStorage.getItem(VIEWED_VENUES_STORAGE_KEY));

    for (const venueId of venueIds) {
      viewedVenueIds.add(venueId);
    }

    localStorage.setItem(VIEWED_VENUES_STORAGE_KEY, JSON.stringify([...viewedVenueIds]));
    window.dispatchEvent(new CustomEvent<string[]>(EXPLORE_VENUES_EVENT, { detail: venueIds }));
  }, [venues]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [busynessFilter, categoryFilter, neighborhoodFilter, searchQuery, sortOption]);

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
        venue.neighborhood,
      ].map(normalizeSearchText).join(" ");
      const matchesSearch = normalizedSearch.length === 0 || searchableText.includes(normalizedSearch);
      const matchesBusyness = busynessFilter === "All" || busyness === busynessFilter;
      const matchesCategory = categoryFilter === "All" || category === categoryFilter;
      const matchesNeighborhood = neighborhoodFilter === "All Areas" || venue.neighborhood === neighborhoodFilter;
      const matchesOpenNow = sortOption !== "Open Now" || venue.openNow === true;

      return matchesSearch && matchesBusyness && matchesCategory && matchesNeighborhood && matchesOpenNow;
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
  }, [busynessFilter, categoryFilter, neighborhoodFilter, searchQuery, sortOption, userLocation, venues]);

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
  const resultVenueNoun = categoryFilter === "All" ? "spot" : categoryFilter.toLowerCase();
  const resultAreaLabel = neighborhoodFilter === "All Areas" ? "all areas" : neighborhoodFilter;
  const resultCountLabel = `${sortedVenues.length} ${resultVenueNoun}${sortedVenues.length === 1 ? "" : "s"} in ${resultAreaLabel}`;

  function clearFilters() {
    setSearchQuery("");
    setBusynessFilter("All");
    setCategoryFilter("All");
    setNeighborhoodFilter("All Areas");
    setSortOption("Busiest");
  }

  function selectSortOption(option: SortOption) {
    setSortOption(option);
    trackAnalytics("explore_filter_selected", { filter: option });
  }

  const timeLabel = useMemo(() => (
    now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  ), [now]);

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {(pulling || refreshing) && (
        <div
          className="fixed left-0 right-0 top-0 z-50 flex justify-center px-4 pt-3"
          role={refreshing ? "status" : undefined}
          aria-live="polite"
        >
          <div className="rounded-full border border-white/10 bg-[#0A0A0F]/90 px-4 py-2 text-xs font-black text-white/50 shadow-2xl backdrop-blur">
            {refreshing ? (
              <span className="flex items-center gap-2">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#00F5D4] border-t-transparent" aria-hidden="true" />
                <span className="sr-only">Refreshing venues...</span>
              </span>
            ) : (
              "Pull to refresh"
            )}
          </div>
        </div>
      )}

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
        <div className="mx-auto max-w-lg space-y-2 px-4 py-2">
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NEIGHBORHOOD_FILTERS.map((filter) => (
              <NeighborhoodFilterPill
                key={filter}
                label={filter}
                active={neighborhoodFilter === filter}
                onSelect={setNeighborhoodFilter}
                prefersReduced={prefersReduced}
              />
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SORT_OPTIONS.map((option) => (
              <SortPill
                key={option}
                label={option}
                active={sortOption === option}
                onSelect={() => selectSortOption(option)}
                prefersReduced={prefersReduced}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-white/30">
            Showing {visibleVenues.length} of {resultCountLabel}
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
