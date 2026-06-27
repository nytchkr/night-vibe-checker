"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import { SearchX, X } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { div as MotionDiv, li as MotionLi, span as MotionSpan } from "framer-motion/client";
import type { Session } from "@supabase/supabase-js";
import { CategoryBadge, PriceLevelDisplay } from "@/components/CategoryBadge";
import { MIN_SAMPLE_SIZE_FOR_RATIO, getMFRatioPercents } from "@/components/MFRatioBar";
import { OpenNowBadge } from "@/components/OpenNowBadge";
import { prefetchRoute } from "@/components/RoutePrefetch";
import SkeletonCard from "@/components/SkeletonCard";
import {
  ExploreSortFilter,
  type ExploreFilterOption,
  type ExploreSortOption,
} from "@/components/ExploreSortFilter";
import { TrendingRow } from "@/components/TrendingRow";
import { TrendingBadge } from "@/components/TrendingBadge";
import { SignalFreshnessLabel } from "@/components/SignalFreshnessLabel";
import { VenuePhoto } from "@/components/VenuePhoto";
import { getBusynessState } from "@/lib/busyness";
import { distanceMiles } from "@/lib/distance";
import { getNeighborhood } from "@/lib/neighborhood";
import { formatSignalConfidenceLabel } from "@/lib/signalConfidenceLabel";
import { fetchTrendingVenueIds } from "@/lib/clientTrendingVenueIds";
import { inZone } from "@/lib/zone";
import { isOnboardingZoneId, PREFERRED_ZONE_STORAGE_KEY, type OnboardingZone } from "@/lib/onboarding";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSavedVenues } from "@/hooks/useSavedVenues";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useTrack } from "@/lib/useTrack";
import type { BusynessSource, ConsumerVenue } from "@/types";

const AISuggest = dynamic(
  () => import("@/components/AISuggest").then((mod) => mod.AISuggest),
  { ssr: false },
);

type UserLocation = { lat: number; lng: number };
type LocationSortStatus = "idle" | "requesting" | "granted" | "denied" | "unsupported";
type HottestBusynessLabel = "Dead" | "Quiet" | "Moderate" | "Busy" | "Packed";
type TonightPickLabel = "Moderate" | "Packed" | "Wild";
type ZoneStatsSummary = {
  zoneName: string;
  spotCount: number;
  openNowCount: number;
  averageBusyness: number | null;
};
type ActivityFeedItem = {
  id: string;
  venue: {
    id: string;
    name: string;
  };
  busyness: "dead" | "moderate" | "packed";
  crowd_feel: string;
  checked_in_at: string;
};

const EXPLORE_SORT_STORAGE_KEY = "nv_explore_sort";
const EXPLORE_SEARCH_STORAGE_KEY = "nv_explore_search";
const DEFAULT_EXPLORE_SORT: ExploreSortOption = "hottest";
const NEIGHBORHOOD_EXPLORE_FILTERS: ExploreFilterOption[] = ["South End", "Uptown", "NoDa", "Dilworth", "South Park"];
const CATEGORY_EXPLORE_FILTERS: ExploreFilterOption[] = ["bars", "restaurants", "clubs", "coffee"];
const EXPLORE_FILTER_ZONE_IDS: Partial<Record<ExploreFilterOption, string>> = {
  "South End": "south-end-charlotte",
  Dilworth: "dilworth-charlotte",
  "South Park": "south-park-charlotte",
};
const EXPLORE_ZONE_LABELS_BY_ID: Record<OnboardingZone["id"], string> = {
  "south-end-charlotte": "South End",
  "dilworth-charlotte": "Dilworth",
  "south-park-charlotte": "South Park",
};
const EXPLORE_FILTER_CATEGORY_MATCHERS: Partial<Record<ExploreFilterOption, string[]>> = {
  bars: ["bar", "pub", "lounge", "brewery"],
  restaurants: ["restaurant", "food", "diner"],
  clubs: ["club", "night club", "night_club", "nightclub", "dance"],
  coffee: ["coffee", "cafe", "café"],
};
const EXPLORE_ZONE_FILTERS_BY_ID: Record<OnboardingZone["id"], ExploreFilterOption> = {
  "south-end-charlotte": "South End",
  "dilworth-charlotte": "Dilworth",
  "south-park-charlotte": "South Park",
};
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
  southpark: [35.1524, -80.8462],
  "south park": [35.1524, -80.8462],
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

function getExploreZoneFilter(value: string | null): ExploreFilterOption | null {
  return isOnboardingZoneId(value) ? EXPLORE_ZONE_FILTERS_BY_ID[value] : null;
}

function getVenueVibeScore(venue: ConsumerVenue): number | null {
  const score = venue.vibe_score ?? venue.current_popularity ?? venue.signal?.busyness0To100 ?? null;
  return score == null || !Number.isFinite(score) ? null : score;
}

function getVenueRating(venue: ConsumerVenue): number | null {
  const rating = venue.rating ?? venue.googleRating ?? null;
  return rating == null || !Number.isFinite(rating) ? null : rating;
}

function compareVenueRatingThenName(a: ConsumerVenue, b: ConsumerVenue): number {
  const aRating = getVenueRating(a);
  const bRating = getVenueRating(b);
  if (aRating == null && bRating == null) return a.name.localeCompare(b.name);
  if (aRating == null) return 1;
  if (bRating == null) return -1;
  return bRating - aRating || a.name.localeCompare(b.name);
}

function getVenueOpenNow(venue: ConsumerVenue): boolean | null {
  return venue.openNow ?? null;
}

function getVenueBusynessPercent(venue: ConsumerVenue): number | null {
  const value = venue.signal?.busyness0To100 ?? venue.current_popularity ?? venue.vibe_score ?? null;
  return value == null || !Number.isFinite(value) ? null : clampPercent(value);
}

function getVenueNeighborhoodName(venue: ConsumerVenue): string {
  return venue.neighborhood ?? getNeighborhood(venue.lat, venue.lng);
}

function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[_-]+/g, " ");
}

function venueMatchesSearchQuery(venue: ConsumerVenue, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query.trim());
  if (!normalizedQuery) return true;

  const searchableText = [
    venue.name,
    getVenueNeighborhoodName(venue),
  ].map(normalizeSearchText).join(" ");

  return searchableText.includes(normalizedQuery);
}

function venueMatchesCategoryFilters(venue: ConsumerVenue, filters: ExploreFilterOption[]): boolean {
  if (filters.length === 0) return true;

  const category = normalizeSearchText(venue.category);
  return filters.some((filter) => (
    EXPLORE_FILTER_CATEGORY_MATCHERS[filter]?.some((term) => category.includes(term)) ?? false
  ));
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
      <mark className="rounded bg-[#8B6CFF]/45 px-0.5 text-white ring-1 ring-[#8B6CFF]/45">{match}</mark>
      {afterMatch}
    </>
  );
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

function getActiveBusyness(venue: ConsumerVenue): number | null {
  const value = getVenueBusynessPercent(venue);
  return value != null && value > 0 ? value : null;
}

function getTonightPickLabel(level: number): TonightPickLabel {
  if (level >= 85) return "Wild";
  if (level >= 60) return "Packed";
  return "Moderate";
}

function getTonightPickColor(label: TonightPickLabel): string {
  switch (label) {
    case "Wild":
      return "#FF2D78";
    case "Packed":
      return "#FF5B6A";
    case "Moderate":
      return "#FFB020";
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

function getActivityBusynessLabel(busyness: ActivityFeedItem["busyness"]): "packed" | "moderate" | "quiet" {
  if (busyness === "packed") return "packed";
  if (busyness === "moderate") return "moderate";
  return "quiet";
}

function getActivityBusynessColor(label: "packed" | "moderate" | "quiet"): string {
  if (label === "packed") return "#FF5B6A";
  if (label === "moderate") return "#FFB020";
  return "#00F5D4";
}

function formatCrowdFeel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ActivityCard({ item }: { item: ActivityFeedItem }) {
  const busynessLabel = getActivityBusynessLabel(item.busyness);
  const busynessColor = getActivityBusynessColor(busynessLabel);

  return (
    <Link
      href={`/venues/${encodeURIComponent(item.venue.id)}`}
      className="venue-card-motion w-56 flex-shrink-0 rounded-xl border border-white/[0.06] bg-white/[0.04] px-4 py-3 shadow-lg shadow-black/10 backdrop-blur-sm hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      aria-label={`Open ${item.venue.name}, ${busynessLabel}, ${formatCrowdFeel(item.crowd_feel)}, ${getRelativeTimeLabel(item.checked_in_at)}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">{item.venue.name}</p>
          <p className="mt-1 truncate text-xs font-semibold text-white/55">{formatCrowdFeel(item.crowd_feel)}</p>
        </div>
        <span
          className="shrink-0 rounded-full border px-2 py-1 text-[10px] font-black uppercase leading-none"
          style={{ borderColor: `${busynessColor}55`, backgroundColor: `${busynessColor}1F`, color: busynessColor }}
        >
          {busynessLabel}
        </span>
      </div>
      <time dateTime={item.checked_in_at} className="mt-3 block text-[11px] font-semibold text-white/55">
        {getRelativeTimeLabel(item.checked_in_at)}
      </time>
    </Link>
  );
}

function TonightPickCard({ venue, index }: { venue: ConsumerVenue; index: number }) {
  const busyness = getActiveBusyness(venue) ?? 0;
  const label = getTonightPickLabel(busyness);
  const color = getTonightPickColor(label);

  return (
    <Link
      href={`/venues/${encodeURIComponent(venue.id)}`}
      onClick={() => trackAnalytics("tonights_pick_tapped", { venueId: venue.id, rank: index + 1 })}
      className="venue-card-motion group relative h-[180px] w-[140px] shrink-0 overflow-hidden rounded-[18px] border border-white/[0.06] bg-white/[0.04] shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-sm hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      aria-label={`Open ${venue.name}, ${label}, ${busyness}% busy`}
    >
      <VenuePhoto
        name={venue.name}
        photoUrl={venue.photoUrl ?? venue.photoUrls?.[0]}
        className="h-full w-full"
        imageClassName="transition-transform duration-[180ms] group-hover:scale-[1.04]"
        sizes="(max-width: 767px) 140px, 160px"
        priority={index === 0}
        loading={index === 0 ? undefined : "lazy"}
      />
      <div className="absolute inset-x-0 bottom-0 min-h-[104px] bg-gradient-to-t from-[#050507] via-[#050507]/78 to-transparent" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 space-y-2 p-3">
        <span
          className="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black leading-none"
          style={{ borderColor: `${color}66`, backgroundColor: `${color}24`, color }}
        >
          {label}
        </span>
        <div className="flex items-end justify-between gap-2">
          <h3 className="line-clamp-2 text-[13px] font-black leading-[1.15] text-white">
            {venue.name}
          </h3>
          <span className="shrink-0 text-lg font-black leading-none text-white/85" aria-hidden="true">
            →
          </span>
        </div>
      </div>
    </Link>
  );
}

function TonightsPicksStrip({ venues }: { venues: ConsumerVenue[] }) {
  if (venues.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Tonight's Picks">
      <h2 className="font-display text-sm font-black tracking-tight text-white">Tonight&apos;s Picks 🔥</h2>
      <div className="scroll-touch flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [will-change:scroll-position] [&::-webkit-scrollbar]:hidden">
        {venues.map((venue, index) => (
          <TonightPickCard key={venue.id} venue={venue} index={index} />
        ))}
      </div>
    </section>
  );
}

function NeighborhoodHeatRow({ venues }: { venues: ConsumerVenue[] }) {
  const neighborhoods = ["South End", "Dilworth"].map((name) => {
    const activeVenues = venues.filter((venue) => getVenueNeighborhoodName(venue) === name && getActiveBusyness(venue) != null);
    const average = activeVenues.length
      ? activeVenues.reduce((sum, venue) => sum + (getActiveBusyness(venue) ?? 0), 0) / activeVenues.length
      : 0;
    const dotClass = average > 60 ? "bg-[#22C55E]" : average > 30 ? "bg-[#FACC15]" : "bg-[#6B7280]";

    return { name, activeCount: activeVenues.length, dotClass };
  });

  return (
    <div className="mt-3 grid grid-cols-2 gap-2" aria-label="Neighborhood heat">
      {neighborhoods.map((neighborhood) => (
        <div
          key={neighborhood.name}
          className="flex min-h-[50px] items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.045] px-4 py-3 backdrop-blur-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:ring-1 hover:ring-violet/20 hover:shadow-lg hover:shadow-violet/10"
        >
          <div className="min-w-0">
            <p className="truncate text-[13px] font-black text-white">{neighborhood.name}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-white/50">
              {neighborhood.activeCount} live {neighborhood.activeCount === 1 ? "spot" : "spots"}
            </p>
          </div>
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${neighborhood.dotClass}`} aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}

function ZoneStatsBar({ stats, prefersReduced }: { stats: ZoneStatsSummary; prefersReduced: boolean }) {
  const busynessLabel = stats.averageBusyness == null ? "avg busyness --" : `avg busyness ${stats.averageBusyness}%`;

  return (
    <MotionDiv
      key={`${stats.zoneName}-${stats.spotCount}-${stats.openNowCount}-${stats.averageBusyness ?? "na"}`}
      className="mt-4 rounded-[16px] border border-[#00F5D4]/15 bg-[#00F5D4]/[0.055] px-4 py-3 shadow-[0_14px_34px_rgba(0,0,0,0.18)] backdrop-blur-sm"
      initial={prefersReduced ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={prefersReduced ? undefined : { opacity: 0, y: -4 }}
      transition={{ duration: prefersReduced ? 0 : 0.22, ease: "easeOut" }}
      role="status"
      aria-label={`${stats.zoneName} stats: ${stats.spotCount} spots, ${stats.openNowCount} open now, ${busynessLabel}`}
    >
      <p className="truncate text-[13px] font-black text-[#F4F5F8]">
        {stats.spotCount} {stats.spotCount === 1 ? "spot" : "spots"} · {stats.openNowCount} open now · {busynessLabel}
      </p>
    </MotionDiv>
  );
}

function ExploreQuietEmptyState() {
  return (
    <div className="rounded-[18px] border border-white/[0.06] bg-white/[0.035] p-8 text-center shadow-lg shadow-black/10 backdrop-blur-sm transition-all duration-200 ease-out hover:ring-1 hover:ring-violet/20 hover:shadow-violet/10">
      <span aria-hidden="true" className="block text-5xl leading-none">🌙</span>
      <h2 className="mt-4 font-display text-[22px] font-black tracking-tight text-[#F4F5F8]">
        No venues in this area yet. Check back soon.
      </h2>
      <p className="mt-2 text-sm font-semibold text-white/50">South End spots will appear here once they are available.</p>
      <Link
        href="/map"
        className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-[14px] border border-white/[0.06] bg-white/[0.07] px-5 text-sm font-semibold text-[#F4F5F8] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-white/[0.1] hover:shadow-lg hover:shadow-violet/10 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      >
        View map instead →
      </Link>
    </div>
  );
}

function ExploreNoMatchState({ query, onClear }: { query: string; onClear: () => void }) {
  const trimmedQuery = query.trim();
  const title = trimmedQuery ? `No results for "${trimmedQuery}"` : "No spots match your filters";
  const description = trimmedQuery
    ? "Try a venue name or neighborhood nearby."
    : "Reset the filters to see what's live tonight.";

  return (
    <div className="rounded-[18px] border border-[#8B6CFF]/25 bg-[linear-gradient(135deg,rgba(139,108,255,0.12),rgba(0,245,212,0.07)_48%,rgba(240,86,140,0.08))] px-6 py-9 text-center shadow-[0_18px_44px_rgba(0,0,0,0.28)]">
      <div className="relative mx-auto h-20 w-24" aria-hidden="true">
        <span className="absolute left-2 top-5 h-12 w-12 rounded-2xl border border-[#00F5D4]/35 bg-[#00F5D4]/10 shadow-[0_0_28px_rgba(0,245,212,0.16)]" />
        <span className="absolute right-2 top-2 h-14 w-14 rounded-full border border-[#F0568C]/35 bg-[#F0568C]/15 shadow-[0_0_28px_rgba(240,86,140,0.18)]" />
        <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#8B6CFF]/45 bg-[#8B6CFF]/20 text-[#F4F5F8] shadow-[0_0_24px_rgba(139,108,255,0.22)]">
          <SearchX className="h-5 w-5" strokeWidth={2.1} />
        </span>
      </div>
      <h2 className="mt-3 text-[17px] font-black leading-6 text-white">{title}</h2>
      <p className="mt-1 text-sm font-semibold leading-5 text-white/60">{description}</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-sm font-semibold text-[#0A0A0E] shadow-[0_0_20px_rgba(139,108,255,0.24)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#9C85FF] hover:shadow-violet/30 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      >
        Clear filters
      </button>
    </div>
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
      <span className="rounded-full border border-white/[0.06] bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-[#9CA2AE] backdrop-blur-sm">
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
      <h2 className="font-display text-sm font-semibold tracking-tight text-[#F4F5F8]">Hottest right now</h2>
      <div className="overflow-hidden rounded-[18px] border border-white/[0.06] bg-white/[0.035] shadow-lg shadow-black/10 backdrop-blur-sm transition-all duration-200 ease-out hover:ring-1 hover:ring-violet/20 hover:shadow-violet/10">
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
              className="group grid min-h-[58px] grid-cols-[2.75rem_minmax(0,1fr)_4.7rem] items-center gap-3 border-b border-white/[0.06] px-4 py-3 transition-all duration-[180ms] ease-out last:border-b-0 hover:bg-white/[0.06] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8B6CFF]/70"
              aria-label={`Open ${venue.name}, ranked number ${index + 1}, ${label}`}
            >
              <span className="font-display text-sm font-black text-white/55">#{index + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-black text-white">{venue.name}</span>
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden="true">
                  <span className="venue-fill-motion block h-full rounded-full" style={{ width: `${level}%`, backgroundColor: color }} />
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
    <MotionLi
      className="h-auto sm:h-[126px]"
      role="article"
      initial={prefersReduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: prefersReduced ? 0 : 0.18,
        delay: prefersReduced || index >= 8 ? 0 : index * 0.04,
        ease: "easeOut",
      }}
      exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
    >
      <Link
        href={`/venues/${encodeURIComponent(venue.id)}`}
        onClick={() => trackAnalytics("venue_card_tapped", { venueId: venue.id })}
        className="venue-card-motion group relative flex h-full w-full flex-col items-stretch gap-3 overflow-hidden rounded-[18px] border border-white/[0.06] bg-[rgba(255,255,255,0.035)] p-4 shadow-lg shadow-black/10 backdrop-blur-sm hover:-translate-y-0.5 hover:bg-white/[0.05] active:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 sm:flex-row sm:items-center"
        aria-label={`Open ${venue.name}`}
      >
        {isTrending ? <TrendingBadge className="absolute right-3 top-3 z-10" /> : null}
        <VenuePhoto
          name={venue.name}
          photoUrl={venue.photoUrl ?? venue.photoUrls?.[0]}
          className="aspect-video w-full shrink-0 rounded-xl sm:h-[72px] sm:w-[72px] sm:aspect-auto"
          imageClassName="transition-transform duration-[180ms] group-hover:scale-[1.02]"
          sizes="(max-width: 639px) calc(100vw - 2.5rem), 72px"
          priority={index === 0}
          loading={index === 0 ? undefined : "lazy"}
        />

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <h2 className="min-w-0 truncate text-[16px] font-semibold leading-tight tracking-tight text-white">
                  <HighlightText text={venue.name} query={searchQuery} />
                </h2>
                <OpenNowBadge openNow={venue.openNow ?? null} />
              </div>
              {googleRatingLabel ? (
                <span
                  className="max-w-[6rem] shrink-0 truncate rounded-full border border-white/[0.06] bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-[#F4F5F8] backdrop-blur-sm"
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
            <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-[#9CA2AE]">
              {distance != null ? (
                <span className="shrink-0 rounded-full border border-[#00F5D4]/30 bg-[#00F5D4]/10 px-2 py-0.5 text-[11px] font-black text-[#00F5D4]">
                  {distance.toFixed(1)} mi
                </span>
              ) : null}
              <span className="min-w-0 truncate">{venue.address}</span>
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
    </MotionLi>
  );
}

export function ExplorePageClient() {
  const router = useRouter();
  const trackPageView = useTrack();
  const prefersReduced = useReducedMotion();
  const [session, setSession] = useState<Session | null>(null);
  const [venues, setVenues] = useState<ConsumerVenue[] | undefined>(undefined);
  const [isFetchingVenues, setIsFetchingVenues] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [exploreSort, setExploreSort] = useState<ExploreSortOption>(DEFAULT_EXPLORE_SORT);
  const [exploreFilters, setExploreFilters] = useState<Set<ExploreFilterOption>>(() => new Set());
  const [hasInitializedExploreFilters, setHasInitializedExploreFilters] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationSortStatus, setLocationSortStatus] = useState<LocationSortStatus>("idle");
  const [activityItems, setActivityItems] = useState<ActivityFeedItem[]>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [trendingVenueIds, setTrendingVenueIds] = useState<Set<string>>(() => new Set());
  const { savedIds } = useSavedVenues();
  const hasLoadedVenuesRef = useRef(false);
  const hasPrefetchedInitialVenuesRef = useRef(false);
  const activitySectionRef = useRef<HTMLElement | null>(null);
  const activityViewedRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const fetchVenues = useCallback(async ({
    reset = false,
    signal,
  }: {
    reset?: boolean;
    signal?: AbortSignal;
  } = {}) => {
    if (reset) setVenues(undefined);
    setIsFetchingVenues(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const selectedZoneIds = NEIGHBORHOOD_EXPLORE_FILTERS
        .filter((filter) => exploreFilters.has(filter))
        .map((filter) => EXPLORE_FILTER_ZONE_IDS[filter])
        .filter((zoneId): zoneId is string => Boolean(zoneId));
      if (selectedZoneIds.length === 1) params.set("zone", selectedZoneIds[0]);
      const url = params.size ? `/api/venues?${params.toString()}` : "/api/venues";
      const res = await fetch(url, { cache: "no-store", signal });
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
  }, [exploreFilters]);

  const refreshVenues = useCallback(async () => {
    await fetchVenues();
  }, [fetchVenues]);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/activity/feed", { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = (await res.json()) as { items?: ActivityFeedItem[] };
      setActivityItems(Array.isArray(json.items) ? json.items.slice(0, 10) : []);
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
    const storedSort = localStorage.getItem(EXPLORE_SORT_STORAGE_KEY);
    if (isExploreSortOption(storedSort) && storedSort !== "nearby") setExploreSort(storedSort);

    const params = new URLSearchParams(window.location.search);
    const initialSearchQuery = params.get("q") ?? sessionStorage.getItem(EXPLORE_SEARCH_STORAGE_KEY) ?? "";
    setSearchQuery(initialSearchQuery);
    setDebouncedSearchQuery(initialSearchQuery);

    const zoneFilter = getExploreZoneFilter(params.get("zone")) ?? getExploreZoneFilter(localStorage.getItem(PREFERRED_ZONE_STORAGE_KEY));
    if (zoneFilter) {
      setExploreFilters((current) => {
        const next = new Set(current);
        for (const filter of NEIGHBORHOOD_EXPLORE_FILTERS) next.delete(filter);
        next.add(zoneFilter);
        return next;
      });
    }
    setHasInitializedExploreFilters(true);
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
    const id = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => window.clearTimeout(id);
  }, [searchQuery]);

  useEffect(() => {
    if (!hasInitializedExploreFilters) return;

    const trimmedSearchQuery = debouncedSearchQuery.trim();
    if (trimmedSearchQuery) sessionStorage.setItem(EXPLORE_SEARCH_STORAGE_KEY, trimmedSearchQuery);
    else sessionStorage.removeItem(EXPLORE_SEARCH_STORAGE_KEY);

    const url = new URL(window.location.href);
    if (trimmedSearchQuery) url.searchParams.set("q", trimmedSearchQuery);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [debouncedSearchQuery, hasInitializedExploreFilters]);

  useEffect(() => {
    if (!hasInitializedExploreFilters) return;
    const controller = new AbortController();
    void fetchVenues({
      reset: !hasLoadedVenuesRef.current,
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [fetchVenues, hasInitializedExploreFilters]);

  useEffect(() => {
    if (!hasInitializedExploreFilters) return;

    const selectedZoneIds = NEIGHBORHOOD_EXPLORE_FILTERS
      .filter((filter) => exploreFilters.has(filter))
      .map((filter) => EXPLORE_FILTER_ZONE_IDS[filter])
      .filter((zoneId): zoneId is OnboardingZone["id"] => isOnboardingZoneId(zoneId ?? null));
    const url = new URL(window.location.href);
    if (selectedZoneIds.length === 1) url.searchParams.set("zone", selectedZoneIds[0]);
    else url.searchParams.delete("zone");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [exploreFilters, hasInitializedExploreFilters]);

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

  const effectiveExploreSort = exploreSort === "nearby" && userLocation ? "nearby" : exploreSort === "nearby" ? DEFAULT_EXPLORE_SORT : exploreSort;

  const sortedVenues = useMemo(() => {
    if (venues === undefined) return [];

    const activeNeighborhoodFilters = NEIGHBORHOOD_EXPLORE_FILTERS.filter((filter) => exploreFilters.has(filter));
    const activeCategoryFilters = CATEGORY_EXPLORE_FILTERS.filter((filter) => exploreFilters.has(filter));
    const query = debouncedSearchQuery;

    return venues.filter((venue) => {
      if (venue.hidden) return false;

      const neighborhoodName = getVenueNeighborhoodName(venue);
      const matchesSearch = venueMatchesSearchQuery(venue, query);
      const matchesOpenNow = !exploreFilters.has("open-now") || getVenueOpenNow(venue) === true;
      const matchesCategory = venueMatchesCategoryFilters(venue, activeCategoryFilters);
      const matchesSaved =
        !exploreFilters.has("saved") ||
        savedIds.has(venue.id) ||
        Boolean(venue.placeId && savedIds.has(venue.placeId));
      const matchesExploreNeighborhood =
        activeNeighborhoodFilters.length === 0 || activeNeighborhoodFilters.includes(neighborhoodName as ExploreFilterOption);
      return matchesSearch && matchesOpenNow && matchesCategory && matchesSaved && matchesExploreNeighborhood;
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
        return bScore - aScore || compareVenueRatingThenName(a, b);
      }

      if (effectiveExploreSort === "nearby" && userLocation) {
        const aDistance = distanceMiles(userLocation.lat, userLocation.lng, a.lat, a.lng);
        const bDistance = distanceMiles(userLocation.lat, userLocation.lng, b.lat, b.lng);
        return aDistance - bDistance || a.name.localeCompare(b.name);
      }

      if (effectiveExploreSort === "hottest") {
        const aScore = getVenueVibeScore(a);
        const bScore = getVenueVibeScore(b);
        if (aScore == null && bScore == null) return compareVenueRatingThenName(a, b);
        if (aScore == null) return 1;
        if (bScore == null) return -1;
        return bScore - aScore || compareVenueRatingThenName(a, b);
      }

      return a.name.localeCompare(b.name);
    });
  }, [debouncedSearchQuery, effectiveExploreSort, exploreFilters, savedIds, trendingVenueIds, userLocation, venues]);

  useEffect(() => {
    if (hasPrefetchedInitialVenuesRef.current || sortedVenues.length === 0) return;
    hasPrefetchedInitialVenuesRef.current = true;

    for (const venue of sortedVenues.slice(0, 3)) {
      prefetchRoute(router, `/venues/${encodeURIComponent(venue.id)}`);
    }
  }, [router, sortedVenues]);

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
        return bBusyness - aBusyness || compareVenueRatingThenName(a, b);
      })
      .slice(0, 5);
  }, [venues]);

  const tonightsPicks = useMemo(() => {
    if (venues === undefined) return [];

    const sourceVenues = sortedVenues.length > 0 ? sortedVenues : venues;
    return sourceVenues
      .filter((venue) => !venue.hidden && getActiveBusyness(venue) != null)
      .sort((a, b) => {
        const aBusyness = getActiveBusyness(a) ?? 0;
        const bBusyness = getActiveBusyness(b) ?? 0;
        return bBusyness - aBusyness || compareVenueRatingThenName(a, b);
      })
      .slice(0, 3);
  }, [sortedVenues, venues]);

  const activeZoneStats = useMemo<ZoneStatsSummary | null>(() => {
    if (venues === undefined) return null;

    const activeZoneIds = NEIGHBORHOOD_EXPLORE_FILTERS
      .filter((filter) => exploreFilters.has(filter))
      .map((filter) => EXPLORE_FILTER_ZONE_IDS[filter])
      .filter((zoneId): zoneId is OnboardingZone["id"] => isOnboardingZoneId(zoneId ?? null));
    const activeZoneId = activeZoneIds.length === 1 ? activeZoneIds[0] : "south-end-charlotte";
    const zoneVenues = venues.filter((venue) => !venue.hidden && venue.zoneId === activeZoneId);

    const busynessValues = zoneVenues
      .map(getVenueBusynessPercent)
      .filter((value): value is number => value !== null);
    const averageBusyness = busynessValues.length > 0
      ? Math.round(busynessValues.reduce((sum, value) => sum + value, 0) / busynessValues.length)
      : null;

    return {
      zoneName: EXPLORE_ZONE_LABELS_BY_ID[activeZoneId],
      spotCount: zoneVenues.length,
      openNowCount: zoneVenues.filter((venue) => getVenueOpenNow(venue) === true).length,
      averageBusyness,
    };
  }, [exploreFilters, venues]);

  const showNearbyDistances = effectiveExploreSort === "nearby" && userLocation !== null;
  const venueDistances = useMemo(() => {
    if (!showNearbyDistances || !userLocation || venues === undefined) return new Map<string, number>();

    return new Map(
      venues.map((venue) => [
        venue.id,
        distanceMiles(userLocation.lat, userLocation.lng, venue.lat, venue.lng),
      ]),
    );
  }, [showNearbyDistances, userLocation, venues]);

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
  const showZoneStats = venues !== undefined && trimmedSearchQuery.length === 0 && activeZoneStats !== null;
  function clearFilters() {
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setExploreSort(DEFAULT_EXPLORE_SORT);
    setExploreFilters(new Set());
  }

  function clearSearch() {
    setSearchQuery("");
    setDebouncedSearchQuery("");
    searchInputRef.current?.focus();
  }

  function requestNearbySort() {
    if (!("geolocation" in navigator)) {
      setUserLocation(null);
      setLocationSortStatus("unsupported");
      setExploreSort(DEFAULT_EXPLORE_SORT);
      trackAnalytics("explore_nearby_location_unavailable", { reason: "unsupported" });
      return;
    }

    setLocationSortStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationSortStatus("granted");
        setExploreSort("nearby");
        trackAnalytics("explore_nearby_location_granted", { accuracy: Math.round(position.coords.accuracy ?? 0) });
      },
      (positionError) => {
        setUserLocation(null);
        setLocationSortStatus(positionError.code === positionError.PERMISSION_DENIED ? "denied" : "unsupported");
        setExploreSort(DEFAULT_EXPLORE_SORT);
        trackAnalytics("explore_nearby_location_denied", { code: positionError.code });
      },
      { maximumAge: 5 * 60 * 1000, timeout: 8000 },
    );
  }

  function selectExploreSort(option: ExploreSortOption) {
    if (option === "nearby") {
      requestNearbySort();
      return;
    }
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
                  className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11.5px] font-semibold text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                >
                  You
                </Link>
              )}
            </div>
          </div>
          <NeighborhoodHeatRow venues={venues} />

          <div className="mt-4 flex items-center gap-2">
            <h1 className="font-display text-[34px] font-semibold tracking-tight">
              <MotionSpan
                className="inline-block bg-[linear-gradient(100deg,#F4F5F8_0%,#F4F5F8_34%,#00F5D4_50%,#FF2D78_64%,#F4F5F8_82%)] bg-[length:220%_100%] bg-clip-text text-transparent"
                initial={prefersReduced ? false : { backgroundPosition: "0% 50%" }}
                animate={prefersReduced ? undefined : { backgroundPosition: "100% 50%" }}
                transition={{ duration: prefersReduced ? 0 : 1.35, ease: "easeOut", delay: prefersReduced ? 0 : 0.08 }}
              >
                South End
              </MotionSpan>
            </h1>
            <span className="rounded-full bg-[#22C55E]/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-[#22C55E]">
              LIVE
            </span>
          </div>
          <p className="mt-1 text-sm text-white/55">{venuesCount} spots tracked tonight</p>

          <AnimatePresence initial={false}>
            {showZoneStats ? (
              <ZoneStatsBar stats={activeZoneStats} prefersReduced={prefersReduced} />
            ) : null}
          </AnimatePresence>

          <div className="sticky top-0 z-30 -mx-4 mt-5 space-y-3 border-y border-white/[0.06] bg-[#0A0A0E]/95 px-4 py-3 backdrop-blur">
            <div className="relative">
              <label htmlFor="venue-search" className="sr-only">
                Search South End venues
              </label>
              <input
                ref={searchInputRef}
                aria-label="Search venues"
                id="venue-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search South End, Dilworth, venue name..."
                className="w-full rounded-xl border border-white/10 bg-[rgba(255,255,255,.05)] px-4 py-3 pl-11 pr-12 text-base font-medium text-white transition-all duration-200 ease-out placeholder:text-[#9CA2AE] focus:border-violet/60 focus:outline-none focus:ring-2 focus:ring-violet/40 focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
              />
              <button
                type="button"
                onClick={() => searchInputRef.current?.focus()}
                className="absolute left-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                aria-label="Focus venue search"
              >
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
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </button>
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-lg font-black leading-none text-white/65 transition-all duration-200 ease-out hover:bg-white/15 hover:text-white active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" strokeWidth={2.4} />
                </button>
              )}
            </div>

            {showOutOfZoneSearchBanner && (
              <div
                role="status"
                className="rounded-[14px] border border-white/[0.06] bg-white/[0.07] px-4 py-3 text-sm font-medium leading-5 text-[#9CA2AE] backdrop-blur-sm"
              >
                {OUT_OF_ZONE_SEARCH_MESSAGE}
              </div>
            )}

            <ExploreSortFilter
              selectedSort={effectiveExploreSort}
              selectedFilters={exploreFilters}
              nearbyLoading={locationSortStatus === "requesting"}
              savedCount={savedCount}
              onSortChange={selectExploreSort}
              onFilterToggle={toggleExploreFilter}
            />
            {(locationSortStatus === "denied" || locationSortStatus === "unsupported") && (
              <p role="status" className="text-xs font-semibold text-[#FFB020]">
                Location access was denied. Enable location to sort nearby spots.
              </p>
            )}
          </div>

          <AISuggest
            userLat={userLocation?.lat ?? null}
            userLng={userLocation?.lng ?? null}
            className="mt-4"
          />

          <div className="mt-5">
            <TrendingRow />
          </div>

          {hottestVenues.length > 0 && (
            <div className="mt-5">
              <HottestRightNow venues={hottestVenues} />
            </div>
          )}

          {tonightsPicks.length > 0 && (
            <div className="mt-5">
              <TonightsPicksStrip venues={tonightsPicks} />
            </div>
          )}
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
            className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-8 text-center shadow-lg shadow-black/10 backdrop-blur-sm transition-all duration-200 ease-out hover:ring-1 hover:ring-violet/20 hover:shadow-violet/10"
          >
            <p className="text-sm font-semibold text-white">{error}</p>
            <button
              type="button"
              onClick={() => void refreshVenues()}
              className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-sm font-medium text-[#0A0A0E] shadow-[0_0_20px_rgba(139,108,255,0.24)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#9C85FF] hover:shadow-violet/30 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
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
          trimmedSearchQuery ? (
            <ExploreNoMatchState query={trimmedSearchQuery} onClear={clearSearch} />
          ) : <ExploreQuietEmptyState />
        )}

        {venues !== undefined && !error && !isSearchingVenues && venues.length > 0 && sortedVenues.length === 0 && (
          <ExploreNoMatchState query={trimmedSearchQuery} onClear={trimmedSearchQuery ? clearSearch : clearFilters} />
        )}

        {venues !== undefined && !error && !isSearchingVenues && sortedVenues.length > 0 && (
          <div className="scroll-touch pr-1 [will-change:scroll-position]">
            <ul className="venue-card-grid grid grid-cols-1 gap-3 lg:grid-cols-3">
              <AnimatePresence initial={false}>
                {sortedVenues.map((venue, index) => (
                  <VenueFeedCard
                    key={venue.id}
                    venue={venue}
                    searchQuery={debouncedSearchQuery}
                    distance={showNearbyDistances ? venueDistances.get(venue.id) ?? null : null}
                    index={index}
                    prefersReduced={prefersReduced}
                    isTrending={trendingVenueIds.has(venue.id)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </div>
        )}
      </section>

      <section
        ref={activitySectionRef}
        className="mx-auto max-w-lg px-4 pb-32"
        role="region"
        aria-label="What's happening now"
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#22C55E]" aria-hidden="true" />
          <h2 className="font-display text-[19px] font-semibold text-[#F4F5F8]">
            What&apos;s happening now
          </h2>
        </div>

        {activityLoaded && activityItems.length === 0 ? (
          <div className="mt-4 rounded-[18px] border border-[#F0568C]/25 bg-[#F0568C]/10 px-5 py-8 text-center text-white/70 shadow-[0_16px_34px_rgba(240,86,140,0.08)]">
            <p className="text-sm font-black leading-5 text-white">
              Be the first to check in tonight!
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
