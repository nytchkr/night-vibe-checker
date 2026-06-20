"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Session } from "@supabase/supabase-js";
import { Skeleton } from "@/components/ui/skeleton";
import { OnboardingOverlay } from "@/components/OnboardingOverlay";
import { createBrowserClient } from "@/lib/supabase-browser";
import { timeAgo } from "@/lib/timeAgo";
import { useTrack } from "@/lib/useTrack";
import type { ConsumerVenue, VenueSignal } from "@/types";

const blurDataUrl =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAzMiAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjMEEwQTBGIi8+PHN0b3Agb2Zmc2V0PSIuNSIgc3RvcC1jb2xvcj0iIzJEMTk1RiIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzAwRjVENCIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSIzMiIgaGVpZ2h0PSIyNCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg==";

type BusynessState = {
  label: "No data yet" | "Quiet" | "Moderate" | "Packed";
  color: string;
  rank: number;
};

type BusynessFilter = "All" | "Packed" | "Moderate" | "Quiet";
type CategoryFilter = "All" | "Bar" | "Brewery" | "Club" | "Restaurant";

const BUSYNESS_FILTERS: BusynessFilter[] = ["All", "Packed", "Moderate", "Quiet"];
const CATEGORY_FILTERS: CategoryFilter[] = ["All", "Bar", "Brewery", "Club", "Restaurant"];

function getBusynessState(value: number | null | undefined): BusynessState {
  if (value == null) return { label: "No data yet", color: "#6B7280", rank: 0 };
  if (value <= 33) return { label: "Quiet", color: "#22C55E", rank: 1 };
  if (value <= 66) return { label: "Moderate", color: "#F59E0B", rank: 2 };
  return { label: "Packed", color: "#EF4444", rank: 3 };
}

function normalizeCategory(category: string | null | undefined): CategoryFilter | null {
  const value = (category ?? "").toLowerCase();
  if (value.includes("brewery")) return "Brewery";
  if (value.includes("club") || value.includes("night_club") || value.includes("nightclub")) return "Club";
  if (value.includes("restaurant") || value.includes("food")) return "Restaurant";
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

function SourceBadge({ source }: { source: VenueSignal["busynessSource"] | undefined }) {
  if (!source) return null;
  const isLive = source === "live";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/55">
      {isLive && (
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22C55E] opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
        </span>
      )}
      {source}
    </span>
  );
}

function BusynessPill({ value }: { value: number | null | undefined }) {
  const state = getBusynessState(value);
  const displayLabel = state.label === "Packed" ? "Packed 🔥" : state.label;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#0A0A0F]/80 px-2.5 py-1 text-xs font-bold text-white/85 shadow-lg backdrop-blur-md">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: state.color, boxShadow: `0 0 10px ${state.color}80` }}
        aria-hidden="true"
      />
      {displayLabel}
    </span>
  );
}

function MFRatioMiniBar({
  mfRatio,
  sampleSize,
  computedAt,
}: {
  mfRatio: number | null | undefined;
  sampleSize: number | null | undefined;
  computedAt: string | null | undefined;
}) {
  if (sampleSize == null && !computedAt) return null;

  const reportCount = sampleSize ?? 0;
  const malePercent = mfRatio == null ? 0 : Math.min(100, Math.max(0, Math.round(mfRatio)));
  const femalePercent = 100 - malePercent;
  const hasRatio = mfRatio != null && reportCount >= 3;

  return (
    <span className="mt-1 block w-[92px]" aria-label={hasRatio ? `${malePercent}% male, ${femalePercent}% female from ${sampleSize} reports` : undefined}>
      {hasRatio && (
        <span className="flex h-0.5 w-full overflow-hidden rounded-full bg-white/15" aria-hidden="true">
          <span className="h-full bg-[#3B82F6]" style={{ width: `${malePercent}%` }} />
          <span className="h-full flex-1 bg-[#EC4899]" />
        </span>
      )}
      {sampleSize != null && (
        <span className="mt-1 block text-right text-[10px] font-semibold leading-3 text-white/55">👥 {sampleSize} reports</span>
      )}
      {computedAt && (
        <span className="mt-0.5 block text-right text-[10px] font-semibold leading-3 text-zinc-500">{timeAgo(computedAt)}</span>
      )}
    </span>
  );
}

function VenuePhoto({ venue }: { venue: ConsumerVenue }) {
  if (venue.photoUrl) {
    return (
      <span className="relative block h-32 w-full overflow-hidden rounded-xl">
        <Image
          src={venue.photoUrl}
          alt={`${venue.name} venue photo`}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, 512px"
          placeholder="blur"
          blurDataURL={blurDataUrl}
        />
      </span>
    );
  }

  return (
    <div className="flex h-32 w-full items-center justify-center rounded-xl bg-white/[0.06] text-xs font-semibold text-white/25">
      No photo
    </div>
  );
}

function reportHref(path: string, session: Session | null): string {
  return session ? path : `/login?return=${encodeURIComponent(path)}`;
}

function VenueFeedCard({
  venue,
  session,
  searchQuery,
}: {
  venue: ConsumerVenue;
  session: Session | null;
  searchQuery: string;
}) {
  const signal = venue.signal;
  const busyness = getBusynessState(signal?.busyness0To100);
  const reportParams = new URLSearchParams({
    venueId: venue.id,
    venueName: venue.name,
  });
  const vibeCheckHref = `/vibe-check?${reportParams.toString()}`;

  return (
    <li
      className={`overflow-hidden rounded-2xl border bg-white/[0.04] p-3 transition-shadow ${
        busyness.label === "Packed"
          ? "border-[#EF4444]/45 shadow-[0_0_24px_rgba(239,68,68,0.16)]"
          : "border-white/[0.09]"
      }`}
    >
      <Link
        href={`/venues/${encodeURIComponent(venue.id)}`}
        className="relative block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
        aria-label={`Open ${venue.name}`}
      >
        <VenuePhoto venue={venue} />
        <span className="absolute right-2 top-2 flex flex-col items-end">
          <BusynessPill value={signal?.busyness0To100} />
          <MFRatioMiniBar mfRatio={signal?.mfRatio} sampleSize={signal?.sampleSize} computedAt={signal?.computedAt} />
        </span>
      </Link>

      <div className="mt-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href={`/venues/${encodeURIComponent(venue.id)}`}
                className="min-w-0 truncate text-lg font-black leading-tight text-white transition-colors hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
              >
                <HighlightText text={venue.name} query={searchQuery} />
              </Link>
              {venue.openNow === true ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" />
                  Open
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SourceBadge source={signal?.busynessSource} />
            </div>
          </div>

          <Link
            href={reportHref(vibeCheckHref, session)}
            className="flex min-h-[44px] shrink-0 items-center rounded-full bg-[#7C3AED] px-4 text-xs font-black text-white shadow-[0_0_18px_rgba(124,58,237,0.24)] transition-colors hover:bg-[#6D28D9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/60"
          >
            {session ? "Report" : "Sign in"}
          </Link>
        </div>

      </div>
    </li>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-3">
      <Skeleton className="h-32 rounded-xl bg-white/10" />
      <div className="mt-3 space-y-3">
        <Skeleton className="h-4 w-2/3 bg-white/10" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-24 rounded-full bg-white/10" />
          <Skeleton className="h-5 w-16 rounded-full bg-white/10" />
        </div>
        <Skeleton className="h-2 w-full rounded-full bg-white/10" />
      </div>
    </div>
  );
}

export function ExplorePageClient() {
  const track = useTrack();
  const [session, setSession] = useState<Session | null>(null);
  const [venues, setVenues] = useState<ConsumerVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [busynessFilter, setBusynessFilter] = useState<BusynessFilter>("All");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All");

  const fetchVenues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/venues");
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setVenues(json?.data?.venues ?? []);
    } catch {
      setError("📡 Can't reach the server. Pull to refresh.");
    } finally {
      setLoading(false);
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

    client.auth.getSession().then(({ data }) => setSession(data.session));

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const sortedVenues = useMemo(() => {
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

      return matchesSearch && matchesBusyness && matchesCategory;
    }).sort((a, b) => {
      const aState = getBusynessState(a.signal?.busyness0To100);
      const bState = getBusynessState(b.signal?.busyness0To100);
      return bState.rank - aState.rank || a.name.localeCompare(b.name);
    });
  }, [busynessFilter, categoryFilter, searchQuery, venues]);

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
          <h1 className="text-[1.65rem] font-black leading-tight text-white">
            Explore South End
          </h1>
          <p className="mt-1 text-sm text-white/42">Find your spot for tonight</p>

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
                className="h-12 w-full rounded-full border border-white/10 bg-white/[0.07] py-0 pl-4 pr-12 text-base font-semibold text-white placeholder:text-white/35 focus:border-[#EF4444]/70 focus:outline-none focus:ring-2 focus:ring-[#EF4444]/25"
                aria-label="Search South End venues"
              />
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
                <FilterChip
                  key={filter}
                  label={filter}
                  active={categoryFilter === filter}
                  onSelect={setCategoryFilter}
                />
              ))}
            </div>

            <p className="text-sm font-bold text-white/55">{sortedVenues.length} spots open now</p>
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

        {loading && (
          <div className="space-y-3" role="status" aria-label="Loading venues">
            <p className="sr-only">Loading venues...</p>
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        )}

        {!loading && !error && venues.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
            <p className="text-sm font-semibold text-white">
              No venues yet. Discovery job seeds South End venues.
            </p>
          </div>
        )}

        {!loading && !error && venues.length > 0 && sortedVenues.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
            <p className="text-sm font-semibold text-white">
              No packed spots right now — check back later 🎉
            </p>
          </div>
        )}

        {!loading && !error && sortedVenues.length > 0 && (
          <ul className="space-y-3">
            {sortedVenues.map((venue) => (
              <VenueFeedCard key={venue.id} venue={venue} session={session} searchQuery={searchQuery} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
