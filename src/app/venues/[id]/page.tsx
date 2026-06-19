"use client";

// ============================================================
// Venue detail page  /venues/[id]  (NV-071)
//
// Fetches GET /api/check-ins?venueId=[id] which returns:
//   { checkIns: ConsumerCheckIn[]; summary: CheckInSummary }
//
// Displays:
//   • Back arrow → home
//   • Venue name (from first check-in's venueName)
//   • Busyness color bar (dominant crowd from summary)
//   • M/F ratio bar (gray placeholder until crowd_feel data lands)
//   • Confidence placeholder
//   • Recent check-in list
//   • Sticky bottom CTA: "Report the Vibe" → /vibe-check?venueId=...
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { MFRatioBar } from "@/components/MFRatioBar";
import type { ConsumerCheckIn, CheckInSummary } from "@/types";

// --------------- Busyness helpers ----------------------------

function busynessColor(value: number | null): string {
  if (value == null) return "#6B7280";   // gray — no data
  if (value >= 75) return "#EF4444";     // red — packed
  if (value >= 40) return "#F59E0B";     // amber — moderate
  return "#22C55E";                      // green — quiet
}

function busynessLabel(value: number | null): string {
  if (value == null) return "No read yet";
  if (value >= 75) return "Packed";
  if (value >= 40) return "Moderate";
  return "Quiet";
}

// Crowd feel labels for the check-in list
function crowdFeel(feel: ConsumerCheckIn["crowdFeel"]): string {
  switch (feel) {
    case "mostly_male":   return "Mostly male";
    case "mostly_female": return "Mostly female";
    case "balanced":      return "Balanced";
    case "mixed":         return "Mixed";
  }
}

function busynessChip(busyness: ConsumerCheckIn["busyness"]): { label: string; color: string } {
  switch (busyness) {
    case "packed":   return { label: "Packed",   color: "#EF4444" };
    case "moderate": return { label: "Moderate", color: "#F59E0B" };
    case "dead":     return { label: "Quiet",    color: "#22C55E" };
  }
}

// --------------- Components ----------------------------------

function BusynessBar({ value }: { value: number | null }) {
  const color = busynessColor(value);
  const label = busynessLabel(value);
  const pct = value ?? 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}80` }}
          aria-hidden="true"
        />
        <span className="text-lg font-black" style={{ color }}>{label}</span>
        {value != null && (
          <span className="text-sm font-semibold text-white/40">{value}%</span>
        )}
      </div>
      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function CheckInItem({ ci }: { ci: ConsumerCheckIn }) {
  const chip = busynessChip(ci.busyness);
  const ts = new Date(ci.createdAt);
  const timeStr = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ backgroundColor: `${chip.color}20`, color: chip.color }}
          >
            {chip.label}
          </span>
          <span className="text-[11px] text-white/35">{crowdFeel(ci.crowdFeel)}</span>
        </div>
        {ci.note && (
          <p className="mt-1 text-xs text-white/50 line-clamp-2">{ci.note}</p>
        )}
      </div>
      <span className="flex-shrink-0 text-[11px] text-white/25">{timeStr}</span>
    </div>
  );
}

// --------------- Loading skeleton ----------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading venue">
      <Skeleton className="h-10 w-2/3 bg-white/10" />
      <Skeleton className="h-2 w-full rounded-full bg-white/10" />
      <Skeleton className="h-2 w-full rounded-full bg-white/10" />
      <div className="space-y-2.5 pt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl bg-white/10" />
        ))}
      </div>
    </div>
  );
}

// --------------- Page ----------------------------------------

export default function VenuePage() {
  const params = useParams<{ id: string }>();
  const venueId = params.id;

  const [checkIns, setCheckIns] = useState<ConsumerCheckIn[]>([]);
  const [summary, setSummary] = useState<CheckInSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetchData() {
      try {
        const res = await fetch(`/api/check-ins?venueId=${encodeURIComponent(venueId)}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setCheckIns(json?.data?.checkIns ?? []);
        setSummary(json?.data?.summary ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load venue.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [venueId]);

  // Derive venue name from first check-in if available
  const venueName = checkIns[0]?.venueName ?? "Venue";
  const busyness = summary?.busyness0To100 ?? null;
  const mfRatio = summary?.mfRatio ?? null;
  const confidence = summary?.confidence0To1 ?? null;
  const sampleSize = summary?.sampleSize ?? 0;

  const reportParams = new URLSearchParams({
    venueId,
    venueName,
  });

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Header with back arrow */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0A0A0F]/90 px-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center gap-3 py-4">
          <Link
            href="/"
            aria-label="Back to home"
            className="flex items-center gap-1.5 text-sm font-semibold text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/50"
          >
            {/* Left arrow */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </Link>
          {!loading && venueName !== "Venue" && (
            <h2 className="truncate text-sm font-medium text-white/50">{venueName}</h2>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-36">
        {loading && <LoadingSkeleton />}

        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/40 bg-rose-950/60 p-5 text-center"
          >
            <p className="font-medium text-rose-300">Could not load venue</p>
            <p className="mt-1 text-sm text-rose-400/70">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Venue name */}
            <section>
              <h1 className="text-[1.75rem] font-black leading-tight text-white">{venueName}</h1>
            </section>

            {/* Busyness signal */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
                Right now
              </p>
              <BusynessBar value={busyness} />
            </section>

            {/* M/F ratio */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
                M/F crowd
              </p>
              <MFRatioBar
                malePercent={mfRatio}
                confidence={confidence}
                sampleSize={sampleSize}
              />
              {sampleSize > 0 && (
                <p className="mt-2 text-[11px] text-white/28">
                  {sampleSize} report{sampleSize !== 1 ? "s" : ""}
                  {confidence != null && ` · ${Math.round(confidence * 100)}% confidence`}
                </p>
              )}
            </section>

            {/* Recent check-ins */}
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
                Recent reports
              </p>
              {checkIns.length === 0 ? (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-5 text-center">
                  <p className="text-sm text-white/40">No reports yet — be the first</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {checkIns.map((ci) => (
                    <CheckInItem key={ci.id} ci={ci} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.07] bg-[#0A0A0F]/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto max-w-lg">
          <Link
            href={`/vibe-check?${reportParams.toString()}`}
            className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#7C3AED] text-base font-black text-white transition-all hover:bg-[#6D28D9] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/60"
          >
            Report the Vibe
          </Link>
        </div>
      </div>
    </div>
  );
}
