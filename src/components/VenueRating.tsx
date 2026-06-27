"use client";

import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import { triggerHapticFeedback } from "@/lib/haptics";

type VenueRatingValue = "up" | "down";

type VenueRatingState = {
  upCount: number;
  downCount: number;
  userRating: VenueRatingValue | null;
};

const EMPTY_RATING_STATE: VenueRatingState = {
  upCount: 0,
  downCount: 0,
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

  return {
    upCount: typeof source.upCount === "number" ? source.upCount : 0,
    downCount: typeof source.downCount === "number" ? source.downCount : 0,
    userRating: source.userRating === "up" || source.userRating === "down" ? source.userRating : null,
  };
}

function RatingButton({
  active,
  count,
  disabled,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  disabled: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={`${label}: ${count}`}
      className={`inline-flex h-10 min-w-[5.25rem] items-center justify-center gap-2 rounded-full border px-3 text-[14px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:cursor-not-allowed ${
        active
          ? "border-[#8B6CFF]/60 bg-[#8B6CFF]/20 text-[#8B6CFF]"
          : "border-white/10 bg-white/[0.04] text-white/65 hover:border-white/20 hover:text-white disabled:hover:border-white/10 disabled:hover:text-white/65"
      }`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{count}</span>
    </button>
  );
}

export function VenueRating({ accessToken, venueId }: { accessToken: string | null; venueId: string }) {
  const [ratingState, setRatingState] = useState<VenueRatingState>(EMPTY_RATING_STATE);
  const [loading, setLoading] = useState(true);
  const [pendingRating, setPendingRating] = useState<VenueRatingValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;

    async function fetchRatings() {
      setLoading(true);
      setError(null);
      try {
        const headers: HeadersInit = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
        const res = await fetch(`/api/venue-ratings?venueId=${encodeURIComponent(venueId)}`, { headers });
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

  async function submitRating(rating: VenueRatingValue) {
    if (!accessToken || pendingRating || ratingState.userRating === rating) return;

    const previousState = ratingState;
    const nextState = {
      upCount:
        previousState.upCount + (rating === "up" ? 1 : 0) - (previousState.userRating === "up" ? 1 : 0),
      downCount:
        previousState.downCount + (rating === "down" ? 1 : 0) - (previousState.userRating === "down" ? 1 : 0),
      userRating: rating,
    };

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
        body: JSON.stringify({ venueId, rating }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      trackAnalytics("rating_submitted", { venue_id: venueId, rating });
    } catch {
      setRatingState(previousState);
      setError("Could not save rating.");
    } finally {
      setPendingRating(null);
    }
  }

  const readOnly = !accessToken;
  const disabled = readOnly || loading || pendingRating !== null;
  const tooltip = readOnly ? "Sign in to rate" : undefined;
  const hasNoRatings = !loading && ratingState.upCount === 0 && ratingState.downCount === 0;

  return (
    <section
      className="space-y-3 border-t border-white/[0.06] pt-5"
      role="region"
      aria-label="Would you go back rating"
      title={tooltip}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-[#9CA2AE]">Would you go back?</p>
          {readOnly && <p className="mt-1 text-[12px] text-[#9CA2AE]">Sign in to rate</p>}
        </div>
        <div className="flex items-center gap-2" aria-busy={loading}>
          <RatingButton
            active={ratingState.userRating === "up"}
            count={ratingState.upCount}
            disabled={disabled}
            icon="👍"
            label="Would go back"
            onClick={() => void submitRating("up")}
          />
          <RatingButton
            active={ratingState.userRating === "down"}
            count={ratingState.downCount}
            disabled={disabled}
            icon="👎"
            label="Would not go back"
            onClick={() => void submitRating("down")}
          />
        </div>
      </div>
      {hasNoRatings && (
        <p className="text-[13px] italic text-[#9CA2AE]">Be the first to rate this venue</p>
      )}
      {error && <p className="text-[12px] text-[#FF5B6A]">{error}</p>}
    </section>
  );
}
