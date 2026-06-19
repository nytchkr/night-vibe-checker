"use client";

// ============================================================
// VenueCard  — NV-041 update
//
// Added props:
//   crowdBadge: "quiet" | "moderate" | "packed" | "wild"
//               → colored badge on card
//   lastReportedAt: ISO string → shows "X min ago" or "Just now"
//
// Full card: shows crowd badge + time since last report
// Compact card: compact popup for map view, unchanged
// ============================================================

import type { VenueBasic } from "@/types";
import { VibeScoreRing } from "./VibeScoreRing";
import { VibeTagBadge } from "./VibeTagBadge";
import { SaveSpotButton } from "./SaveSpotButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// --------------- Crowd badge types -------------------------

export type CrowdLevel = "quiet" | "moderate" | "packed" | "wild";

const CROWD_CFG: Record<CrowdLevel, { label: string; bg: string; text: string; glow: string }> = {
  quiet:    { label: "Quiet",    bg: "rgba(34,197,94,0.15)",  text: "#4ade80", glow: "0 0 8px rgba(34,197,94,0.3)"   },
  moderate: { label: "Moderate", bg: "rgba(251,191,36,0.15)", text: "#fbbf24", glow: "0 0 8px rgba(251,191,36,0.3)"  },
  packed:   { label: "Packed",   bg: "rgba(249,115,22,0.15)", text: "#fb923c", glow: "0 0 8px rgba(249,115,22,0.3)"  },
  wild:     { label: "Wild",     bg: "rgba(255,45,120,0.18)", text: "#FF2D78", glow: "0 0 8px rgba(255,45,120,0.4)"  },
};

function CrowdBadge({ level }: { level: CrowdLevel }) {
  const cfg = CROWD_CFG[level];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{ background: cfg.bg, color: cfg.text, boxShadow: cfg.glow }}
    >
      {cfg.label}
    </span>
  );
}

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000 / 60);
  if (diff < 1) return "Just now";
  if (diff === 1) return "1 min ago";
  if (diff < 60) return `${diff} min ago`;
  const h = Math.floor(diff / 60);
  return h === 1 ? "1 hr ago" : `${h} hr ago`;
}

// --------------- Props --------------------------------------

interface VenueCardProps {
  venue: VenueBasic;
  topTags?: string[];
  variant?: "full" | "compact";
  onVibeCheck?: (venue: VenueBasic) => void;
  isChecking?: boolean;
  className?: string;
  isSaved?: boolean;
  onSaveToggle?: (venueId: string, saved: boolean) => void;
  /** Live crowd level from check-ins (NV-041) */
  crowdBadge?: CrowdLevel;
  /** ISO string of most recent check-in (NV-041) */
  lastReportedAt?: string;
}

// --------------- Venue type emoji ---------------------------

const VENUE_TYPE_EMOJI: Record<string, string> = {
  bar: "🍸",
  bars: "🍸",
  night_club: "🎉",
  nightclub: "🎉",
  club: "🎉",
  restaurant: "🍽️",
  live_music: "🎵",
  music_venue: "🎵",
  lounge: "🛋️",
};

function venueEmoji(type: string): string {
  const key = type.toLowerCase().replace(/\s+/g, "_");
  return VENUE_TYPE_EMOJI[key] ?? "📍";
}

function PriceLevel({ level }: { level?: number }) {
  if (!level) return null;
  return (
    <span className="text-white/35 text-xs" aria-label={`Price level ${level} of 4`}>
      {"$".repeat(level)}
      <span className="opacity-30">{"$".repeat(4 - level)}</span>
    </span>
  );
}

function StarRating({ rating }: { rating?: number }) {
  if (rating == null) return null;
  return (
    <span className="text-amber-400/80 text-xs font-semibold" aria-label={`${rating} star rating`}>
      ★ {rating.toFixed(1)}
    </span>
  );
}

function NoScorePlaceholder({ size }: { size: number }) {
  return (
    <div
      className="flex-shrink-0 rounded-full flex items-center justify-center"
      style={{ width: size, height: size, background: "rgba(255,255,255,0.04)", border: "2px dashed rgba(255,255,255,0.12)" }}
      aria-label="Vibe not checked yet"
    >
      <span className="text-white/20 text-sm font-bold">?</span>
    </div>
  );
}

// --------------- Compact card -------------------------------

function CompactCard({ venue, topTags, onVibeCheck, isChecking }: Omit<VenueCardProps, "variant" | "className">) {
  return (
    <Card
      className="w-56 overflow-hidden rounded-2xl border-white/10 bg-zinc-950/95 text-white shadow-2xl"
      style={{ background: "linear-gradient(145deg, rgba(24,24,27,0.98), rgba(39,39,42,0.92))", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          {venue.cachedVibeScore != null ? (
            <VibeScoreRing score={venue.cachedVibeScore} size={52} strokeWidth={6} />
          ) : (
            <NoScorePlaceholder size={52} />
          )}
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm leading-tight truncate">{venue.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <StarRating rating={venue.googleRating} />
              <PriceLevel level={venue.priceLevel} />
            </div>
            <span className="mt-1 block text-white/25 text-[10px]">
              {venueEmoji(venue.type)} {venue.type.replace("_", " ")}
            </span>
          </div>
        </div>

        {topTags && topTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {topTags.slice(0, 3).map((t) => (
              <VibeTagBadge key={t} tag={t} variant="secondary" />
            ))}
          </div>
        )}

        <Button
          type="button"
          onClick={() => onVibeCheck?.(venue)}
          disabled={isChecking}
          className="mt-3 h-9 w-full rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-xs font-semibold text-white shadow-[0_0_18px_rgba(168,85,247,0.18)] hover:from-purple-500 hover:to-pink-500"
        >
          {isChecking ? "Checking..." : "Check Vibe"}
        </Button>
      </CardContent>
    </Card>
  );
}

// --------------- Full card ----------------------------------

function FullCard({
  venue,
  topTags,
  onVibeCheck,
  isChecking,
  isSaved,
  className,
  crowdBadge,
  lastReportedAt,
}: Omit<VenueCardProps, "variant">) {
  return (
    <Card
      className={`
        group relative overflow-hidden rounded-[22px] border p-4 transition-all duration-200
        border-white/[0.09] bg-white/[0.04]
        hover:border-[#00F5D4]/30 hover:bg-white/[0.065]
        ${className ?? ""}
      `}
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025) 52%, rgba(34,211,238,0.045))",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 34px rgba(0,0,0,0.18)",
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 34px rgba(0,0,0,0.18), 0 0 24px rgba(0,245,212,0.12)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 34px rgba(0,0,0,0.18)";
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-300/0 via-cyan-300/45 to-pink-300/0" />
      <CardContent className="p-0">
        {/* Save button */}
        <div className="absolute top-3 right-3 z-10">
          <SaveSpotButton
            venueId={venue.placeId}
            venueName={venue.name}
            address={venue.address}
            vibeScoreSnapshot={venue.cachedVibeScore}
            isSaved={isSaved}
            className="w-8 h-8 opacity-60 group-hover:opacity-100 transition-opacity duration-150"
          />
        </div>

        <div className="flex items-center gap-4">
          {venue.cachedVibeScore != null ? (
            <VibeScoreRing score={venue.cachedVibeScore} size={68} strokeWidth={7} className="flex-shrink-0" />
          ) : (
            <NoScorePlaceholder size={68} />
          )}

          <div className="flex-1 min-w-0 pr-8">
            <div className="flex items-center gap-2">
              <span className="text-xl leading-none" aria-hidden="true">{venueEmoji(venue.type)}</span>
              <h3 className="text-white font-bold text-[15px] leading-snug truncate">{venue.name}</h3>
            </div>
            <p className="text-white/35 text-xs truncate mt-0.5">{venue.address}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <StarRating rating={venue.googleRating} />
              <PriceLevel level={venue.priceLevel} />
              <span className="text-white/25 text-xs capitalize">
                {venue.type.replace(/_/g, " ")}
              </span>
            </div>

            {/* Crowd badge + time since last report (NV-041) */}
            {(crowdBadge || lastReportedAt) && (
              <div className="flex items-center gap-2 mt-2">
                {crowdBadge && <CrowdBadge level={crowdBadge} />}
                {lastReportedAt && (
                  <span className="text-white/30 text-[10px]">{timeAgo(lastReportedAt)}</span>
                )}
              </div>
            )}

            {topTags && topTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {topTags.slice(0, 3).map((t) => (
                  <VibeTagBadge key={t} tag={t} variant="secondary" />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CTA row */}
        <div className="mt-3 flex items-center justify-between gap-3">
          {venue.cachedVibeScore != null && !crowdBadge && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 6px #34d39999" }} />
              <span className="text-emerald-400/70 text-xs">Vibe scored</span>
            </div>
          )}
          <div className="ml-auto">
            <Button
              type="button"
              onClick={() => onVibeCheck?.(venue)}
              disabled={isChecking}
              aria-label={`Check in at ${venue.name}`}
              className="h-9 rounded-full px-4 text-xs font-bold text-[#0A0A0F] focus-visible:ring-[#00F5D4]/60 transition-all duration-150 active:scale-95"
              style={{
                background: "linear-gradient(135deg, #00F5D4 0%, #00c9b0 100%)",
                boxShadow: "0 0 18px rgba(0,245,212,0.45), 0 0 36px rgba(0,245,212,0.15)",
                animation: isChecking ? undefined : "vibeCTAPulse 2.4s ease-in-out infinite",
              }}
            >
              {isChecking ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full border-2 border-[#0A0A0F]/40 border-t-[#0A0A0F] animate-spin" />
                  Checking...
                </span>
              ) : "Check In →"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --------------- Export -------------------------------------

export function VenueCard({ variant = "full", ...props }: VenueCardProps) {
  if (variant === "compact") {
    const { isSaved: _isSaved, onSaveToggle: _onSaveToggle, crowdBadge: _cb, lastReportedAt: _lr, ...compactProps } = props;
    return <CompactCard {...compactProps} />;
  }
  return <FullCard {...props} />;
}

export default VenueCard;
