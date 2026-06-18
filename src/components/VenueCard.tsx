"use client";

// ============================================================
// VenueCard
//
// Venue list item and compact map-popup variant.
//
// variant="full"    (default) — full card for list views
// variant="compact" — smaller popover for map pins
// ============================================================

import type { VenueBasic } from "@/types";
import { VibeScoreRing } from "./VibeScoreRing";
import { VibeTagBadge } from "./VibeTagBadge";
import { SaveSpotButton } from "./SaveSpotButton";

interface VenueCardProps {
  venue: VenueBasic;
  /** Pre-fetched top tags — optional; sourced from cached VibeReport */
  topTags?: string[];
  variant?: "full" | "compact";
  /** Called when the user clicks the card / "Check Vibe" button */
  onVibeCheck?: (venue: VenueBasic) => void;
  /** True while a vibe check for this venue is in flight */
  isChecking?: boolean;
  className?: string;
  /** Initial saved state for the SaveSpotButton; omit to auto-fetch */
  isSaved?: boolean;
  /** Called after a save/unsave toggle completes */
  onSaveToggle?: (venueId: string, saved: boolean) => void;
}

// --------------- Price level helper -----------------------

function PriceLevel({ level }: { level?: number }) {
  if (!level) return null;
  return (
    <span className="text-white/40 text-xs" aria-label={`Price level ${level} of 4`}>
      {"$".repeat(level)}
      <span className="opacity-30">{"$".repeat(4 - level)}</span>
    </span>
  );
}

// --------------- Star rating helper ----------------------

function StarRating({ rating }: { rating?: number }) {
  if (rating == null) return null;
  return (
    <span className="text-amber-400 text-xs font-semibold" aria-label={`${rating} star rating`}>
      ★ {rating.toFixed(1)}
    </span>
  );
}

// --------------- Compact variant (map popup) -------------

function CompactCard({
  venue,
  topTags,
  onVibeCheck,
  isChecking,
}: Omit<VenueCardProps, "variant" | "className">) {
  return (
    <div className="w-56 rounded-xl bg-zinc-950/95 border border-white/10 p-3 shadow-xl">
      <div className="flex items-center gap-3">
        {venue.cachedVibeScore != null ? (
          <VibeScoreRing score={venue.cachedVibeScore} size={52} strokeWidth={6} />
        ) : (
          <div
            className="w-[52px] h-[52px] rounded-full bg-white/10 flex items-center justify-center flex-shrink-0"
            aria-label="No vibe score yet"
          >
            <span className="text-white/30 text-xs">?</span>
          </div>
        )}
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm leading-tight truncate">
            {venue.name}
          </p>
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

      <button
        onClick={() => onVibeCheck?.(venue)}
        disabled={isChecking}
        className="
          mt-3 w-full py-1.5 rounded-lg text-xs font-semibold text-white
          bg-gradient-to-r from-purple-600 to-pink-600
          hover:from-purple-500 hover:to-pink-500
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-150
        "
      >
        {isChecking ? "Checking…" : "Check Vibe"}
      </button>
    </div>
  );
}

// --------------- Full variant (list view) ----------------

function FullCard({
  venue,
  topTags,
  onVibeCheck,
  isChecking,
  isSaved,
  onSaveToggle,
  className,
}: Omit<VenueCardProps, "variant">) {
  return (
    <div
      className={`
        relative rounded-2xl bg-white/5 border border-white/10
        hover:bg-white/[0.07] hover:border-white/20
        transition-all duration-200 p-4
        ${className ?? ""}
      `}
    >
      {/* Save button — top-right overlay */}
      <div className="absolute top-3 right-3 z-10">
        <SaveSpotButton
          venueId={venue.placeId}
          venueName={venue.name}
          address={venue.address}
          vibeScoreSnapshot={venue.cachedVibeScore}
          isSaved={isSaved}
          className="w-8 h-8"
        />
      </div>

      <div className="flex items-center gap-4">
        {/* Score ring or placeholder */}
        {venue.cachedVibeScore != null ? (
          <VibeScoreRing
            score={venue.cachedVibeScore}
            size={72}
            strokeWidth={7}
            className="flex-shrink-0"
          />
        ) : (
          <div
            className="w-[72px] h-[72px] flex-shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center"
            aria-label="Vibe not checked yet"
          >
            <span className="text-white/25 text-lg">?</span>
          </div>
        )}

        {/* Info column */}
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-base leading-snug truncate">
            {venue.name}
          </h3>
          <p className="text-white/40 text-xs truncate mt-0.5">{venue.address}</p>
          <div className="flex items-center gap-3 mt-1">
            <StarRating rating={venue.googleRating} />
            <PriceLevel level={venue.priceLevel} />
            <span className="text-white/30 text-xs capitalize">{venue.type.replace("_", " ")}</span>
          </div>

          {/* Tags */}
          {topTags && topTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {topTags.slice(0, 4).map((t) => (
                <VibeTagBadge key={t} tag={t} variant="secondary" />
              ))}
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="flex-shrink-0">
          <button
            onClick={() => onVibeCheck?.(venue)}
            disabled={isChecking}
            aria-label={`Check vibe for ${venue.name}`}
            className="
              px-4 py-2 rounded-xl text-sm font-semibold text-white
              bg-gradient-to-r from-purple-600 to-pink-600
              hover:from-purple-500 hover:to-pink-500
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-150 whitespace-nowrap
              focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400
            "
          >
            {isChecking ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                Checking…
              </span>
            ) : venue.cachedVibeScore != null ? (
              "Re-check"
            ) : (
              "Check Vibe"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------- Exported component ----------------------

export function VenueCard({ variant = "full", ...props }: VenueCardProps) {
  if (variant === "compact") {
    // CompactCard does not expose save UI (MVP scope)
    const { isSaved: _isSaved, onSaveToggle: _onSaveToggle, ...compactProps } = props;
    return <CompactCard {...compactProps} />;
  }
  return <FullCard {...props} />;
}

export default VenueCard;
