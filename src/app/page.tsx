"use client";

// ============================================================
// Home — Live Feed  (NV-059, NV-065)
//
// On load: fetches GET /api/check-ins?limit=20
// Shows feed of real check-ins — crowd badge dominant, no search hero
// Empty state: simple search input + "Nothing reported tonight yet"
// ============================================================

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import type { LiveCheckIn } from "@/types";

// --------------- Crowd badge config -------------------------

type CrowdLevel = "quiet" | "moderate" | "packed" | "wild";

const CROWD_CFG: Record<CrowdLevel, { label: string; bg: string; text: string; borderColor: string }> = {
  quiet:    { label: "QUIET",    bg: "rgba(34,197,94,0.40)",   text: "#fff",    borderColor: "rgba(34,197,94,0.6)"   },
  moderate: { label: "MODERATE", bg: "rgba(251,191,36,0.40)",  text: "#fff",    borderColor: "rgba(251,191,36,0.6)"  },
  packed:   { label: "PACKED",   bg: "rgba(249,115,22,0.40)",  text: "#fff",    borderColor: "rgba(249,115,22,0.6)"  },
  wild:     { label: "WILD",     bg: "rgba(255,45,120,0.40)",  text: "#fff",    borderColor: "rgba(255,45,120,0.6)"  },
};

function CrowdBar({ level }: { level: string }) {
  const cfg = CROWD_CFG[(level as CrowdLevel)] ?? CROWD_CFG.moderate;
  return (
    <div
      className="w-full flex items-center px-3 min-h-[32px]"
      style={{ background: cfg.bg, borderBottom: `1px solid ${cfg.borderColor}` }}
    >
      <span className="text-[14px] font-bold tracking-wide" style={{ color: cfg.text }}>
        {cfg.label}
      </span>
    </div>
  );
}

// --------------- Time ago -----------------------------------

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 1000 / 60);
  if (mins < 1) return "Just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return h === 1 ? "1 hr ago" : `${h} hr ago`;
}

// --------------- Feed card ----------------------------------

function FeedCard({ checkIn }: { checkIn: LiveCheckIn }) {
  return (
    <div
      className="rounded-2xl overflow-hidden border border-white/[0.09]"
      style={{ background: "rgba(255,255,255,0.04)" }}
    >
      <CrowdBar level={checkIn.crowdLevel} />
      <div className="flex items-center px-3 py-3 gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-white text-[16px] font-bold leading-snug truncate">{checkIn.venueName}</p>
          <p className="text-white/40 text-[11px] mt-0.5">
            <span className="text-[#00F5D4] text-[18px] font-bold leading-none align-middle mr-1">
              {typeof checkIn.vibeScore === "number" ? checkIn.vibeScore : "—"}
            </span>
            · {timeAgo(checkIn.createdAt)}
          </p>
        </div>
        <Link
          href={`/vibe-check?venueId=${encodeURIComponent(checkIn.venueId)}&venueName=${encodeURIComponent(checkIn.venueName)}`}
          className="flex-shrink-0 px-3 py-2 rounded-full text-[#00F5D4] border border-[#00F5D4]/50 text-xs font-bold min-h-[44px] flex items-center hover:bg-[#00F5D4]/10 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60"
          aria-label={`Report vibe for ${checkIn.venueName}`}
        >
          Report →
        </Link>
      </div>
    </div>
  );
}

// --------------- Skeleton -----------------------------------

function FeedCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden border border-white/[0.09]" style={{ background: "rgba(255,255,255,0.04)" }}>
      <Skeleton className="h-8 w-full rounded-none bg-white/10" />
      <div className="flex items-center px-3 py-3 gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3 bg-white/10" />
          <Skeleton className="h-3 w-1/3 bg-white/10" />
        </div>
        <Skeleton className="h-9 w-20 rounded-full bg-white/10 flex-shrink-0" />
      </div>
    </div>
  );
}

// --------------- Empty state with venue search --------------

function EmptyState() {
  const [query, setQuery] = useState("");

  return (
    <div className="space-y-5 pt-4">
      <div className="text-center space-y-2 py-6">
        <p className="text-white/60 text-sm font-medium">Nothing reported tonight yet — be the first</p>
      </div>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx={11} cy={11} r={8} />
            <line x1={21} y1={21} x2={16.65} y2={16.65} />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a venue to report…"
          aria-label="Search venues"
          className="w-full rounded-2xl bg-white/[0.07] border border-white/10 text-white placeholder:text-white/30 text-sm pl-11 pr-4 py-3.5 focus:outline-none focus:border-[#00F5D4]/60 focus:ring-1 focus:ring-[#00F5D4]/30 transition-colors duration-150 min-h-[44px]"
        />
      </div>
      {query.trim() && (
        <Link
          href={`/vibe-check?venueName=${encodeURIComponent(query.trim())}`}
          className="flex items-center justify-center w-full min-h-[52px] rounded-2xl text-[#0A0A0F] font-black text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/80 transition-all duration-150 active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #00F5D4 0%, #00dfc0 100%)", boxShadow: "0 0 28px rgba(0,245,212,0.45)" }}
        >
          Report a spot at &ldquo;{query.trim()}&rdquo;
        </Link>
      )}
    </div>
  );
}

// --------------- Main page ----------------------------------

export default function HomePage() {
  const [checkIns, setCheckIns] = useState<LiveCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetch("/api/check-ins?limit=20")
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((json) => {
        const rows: LiveCheckIn[] = json?.data?.checkIns ?? [];
        setCheckIns(rows);
      })
      .catch(() => setError("Could not load the feed. Tap to retry."))
      .finally(() => setLoading(false));
  }, []);

  const isEmpty = !loading && !error && checkIns.length === 0;

  return (
    <div className="min-h-screen bg-[#0A0A0F]">

      {/* Header */}
      <header className="px-4 pt-10 pb-5">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-10"
          style={{ height: "180px", background: "radial-gradient(ellipse 80% 120% at 30% -30%, rgba(0,245,212,0.14) 0%, transparent 65%)" }}
        />
        <div className="max-w-lg mx-auto">
          <h1
            className="text-white font-black text-[1.6rem] tracking-[-0.02em] leading-tight"
            style={{ textShadow: "0 0 40px rgba(0,245,212,0.12)" }}
          >
            How&apos;s it out there?
          </h1>
          <p className="text-white/40 text-sm mt-1">Live crowd reports from tonight</p>
        </div>
      </header>

      {/* Feed */}
      <section className="max-w-lg mx-auto px-4 pb-32 space-y-3" aria-label="Live vibe feed">

        {/* Section label */}
        {!loading && !error && checkIns.length > 0 && (
          <p className="text-white/35 text-[11px] font-semibold uppercase tracking-[0.2em] mb-1">
            Right now
          </p>
        )}

        {/* Error */}
        {error && (
          <div role="alert" className="rounded-2xl bg-rose-950/60 border border-rose-500/40 px-4 py-3 text-sm text-rose-300 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                fetchedRef.current = false;
                fetch("/api/check-ins?limit=20")
                  .then((r) => r.json())
                  .then((j) => setCheckIns(j?.data?.checkIns ?? []))
                  .catch(() => setError("Could not load the feed. Tap to retry."))
                  .finally(() => setLoading(false));
              }}
              className="underline text-rose-200 hover:text-white ml-2 focus:outline-none"
            >
              Retry
            </button>
          </div>
        )}

        {/* Skeletons */}
        {loading && (
          <div className="space-y-3" role="status" aria-label="Loading feed">
            {Array.from({ length: 3 }).map((_, i) => <FeedCardSkeleton key={i} />)}
            <span className="sr-only">Loading…</span>
          </div>
        )}

        {/* Feed cards */}
        {!loading && !error && checkIns.length > 0 && (
          <ul className="space-y-3 list-none">
            {checkIns.map((ci) => (
              <li key={ci.id}>
                <FeedCard checkIn={ci} />
              </li>
            ))}
          </ul>
        )}

        {/* Empty state */}
        {isEmpty && <EmptyState />}

        {/* Secondary CTA — always visible below feed */}
        {!loading && !error && checkIns.length > 0 && (
          <div className="pt-4">
            <Link
              href="/vibe-check"
              className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-2xl text-[#0A0A0F] font-bold text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/80 transition-all duration-150 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #00F5D4 0%, #00dfc0 100%)", boxShadow: "0 0 24px rgba(0,245,212,0.35)" }}
            >
              Report a spot
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
