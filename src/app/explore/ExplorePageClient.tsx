"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { SearchX } from "lucide-react";
import { motion } from "framer-motion";
import type { Session } from "@supabase/supabase-js";
import { CategoryBadge, PriceLevelDisplay } from "@/components/CategoryBadge";
import { MIN_SAMPLE_SIZE_FOR_RATIO, getMFRatioPercents } from "@/components/MFRatioBar";
import { OpenNowBadge } from "@/components/OpenNowBadge";
import SkeletonCard from "@/components/SkeletonCard";
import {
  ExploreSortFilter,
  type ExploreFilterOption,
  type ExploreSortOption,
} from "@/components/ExploreSortFilter";
import { TrendingRow } from "@/components/TrendingRow";
import { TrendingBadge } from "@/components/TrendingBadge";
import { SignalFreshnessLabel } from "@/components/SignalFreshnessLabel";
import { getBusynessState } from "@/lib/busyness";
import { distanceMiles } from "@/lib/distance";
import { getNeighborhood } from "@/lib/neighborhood";
import { formatSignalConfidenceLabel } from "@/lib/signalConfidenceLabel";
import { fetchTrendingVenueIds } from "@/lib/trendingVenueIds";
import { inZone } from "@/lib/zone";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useSavedVenues } from "@/hooks/useSavedVenues";
import { VENUE_PHOTO_BLUR_DATA_URL } from "@/lib/imagePlaceholders";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useTrack } from "@/lib/useTrack";
import type { BusynessSource, ConsumerVenue } from "@/types";

type UserLocation = { lat: number; lng: number };
type HottestBusynessLabel = "Dead" | "Quiet" | "Moderate" | "Busy" | "Packed";
type ActivityFeedItem = {
  id: string;
  user: {
    name: string;
    avatar_url: string | null;
  };
  venue: {
    id: string;
    name: string;
  };
  checked_in_at: string;
};

const EXPLORE_SORT_STORAGE_KEY = "nv_explore_sort";
const DEFAULT_EXPLORE_SORT: ExploreSortOption = "hottest";
const NEIGHBORHOOD_EXPLORE_FILTERS: ExploreFilterOption[] = ["South End", "Uptown", "NoDa", "Dilworth"];
const VIEWED_VENUES_STORAGE_KEY = "nightvibe.viewed_venues";
const EXPLORE_VENUES_EVENT = "nightvibe:explore-venues-updated";
const OUT_OF_ZONE_SEARCH_MESSAGE = "NightVibe isn't live in your area yet. We're starting in South End Charlotte.";
const LOCATION_SEARCH_CENTERS: Record<string, [number, number]> = {
  noda: [35.2396, -80.8106],
  "no da": [35.2396, -80.8106],
  uptown: [35.2271, -80.8431],
  "28202": [35.2271, -80.8431],
  "28203": [35.2178, -80.8597],
  "28204": [35.22, -80.83],
  "28205": [35.23, -80.79],
  "28206": [35.25, -80.82],
  "28207": [35.21, -80.81],
  "28208": [35.22, -80.9],
  "28209": [35.17, -80.85],
  "28210": [35.14, -80.88],
  "28211": [35.19, -80.78],
  "28212": [35.2, -80.75],
};
function trackAnalytics(event: string, properties: Record<string, string | number | boolean | null>) {
  try {
    track(event, properties);
  } catch {
    // Analytics must never break the UI.
  }
}

function isExploreSortOption(value: string | null): value is ExploreSortOption {
  return value === "hottest" || value === "top-rated" || value === "trending" || value === "nearby";
}

function getVenueVibeScore(venue: ConsumerVenue): number | null {
  const score = venue.vibe_score ?? venue.current_popularity ?? venue.signal?.busyness0To100 ?? null;
  return score == null || !Number.isFinite(score) ? null : score;
}

function getVenueRating(venue: ConsumerVenue): number | null {
  const rating = venue.rating ?? venue.googleRating ?? null;
  return rating == null || !Number.isFinite(rating) ? null : rating;
}

function getVenueOpenNow(venue: ConsumerVenue): boolean | null {
  return venue.openNow ?? null;
}

function getVenueNeighborhoodName(venue: ConsumerVenue): string {
  return venue.neighborhood ?? getNeighborhood(venue.lat, venue.lng);
}

function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[_-]+/g, " ");
}

function getSearchedLocationCenter(query: string): [number, number] | null {
  const normalized = normalizeSearchText(query.trim());
  if (!normalized) return null;

  const zip = normalized.match(/\b\d{5}\b/)?.[0];
  if (zip && LOCATION_SEARCH_CENTERS[zip]) return LOCATION_SEARCH_CENTERS[zip];

  return LOCATION_SEARCH_CENTERS[normalized] ?? null;
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

function getInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return initials || "NV";
}

function getVenueInitial(name: string): string {
  return name.trim()[0]?.toUpperCase() ?? "N";
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function getHottestBusynessLabel(level: number): HottestBusynessLabel {
  if (level >= 81) return "Packed";
  if (level >= 61) return "Busy";
  if (level >= 41) return "Moderate";
  if (level >= 21) return "Quiet";
  return "Dead";
}

function getHottestBusynessColor(label: HottestBusynessLabel): string {
  switch (label) {
    case "Packed":
      return "#FF5B6A";
    case "Busy":
      return "#FF5B6A";
    case "Moderate":
      return "#FFB020";
    case "Quiet":
      return "#5C6573";
    case "Dead":
      return "#5C6573";
  }
}

function getRelativeTimeLabel(value: string): string {
  const checkedInMs = new Date(value).getTime();
  if (!Number.isFinite(checkedInMs)) return "now";

  const seconds = Math.max(0, Math.floor((Date.now() - checkedInMs) / 1000));
  if (seconds < 60) return "now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ActivityCard({ item }: { item: ActivityFeedItem }) {
  return (
    <article className="w-48 flex-shrink-0 rounded-xl bg-white/[0.04] px-3 py-2.5">
      <div className="flex items-center gap-3">
        {item.user.avatar_url ? (
          <Image
            src={item.user.avatar_url}
            alt={`${item.user.name} avatar`}
            width={40}
            height={40}
            sizes="40px"
            loading="lazy"
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-black text-white/75">
            {getInitials(item.user.name)}
          </div>
        )}
        <div className="min-w-0">
          <p className="line-clamp-2 text-xs font-semibold leading-4 text-white/75">
            <span className="font-black text-white">{item.user.name}</span>{" "}
            checked into <span className="font-black text-white">{item.venue.name}</span>
          </p>
          <time dateTime={item.checked_in_at} className="mt-1 block text-[11px] font-semibold text-white/55">
            {getRelativeTimeLabel(item.checked_in_at)}
          </time>
        </div>
      </div>
    </article>
  );
}

function BusynessChip({
  value,
  source,
}: {
  value: number | null;
  source: BusynessSource | null;
}) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-[#9CA2AE]">
        No crowd data
      </span>
    );
  }

  const percent = clampPercent(value);
  const state = getBusynessState(percent);
  const badge = source === "live" ? "LIVE" : source === "forecast" ? "FORECAST" : source === "crowd" ? "CROWD" : null;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black leading-none"
      style={{ borderColor: `${state.color}55`, backgroundColor: `${state.color}1A`, color: state.color }}
      aria-label={`${state.label}, ${percent}% busy${badge ? `, ${badge}` : ""}`}
    >
      <span>{state.label}</span>
      <span className="text-[#9CA2AE]">{percent}%</span>
      {badge ? (
        <span className="inline-flex items-center gap-1 text-[9px] text-[#9CA2AE]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${badge === "LIVE" ? "animate-pulse bg-[#22C55E] shadow-[0_0_10px_rgba(34,197,94,0.75)]" : "bg-[#646B79]"}`}
            aria-hidden="true"
          />
          {badge}
        </span>
      ) : null}
    </span>
  );
}

function MFRatioPill({ malePercent, femalePercent }: { malePercent: number; femalePercent: number }) {
  const isMaleLeaning = malePercent >= femalePercent;
  const percent = isMaleLeaning ? malePercent : femalePercent;
  const label = isMaleLeaning ? "M" : "F";
  const color = isMaleLeaning ? "#8B6CFF" : "#F0568C";

  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-black"
      style={{ borderColor: `${color}55`, backgroundColor: `${color}1A`, color }}
      aria-label={`${malePercent}% male, ${femalePercent}% female`}
    >
      {percent}% {label}
    </span>
  );
}

function HottestRightNow({ venues }: { venues: ConsumerVenue[] }) {
  if (venues.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Hottest right now">
      <h2 className="font-display text-sm font-semibold text-[#F4F5F8]">Hottest right now</h2>
      <div className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-white/[0.035]">
        {venues.map((venue, index) => {
          const rawLevel = venue.signal?.busyness0To100 ?? 0;
          const level = clampPercent(rawLevel);
          const label = getHottestBusynessLabel(level);
          const color = getHottestBusynessColor(label);

          return (
            <Link
              key={venue.id}
              href={`/venues/${encodeURIComponent(venue.id)}`}
              onClick={() => trackAnalytics("hottest_right_now_tapped", { venueId: venue.id, rank: index + 1 })}
              className="group grid min-h-[58px] grid-cols-[2.75rem_minmax(0,1fr)_4.7rem] items-center gap-3 border-b border-white/[0.06] px-3.5 py-3 transition-colors last:border-b-0 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8B6CFF]/60"
              aria-label={`Open ${venue.name}, ranked number ${index + 1}, ${label}`}
            >
              <span className="font-display text-sm font-black text-white/55">#{index + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-black text-white">{venue.name}</span>
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden="true">
                  <span className="block h-full rounded-full" style={{ width: `${level}%`, backgroundColor: color }} />
                </span>
              </span>
              <span
                className="justify-self-end rounded-full border px-2 py-1 text-[11px] font-black leading-none"
                style={{ borderColor: `${color}55`, backgroundColor: `${color}1F`, color }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function VenueFeedCard({
  venue,
  searchQuery,
  distance,
  index,
  prefersReduced,
  isTrending,
}: {
  venue: ConsumerVenue;
  searchQuery: string;
  distance: number | null;
  index: number;
  prefersReduced: boolean;
  isTrending: boolean;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const signal = venue.signal;
  const busyness = signal?.busyness0To100 ?? null;
  const rating = venue.rating ?? venue.googleRating;
  const ratingLabel = rating?.toFixed(1);
  const reviewCount = venue.userRatingCount ?? venue.totalRatings;
  const reviewLabel = reviewCount == null || !Number.isFinite(reviewCount)
    ? null
    : `${Math.round(reviewCount).toLocaleString()} review${Math.round(reviewCount) === 1 ? "" : "s"}`;
  const googleRatingLabel = ratingLabel ? `★ ${ratingLabel}${reviewLabel ? ` · ${reviewLabel}` : ""}` : null;
  const hasBusyness = busyness !== null && Number.isFinite(busyness);
  const signalConfidenceLabel = hasBusyness ? formatSignalConfidenceLabel(signal) : null;
  const hasMfReading =
    signal?.mfRatio !== null &&
    signal?.mfRatio !== undefined &&
    signal.sampleSize >= MIN_SAMPLE_SIZE_FOR_RATIO;
  const mfPercents = hasMfReading ? getMFRatioPercents(signal.mfRatio) : null;
  const neighborhood = getNeighborhood(venue.lat, venue.lng);

  return (
    <motion.li
      className="h-auto sm:h-[126px]"
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
        onClick={() => trackAnalytics("venue_card_tapped", { venueId: venue.id })}
        className="group relative flex h-full w-full flex-col items-stretch gap-3 overflow-hidden rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.035)] p-3 transition-colors hover:border-white/[0.16] hover:bg-white/[0.05] active:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 sm:flex-row sm:items-center"
        aria-label={`Open ${venue.name}`}
      >
        {isTrending ? <TrendingBadge className="absolute right-3 top-3 z-10" /> : null}
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-[#8B6CFF]/20 sm:h-[72px] sm:w-[72px] sm:aspect-auto">
          {venue.photoUrl && !photoFailed ? (
            <Image
              src={venue.photoUrl}
              alt={venue.name}
              fill
              sizes="(max-width: 639px) calc(100vw - 2.5rem), 72px"
              loading={index === 0 ? undefined : "lazy"}
              priority={index === 0}
              placeholder="blur"
              blurDataURL={VENUE_PHOTO_BLUR_DATA_URL}
              onError={() => setPhotoFailed(true)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xl font-black text-[#8B6CFF]" aria-hidden="true">
              {getVenueInitial(venue.name)}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <h2 className="min-w-0 truncate text-[16px] font-semibold leading-tight text-white">
                  <HighlightText text={venue.name} query={searchQuery} />
                </h2>
                <OpenNowBadge openNow={venue.openNow ?? null} />
              </div>
              {googleRatingLabel ? (
                <span
                  className="max-w-[6rem] shrink-0 truncate rounded-full border border-white/[0.08] bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-[#F4F5F8]"
                  aria-label={reviewLabel ? `${ratingLabel} star rating from ${reviewLabel}` : `${ratingLabel} star rating`}
                >
                  {googleRatingLabel}
                </span>
              ) : null}
            </div>
            <p className="truncate text-xs font-semibold text-[#9CA2AE]">{neighborhood}</p>
            <div className="flex min-w-0 items-center gap-2">
              <CategoryBadge category={venue.category} className="max-w-[8.5rem] shrink truncate" />
              <PriceLevelDisplay priceLevel={venue.priceLevel} className="shrink-0" />
            </div>
          </div>

          <BusynessChip value={busyness} source={signal?.busynessSource ?? null} />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <span className="min-w-0 truncate text-[13px] font-medium text-[#9CA2AE]">
              {distance != null ? `${distance.toFixed(1)} mi · ` : ""}
              {venue.address}
            </span>
            <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
              {mfPercents ? (
                <MFRatioPill malePercent={mfPercents.male} femalePercent={mfPercents.female} />
              ) : null}
              {hasBusyness ? <SignalFreshnessLabel signal={signal} /> : null}
            </div>
          </div>
          {signalConfidenceLabel ? <p className="sr-only">{signalConfidenceLabel}</p> : null}
        </div>
      </Link>
    </motion.li>
  );
}

export function ExplorePageClient() {
  const trackPageView = useTrack();
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [session, setSession] = useState<Session | null>(null);
  const [venues, setVenues] = useState<ConsumerVenue[] | undefined>(undefined);
  const [isFetchingVenues, setIsFetchingVenues] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [exploreSort, setExploreSort] = useState<ExploreSortOption>(DEFAULT_EXPLORE_SORT);
  const [exploreFilters, setExploreFilters] = useState<Set<ExploreFilterOption>>(() => new Set());
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityFeedItem[]>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [trendingVenueIds, setTrendingVenueIds] = useState<Set<string>>(() => new Set());
  const { savedIds } = useSavedVenues();
  const hasLoadedVenuesRef = useRef(false);
  const activitySectionRef = useRef<HTMLElement | null>(null);
  const activityViewedRef = useRef(false);

  const fetchVenues = useCallback(async ({
    reset = false,
    searchTerm = "",
    signal,
  }: {
    reset?: boolean;
    searchTerm?: string;
    signal?: AbortSignal;
  } = {}) => {
    if (reset) setVenues(undefined);
    setIsFetchingVenues(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const trimmedSearchTerm = searchTerm.trim();
      if (trimmedSearchTerm) params.set("q", trimmedSearchTerm);
      const url = params.size ? `/api/venues?${params.toString()}` : "/api/venues";
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setVenues(json?.data?.venues ?? []);
      hasLoadedVenuesRef.current = true;
    } catch {
      if (signal?.aborted) return;
      setError("📡 Can't reach the server. Pull to refresh.");
    } finally {
      if (!signal?.aborted) setIsFetchingVenues(false);
    }
  }, []);

  const refreshVenues = useCallback(async () => {
    await fetchVenues({ searchTerm: debouncedSearchQuery });
  }, [debouncedSearchQuery, fetchVenues]);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/activity/feed");
      if (!res.ok) throw new Error(`${res.status}`);
      const json = (await res.json()) as { items?: ActivityFeedItem[] };
      setActivityItems(Array.isArray(json.items) ? json.items.slice(0, 8) : []);
    } catch {
      setActivityItems([]);
    } finally {
      setActivityLoaded(true);
    }
  }, []);

  const { pulling, refreshing } = usePullToRefresh(refreshVenues);

  useEffect(() => {
    void fetchActivity();
    const id = window.setInterval(() => void fetchActivity(), 60_000);
    return () => window.clearInterval(id);
  }, [fetchActivity]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTrendingVenues() {
      try {
        setTrendingVenueIds(await fetchTrendingVenueIds(controller.signal));
      } catch {
        if (!controller.signal.aborted) setTrendingVenueIds(new Set());
      }
    }

    void loadTrendingVenues();
    return () => controller.abort();
  }, []);

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
    const storedSort = localStorage.getItem(EXPLORE_SORT_STORAGE_KEY);
    if (isExploreSortOption(storedSort)) setExploreSort(storedSort);
  }, []);

  useEffect(() => {
    localStorage.setItem(EXPLORE_SORT_STORAGE_KEY, exploreSort);
  }, [exploreSort]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const element = activitySectionRef.current;
    if (!element || activityViewedRef.current || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || activityViewedRef.current) return;
        activityViewedRef.current = true;
        trackAnalytics("activity_feed_viewed", { source: "explore" });
        observer.disconnect();
      },
      { threshold: 0.4 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (venues === undefined) return;

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
    window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" });
  }, [debouncedSearchQuery, exploreFilters, exploreSort]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => window.clearTimeout(id);
  }, [searchQuery]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchVenues({
      reset: !hasLoadedVenuesRef.current,
      searchTerm: debouncedSearchQuery,
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [debouncedSearchQuery, fetchVenues]);

  useEffect(() => {
    const client = createBrowserClient();

    client.auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
      })
      .catch(() => setSession(null));

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const effectiveExploreSort = exploreSort === "nearby" && !userLocation ? DEFAULT_EXPLORE_SORT : exploreSort;

  const sortedVenues = useMemo(() => {
    if (venues === undefined) return [];

    const activeNeighborhoodFilters = NEIGHBORHOOD_EXPLORE_FILTERS.filter((filter) => exploreFilters.has(filter));

    return venues.filter((venue) => {
      if (venue.hidden) return false;

      const neighborhoodName = getVenueNeighborhoodName(venue);
      const matchesOpenNow = !exploreFilters.has("open-now") || getVenueOpenNow(venue) === true;
      const matchesSaved =
        !exploreFilters.has("saved") ||
        savedIds.has(venue.id) ||
        Boolean(venue.placeId && savedIds.has(venue.placeId));
      const matchesExploreNeighborhood =
        activeNeighborhoodFilters.length === 0 || activeNeighborhoodFilters.includes(neighborhoodName as ExploreFilterOption);
      return matchesOpenNow && matchesSaved && matchesExploreNeighborhood;
    }).sort((a, b) => {
      if (effectiveExploreSort === "top-rated") {
        const aRating = getVenueRating(a);
        const bRating = getVenueRating(b);
        if (aRating == null && bRating == null) return a.name.localeCompare(b.name);
        if (aRating == null) return 1;
        if (bRating == null) return -1;
        return bRating - aRating || a.name.localeCompare(b.name);
      }

      if (effectiveExploreSort === "trending") {
        const aTrending = Boolean(a.trending) || trendingVenueIds.has(a.id);
        const bTrending = Boolean(b.trending) || trendingVenueIds.has(b.id);
        if (aTrending !== bTrending) return aTrending ? -1 : 1;
        const aScore = getVenueVibeScore(a) ?? 0;
        const bScore = getVenueVibeScore(b) ?? 0;
        return bScore - aScore || a.name.localeCompare(b.name);
      }

      if (effectiveExploreSort === "nearby" && userLocation) {
        const aDistance = distanceMiles(userLocation.lat, userLocation.lng, a.lat, a.lng);
        const bDistance = distanceMiles(userLocation.lat, userLocation.lng, b.lat, b.lng);
        return aDistance - bDistance || a.name.localeCompare(b.name);
      }

      if (effectiveExploreSort === "hottest") {
        const aScore = getVenueVibeScore(a);
        const bScore = getVenueVibeScore(b);
        if (aScore == null && bScore == null) return a.name.localeCompare(b.name);
        if (aScore == null) return 1;
        if (bScore == null) return -1;
        return bScore - aScore || a.name.localeCompare(b.name);
      }

      return a.name.localeCompare(b.name);
    });
  }, [effectiveExploreSort, exploreFilters, savedIds, trendingVenueIds, userLocation, venues]);

  const hottestVenues = useMemo(() => {
    if (venues === undefined) return [];

    return venues
      .filter((venue) => {
        const busynessLevel = venue.signal?.busyness0To100 ?? 0;
        return !venue.hidden && Number.isFinite(busynessLevel) && busynessLevel > 0;
      })
      .sort((a, b) => {
        const aBusyness = a.signal?.busyness0To100 ?? 0;
        const bBusyness = b.signal?.busyness0To100 ?? 0;
        return bBusyness - aBusyness || a.name.localeCompare(b.name);
      })
      .slice(0, 5);
  }, [venues]);

  const venueDistances = useMemo(() => {
    if (!userLocation || venues === undefined) return new Map<string, number>();

    return new Map(
      venues.map((venue) => [
        venue.id,
        distanceMiles(userLocation.lat, userLocation.lng, venue.lat, venue.lng),
      ]),
    );
  }, [userLocation, venues]);

  const venuesCount = venues?.length ?? 0;
  const searchedLocationCenter = getSearchedLocationCenter(searchQuery);
  const showOutOfZoneSearchBanner = searchedLocationCenter
    ? !inZone(searchedLocationCenter[0], searchedLocationCenter[1])
    : false;
  const activeExploreNeighborhoods = NEIGHBORHOOD_EXPLORE_FILTERS.filter((filter) => exploreFilters.has(filter));
  const savedCount = savedIds.size;
  const resultAreaLabel = activeExploreNeighborhoods.length > 0
    ? activeExploreNeighborhoods.join(", ")
    : "all areas";
  const resultCountLabel = `${sortedVenues.length} spot${sortedVenues.length === 1 ? "" : "s"} in ${resultAreaLabel}`;
  const trimmedSearchQuery = debouncedSearchQuery.trim();
  const isSearchingVenues = isFetchingVenues && trimmedSearchQuery.length > 0;
  function clearFilters() {
    setSearchQuery("");
    setExploreSort(DEFAULT_EXPLORE_SORT);
    setExploreFilters(new Set());
  }

  function selectExploreSort(option: ExploreSortOption) {
    if (option === "nearby" && !userLocation) return;
    setExploreSort(option);
    trackAnalytics("explore_filter_selected", { filter: option });
  }

  function toggleExploreFilter(option: ExploreFilterOption) {
    setExploreFilters((current) => {
      const next = new Set(current);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      return next;
    });
    trackAnalytics("explore_filter_selected", { filter: option });
  }

  const timeLabel = useMemo(() => (
    now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  ), [now]);

  if (!venues) {
    return (
      <div className="min-h-screen-safe space-y-3 bg-[#0A0A0E] p-4 text-white">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  return (
    <div className="min-h-screen-safe bg-[#0A0A0E]">
      {(pulling || refreshing) && (
        <div
          className="fixed left-0 right-0 top-0 z-50 flex justify-center px-4 pt-3"
          role={refreshing ? "status" : undefined}
          aria-live="polite"
        >
          <div className="rounded-full border border-white/10 bg-[#0A0A0E]/90 px-4 py-2 text-xs font-semibold text-white/50 shadow-2xl backdrop-blur">
            {refreshing ? (
              <span className="flex items-center gap-2">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#8B6CFF] border-t-transparent" aria-hidden="true" />
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
          <div className="mb-3 flex items-center justify-between gap-3 text-xs font-semibold text-white/55">
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
                className="shrink-0 text-white/55"
              >
                <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="truncate">South End Charlotte</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <time className="text-white/55">{timeLabel}</time>
              {session && (
                <Link
                  href="/profile"
                  className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11.5px] font-semibold text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
                >
                  You
                </Link>
              )}
            </div>
          </div>
          <h1 className="font-display text-[34px] font-semibold text-white tracking-normal">
            South End
          </h1>
          <p className="mt-1 text-sm text-white/55">{venuesCount} spots tracked tonight</p>

          <div className="mt-5">
            <TrendingRow />
          </div>

          {hottestVenues.length > 0 && (
            <div className="mt-5">
              <HottestRightNow venues={hottestVenues} />
            </div>
          )}

          <div className="sticky top-0 z-30 -mx-4 mt-5 space-y-3 border-y border-white/[0.06] bg-[#0A0A0E]/95 px-4 py-3 backdrop-blur">
            <div className="relative">
              <label htmlFor="venue-search" className="sr-only">
                Search South End venues
              </label>
              <input aria-label="Search venues"
                id="venue-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search South End, Dilworth, venue name..."
                className="w-full rounded-xl border border-white/10 bg-[rgba(255,255,255,.05)] px-4 py-3 pl-11 pr-12 text-base font-semibold text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
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
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/55"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-lg font-black leading-none text-white/65 transition-colors hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            {showOutOfZoneSearchBanner && (
              <div
                role="status"
                className="rounded-[14px] border border-white/[0.08] bg-white/[0.07] px-4 py-3 text-sm font-semibold leading-5 text-[#9CA2AE]"
              >
                {OUT_OF_ZONE_SEARCH_MESSAGE}
              </div>
            )}

            <ExploreSortFilter
              selectedSort={effectiveExploreSort}
              selectedFilters={exploreFilters}
              nearbyEnabled={userLocation !== null}
              savedCount={savedCount}
              onSortChange={selectExploreSort}
              onFilterToggle={toggleExploreFilter}
            />
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-20 border-y border-white/[0.06] bg-[#0A0A0E]/95 backdrop-blur" role="region" aria-label="Explore filters summary">
        <div className="mx-auto max-w-lg px-4 py-2">
          <p className="text-[11.5px] text-[#9CA2AE]">
            {`Showing ${resultCountLabel}`}
          </p>
        </div>
      </div>

      <section className="mx-auto max-w-lg space-y-3 px-4 pb-6" role="region" aria-label="Venue results">
        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center"
          >
            <p className="text-sm font-semibold text-white">{error}</p>
            <button
              type="button"
              onClick={() => void refreshVenues()}
              className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-sm font-medium text-[#0A0A0E] transition-colors hover:bg-[#8B6CFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              Retry
            </button>
          </div>
        )}

        {(venues === undefined || isSearchingVenues) && !error && (
          <div role="status" aria-label={isSearchingVenues ? "Searching venues" : "Loading venues"}>
            <p className="mb-3 text-sm font-semibold text-white/55">
              {isSearchingVenues ? "Searching..." : "Loading venues..."}
            </p>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {venues !== undefined && !error && !isSearchingVenues && venues.length === 0 && (
          <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-8 text-center">
            <h2 className="font-display text-[19px] font-semibold text-[#F4F5F8]">
              {trimmedSearchQuery ? `No venues found for "${trimmedSearchQuery}"` : "No venues in this area yet. Check back soon."}
            </h2>
            {trimmedSearchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-sm font-semibold text-[#0A0A0E] shadow-[0_0_20px_rgba(139,108,255,0.24)] transition-colors hover:bg-[#8B6CFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
              >
                Clear search
              </button>
            ) : (
              <Link
                href="/map"
                className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.07] px-5 text-sm font-semibold text-[#F4F5F8] transition-colors hover:bg-white/[0.1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
              >
                View map
              </Link>
            )}
          </div>
        )}

        {venues !== undefined && !error && !isSearchingVenues && venues.length > 0 && sortedVenues.length === 0 && (
          <div className="px-6 py-12 text-center text-white/60">
            <SearchX aria-hidden="true" className="mx-auto h-6 w-6" strokeWidth={1.9} />
            <h2 className="mt-3 text-[15px] font-semibold leading-6">
              No spots match this filter.
            </h2>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-sm font-semibold text-[#0A0A0E] shadow-[0_0_20px_rgba(139,108,255,0.24)] transition-colors hover:bg-[#8B6CFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              Clear filters
            </button>
          </div>
        )}

        {venues !== undefined && !error && !isSearchingVenues && sortedVenues.length > 0 && (
          <div className="scroll-touch pr-1 [will-change:scroll-position]">
            <ul className="venue-card-grid grid grid-cols-1 gap-3 lg:grid-cols-3">
              {sortedVenues.map((venue, index) => (
                <VenueFeedCard
                  key={venue.id}
                  venue={venue}
                  searchQuery={searchQuery}
                  distance={venueDistances.get(venue.id) ?? null}
                  index={index}
                  prefersReduced={prefersReduced}
                  isTrending={trendingVenueIds.has(venue.id)}
                />
              ))}
            </ul>
          </div>
        )}
      </section>

      <section
        ref={activitySectionRef}
        className="mx-auto max-w-lg px-4 pb-32"
        role="region"
        aria-label="Recent check-ins"
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#22C55E]" aria-hidden="true" />
          <h2 className="font-display text-[19px] font-semibold text-[#F4F5F8]">
            Recent check-ins
          </h2>
        </div>

        {activityLoaded && activityItems.length === 0 ? (
          <div className="mt-4 px-4 py-8 text-center text-white/60">
            <span aria-hidden="true" className="block text-2xl leading-none">👋</span>
            <p className="mt-3 text-sm font-semibold leading-5">
              Be the first to check in tonight.
            </p>
          </div>
        ) : (
          <div
            className="scroll-touch mt-3 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [will-change:scroll-position] [&::-webkit-scrollbar]:hidden"
            aria-live="polite"
          >
            {activityItems.map((item) => (
              <ActivityCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
