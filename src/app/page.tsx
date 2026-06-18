"use client";

// ============================================================
// Home / Discovery Feed  (NV-007)
//
// - Loading: 3 skeleton cards with pulse animation
// - Empty state: dark card "No vibes found nearby. Try a different search."
// - Error state: banner with Retry button
// - Filter chips: All | Bars | Clubs | Restaurants | Live Music
// - VenueCard shows VibeScoreRing (40px) when cachedVibeScore exists
// - FAB: neon cyan "+" circle at bottom-right → /vibe-check
// - Dark theme: bg-[#0A0A0F], cards bg-[#141420], neon cyan accents
// ============================================================

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VenueCard } from "@/components/VenueCard";
import { VibeScoreRing } from "@/components/VibeScoreRing";
import type { VenueBasic } from "@/types";

// --------------- Filter chip config -------------------------

type FilterKey = "all" | "bar" | "night_club" | "restaurant" | "live_music";

interface FilterChip {
  key: FilterKey;
  label: string;
}

const FILTER_CHIPS: FilterChip[] = [
  { key: "all", label: "All" },
  { key: "bar", label: "Bars" },
  { key: "night_club", label: "Clubs" },
  { key: "restaurant", label: "Restaurants" },
  { key: "live_music", label: "Live Music" },
];

// Map filter key → venue type strings that match
const FILTER_TYPE_MAP: Record<FilterKey, string[]> = {
  all: [],
  bar: ["bar", "bars"],
  night_club: ["night_club", "nightclub", "club"],
  restaurant: ["restaurant", "restaurants"],
  live_music: ["live_music", "music_venue", "live music"],
};

// --------------- Loading skeleton for a single card ----------

function VenueCardSkeleton() {
  return (
    <div className="rounded-2xl bg-[#141420] border border-white/10 p-4 flex items-center gap-4 animate-pulse">
      {/* Score ring placeholder */}
      <div className="w-[72px] h-[72px] rounded-full bg-white/10 flex-shrink-0" />
      {/* Text lines */}
      <div className="flex-1 space-y-3">
        <div className="h-4 bg-white/10 rounded-md w-3/4" />
        <div className="h-3 bg-white/10 rounded-md w-1/2" />
        <div className="flex gap-2">
          <div className="h-5 bg-white/10 rounded-full w-16" />
          <div className="h-5 bg-white/10 rounded-full w-12" />
        </div>
      </div>
      {/* Button placeholder */}
      <div className="w-24 h-9 bg-white/10 rounded-xl flex-shrink-0" />
    </div>
  );
}

// --------------- Search input --------------------------------

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
}

function SearchInput({ value, onChange }: SearchInputProps) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx={11} cy={11} r={8} />
          <line x1={21} y1={21} x2={16.65} y2={16.65} />
        </svg>
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search bars, clubs, lounges…"
        aria-label="Search venues"
        className="
          w-full rounded-2xl bg-white/[0.07] border border-white/10
          text-white placeholder:text-white/30 text-sm
          pl-11 pr-4 py-3.5
          focus:outline-none focus:border-[#00F5D4]/60 focus:ring-1 focus:ring-[#00F5D4]/30
          transition-colors duration-150
        "
      />
    </div>
  );
}

// --------------- Filter chips row ----------------------------

interface FilterChipsProps {
  active: FilterKey;
  onChange: (key: FilterKey) => void;
}

function FilterChips({ active, onChange }: FilterChipsProps) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
      role="group"
      aria-label="Filter venues by type"
    >
      {FILTER_CHIPS.map((chip) => {
        const isActive = chip.key === active;
        return (
          <button
            key={chip.key}
            onClick={() => onChange(chip.key)}
            aria-pressed={isActive}
            className={`
              flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold
              border transition-all duration-150 focus:outline-none
              focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60
              ${
                isActive
                  ? "bg-[#00F5D4]/15 border-[#00F5D4]/70 text-[#00F5D4]"
                  : "bg-white/[0.06] border-white/10 text-white/50 hover:bg-white/[0.09] hover:text-white/80"
              }
            `}
            style={
              isActive
                ? { boxShadow: "0 0 10px rgba(0,245,212,0.18)" }
                : undefined
            }
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

// --------------- Small score ring for card augmentation ------

interface SmallScoreRingProps {
  score: number;
}

function SmallScoreRing({ score }: SmallScoreRingProps) {
  return (
    <VibeScoreRing
      score={score}
      size={40}
      strokeWidth={4}
      className="flex-shrink-0"
    />
  );
}

// --------------- Empty state ---------------------------------

function EmptyState({ query, activeFilter }: { query: string; activeFilter: FilterKey }) {
  const isBlankSearch = !query.trim();
  const hasFilter = activeFilter !== "all";

  if (isBlankSearch && !hasFilter) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
        <span className="text-4xl" aria-hidden="true">🌃</span>
        <p className="text-white font-semibold text-base">Discover tonight's vibe</p>
        <p className="text-white/40 text-sm max-w-xs">
          Search for a bar, club, or lounge above to see its vibe score.
        </p>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="rounded-2xl bg-[#141420] border border-white/10 p-8 flex flex-col items-center text-center gap-3"
    >
      <span className="text-3xl" aria-hidden="true">🔍</span>
      <p className="text-white font-semibold text-sm">
        No vibes found nearby. Try a different search.
      </p>
      <p className="text-white/40 text-xs max-w-xs">
        {hasFilter
          ? "Try removing the filter or adjusting your search terms."
          : "Check the spelling or try a broader term like "bar" or "lounge"."}
      </p>
    </div>
  );
}

// --------------- Main page component ------------------------

export default function HomePage() {
  const router = useRouter();
  const [venues, setVenues] = useState<VenueBasic[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [checkingVenueId, setCheckingVenueId] = useState<string | null>(null);

  // Fetch venues from the API whenever search changes.
  const fetchVenues = useCallback(async (query: string) => {
    if (!query.trim()) {
      setVenues([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query.trim() });
      const res = await fetch(`/api/venues?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }
      const json = await res.json();
      const list: VenueBasic[] = Array.isArray(json) ? json : (json.data ?? []);
      setVenues(list);
    } catch (err) {
      console.error("[HomePage] Failed to fetch venues", err);
      setError("Could not load venues. Please try again.");
      setVenues([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search effect — 300 ms after last keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchVenues(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchVenues]);

  // Filtered venue list based on active chip
  const filteredVenues =
    activeFilter === "all"
      ? venues
      : venues.filter((v) => {
          const typeNorm = v.type.toLowerCase().replace(/\s+/g, "_");
          return FILTER_TYPE_MAP[activeFilter].some((t) =>
            typeNorm.includes(t.replace(/\s+/g, "_"))
          );
        });

  function handleVibeCheck(venue: VenueBasic) {
    setCheckingVenueId(venue.placeId);
    router.push(
      `/vibe-check?venueId=${venue.placeId}&venueName=${encodeURIComponent(venue.name)}`
    );
  }

  const showEmpty =
    !loading && !error && (search.trim() === "" || filteredVenues.length === 0);

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0A0A0F]/90 backdrop-blur-xl border-b border-white/10 px-4 pt-safe">
        <div className="max-w-lg mx-auto py-4 space-y-3">
          <h1 className="text-gradient-vibe text-2xl font-extrabold tracking-tight">
            NightVibe
          </h1>
          <SearchInput value={search} onChange={setSearch} />
          {/* Filter chips always visible */}
          <FilterChips active={activeFilter} onChange={setActiveFilter} />
        </div>
      </header>

      {/* Feed */}
      <section
        className="max-w-lg mx-auto px-4 py-4 space-y-3 pb-32"
        aria-label="Venue feed"
      >
        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="rounded-2xl bg-rose-950/60 border border-rose-500/40 px-4 py-3 text-sm text-rose-300"
          >
            {error}{" "}
            <button
              onClick={() => fetchVenues(search)}
              className="underline text-rose-200 hover:text-white ml-1 focus:outline-none"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading skeletons — exactly 3 */}
        {loading && (
          <div className="space-y-3" aria-label="Loading venues" role="status">
            {Array.from({ length: 3 }).map((_, i) => (
              <VenueCardSkeleton key={i} />
            ))}
            <span className="sr-only">Loading venues…</span>
          </div>
        )}

        {/* Venue list */}
        {!loading && filteredVenues.length > 0 && (
          <ul className="space-y-3 list-none" aria-label="Venue results">
            {filteredVenues.map((venue) => (
              <li key={venue.placeId} className="relative">
                {/* Overlay small score ring on card if cached score exists */}
                {venue.cachedVibeScore != null && (
                  <div className="absolute top-3 right-3 z-10 pointer-events-none">
                    <SmallScoreRing score={venue.cachedVibeScore} />
                  </div>
                )}
                <VenueCard
                  venue={venue}
                  variant="full"
                  onVibeCheck={handleVibeCheck}
                  isChecking={checkingVenueId === venue.placeId}
                />
              </li>
            ))}
          </ul>
        )}

        {/* Empty state */}
        {showEmpty && (
          <EmptyState query={search} activeFilter={activeFilter} />
        )}
      </section>

      {/* Floating Action Button — neon cyan "+" circle */}
      <Link
        href="/vibe-check"
        aria-label="Check a vibe"
        className="
          fixed bottom-8 right-5 z-50
          w-14 h-14 rounded-full
          flex items-center justify-center
          bg-[#00F5D4] hover:bg-[#00dfc0]
          shadow-[0_0_20px_rgba(0,245,212,0.5)]
          hover:shadow-[0_0_28px_rgba(0,245,212,0.65)]
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/80
          transition-all duration-150 active:scale-95
        "
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#0A0A0F"
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1={12} y1={5} x2={12} y2={19} />
          <line x1={5} y1={12} x2={19} y2={12} />
        </svg>
      </Link>
    </div>
  );
}
