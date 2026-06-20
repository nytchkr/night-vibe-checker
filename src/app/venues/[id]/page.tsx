"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { MFRatioBar } from "@/components/MFRatioBar";
import type { BusynessSource, ConsumerCheckIn, ConsumerVenue } from "@/types";

function busynessColor(value: number | null | undefined): string {
  if (value == null) return "#6B7280";
  if (value <= 33) return "#22C55E";
  if (value <= 66) return "#F59E0B";
  return "#EF4444";
}

function busynessLabel(value: number | null | undefined): string {
  if (value == null) return "No data yet";
  if (value <= 33) return "Quiet";
  if (value <= 66) return "Moderate";
  return "Packed";
}

function crowdFeelLabel(feel: ConsumerCheckIn["crowdFeel"]): string {
  switch (feel) {
    case "mostly_male": return "Mostly male";
    case "mostly_female": return "Mostly female";
    case "balanced": return "Balanced";
    case "mixed": return "Mixed";
  }
}

function busynessChip(busyness: ConsumerCheckIn["busyness"]): { label: string; color: string } {
  switch (busyness) {
    case "packed": return { label: "Packed", color: "#EF4444" };
    case "moderate": return { label: "Moderate", color: "#F59E0B" };
    case "dead": return { label: "Quiet", color: "#22C55E" };
  }
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "Not updated yet";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "Just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes === 1) return "1m ago";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1d ago" : `${days}d ago`;
}

function SourceBadge({ source }: { source: BusynessSource | null | undefined }) {
  if (!source) return null;
  const isLive = source === "live";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/60">
      {isLive && (
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22C55E] opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
        </span>
      )}
      {source}
    </span>
  );
}

function ConfidenceChip({ value }: { value: number | null | undefined }) {
  const confidence = value ?? 0;
  const config =
    confidence < 0.3
      ? { label: "Low confidence", color: "#9CA3AF" }
      : confidence <= 0.7
        ? { label: "Medium confidence", color: "#F59E0B" }
        : { label: "High confidence", color: "#22C55E" };

  return (
    <span
      className="inline-flex rounded-full border px-2.5 py-1 text-xs font-bold"
      style={{
        borderColor: `${config.color}55`,
        backgroundColor: `${config.color}18`,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}

function CategoryChip({ category }: { category: string }) {
  return (
    <span className="inline-flex rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-bold capitalize text-white/60">
      {category.replaceAll("_", " ")}
    </span>
  );
}

function CheckInItem({ ci }: { ci: ConsumerCheckIn }) {
  const chip = busynessChip(ci.busyness);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ backgroundColor: `${chip.color}20`, color: chip.color }}
          >
            {chip.label}
          </span>
          <span className="text-[11px] text-white/35">{crowdFeelLabel(ci.crowdFeel)}</span>
        </div>
        {ci.note && (
          <p className="mt-1 line-clamp-2 text-xs text-white/50">{ci.note}</p>
        )}
      </div>
      <span className="shrink-0 text-[11px] text-white/25">{timeAgo(ci.createdAt)}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading venue">
      <Skeleton className="h-[200px] rounded-none bg-white/10" />
      <div className="px-4">
        <Skeleton className="h-8 w-2/3 bg-white/10" />
        <Skeleton className="mt-3 h-4 w-4/5 bg-white/10" />
        <Skeleton className="mt-5 h-28 rounded-2xl bg-white/10" />
      </div>
    </div>
  );
}

export default function VenuePage() {
  const params = useParams<{ id: string }>();
  const venueId = params.id;

  const [venue, setVenue] = useState<ConsumerVenue | null>(null);
  const [checkIns, setCheckIns] = useState<ConsumerCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetchData() {
      try {
        const [venueRes, checkInsRes] = await Promise.all([
          fetch(`/api/venues/${encodeURIComponent(venueId)}`),
          fetch(`/api/check-ins?venueId=${encodeURIComponent(venueId)}&limit=10`),
        ]);
        if (!venueRes.ok) throw new Error(`${venueRes.status}`);
        const venueJson = await venueRes.json();
        const checkInsJson = checkInsRes.ok ? await checkInsRes.json() : null;
        if (cancelled) return;
        setVenue(venueJson?.data?.venue ?? null);
        setCheckIns((checkInsJson?.data?.checkIns ?? []).slice(0, 10));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load venue.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [venueId]);

  const signal = venue?.signal;
  const busyness = signal?.busyness0To100 ?? null;
  const color = busynessColor(busyness);
  const label = busynessLabel(busyness);
  const updatedAt = signal?.lastBusynessRefresh ?? signal?.computedAt ?? null;
  const reportParams = useMemo(() => new URLSearchParams({
    venueId,
    venueName: venue?.name ?? "Venue",
  }), [venueId, venue?.name]);

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0A0A0F]/90 px-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center gap-3 py-4">
          <Link
            href="/"
            aria-label="Back to home"
            className="flex items-center gap-1.5 text-sm font-semibold text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/50"
          >
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
          {venue?.name && <h2 className="truncate text-sm font-medium text-white/50">{venue.name}</h2>}
        </div>
      </header>

      {loading && <LoadingSkeleton />}

      {!loading && error && (
        <main className="mx-auto max-w-lg px-4 py-6 pb-36">
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/40 bg-rose-950/60 p-5 text-center"
          >
            <p className="font-medium text-rose-300">Could not load venue</p>
            <p className="mt-1 text-sm text-rose-400/70">{error}</p>
          </div>
        </main>
      )}

      {!loading && !error && venue && (
        <>
          {venue.photoUrl ? (
            <img
              src={venue.photoUrl}
              alt=""
              className="h-[200px] w-full object-cover"
            />
          ) : (
            <div className="flex h-[200px] w-full items-center justify-center bg-white/[0.05] text-sm font-semibold text-white/28">
              No photo
            </div>
          )}

          <main className="mx-auto max-w-lg space-y-4 px-4 py-5 pb-36">
            <section>
              <div className="flex flex-wrap items-center gap-2">
                <CategoryChip category={venue.category} />
              </div>
              <h1 className="mt-3 text-[1.85rem] font-black leading-tight text-white">{venue.name}</h1>
              <p className="mt-1 text-sm leading-relaxed text-white/45">{venue.address}</p>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
                    Right now
                  </p>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="text-5xl font-black leading-none" style={{ color }}>
                      {busyness ?? "--"}
                    </span>
                    {busyness != null && <span className="pb-1 text-sm font-bold text-white/35">/100</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 pt-1">
                  <SourceBadge source={signal?.busynessSource} />
                  <ConfidenceChip value={signal?.confidence0To1} />
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}80` }}
                  aria-hidden="true"
                />
                <span className="text-lg font-black" style={{ color }}>{label}</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${busyness ?? 0}%`, backgroundColor: color }}
                />
              </div>
              <p className="mt-3 text-xs text-white/32">Updated {timeAgo(updatedAt)}</p>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
                M/F crowd
              </p>
              {signal?.mfRatio != null && signal.sampleSize >= 3 ? (
                <>
                  <MFRatioBar
                    malePercent={signal.mfRatio}
                    confidence={signal.confidence0To1}
                    sampleSize={signal.sampleSize}
                  />
                  <p className="mt-2 text-[11px] text-white/28">
                    {signal.sampleSize} report{signal.sampleSize !== 1 ? "s" : ""}
                  </p>
                </>
              ) : (
                <p className="text-sm font-semibold text-white/38">
                  No crowd reads yet — be the first to report
                </p>
              )}
            </section>

            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
                Recent check-ins
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
          </main>
        </>
      )}

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
