"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { OnboardingOverlay } from "@/components/OnboardingOverlay";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useTrack } from "@/lib/useTrack";
import type { ConsumerVenue } from "@/types";

type BusynessState = {
  label: "No data yet" | "Quiet" | "Moderate" | "Packed";
  color: string;
  rank: number;
};

type BusynessFilter = "All" | "Packed" | "Moderate" | "Quiet";
type CategoryFilter = "All" | "Bar" | "Club" | "Restaurant" | "Lounge";

const BUSYNESS_FILTERS: BusynessFilter[] = ["All", "Packed", "Moderate", "Quiet"];
const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: "All", label: "All" },
  { value: "Bar", label: "🍸 Bar" },
  { value: "Club", label: "🎵 Club" },
  { value: "Restaurant", label: "🍔 Restaurant" },
  { value: "Lounge", label: "🛋 Lounge" },
];

function getBusynessState(value: number | null | undefined): BusynessState {
  if (value == null) return { label: "No data yet", color: "#6B7280", rank: 0 };
  if (value <= 33) return { label: "Quiet", color: "#71717A", rank: 1 };
  if (value <= 66) return { label: "Moderate", color: "#F59E0B", rank: 2 };
  return { label: "Packed", color: "#EF4444", rank: 3 };
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
      <mark className="rounded bg-yellow-400/30 px-0.5 text-white">{match}</mark>
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
      className={`min-h-[38px] shrink-0 rounded-full border px-4 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EF4444]/70 ${
        active ? "border-white/70 bg-[#EF4444] text-white" : "border-transparent bg-white/10 text-white/60 hover:bg-white/15 hover:text-white/80"
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
      className={`min-h-[38px] shrink-0 rounded-full border px-4 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70 ${
        active
          ? "border-[#00F5D4] bg-[#00F5D4]/10 text-[#00F5D4] shadow-[0_0_16px_rgba(0,245,212,0.22)]"
          : "border-white/10 bg-[#0A0A0F]/80 text-white/50 hover:border-white/20 hover:bg-white/10 hover:text-white/75"
      }`}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function busynessPillClass(label: BusynessState["label"]): string {
  if (label === "Packed") return "bg-red-500/15 text-red-400";
  if (label === "Moderate") return "bg-yellow-500/15 text-yellow-300";
  return "bg-zinc-500/15 text-zinc-300";
}

function BusynessPill({ value }: { value: number | null | undefined }) {
  const state = getBusynessState(value);
  const displayLabel = state.label === "Packed" ? "🔥 Packed" : state.label;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-black ${busynessPillClass(state.label)}`}>
      {displayLabel}
    </span>
  );
}

function MFRatioMiniBar({
  mfRatio,
  sampleSize,
}: {
  mfRatio: number | null | undefined;
  sampleSize: number | null | undefined;
}) {
  if (mfRatio == null || sampleSize == null || sampleSize < 3) return null;

  const reportCount = sampleSize ?? 0;
  const malePercent = mfRatio == null ? 0 : Math.min(100, Math.max(0, Math.round(mfRatio)));
  const femalePercent = 100 - malePercent;
  const hasRatio = mfRatio != null && reportCount >= 3;

  return (
    <span className="block w-[92px]" aria-label={hasRatio ? `${malePercent}% male, ${femalePercent}% female from ${sampleSize} reports` : undefined}>
      {hasRatio && (
        <span className="flex h-[2px] w-full overflow-hidden rounded-full bg-white/15" aria-hidden="true">
          <span className="h-full bg-[#3B82F6]" style={{ width: `${malePercent}%` }} />
          <span className="h-full flex-1 bg-[#EC4899]" />
        </span>
      )}
    </span>
  );
}

function VenueFeedCard({
  venue,
  searchQuery,
}: {
  venue: ConsumerVenue;
  searchQuery: string;
}) {
  const signal = venue.signal;
  const busyness = getBusynessState(signal?.busyness0To100);
  const venueMeta = [venue.category, venue.address].filter(Boolean).join(" · ");

  return (
    <li>
      <Link
        href={`/venues/${encodeURIComponent(venue.id)}`}
        className="flex min-h-[72px] w-full items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3 transition-colors hover:border-white/[0.12] hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/55"
        aria-label={`Open ${venue.name}`}
      >
        <span
          className="h-4 w-4 shrink-0 rounded-full"
          style={{ backgroundColor: busyness.color, boxShadow: `0 0 16px ${busyness.color}55` }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-black leading-tight text-white">
              <HighlightText text={venue.name} query={searchQuery} />
            </span>
            {venue.openNow === true ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" />
                Open
              </span>
            ) : null}
          </span>
          <span className="mt-1 block truncate text-xs font-semibold text-white/45">{venueMeta}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-2">
          <BusynessPill value={signal?.busyness0To100} />
          <MFRatioMiniBar mfRatio={signal?.mfRatio} sampleSize={signal?.sampleSize} />
        </span>
      </Link>
    </li>
  );
}

function CardSkeleton() {
  return (
    <div className="flex min-h-[72px] w-full animate-pulse items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3">
      <div className="h-4 w-4 shrink-0 rounded-full bg-white/10" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 h-4 w-36 rounded bg-white/10" />
        <div className="h-3 w-24 rounded bg-white/[0.06]" />
      </div>
      <div className="h-6 w-16 shrink-0 rounded-full bg-white/10" />
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
      const aState = getBusynessState(a.signal?.busyness0To100);
      const bState = getBusynessState(b.signal?.busyness0To100);
      return bState.rank - aState.rank || a.name.localeCompare(b.name);
    });
  }, [busynessFilter, categoryFilter, openNowOnly, searchQuery, venues]);

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
                className="shrink-0 text-[#00F5D4]/70"
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
                  className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
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
                className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 pl-11 pr-12 text-base font-semibold text-white placeholder:text-white/30 focus:border-[#00F5D4]/40 focus:outline-none focus:ring-0"
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
                    ? "bg-[#00F5D4] text-[#0A0A0F] border-[#00F5D4]"
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
          <div className="space-y-3" role="status" aria-label="Loading venues">
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
          <ul className="space-y-3">
            {sortedVenues.map((venue) => (
              <VenueFeedCard
                key={venue.id}
                venue={venue}
                searchQuery={searchQuery}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
