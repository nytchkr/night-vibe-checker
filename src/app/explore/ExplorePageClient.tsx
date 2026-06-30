"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import { Search, SearchX, Star, X } from "lucide-react";
import { CategoryBadge, PriceLevelDisplay } from "@/components/CategoryBadge";
import SkeletonCard from "@/components/SkeletonCard";
import { VenuePhoto } from "@/components/VenuePhoto";
import { getBusynessState } from "@/lib/busyness";
import { useTrack } from "@/lib/useTrack";
import type { BusynessSource, ConsumerVenue } from "@/types";

type CategoryFilter = "all" | "bars" | "restaurants" | "lounges" | "clubs";
type PriceFilter = 1 | 2 | 3 | 4 | null;
type BusynessFilter = "any" | "busy" | "moderate" | "quiet";
type SortOption = "distance" | "rating" | "busyness";
type VenueSuggestion = {
  id: string;
  name: string;
  category: string | null;
  zoneId: string | null;
};

const EXPLORE_SEARCH_STORAGE_KEY = "nytchkr_explore_search";
const CHARLOTTE_LAUNCH_CENTER = { lat: 35.2123, lng: -80.8590 };

const CATEGORY_FILTERS: Array<{ value: CategoryFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "bars", label: "Bars" },
  { value: "restaurants", label: "Restaurants" },
  { value: "lounges", label: "Lounges" },
  { value: "clubs", label: "Clubs" },
];

const PRICE_FILTERS: Array<{ value: PriceFilter; label: string }> = [
  { value: 1, label: "$" },
  { value: 2, label: "$$" },
  { value: 3, label: "$$$" },
  { value: 4, label: "$$$$" },
];

const BUSYNESS_FILTERS: Array<{ value: BusynessFilter; label: string }> = [
  { value: "any", label: "Any" },
  { value: "busy", label: "Busy" },
  { value: "moderate", label: "Moderate" },
  { value: "quiet", label: "Quiet" },
];

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "distance", label: "Distance" },
  { value: "rating", label: "Rating" },
  { value: "busyness", label: "Busyness" },
];

function trackAnalytics(event: string, properties: Record<string, string | number | boolean | null>) {
  try {
    track(event, properties);
  } catch {
    // Analytics must never break discovery.
  }
}

function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[_-]+/g, " ").trim();
}

function venueMatchesSearchQuery(venue: ConsumerVenue, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  return [
    venue.name,
    venue.category,
    venue.address,
    venue.neighborhood,
  ].map(normalizeSearchText).join(" ").includes(normalizedQuery);
}

function venueMatchesCategory(venue: ConsumerVenue, filter: CategoryFilter): boolean {
  if (filter === "all") return true;

  const category = normalizeSearchText(venue.category);
  if (filter === "bars") return category.includes("bar") || category.includes("pub") || category.includes("brewery");
  if (filter === "restaurants") return category.includes("restaurant") || category.includes("food") || category.includes("diner");
  if (filter === "lounges") return category.includes("lounge");
  return category.includes("club") || category.includes("night club") || category.includes("nightclub");
}

function getVenueRating(venue: ConsumerVenue): number | null {
  const rating = venue.googleRating ?? venue.rating ?? null;
  return rating == null || !Number.isFinite(rating) ? null : rating;
}

function getVenueReviewCount(venue: ConsumerVenue): number | null {
  const count = venue.totalRatings ?? venue.userRatingCount ?? null;
  return count == null || !Number.isFinite(count) ? null : Math.max(0, Math.round(count));
}

function getVenueBusyness(venue: ConsumerVenue): number | null {
  const value = venue.signal?.busyness0To100 ?? venue.current_popularity ?? null;
  return value == null || !Number.isFinite(value) ? null : Math.min(100, Math.max(0, Math.round(value)));
}

function getVenueDistanceFromLaunch(venue: ConsumerVenue): number {
  const latDelta = venue.lat - CHARLOTTE_LAUNCH_CENTER.lat;
  const lngDelta = venue.lng - CHARLOTTE_LAUNCH_CENTER.lng;
  return Math.hypot(latDelta, lngDelta);
}

function getBusynessSourceLabel(source: BusynessSource | null | undefined): "LIVE" | "FORECAST" | null {
  if (source === "live") return "LIVE";
  if (source === "forecast") return "FORECAST";
  return null;
}

function venueMatchesBusyness(venue: ConsumerVenue, filter: BusynessFilter): boolean {
  if (filter === "any") return true;

  const busyness = getVenueBusyness(venue);
  if (busyness == null) return false;

  const state = getBusynessState(busyness);
  if (filter === "busy") return state.label === "Packed";
  if (filter === "moderate") return state.label === "Moderate";
  return state.label === "Quiet";
}

function formatReviewCount(count: number | null): string | null {
  if (count == null || count <= 0) return null;
  return `${count.toLocaleString()} reviews`;
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return <>{text}</>;

  const matchIndex = text.toLowerCase().indexOf(trimmedQuery.toLowerCase());
  if (matchIndex === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, matchIndex)}
      <mark className="rounded bg-[#8B6CFF]/35 px-0.5 text-white">{text.slice(matchIndex, matchIndex + trimmedQuery.length)}</mark>
      {text.slice(matchIndex + trimmedQuery.length)}
    </>
  );
}

function isTouchDevice(): boolean {
  return typeof window !== "undefined" && (
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(pointer: coarse)").matches === true
  );
}

function FilterPill({
  active,
  children,
  onClick,
  ariaLabel,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={onClick}
      className={[
        "inline-flex min-h-[38px] shrink-0 items-center justify-center rounded-full border px-4 text-sm font-semibold transition-all duration-150 ease-out active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/75",
        active
          ? "border-[#8B6CFF] bg-[#8B6CFF] text-[#0A0A0E] shadow-[0_0_20px_rgba(139,108,255,0.22)]"
          : "border-white/[0.08] bg-[#14141A] text-white/72 hover:border-white/18 hover:bg-white/[0.09] hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function OpenStatusBadge({ openNow }: { openNow: boolean | null | undefined }) {
  const isOpen = openNow === true;

  return (
    <span
      className={[
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black leading-none",
        isOpen
          ? "border-[#22C55E]/35 bg-[#22C55E]/12 text-[#4ADE80]"
          : "border-white/[0.08] bg-white/[0.06] text-white/48",
      ].join(" ")}
    >
      <span
        className={[
          "h-1.5 w-1.5 rounded-full",
          isOpen ? "bg-[#4ADE80] shadow-[0_0_10px_rgba(74,222,128,0.7)]" : "bg-white/35",
        ].join(" ")}
        aria-hidden="true"
      />
      {isOpen ? "Open" : "Closed"}
    </span>
  );
}

function BusynessBadge({ value, source }: { value: number | null; source: BusynessSource | null | undefined }) {
  if (value == null) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-1 text-[11px] font-black text-white/45">
        No busyness
      </span>
    );
  }

  const state = getBusynessState(value);
  const sourceLabel = getBusynessSourceLabel(source);

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black leading-none"
      style={{ borderColor: `${state.color}55`, backgroundColor: `${state.color}1A`, color: state.color }}
      aria-label={`${sourceLabel ? `${sourceLabel} ` : ""}${state.label}`}
    >
      {sourceLabel ? (
        <span className="inline-flex items-center gap-1 text-[9px] text-white/70">
          <span
            className={sourceLabel === "LIVE" ? "h-1.5 w-1.5 rounded-full bg-[#22C55E] shadow-[0_0_10px_rgba(34,197,94,0.7)]" : "h-1.5 w-1.5 rounded-full bg-white/40"}
            aria-hidden="true"
          />
          {sourceLabel}
        </span>
      ) : null}
      <span>{state.label}</span>
    </span>
  );
}

function GoogleRating({ rating, reviewCount }: { rating: number | null; reviewCount: number | null }) {
  if (rating == null) return null;

  const reviewLabel = formatReviewCount(reviewCount);

  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-white/72"
      aria-label={reviewLabel ? `Google rating ${rating.toFixed(1)} from ${reviewLabel}` : `Google rating ${rating.toFixed(1)}`}
    >
      <Star className="h-3.5 w-3.5 shrink-0 fill-[#F8C14A] text-[#F8C14A]" strokeWidth={2.2} aria-hidden="true" />
      <span className="shrink-0">{rating.toFixed(1)}</span>
      {reviewLabel ? (
        <>
          <span className="text-white/28" aria-hidden="true">{"\u00B7"}</span>
          <span className="truncate">{reviewLabel}</span>
        </>
      ) : null}
    </span>
  );
}

function VenueDiscoveryCard({
  venue,
  searchQuery,
  onPrefetchVenue,
}: {
  venue: ConsumerVenue;
  searchQuery: string;
  onPrefetchVenue: (venueId: string) => void;
}) {
  const rating = getVenueRating(venue);
  const reviewCount = getVenueReviewCount(venue);
  const busyness = getVenueBusyness(venue);

  return (
    <li role="article">
      <Link
        href={`/venues/${encodeURIComponent(venue.id)}`}
        prefetch={false}
        onMouseEnter={() => {
          if (isTouchDevice()) return;
          onPrefetchVenue(venue.id);
        }}
        onTouchStart={() => onPrefetchVenue(venue.id)}
        onClick={() => trackAnalytics("explore_venue_card_tapped", { venueId: venue.id })}
        className="group block overflow-hidden rounded-[8px] border border-white/[0.07] bg-[#14141A] shadow-[0_18px_42px_rgba(0,0,0,0.28)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#8B6CFF]/35 hover:shadow-[0_22px_46px_rgba(0,0,0,0.34)] active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/75"
        aria-label={`Open ${venue.name}`}
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-[#0A0A0E]">
          <VenuePhoto
            name={venue.name}
            photoUrl={venue.photoUrl ?? venue.photoUrls?.[0] ?? venue.photo_urls?.[0]}
            photoUrls={venue.photoUrls ?? venue.photo_urls}
            className="h-full w-full"
            imageClassName="transition-transform duration-300 ease-out group-hover:scale-[1.035]"
            sizes="(max-width: 768px) 100vw, 420px"
            loading="lazy"
          />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#14141A] to-transparent" aria-hidden="true" />
          <div className="absolute left-3 top-3">
            <CategoryBadge category={venue.category} />
          </div>
          <div className="absolute right-3 top-3">
            <OpenStatusBadge openNow={venue.openNow ?? venue.open_now ?? venue.opening_hours?.open_now ?? null} />
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="min-w-0">
            <h2 className="font-display text-[20px] font-black leading-tight tracking-normal text-white">
              <HighlightText text={venue.name} query={searchQuery} />
            </h2>
            <p className="mt-1 truncate text-[13px] font-medium text-white/45">{venue.address}</p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
            <GoogleRating rating={rating} reviewCount={reviewCount} />
            <PriceLevelDisplay priceLevel={venue.priceLevel} className="text-[13px]" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <BusynessBadge value={busyness} source={venue.signal?.busynessSource ?? null} />
          </div>
        </div>
      </Link>
    </li>
  );
}

function ExploreEmptyState({ hasActiveSearchOrFilter, onClear }: { hasActiveSearchOrFilter: boolean; onClear: () => void }) {
  return (
    <div className="rounded-[8px] border border-white/[0.08] bg-[#14141A] px-6 py-10 text-center shadow-[0_18px_42px_rgba(0,0,0,0.24)]">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#8B6CFF]/25 bg-[#8B6CFF]/10 text-[#8B6CFF]" aria-hidden="true">
        <SearchX className="h-6 w-6" strokeWidth={2.2} />
      </div>
      <h2 className="mt-4 font-display text-[20px] font-black text-white">
        {hasActiveSearchOrFilter ? "No venues match your filters." : "No venues are available in Charlotte yet."}
      </h2>
      {hasActiveSearchOrFilter ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-5 inline-flex min-h-[42px] items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#9C85FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/75"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

export function ExplorePageClient() {
  const router = useRouter();
  const trackPageView = useTrack();
  const [venues, setVenues] = useState<ConsumerVenue[] | undefined>(undefined);
  const [isFetchingVenues, setIsFetchingVenues] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [priceFilter, setPriceFilter] = useState<PriceFilter>(null);
  const [busynessFilter, setBusynessFilter] = useState<BusynessFilter>("any");
  const [sortBy, setSortBy] = useState<SortOption>("busyness");
  const [searchSuggestions, setSearchSuggestions] = useState<VenueSuggestion[]>([]);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const prefetchedVenueIdsRef = useRef<Set<string>>(new Set());

  const fetchVenues = useCallback(async (signal?: AbortSignal) => {
    setIsFetchingVenues(true);
    setError(null);

    try {
      const res = await fetch("/api/venues", { cache: "no-store", signal });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setVenues(Array.isArray(json?.data?.venues) ? json.data.venues : []);
    } catch {
      if (!signal?.aborted) setError("Can't reach venues right now. Try again.");
    } finally {
      if (!signal?.aborted) setIsFetchingVenues(false);
    }
  }, []);

  useEffect(() => {
    void trackPageView("page_view", { meta: { page: "explore" } });
  }, [trackPageView]);

  useEffect(() => {
    const initialSearchQuery = sessionStorage.getItem(EXPLORE_SEARCH_STORAGE_KEY) ?? "";
    setSearchQuery(initialSearchQuery);
    setDebouncedSearchQuery(initialSearchQuery);

    const controller = new AbortController();
    void fetchVenues(controller.signal);
    return () => controller.abort();
  }, [fetchVenues]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => window.clearTimeout(id);
  }, [searchQuery]);

  useEffect(() => {
    const trimmedSearchQuery = debouncedSearchQuery.trim();
    if (trimmedSearchQuery) sessionStorage.setItem(EXPLORE_SEARCH_STORAGE_KEY, trimmedSearchQuery);
    else sessionStorage.removeItem(EXPLORE_SEARCH_STORAGE_KEY);

    const url = new URL(window.location.href);
    if (trimmedSearchQuery) url.searchParams.set("q", trimmedSearchQuery);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [debouncedSearchQuery]);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 2) {
      setSearchSuggestions([]);
      setIsSuggestionsOpen(false);
      return;
    }

    const controller = new AbortController();
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/venues/suggest?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const json = (await res.json()) as { suggestions?: VenueSuggestion[] };
        if (!controller.signal.aborted) {
          setSearchSuggestions(Array.isArray(json.suggestions) ? json.suggestions.slice(0, 5) : []);
          setIsSuggestionsOpen(true);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSearchSuggestions([]);
          setIsSuggestionsOpen(false);
        }
      }
    }, 200);

    return () => {
      controller.abort();
      window.clearTimeout(id);
    };
  }, [searchQuery]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!searchContainerRef.current || searchContainerRef.current.contains(event.target as Node)) return;
      setIsSuggestionsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const filteredVenues = useMemo(() => {
    if (venues === undefined) return [];

    return venues
      .filter((venue) => {
        if (venue.hidden) return false;
        if (!venueMatchesSearchQuery(venue, debouncedSearchQuery)) return false;
        if (!venueMatchesCategory(venue, categoryFilter)) return false;
        if (openNowOnly && (venue.openNow ?? venue.open_now ?? venue.opening_hours?.open_now) !== true) return false;
        if (priceFilter !== null && venue.priceLevel !== priceFilter) return false;
        return venueMatchesBusyness(venue, busynessFilter);
      })
      .sort((a, b) => {
        if (sortBy === "distance") {
          const distanceDelta = getVenueDistanceFromLaunch(a) - getVenueDistanceFromLaunch(b);
          if (distanceDelta !== 0) return distanceDelta;
        }

        if (sortBy === "rating") {
          const aRating = getVenueRating(a) ?? -1;
          const bRating = getVenueRating(b) ?? -1;
          if (aRating !== bRating) return bRating - aRating;
        }

        if (sortBy === "busyness") {
          const aBusyness = getVenueBusyness(a) ?? -1;
          const bBusyness = getVenueBusyness(b) ?? -1;
          if (aBusyness !== bBusyness) return bBusyness - aBusyness;
        }

        const aRating = getVenueRating(a) ?? -1;
        const bRating = getVenueRating(b) ?? -1;
        return bRating - aRating || a.name.localeCompare(b.name);
      });
  }, [busynessFilter, categoryFilter, debouncedSearchQuery, openNowOnly, priceFilter, sortBy, venues]);

  const prefetchVenueDetail = useCallback((venueId: string) => {
    if (prefetchedVenueIdsRef.current.has(venueId)) return;
    prefetchedVenueIdsRef.current.add(venueId);
    router.prefetch(`/venues/${venueId}`);
  }, [router]);

  const hasActiveSearchOrFilter = Boolean(
    debouncedSearchQuery.trim() ||
    categoryFilter !== "all" ||
    openNowOnly ||
    priceFilter !== null ||
    busynessFilter !== "any",
  );

  function clearSearch() {
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setSearchSuggestions([]);
    setIsSuggestionsOpen(false);
    searchInputRef.current?.focus();
  }

  function clearFilters() {
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setCategoryFilter("all");
    setOpenNowOnly(false);
    setPriceFilter(null);
    setBusynessFilter("any");
    setSearchSuggestions([]);
    setIsSuggestionsOpen(false);
  }

  function selectSearchSuggestion(suggestion: VenueSuggestion) {
    setIsSuggestionsOpen(false);
    setSearchSuggestions([]);
    trackAnalytics("explore_search_suggestion_clicked", { venue_id: suggestion.id });
    router.push(`/venues/${encodeURIComponent(suggestion.id)}`);
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") setIsSuggestionsOpen(false);
  }

  const isLoading = venues === undefined;

  return (
    <div className="min-h-screen-safe bg-[#0A0A0E] pb-28 text-white">
      <header className="border-b border-white/[0.06] bg-[#0A0A0E] px-4 pb-4 pt-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[12px] font-black uppercase tracking-[0.18em] text-[#8B6CFF]">nytchkr</p>
              <h1 className="mt-1 font-display text-[32px] font-black leading-tight tracking-normal text-white sm:text-[40px]">
                Explore Charlotte
              </h1>
            </div>
            {!isLoading && (
              <p className="shrink-0 text-right text-sm font-semibold text-white/48">
                {filteredVenues.length} {filteredVenues.length === 1 ? "venue" : "venues"}
              </p>
            )}
          </div>

          <div className="sticky top-0 z-30 -mx-4 mt-5 space-y-3 border-y border-white/[0.06] bg-[#0A0A0E]/95 px-4 py-3 backdrop-blur">
            <div ref={searchContainerRef} className="relative">
              <label htmlFor="venue-search" className="sr-only">
                Search venues
              </label>
              <input
                ref={searchInputRef}
                aria-label="Search venues"
                aria-autocomplete="list"
                aria-controls="explore-search-suggestions"
                aria-expanded={isSuggestionsOpen && searchSuggestions.length > 0}
                id="venue-search"
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  if (event.target.value.trim().length >= 2) setIsSuggestionsOpen(true);
                }}
                onFocus={() => {
                  if (searchSuggestions.length > 0) setIsSuggestionsOpen(true);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search restaurants, bars, lounges..."
                className="w-full rounded-[14px] border border-white/[0.08] bg-[#14141A] px-4 py-3 pl-11 pr-12 text-base font-semibold text-white placeholder:text-white/36 focus:border-[#8B6CFF]/60 focus:outline-none focus:ring-2 focus:ring-[#8B6CFF]/25"
              />
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/42" strokeWidth={2.3} aria-hidden="true" />
              {searchQuery.length > 0 ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/75"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} />
                </button>
              ) : null}
              {isSuggestionsOpen && searchSuggestions.length > 0 ? (
                <div
                  id="explore-search-suggestions"
                  role="listbox"
                  aria-label="Search suggestions"
                  className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#14141A] shadow-2xl shadow-black/35"
                >
                  {searchSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      role="option"
                      aria-selected="false"
                      onClick={() => selectSearchSuggestion(suggestion)}
                      className="block w-full px-4 py-3 text-left transition-colors hover:bg-white/[0.06] focus:bg-white/[0.08] focus:outline-none"
                    >
                      <span className="block truncate text-sm font-black text-white">{suggestion.name}</span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-white/45">
                        {suggestion.category ?? "Venue"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="scroll-touch flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Category filters">
              {CATEGORY_FILTERS.map((filter) => (
                <FilterPill
                  key={filter.value}
                  active={categoryFilter === filter.value}
                  onClick={() => {
                    setCategoryFilter(filter.value);
                    trackAnalytics("explore_category_filter_selected", { filter: filter.value });
                  }}
                >
                  {filter.label}
                </FilterPill>
              ))}
            </div>

            <div className="scroll-touch flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Open price and busyness filters">
              <FilterPill
                active={openNowOnly}
                onClick={() => {
                  setOpenNowOnly((current) => !current);
                  trackAnalytics("explore_open_now_filter_toggled", { enabled: !openNowOnly });
                }}
              >
                Open Now
              </FilterPill>
              {PRICE_FILTERS.map((filter) => (
                <FilterPill
                  key={filter.label}
                  active={priceFilter === filter.value}
                  ariaLabel={`Price ${filter.label}`}
                  onClick={() => {
                    setPriceFilter((current) => current === filter.value ? null : filter.value);
                    trackAnalytics("explore_price_filter_selected", { filter: filter.label });
                  }}
                >
                  {filter.label}
                </FilterPill>
              ))}
              {BUSYNESS_FILTERS.map((filter) => (
                <FilterPill
                  key={filter.value}
                  active={busynessFilter === filter.value}
                  onClick={() => {
                    setBusynessFilter(filter.value);
                    trackAnalytics("explore_busyness_filter_selected", { filter: filter.value });
                  }}
                >
                  {filter.label}
                </FilterPill>
              ))}
            </div>

            <div className="scroll-touch flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Sort options">
              {SORT_OPTIONS.map((option) => (
                <FilterPill
                  key={option.value}
                  active={sortBy === option.value}
                  ariaLabel={`Sort by ${option.label.toLowerCase()}`}
                  onClick={() => {
                    setSortBy(option.value);
                    trackAnalytics("explore_sort_selected", { sort: option.value });
                  }}
                >
                  {option.label}
                </FilterPill>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-5">
        {error ? (
          <div role="alert" className="rounded-[18px] border border-white/[0.08] bg-[#14141A] p-8 text-center">
            <p className="text-sm font-semibold text-white">{error}</p>
            <button
              type="button"
              onClick={() => void fetchVenues()}
              className="mt-4 inline-flex min-h-[42px] items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#9C85FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/75"
            >
              Retry
            </button>
          </div>
        ) : null}

        {isLoading && !error ? (
          <div role="status" aria-label="Loading venues" className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : null}

        {!isLoading && !error && filteredVenues.length === 0 ? (
          <ExploreEmptyState hasActiveSearchOrFilter={hasActiveSearchOrFilter} onClear={clearFilters} />
        ) : null}

        {!isLoading && !error && filteredVenues.length > 0 ? (
          <section role="region" aria-label="Venue results">
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredVenues.map((venue) => (
                <VenueDiscoveryCard
                  key={venue.id}
                  venue={venue}
                  searchQuery={debouncedSearchQuery}
                  onPrefetchVenue={prefetchVenueDetail}
                />
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
