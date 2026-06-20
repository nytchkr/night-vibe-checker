"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { OnboardingOverlay } from "@/components/OnboardingOverlay";
import { getBusynessState } from "@/lib/busyness";
import { distanceMiles } from "@/lib/distance";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useTrack } from "@/lib/useTrack";
import type { ConsumerVenue } from "@/types";

type BusynessFilter = "All" | "Packed" | "Moderate" | "Quiet";
type CategoryFilter = "All" | "Bar" | "Club" | "Restaurant" | "Lounge";
type SortOption = "Busiest" | "Nearest";
type UserLocation = { lat: number; lng: number };

const BUSYNESS_FILTERS: BusynessFilter[] = ["All", "Packed", "Moderate", "Quiet"];
const SORT_OPTIONS: SortOption[] = ["Busiest", "Nearest"];
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
}: {
  label: T;
  active: boolean;
  onSelect: (label: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(label)}
      className={`min-h-[38px] shrink-0 rounded-full border px-4 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35 ${
        active ? "border-white/40 bg-white/[0.16] text-white" : "border-transparent bg-white/10 text-white/60 hover:bg-white/15 hover:text-white/80"
      }`}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function CategoryFilterPill({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`min-h-[38px] shrink-0 rounded-full border px-4 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35 ${
        active
          ? "border-white/35 bg-white/[0.14] text-white"
          : "border-white/10 bg-[#0A0A0F]/80 text-white/50 hover:border-white/20 hover:bg-white/10 hover:text-white/75"
      }`}
      aria-pressed={active}
    >
      {label}
    </button>
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
}: {
  venue: ConsumerVenue;
  searchQuery: string;
  distance: number | null;
}) {
  const categoryLabel = getCategoryChipLabel(venue.category);
  const priceLabel = "$".repeat(venue.priceLevel ?? 0) || "—";
  const ratingLabel = venue.rating?.toFixed(1) ?? "—";
  const signalLabel = getSignalLabel(venue);

  return (
    <li className="mb-3 last:mb-0">
      <Link
        href={`/venues/${encodeURIComponent(venue.id)}`}
        className="block overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.04] transition-colors hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/55"
        aria-label={`Open ${venue.name}`}
      >
        <div className="relative aspect-video w-full overflow-hidden bg-white/[0.06]">
          {venue.photoUrl ? (
            <Image
              src={venue.photoUrl}
              alt={venue.name}
              fill
              sizes="(max-width: 640px) calc(100vw - 32px), 512px"
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
    </li>
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
  const [session, setSession] = useState<Session | null>(null);
  const [venues, setVenues] = useState<ConsumerVenue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [busynessFilter, setBusynessFilter] = useState<BusynessFilter>("All");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All");
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("Busiest");
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
      const matchesOpenNow = !openNowOnly || venue.openNow === true;

      return matchesSearch && matchesBusyness && matchesCategory && matchesOpenNow;
    }).sort((a, b) => {
      if (sortOption === "Nearest" && userLocation) {
        const aDistance = distanceMiles(userLocation.lat, userLocation.lng, a.lat, a.lng);
        const bDistance = distanceMiles(userLocation.lat, userLocation.lng, b.lat, b.lng);
        return aDistance - bDistance || a.name.localeCompare(b.name);
      }

      const aState = getBusynessState(a.signal?.busyness0To100);
      const bState = getBusynessState(b.signal?.busyness0To100);
      return bState.rank - aState.rank || a.name.localeCompare(b.name);
    });
  }, [busynessFilter, categoryFilter, openNowOnly, searchQuery, sortOption, userLocation, venues]);

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
                  className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
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
                className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 pl-11 pr-12 text-base font-semibold text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none focus:ring-0"
                aria-label="Search South End venues"
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
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-lg font-black leading-none text-white/65 transition-colors hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <div className="flex">
              <button
                type="button"
                onClick={() => setOpenNowOnly((p) => !p)}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
                  openNowOnly
                    ? "border-white/35 bg-white/[0.16] text-white"
                    : "border-white/20 text-white/60 bg-transparent"
                }`}
                aria-pressed={openNowOnly}
              >
                🟢 Open Now
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {BUSYNESS_FILTERS.map((filter) => (
                <FilterChip
                  key={filter}
                  label={filter}
                  active={busynessFilter === filter}
                  onSelect={setBusynessFilter}
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
                />
              ))}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {SORT_OPTIONS.filter((option) => option !== "Nearest" || userLocation).map((option) => (
                <CategoryFilterPill
                  key={option}
                  label={option}
                  active={sortOption === option}
                  onSelect={() => setSortOption(option)}
                />
              ))}
            </div>

            <p className="text-sm font-bold text-white/55">{sortedVenues.length} spot{sortedVenues.length === 1 ? "" : "s"} showing</p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-lg space-y-3 px-4 pb-32" aria-label="Venue results">
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
            <p className="text-sm font-semibold text-white">
              {searchQuery.trim().length > 0
                ? `No spots match "${searchQuery.trim()}" — try a different name or category`
                : "No spots match your filters — try adjusting them"}
            </p>
          </div>
        )}

        {venues !== null && !error && sortedVenues.length > 0 && (
          <ul>
            {sortedVenues.map((venue) => (
              <VenueFeedCard
                key={venue.id}
                venue={venue}
                searchQuery={searchQuery}
                distance={venueDistances.get(venue.id) ?? null}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
