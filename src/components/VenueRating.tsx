"use client";

import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import { Star } from "lucide-react";
import { useToast } from "@/hooks/useToast";
import { triggerHapticFeedback } from "@/lib/haptics";

type VenueRatingState = {
  averageRating: number | null;
  ratingCount: number;
  userRating: number | null;
};

const EMPTY_RATING_STATE: VenueRatingState = {
  averageRating: null,
  ratingCount: 0,
  userRating: null,
};

function trackAnalytics(event: string, properties: Record<string, string | number | boolean | null>) {
  try {
    track(event, properties);
  } catch {
    // Analytics must never break the UI.
  }
}

function getRatingJsonValue(json: unknown): VenueRatingState {
  const value = json as Partial<VenueRatingState> & { data?: Partial<VenueRatingState> };
  const source = value.data ?? value;
  const userRating = typeof source.userRating === "number" && source.userRating >= 1 && source.userRating <= 5
    ? Math.round(source.userRating)
    : null;

  return {
    averageRating: typeof source.averageRating === "number" ? source.averageRating : null,
    ratingCount: typeof source.ratingCount === "number" ? source.ratingCount : 0,
    userRating,
  };
}

function StarButton({
  disabled,
  filled,
  rating,
  onClick,
}: {
  disabled: boolean;
  filled: boolean;
  rating: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Rate ${rating} star${rating === 1 ? "" : "s"}`}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:cursor-not-allowed ${
        filled
          ? "border-[#FFD166]/45 bg-[#FFD166]/15 text-[#FFD166]"
          : "border-white/10 bg-white/[0.04] text-white/35 hover:border-[#FFD166]/35 hover:text-[#FFD166] disabled:hover:border-white/10 disabled:hover:text-white/35"
      }`}
    >
      <Star className={`h-5 w-5 ${filled ? "fill-current" : ""}`} aria-hidden="true" />
    </button>
  );
}

export function VenueRating({
  accessToken,
  userId,
  venueId,
  googleRating,
  userRatingCount,
  promptAfterCheckIn = false,
  onRated,
}: {
  accessToken: string | null;
  userId?: string | null;
  venueId: string;
  googleRating?: number | null;
  userRatingCount?: number | null;
  promptAfterCheckIn?: boolean;
  onRated?: () => void;
}) {
  const { showToast } = useToast();
  const [ratingState, setRatingState] = useState<VenueRatingState>(EMPTY_RATING_STATE);
  const [loading, setLoading] = useState(true);
  const [pendingRating, setPendingRating] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;

    async function fetchRatings() {
      setLoading(true);
      setError(null);
      try {
        const headers: HeadersInit = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
        const res = await fetch(`/api/venue-ratings?venue_id=${encodeURIComponent(venueId)}`, { headers });
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        if (!cancelled) setRatingState(getRatingJsonValue(json));
      } catch {
        if (!cancelled) setError("Could not load ratings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchRatings();
    return () => {
      cancelled = true;
    };
  }, [accessToken, venueId]);

  async function submitRating(rating: number) {
    if (!accessToken) {
      showToast("Sign in to rate", "info");
      return;
    }
    if (pendingRating || ratingState.userRating === rating) return;
    const previousState = ratingState;
    const hadRating = previousState.userRating !== null;
    const nextRatingCount = hadRating ? previousState.ratingCount : previousState.ratingCount + 1;
    const nextAverageRating = previousState.averageRating === null
      ? rating
      : Math.round(
        ((previousState.averageRating * previousState.ratingCount) - (previousState.userRating ?? 0) + rating)
        / Math.max(1, nextRatingCount)
        * 10,
      ) / 10;
    const nextState = { averageRating: nextAverageRating, ratingCount: nextRatingCount, userRating: rating };

    setPendingRating(rating);
    setError(null);
    setRatingState(nextState);
    triggerHapticFeedback(30);

    try {
      const res = await fetch("/api/venue-ratings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ venue_id: venueId, user_id: userId ?? undefined, rating }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      trackAnalytics("rating_submitted", { venue_id: venueId, rating });
      showToast("Rating saved!", "success");
      onRated?.();
    } catch {
      setRatingState(previousState);
      setError("Could not save rating.");
    } finally {
      setPendingRating(null);
    }
  }

  const readOnly = !accessToken;
  const disabled = loading || pendingRating !== null;
  const displayRating = googleRating ?? ratingState.averageRating;
  const displayCount = userRatingCount ?? ratingState.ratingCount;
  const googleRatingLabel = displayRating == null || !Number.isFinite(displayRating)
    ? "Google rating unavailable"
    : `Google ${displayRating.toFixed(1)}`;
  const countLabel = displayCount == null || displayCount <= 0 ? null : `${displayCount.toLocaleString()} ratings`;
  const hasNoRatings = !loading && ratingState.userRating === null;
  const showPostCheckInPrompt = promptAfterCheckIn && !loading && ratingState.userRating === null;

  return (
    <section
      className={`space-y-3 border-t pt-5 ${
        showPostCheckInPrompt
          ? "rounded-2xl border border-[#8B6CFF]/35 bg-[#8B6CFF]/10 p-4 shadow-[0_0_24px_rgba(139,108,255,0.16)]"
          : "border-white/[0.06]"
      }`}
      role="region"
      aria-label="Venue rating"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-[#9CA2AE]">
            {showPostCheckInPrompt ? "Rate this venue" : "Your rating"}
          </p>
          <p className="mt-1 text-[12px] font-medium text-white/55">
            {googleRatingLabel}{countLabel ? ` · ${countLabel}` : ""}
          </p>
          {showPostCheckInPrompt && (
            <p className="mt-1 text-[12px] font-medium text-white/55">Help the next person choose the right spot.</p>
          )}
          {readOnly && <p className="mt-1 text-[12px] text-[#9CA2AE]">Sign in to rate</p>}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1.5" aria-busy={loading}>
            {[1, 2, 3, 4, 5].map((rating) => (
              <StarButton
                key={rating}
                disabled={disabled}
                filled={(ratingState.userRating ?? 0) >= rating}
                rating={rating}
                onClick={() => void submitRating(rating)}
              />
            ))}
          </div>
        )}
      </div>
      {hasNoRatings && !readOnly && (
        <p className="text-[13px] italic text-[#9CA2AE]">Tap a star to add your rating</p>
      )}
      {error && <p className="text-[12px] text-[#FF5B6A]">{error}</p>}
    </section>
  );
}
