"use client";

// ============================================================
// Home / Discovery Feed  (NV-007, NV-041)
//
// NV-041: Redesigned around check-in product flow.
// - Hero section: NightVibe wordmark + "What's the vibe right now?"
//   tagline + full-width "Check In — Report a Vibe" CTA
// - Below hero: Recently Reported venues grid with crowd badges
//   and "X min ago" timestamps
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VenueCard } from "@/components/VenueCard";
import { Skeleton } from "@/components/ui/skeleton";
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

const FILTER_TYPE_MAP: Record<FilterKey, string[]> = {
  all: [],
  bar: ["bar", "bars"],
  night_club: ["night_club", "nightclub", "club"],
  restaurant: ["restaurant", "restaurants"],
  live_music: ["live_music", "music_venue", "live music"],
};

// --------------- Crowd badge types --------------------------

type CrowdLevel = "quiet" | "moderate" | "packed" | "wild";

const CROWD_BADGE: Record<CrowdLevel, { label: string; bg: string; text: string; glow: string }> = {
  quiet: { label: "Quiet", bg: "rgba(34,197,94,0.15)", text: "#4ade80", glow: "0 0 8px rgba(34,197,94,0.3)" },
  moderate: { label: "Moderate", bg: "rgba(251,191,36,0.15)", text: "#fbbf24", glow: "0 0 8px rgba(251,191,36,0.3)" },
  packed: { label: "Packed", bg: "rgba(249,115,22,0.15)", text: "#fb923c", glow: "0 0 8px rgba(249,115,22,0.3)" },
  wild: { label: "Wild", bg: "rgba(255,45,120,0.18)", text: "#FF2D78", glow: "0 0 8px rgba(255,45,120,0.4)" },
};

function CrowdBadge({ level }: { level: CrowdLevel }) {
  const cfg = CROWD_BADGE[level];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{ background: cfg.bg, color: cfg.text, boxShadow: cfg.glow }}
    >
      {cfg.label}
    </span>
  );
}

function timeAgo(minutes: number): string {
  if (minutes < 1) return "Just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  return h === 1 ? "1 hr ago" : `${h} hr ago`;
}

// --------------- Demo venues (shown when no check-ins yet) --

interface DemoVenue {
  name: string;
  type: string;
  crowdLevel: CrowdLevel;
  vibeScore: number;
  minutesAgo: number;
}

const DEMO_VENUES: DemoVenue[] = [
  { name: "The Midnight Lounge", type: "lounge", crowdLevel: "packed", vibeScore: 8.4, minutesAgo: 3 },
  { name: "Club Neon", type: "night_club", crowdLevel: "wild", vibeScore: 9.1, minutesAgo: 7 },
  { name: "The Corner Bar", type: "bar", crowdLevel: "moderate", vibeScore: 6.8, minutesAgo: 12 },
  { name: "Velvet Underground", type: "lounge", crowdLevel: "quiet", vibeScore: 7.2, minutesAgo: 22 },
];

function DemoVenueCard({ venue }: { venue: DemoVenue }) {
  return (
    <div
      className="rounded-2xl border border-white/[0.09] p-4 flex items-center gap-4 transition-all duration-150 hover:border-white/20"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025) 52%, rgba(34,211,238,0.04))",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.18)",
      }}
    >
      <div
        className="flex-shrink-0 w-14 h-14 rounded-full flex flex-col items-center justify-center bg-white/[0.06] border border-[#00F5D4]/20"
        style={{ boxShadow: "0 0 14px rgba(0,245,212,0.2)" }}
        aria-label={`Vibe score ${venue.vibeScore} out of 10`}
      >
        <span className="text-[#00F5D4] font-black text-base leading-none">{venue.vibeScore.toFixed(1)}</span>
        <span className="text-white/30 text-[9px] mt-0.5">/10</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-sm leading-snug truncate">{venue.name}</p>
        <p className="text-white/35 text-xs capitalize mt-0.5">{venue.type.replace(/_/g, " ")}</p>
        <div className="flex items-center gap-2 mt-2">
          <CrowdBadge level={venue.crowdLevel} />
          <span className="text-white/30 text-[10px]">{timeAgo(venue.minutesAgo)}</span>
        </div>
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="text-white/20 flex-shrink-0" aria-hidden="true">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  );
}

// --------------- Skeletons ----------------------------------

function VenueCardSkeleton() {
  return (
    <div className="rounded-2xl bg-[#141420] border border-white/10 p-4 flex items-center gap-4">
      <Skeleton className="w-14 h-14 rounded-full flex-shrink-0 bg-white/10" />
      <div className="flex-1 space-y-3">
        <Skeleton className="h-4 w-3/4 bg-white/10" />
        <Skeleton className="h-3 w-1/2 bg-white/10" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full bg-white/10" />
          <Skeleton className="h-3 w-14 bg-white/10" />
        </div>
      </div>
    </div>
  );
}

// --------------- Search input --------------------------------

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none">
        <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
        className="w-full rounded-2xl bg-white/[0.07] border border-white/10 text-white placeholder:text-white/30 text-sm pl-11 pr-4 py-3.5 focus:outline-none focus:border-[#00F5D4]/60 focus:ring-1 focus:ring-[#00F5D4]/30 transition-colors duration-150"
      />
    </div>
  );
}

// --------------- Filter chips --------------------------------

function FilterChips({ active, onChange }: { active: FilterKey; onChange: (key: FilterKey) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" role="group" aria-label="Filter venues by type">
      {FILTER_CHIPS.map((chip) => {
        const isActive = chip.key === active;
        return (
          <button
            key={chip.key}
            onClick={() => onChange(chip.key)}
            aria-pressed={isActive}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60 ${
              isActive
                ? "bg-[#00F5D4]/15 border-[#00F5D4]/70 text-[#00F5D4]"
                : "bg-white/[0.06] border-white/10 text-white/50 hover:bg-white/[0.09] hover:text-white/80"
            }`}
            style={isActive ? { boxShadow: "0 0 10px rgba(0,245,212,0.18)" } : undefined}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

// --------------- Empty state ---------------------------------

function EmptyState({ query, activeFilter }: { query: string; activeFilter: FilterKey }) {
  const hasFilter = activeFilter !== "all";
  return (
    <div role="status" className="rounded-2xl bg-[#141420] border border-white/10 p-8 flex flex-col items-center text-center gap-3">
      <span className="text-3xl" aria-hidden="true">🔍</span>
      <p className="text-white font-semibold text-sm">No vibes found nearby. Try a different search.</p>
      <p className="text-white/40 text-xs max-w-xs">
        {hasFilter ? "Try removing the filter or adjusting your search terms." : `Check the spelling or try a broader term like "bar" or "lounge".`}
      </p>
      {query && <p className="text-white/20 text-xs">Searched for: &quot;{query}&quot;</p>}
    </div>
  );
}

// --------------- Main page ----------------------------------

export default function HomePage() {
  const router = useRouter();
  const [venues, setVenues] = useState<VenueBasic[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [checkingVenueId, setCheckingVenueId] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const mountFetchDone = useRef(false);

  const fetchVenues = useCallback(
    async (query: string, coords?: { lat: number; lng: number } | null) => {
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
        const resolvedCoords = coords !== undefined ? coords : userCoords;
        if (resolvedCoords) {
          params.set("lat", String(resolvedCoords.lat));
          params.set("lng", String(resolvedCoords.lng));
        }
        const res = await fetch(`/api/venues?${params.toString()}`);
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
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
    },
    [userCoords]
  );

  useEffect(() => {
    if (mountFetchDone.current) return;
    mountFetchDone.current = true;
    setLoading(true);
    const doFallback = () => fetchVenues("nightlife", null);
    if (!navigator.geolocation) { doFallback(); return; }
    const timeoutId = setTimeout(doFallback, 3000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeoutId);
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUserCoords(coords);
        fetchVenues("bars", coords);
      },
      () => { clearTimeout(timeoutId); doFallback(); },
      { timeout: 3000, maximumAge: 300_000 }
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!search.trim()) return;
    const timer = setTimeout(() => fetchVenues(search), 300);
    return () => clearTimeout(timer);
  }, [search, fetchVenues]);

  const filteredVenues =
    activeFilter === "all"
      ? venues
      : venues.filter((v) => {
          const typeNorm = v.type.toLowerCase().replace(/\s+/g, "_");
          return FILTER_TYPE_MAP[activeFilter].some((t) => typeNorm.includes(t.replace(/\s+/g, "_")));
        });

  function handleVibeCheck(venue: VenueBasic) {
    setCheckingVenueId(venue.placeId);
    router.push(`/vibe-check?venueId=${venue.placeId}&venueName=${encodeURIComponent(venue.name)}`);
  }

  const hasSearch = search.trim().length > 0;
  const showEmpty = !loading && !error && filteredVenues.length === 0 && hasSearch;
  const showDemoVenues = !loading && !error && filteredVenues.length === 0 && !hasSearch;

  return (
    <div className="min-h-screen bg-[#0A0A0F]">

      {/* ── Hero (above the fold, 375px mobile) ────────────── */}
      <section className="relative overflow-hidden px-4 pt-10 pb-7">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-10"
          style={{
            height: "280px",
            background: "radial-gradient(ellipse 90% 140% at 20% -20%, rgba(0,245,212,0.18) 0%, transparent 60%), radial-gradient(ellipse 70% 120% at 80% -10%, rgba(255,45,120,0.12) 0%, transparent 60%)",
          }}
        />
        <div className="max-w-lg mx-auto">
          {/* Wordmark */}
          <p className="text-[#00F5D4]/60 text-[10px] font-black uppercase tracking-[0.38em] mb-3">
            NightVibe
          </p>
          {/* Tagline */}
          <h1
            className="text-white font-black text-[1.75rem] tracking-[-0.02em] leading-tight mb-6"
            style={{ textShadow: "0 0 40px rgba(0,245,212,0.15)" }}
          >
            What&apos;s the vibe{" "}
            <span style={{ color: "#00F5D4" }}>right now?</span>
          </h1>
          {/* Primary CTA — neon-cyan bg, dark text, full-width */}
          <Link
            href="/vibe-check"
            className="flex items-center justify-center gap-2.5 w-full min-h-[52px] rounded-2xl text-[#0A0A0F] font-black text-base tracking-[-0.01em] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/80 transition-all duration-150 active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #00F5D4 0%, #00dfc0 100%)",
              boxShadow: "0 0 32px rgba(0,245,212,0.55), 0 0 64px rgba(0,245,212,0.18)",
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Check In — Report a Vibe
          </Link>
        </div>
      </section>

      {/* ── Search + filters (sticky) ──────────────────────── */}
      <div className="sticky top-0 z-40 bg-[#0A0A0F]/95 backdrop-blur-xl border-b border-white/[0.07] px-4 py-3">
        <div className="max-w-lg mx-auto space-y-2.5">
          <SearchInput value={search} onChange={setSearch} />
          <FilterChips active={activeFilter} onChange={setActiveFilter} />
        </div>
      </div>

      {/* ── Venue feed ─────────────────────────────────────── */}
      <section className="max-w-lg mx-auto px-4 py-4 space-y-3 pb-32" aria-label="Venue feed">

        {/* Section label */}
        {!loading && !error && (filteredVenues.length > 0 || showDemoVenues) && (
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-white/35 text-[11px] font-semibold uppercase tracking-[0.2em]">
              {showDemoVenues ? "Recently Reported" : "Tonight"}
            </p>
            {!showDemoVenues && filteredVenues.length > 0 && (
              <Link href="/discover" className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/60 transition-colors hover:bg-white/[0.1] hover:text-white">
                Map
              </Link>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div role="alert" className="rounded-2xl bg-rose-950/60 border border-rose-500/40 px-4 py-3 text-sm text-rose-300">
            {error}{" "}
            <button onClick={() => fetchVenues(search)} className="underline text-rose-200 hover:text-white ml-1 focus:outline-none">
              Retry
            </button>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-3" aria-label="Loading venues" role="status">
            {Array.from({ length: 3 }).map((_, i) => <VenueCardSkeleton key={i} />)}
            <span className="sr-only">Loading venues…</span>
          </div>
        )}

        {/* Demo "Recently Reported" cards */}
        {showDemoVenues && (
          <ul className="space-y-3 list-none" aria-label="Recently reported venues">
            {DEMO_VENUES.map((v) => (
              <li key={v.name}><DemoVenueCard venue={v} /></li>
            ))}
            <li aria-hidden="true">
              <p className="text-center text-white/20 text-xs py-2">
                Demo data — be the first to report a real venue!
              </p>
            </li>
          </ul>
        )}

        {/* Real venue list */}
        {!loading && filteredVenues.length > 0 && (
          <ul className="space-y-3 list-none" aria-label="Venue results">
            {filteredVenues.map((venue) => (
              <li key={venue.placeId}>
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
        {showEmpty && <EmptyState query={search} activeFilter={activeFilter} />}
      </section>
    </div>
  );
}
