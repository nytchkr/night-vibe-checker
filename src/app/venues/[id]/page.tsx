"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConsumerVenue } from "@/types";

function busynessLabel(value: number | null | undefined) {
  if (value == null) return "No read yet";
  if (value >= 75) return "Packed";
  if (value >= 40) return "Moderate";
  return "Dead";
}

function priceLevelText(level?: number): string {
  if (!level) return "No price read";
  return "$".repeat(level);
}

function sourceLabel(source: string | null | undefined) {
  if (!source) return "No live reads yet";
  if (source === "crowd") return "Crowd read";
  if (source === "forecast") return "BestTime forecast";
  return "BestTime live";
}

export default function VenueDetailPage() {
  const params = useParams<{ id: string }>();
  const venueId = params.id;
  const [venue, setVenue] = useState<ConsumerVenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetchVenue() {
      try {
        const res = await fetch(`/api/venues/${venueId}`);
        if (!res.ok) throw new Error(`Venue not found (${res.status})`);
        const json = await res.json();
        if (!cancelled) setVenue(json.data?.venue ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load venue.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchVenue();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  const signal = venue?.signal;
  const busyness = signal?.busyness0To100 ?? null;

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0A0A0F]/90 px-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center gap-3 py-4">
          <Link href="/" className="text-sm font-semibold text-white/55 hover:text-white">Back</Link>
          {venue && <h2 className="truncate text-sm font-medium text-white/60">{venue.name}</h2>}
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-32">
        {loading && (
          <div className="space-y-4" role="status" aria-label="Loading venue">
            <Skeleton className="h-52 rounded-2xl bg-white/10" />
            <Skeleton className="h-32 rounded-2xl bg-white/10" />
            <Skeleton className="h-12 rounded-2xl bg-white/10" />
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-2xl border border-rose-500/40 bg-rose-950/60 p-5 text-center">
            <p className="font-medium text-rose-300">Could not load venue</p>
            <p className="mt-1 text-sm text-rose-400/70">{error}</p>
          </div>
        )}

        {!loading && !error && venue && (
          <>
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
              {venue.photoUrl ? (
                <img src={venue.photoUrl} alt="" className="h-48 w-full object-cover" />
              ) : (
                <div className="h-32 w-full bg-white/[0.06]" />
              )}
              <div className="p-5">
                <h1 className="text-2xl font-black leading-tight text-white">{venue.name}</h1>
                <p className="mt-1 text-sm text-white/42">{venue.address}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/45">
                  <span>{venue.category.replaceAll("_", " ")}</span>
                  {venue.googleRating != null && <span>{venue.googleRating.toFixed(1)} stars</span>}
                  <span>{priceLevelText(venue.priceLevel)}</span>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/35">Right now</p>
              <p className="mt-3 text-3xl font-black text-[#00F5D4]">
                {busynessLabel(busyness)}{busyness == null ? "" : ` · ${busyness}%`}
              </p>
              <p className="mt-1 text-sm text-white/42">{sourceLabel(signal?.busynessSource)}</p>
              <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">M/F signal</p>
                {signal?.mfRatio == null ? (
                  <p className="mt-2 text-sm text-white/45">No live reads yet.</p>
                ) : (
                  <p className="mt-2 text-lg font-bold text-white">
                    {signal.mfRatio}% male · {Math.round(signal.confidence0To1 * 100)}% confidence
                  </p>
                )}
              </div>
            </section>

            <Link
              href={`/vibe-check?venueId=${encodeURIComponent(venue.id)}&venueName=${encodeURIComponent(venue.name)}`}
              className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#00F5D4] text-base font-black text-[#0A0A0F] transition-all active:scale-[0.98]"
            >
              Report vibe
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
