"use client";

// ============================================================
// VenueCard  — NV-061, NV-065
//
// FullCard: crowd-first layout
//   1. Full-width crowd color bar at top (40% fill opacity)
//   2. Venue name 19px, Space Grotesk
//   3. Vibe score plain text in #8B6CFF, 18px
//   4. Time ago + report count, white/40, 11px
//   5. "Report →" pill button, right-aligned, canonical violet
//   Max height ~90px. No VibeScoreRing, no star rating, no save button.
//
// CompactCard: map popup variant — unchanged from prior version.
// ============================================================

import { VibeTagBadge } from "./VibeTagBadge";
import { SaveVenueButton } from "./SaveVenueButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StarRating } from "./StarRating";
import { VenuePhoto } from "@/components/VenuePhoto";

// --------------- Crowd types --------------------------------

export type CrowdLevel = "quiet" | "moderate" | "packed" | "wild";

const CROWD_CFG: Record<CrowdLevel, { label: string; bg: string; text: string; border: string }> = {
  quiet: { label: "Dead", bg: "rgba(255,255,255,0.035)", text: "#5C6573", border: "#5C6573" },
  moderate: { label: "Moderate", bg: "rgba(255,255,255,0.035)", text: "#FFB020", border: "#FFB020" },
  packed: { label: "Packed", bg: "rgba(255,255,255,0.035)", text: "#FF5B6A", border: "#FF5B6A" },
  wild: { label: "Wild", bg: "rgba(255,91,106,0.08)", text: "#FF5B6A", border: "#FF5B6A" },
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
  photoUrl?: string | null;
  rating?: number | null;
  googleRating?: number;
  totalRatings?: number;
  userRatingCount?: number | null;
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

function getGoogleRatingData(venue: VenueShape): { rating: number; count: number } | null {
  const rating = venue.rating ?? venue.googleRating;
  const count = venue.userRatingCount ?? venue.totalRatings;
  if (rating == null || count == null) return null;
  return { rating, count };
}

function PriceLevel({ level }: { level?: number }) {
  if (!level) return null;
  return (
    <span className="text-white/55 text-xs" aria-label={`Price level ${level} of 4`}>
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
  crowdBadge,
}: Omit<VenueCardProps, "variant" | "className">) {
  const crowd = crowdBadge ? CROWD_CFG[crowdBadge] : null;
  const googleRatingData = getGoogleRatingData(venue);

  return (
    <Card
      className="relative w-56 overflow-hidden rounded-[18px] border-white/[0.06] text-[#F4F5F8] shadow-2xl backdrop-blur-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:ring-1 hover:ring-violet/20 hover:shadow-violet/10"
      style={{ background: "rgba(255,255,255,0.035)" }}
    >
      <CardContent className="p-4">
        {venue.id && (
          <SaveVenueButton
            venueId={venue.id}
            venueName={venue.name}
            accessToken={accessToken}
            initialSaved={isSaved}
            onSavedChange={onSaveToggle}
            className="absolute right-2 top-2 h-11 w-11"
          />
        )}
        <div className="flex items-center gap-3">
          <VenuePhoto
            name={venue.name}
            photoUrl={venue.photoUrl}
            className="h-[72px] w-[72px] shrink-0 rounded-2xl"
            sizes="72px"
          />
          <div className="min-w-0 pr-10">
            <p className="font-display truncate text-[19px] font-semibold leading-tight tracking-tight text-[#F4F5F8]">{venue.name}</p>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-xs">
              {googleRatingData ? <StarRating {...googleRatingData} /> : null}
              <PriceLevel level={venue.priceLevel} />
              {crowd && (
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: crowd.text, border: `1px solid ${crowd.border}59` }}>
                  {crowd.label}
                </span>
              )}
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
          className="mt-3 min-h-11 w-full rounded-full bg-[#8B6CFF] text-[13px] font-semibold text-[#0A0A0E] shadow-[0_0_18px_rgba(139,108,255,0.24)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#9C85FF] active:scale-95"
        >
          {isChecking ? "Checking..." : "Check vibe"}
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
  const googleRatingData = getGoogleRatingData(venue);
  if (lastReportedAt) meta.push(timeAgo(lastReportedAt));
  if (reportCount != null && reportCount > 0) meta.push(`${reportCount} report${reportCount === 1 ? "" : "s"}`);

  return (
    <div
      className={`relative overflow-hidden rounded-[18px] border border-white/[0.06] shadow-lg shadow-black/10 backdrop-blur-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:ring-1 hover:ring-violet/20 hover:shadow-violet/10 ${className ?? ""}`}
      style={{ background: "rgba(255,255,255,0.035)" }}
    >
      {venue.id && (
        <SaveVenueButton
          venueId={venue.id}
          venueName={venue.name}
          accessToken={accessToken}
          initialSaved={isSaved}
          onSavedChange={onSaveToggle}
          className="absolute right-2 top-2 z-10 h-11 w-11"
        />
      )}

      <VenuePhoto
        name={venue.name}
        photoUrl={venue.photoUrl}
        className="h-28 w-full border-b border-white/[0.06]"
        sizes="(max-width: 640px) calc(100vw - 2rem), 420px"
      />

      {/* Crowd color bar */}
      {crowd ? (
        <div
          className="flex min-h-[32px] w-full items-center px-4 pr-12"
          style={{ background: crowd.bg, borderBottom: `1px solid ${crowd.border}` }}
        >
          <span className="text-[13px] font-semibold" style={{ color: crowd.text }}>
            {crowd.label}
          </span>
        </div>
      ) : (
        <div className="flex min-h-[32px] w-full items-center border-b border-white/[0.06] px-4">
          <span className="text-[11px] text-white/30">No reports yet — be first</span>
        </div>
      )}

      {/* Card body */}
      <div className="flex items-center gap-3 p-4">
        <div className="flex-1 min-w-0">
          {/* Venue name */}
          <p className="font-display truncate text-[19px] font-semibold leading-snug tracking-tight text-[#F4F5F8]">{venue.name}</p>
          {googleRatingData ? (
            <div className="mt-1 text-xs">
              <StarRating {...googleRatingData} />
            </div>
          ) : null}
          {/* Meta */}
          <div className="mt-1 flex items-baseline gap-1.5">
            {meta.length > 0 && (
              <span className="text-[13px] font-medium text-[#9CA2AE]">{meta.join(" · ")}</span>
            )}
          </div>
        </div>

        {/* Report button */}
        <button
          type="button"
          onClick={() => onVibeCheck?.(venue)}
          disabled={isChecking}
          aria-label={`Report vibe for ${venue.name}`}
          className="flex min-h-[44px] flex-shrink-0 items-center rounded-full border border-[#8B6CFF]/50 px-4 py-2 text-[13px] font-semibold text-[#8B6CFF] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#8B6CFF]/10 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 disabled:opacity-40 disabled:hover:translate-y-0 disabled:active:scale-100"
        >
          {isChecking ? "…" : "Check in →"}
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
