"use client";

import type { VenueBasic } from "@/types";
import { VibeScoreRing } from "./VibeScoreRing";
import { VibeTagBadge } from "./VibeTagBadge";
import { SaveSpotButton } from "./SaveSpotButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface VenueCardProps {
  venue: VenueBasic;
  topTags?: string[];
  variant?: "full" | "compact";
  onVibeCheck?: (venue: VenueBasic) => void;
  isChecking?: boolean;
  className?: string;
  isSaved?: boolean;
  onSaveToggle?: (venueId: string, saved: boolean) => void;
}

// Map venue type → emoji accent
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
    <Badge variant="outline" className="border-white/10 bg-white/[0.03] px-1.5 py-0 text-white/35 text-[11px]" aria-label={`Price level ${level} of 4`}>
      {"$".repeat(level)}
      <span className="opacity-30">{"$".repeat(4 - level)}</span>
    </Badge>
  );
}

function StarRating({ rating }: { rating?: number }) {
  if (rating == null) return null;
  return (
    <Badge variant="outline" className="border-amber-400/15 bg-amber-400/[0.06] px-1.5 py-0 text-amber-400/80 text-[11px]" aria-label={`${rating} star rating`}>
      ★ {rating.toFixed(1)}
    </Badge>
  );
}

// Placeholder ring when no vibe score exists
function NoScorePlaceholder({ size }: { size: number }) {
  return (
    <div
      className="flex-shrink-0 rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: "rgba(255,255,255,0.04)",
        border: "2px dashed rgba(255,255,255,0.12)",
      }}
      aria-label="Vibe not checked yet"
    >
      <span className="text-white/20 text-sm font-bold">?</span>
    </div>
  );
}

function CompactCard({ venue, topTags, onVibeCheck, isChecking }: Omit<VenueCardProps, "variant" | "className">) {
  return (
    <Card className="w-56 rounded-xl border-white/10 bg-zinc-950/95 text-white shadow-2xl"
      style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
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
            <Badge variant="outline" className="mt-1 border-white/10 bg-white/[0.03] px-1.5 py-0 text-white/30 text-[10px]">
              {venueEmoji(venue.type)} {venue.type.replace("_", " ")}
            </Badge>
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
          className="mt-3 h-9 w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-xs font-semibold text-white hover:from-purple-500 hover:to-pink-500"
        >
          {isChecking ? "Checking..." : "Check Vibe"}
        </Button>
      </CardContent>
    </Card>
  );
}

function FullCard({ venue, topTags, onVibeCheck, isChecking, isSaved, className }: Omit<VenueCardProps, "variant">) {
  return (
    <Card
      className={`
        relative rounded-2xl border transition-all duration-200 p-4 group
        bg-white/[0.04] border-white/[0.09]
        hover:bg-white/[0.07] hover:border-white/[0.18]
        ${className ?? ""}
      `}
      style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}
    >
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
          {/* Score ring or placeholder */}
          {venue.cachedVibeScore != null ? (
            <VibeScoreRing score={venue.cachedVibeScore} size={68} strokeWidth={7} className="flex-shrink-0" />
          ) : (
            <NoScorePlaceholder size={68} />
          )}

          {/* Info */}
          <div className="flex-1 min-w-0 pr-8">
            <div className="flex items-center gap-1.5">
              <span className="text-sm" aria-hidden="true">{venueEmoji(venue.type)}</span>
              <h3 className="text-white font-semibold text-[15px] leading-snug truncate">{venue.name}</h3>
            </div>
            <p className="text-white/35 text-xs truncate mt-0.5">{venue.address}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <StarRating rating={venue.googleRating} />
              <PriceLevel level={venue.priceLevel} />
              <Badge variant="outline" className="border-white/10 bg-white/[0.03] px-1.5 py-0 text-white/30 text-[11px] capitalize">
                {venue.type.replace(/_/g, " ")}
              </Badge>
            </div>
            {topTags && topTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {topTags.slice(0, 3).map((t) => (
                  <VibeTagBadge key={t} tag={t} variant="secondary" />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CTA row below content */}
        <div className="mt-3 flex items-center justify-between gap-3">
          {venue.cachedVibeScore != null && (
            <Badge variant="outline" className="gap-1.5 border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-400/70">
              <span className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 6px #34d39999" }} />
              Vibe scored
            </Badge>
          )}
          <div className="ml-auto">
            <Button
              type="button"
              onClick={() => onVibeCheck?.(venue)}
              disabled={isChecking}
              aria-label={`Check vibe for ${venue.name}`}
              className="h-9 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 text-xs font-bold text-white hover:from-purple-500 hover:to-pink-500 focus-visible:ring-purple-400"
              style={{ boxShadow: "0 0 16px rgba(168,85,247,0.2)" }}
            >
              {isChecking ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Checking...
                </span>
              ) : venue.cachedVibeScore != null ? "Re-check Vibe" : "Check Vibe"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function VenueCard({ variant = "full", ...props }: VenueCardProps) {
  if (variant === "compact") {
    const { isSaved: _isSaved, onSaveToggle: _onSaveToggle, ...compactProps } = props;
    return <CompactCard {...compactProps} />;
  }
  return <FullCard {...props} />;
}

export default VenueCard;
