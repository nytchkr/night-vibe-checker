"use client";

// ============================================================
// VenueCard  — NV-061, NV-065
//
// FullCard: crowd-first layout
//   1. Full-width crowd color bar at top (40% fill opacity)
//   2. Venue name 16px bold
//   3. Vibe score plain text in #00F5D4, 18px
//   4. Time ago + report count, white/40, 11px
//   5. "Report →" pill button, right-aligned, neon-cyan
//   Max height ~90px. No VibeScoreRing, no star rating, no save button.
//
// CompactCard: map popup variant — unchanged from prior version.
// ============================================================

// TODO(NV-076): VenueBasic removed with vibe.ts — prop type will be replaced by ConsumerVenue
import { VibeTagBadge } from "./VibeTagBadge";
import { SaveVenueButton } from "./SaveVenueButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// --------------- Crowd types --------------------------------

export type CrowdLevel = "quiet" | "moderate" | "packed" | "wild";

const CROWD_CFG: Record<CrowdLevel, { label: string; bg: string; text: string; border: string }> = {
  quiet:    { label: "QUIET",    bg: "rgba(34,197,94,0.40)",  text: "#fff", border: "rgba(34,197,94,0.5)"   },
  moderate: { label: "MODERATE", bg: "rgba(251,191,36,0.40)", text: "#fff", border: "rgba(251,191,36,0.5)"  },
  packed:   { label: "PACKED",   bg: "rgba(249,115,22,0.40)", text: "#fff", border: "rgba(249,115,22,0.5)"  },
  wild:     { label: "WILD",     bg: "rgba(255,45,120,0.40)", text: "#fff", border: "rgba(255,45,120,0.5)"  },
};

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000 / 60);
  if (diff < 1) return "Just now";
  if (diff === 1) return "1 min ago";
  if (diff < 60) return `${diff} min ago`;
  const h = Math.floor(diff / 60);
  return h === 1 ? "1 hr ago" : `${h} hr ago`;
}

// --------------- Props --------------------------------------

// Minimal venue shape — will be replaced by ConsumerVenue once NV-076 ships
interface VenueShape {
  id?: string;
  placeId: string;
  name: string;
  googleRating?: number;
  priceLevel?: number;
}

interface VenueCardProps {
  venue: VenueShape;
  topTags?: string[];
  variant?: "full" | "compact";
  onVibeCheck?: (venue: VenueShape) => void;
  isChecking?: boolean;
  className?: string;
  isSaved?: boolean;
  accessToken?: string | null;
  onSaveToggle?: (venueId: string, saved: boolean) => void;
  /** Live crowd level from check-ins */
  crowdBadge?: CrowdLevel;
  /** ISO string of most recent check-in */
  lastReportedAt?: string;
  /** Number of reports in the time window */
  reportCount?: number;
}

// --------------- Compact card (map popup) -------------------

function StarRating({ rating }: { rating?: number }) {
  if (rating == null) return null;
  return (
    <span className="text-amber-400/80 text-xs font-semibold" aria-label={`${rating} star rating`}>
      ★ {rating.toFixed(1)}
    </span>
  );
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

function CompactCard({
  venue,
  topTags,
  onVibeCheck,
  isChecking,
  isSaved,
  accessToken,
  onSaveToggle,
}: Omit<VenueCardProps, "variant" | "className">) {
  return (
    <Card
      className="relative w-56 overflow-hidden rounded-2xl border-white/10 bg-zinc-950/95 text-white shadow-2xl"
      style={{ background: "linear-gradient(145deg, rgba(24,24,27,0.98), rgba(39,39,42,0.92))", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}
    >
      <CardContent className="p-3">
        {venue.id && (
          <SaveVenueButton
            venueId={venue.id}
            venueName={venue.name}
            accessToken={accessToken}
            initialSaved={isSaved}
            onSavedChange={onSaveToggle}
            className="absolute right-2 top-2 h-9 w-9"
          />
        )}
        <div className="flex items-center gap-3">
          <div className="min-w-0 pr-10">
            <p className="text-white font-semibold text-sm leading-tight truncate">{venue.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <StarRating rating={venue.googleRating} />
              <PriceLevel level={venue.priceLevel} />
            </div>
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
  onVibeCheck,
  isChecking,
  className,
  isSaved,
  accessToken,
  onSaveToggle,
  crowdBadge,
  lastReportedAt,
  reportCount,
}: Omit<VenueCardProps, "variant">) {
  const crowd = crowdBadge ? CROWD_CFG[crowdBadge] : null;
  const meta: string[] = [];
  if (lastReportedAt) meta.push(timeAgo(lastReportedAt));
  if (reportCount != null && reportCount > 0) meta.push(`${reportCount} report${reportCount === 1 ? "" : "s"}`);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden border border-white/[0.09] ${className ?? ""}`}
      style={{ background: "rgba(255,255,255,0.04)" }}
    >
      {venue.id && (
        <SaveVenueButton
          venueId={venue.id}
          venueName={venue.name}
          accessToken={accessToken}
          initialSaved={isSaved}
          onSavedChange={onSaveToggle}
          className="absolute right-2 top-2 z-10 h-9 w-9"
        />
      )}

      {/* Crowd color bar */}
      {crowd ? (
        <div
          className="w-full flex items-center px-3 pr-12 min-h-[32px]"
          style={{ background: crowd.bg, borderBottom: `1px solid ${crowd.border}` }}
        >
          <span className="text-[14px] font-bold" style={{ color: crowd.text }}>
            {crowd.label}
          </span>
        </div>
      ) : (
        <div className="w-full min-h-[32px] border-b border-white/[0.07]" />
      )}

      {/* Card body */}
      <div className="flex items-center px-3 py-3 gap-3">
        <div className="flex-1 min-w-0">
          {/* Venue name */}
          <p className="text-white text-[16px] font-bold leading-snug truncate">{venue.name}</p>
          {/* Vibe score + meta */}
          <div className="flex items-baseline gap-1.5 mt-0.5">
            {meta.length > 0 && (
              <span className="text-white/40 text-[11px]">{meta.join(" · ")}</span>
            )}
          </div>
        </div>

        {/* Report button */}
        <button
          type="button"
          onClick={() => onVibeCheck?.(venue)}
          disabled={isChecking}
          aria-label={`Report vibe for ${venue.name}`}
          className="flex-shrink-0 px-3 py-2 rounded-full text-[#00F5D4] border border-[#00F5D4]/50 text-xs font-bold min-h-[44px] flex items-center hover:bg-[#00F5D4]/10 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60 disabled:opacity-40"
        >
          {isChecking ? "…" : "Report →"}
        </button>
      </div>
    </div>
  );
}

// --------------- Export -------------------------------------

export function VenueCard({ variant = "full", ...props }: VenueCardProps) {
  if (variant === "compact") {
    const { crowdBadge: _cb, lastReportedAt: _lr, reportCount: _rc, ...compactProps } = props;
    return <CompactCard {...compactProps} />;
  }
  return <FullCard {...props} />;
}

export default VenueCard;
