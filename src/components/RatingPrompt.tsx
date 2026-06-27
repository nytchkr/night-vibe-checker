"use client";

import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

type RatingPromptProps = {
  accessToken: string | null;
  isOpen: boolean;
  onSkip: () => void;
  onSubmitted: (avgRating: number) => void;
  venueId: string;
};

type RateResponse = {
  ok?: boolean;
  avg_rating?: number;
  error?: { message?: string };
};

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

export function RatingPrompt({
  accessToken,
  isOpen,
  onSkip,
  onSubmitted,
  venueId,
}: RatingPromptProps) {
  const [rating, setRating] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(isOpen, dialogRef, () => {
    if (!submitting) onSkip();
  });

  useEffect(() => {
    if (!isOpen) {
      setRating(0);
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function submitRating() {
    if (!accessToken || submitting || rating < 1 || rating > 5) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/venues/${encodeURIComponent(venueId)}/rate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rating }),
      });
      const json = (await response.json().catch(() => ({}))) as RateResponse;
      if (!response.ok || !json.ok) {
        throw new Error(json.error?.message ?? "Could not submit rating.");
      }

      onSubmitted(typeof json.avg_rating === "number" ? json.avg_rating : rating);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit rating.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rating-prompt-title"
      tabIndex={-1}
    >
      <button
        type="button"
        aria-label="Skip rating"
        className="absolute inset-0 cursor-default"
        onClick={() => {
          if (!submitting) onSkip();
        }}
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#0A0A0E] p-6 shadow-2xl shadow-black/50">
        <h2 id="rating-prompt-title" className="text-lg font-bold text-white">
          How was the vibe?
        </h2>

        <div className="mt-5 flex justify-center gap-2" role="radiogroup" aria-label="Vibe rating">
          {STAR_VALUES.map((value) => {
            const selected = value <= rating;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setRating(value);
                  if (error) setError(null);
                }}
                disabled={submitting}
                aria-label={`${value} star${value === 1 ? "" : "s"}`}
                aria-checked={rating === value}
                role="radio"
                className="flex h-11 w-11 items-center justify-center rounded-full text-3xl leading-none transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ color: selected ? "#F0568C" : "rgba(255,255,255,0.35)" }}
              >
                <span aria-hidden="true">{selected ? "★" : "☆"}</span>
              </button>
            );
          })}
        </div>

        {error && <p className="mt-4 text-sm font-medium text-[#F0568C]">{error}</p>}

        <button
          type="button"
          onClick={() => void submitRating()}
          disabled={!accessToken || rating === 0 || submitting}
          className="mt-6 flex min-h-12 w-full items-center justify-center rounded-xl bg-[#8B6CFF] px-4 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
        >
          {submitting ? "Submitting" : "Submit Rating"}
        </button>

        <button
          type="button"
          onClick={onSkip}
          disabled={submitting}
          className="mt-4 w-full rounded-xl py-2 text-sm font-bold text-white/50 transition-colors hover:text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:opacity-50"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
