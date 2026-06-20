"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareButton } from "@/components/ShareButton";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useTrack } from "@/lib/useTrack";
import type { ConsumerCheckIn, ConsumerVenue } from "@/types";

type BusynessState = {
  label: "No data yet" | "Dead" | "Moderate" | "Packed";
  color: string;
};

function getBusynessState(value: number | null | undefined): BusynessState {
  if (value == null) return { label: "No data yet", color: "#6B7280" };
  if (value >= 67) return { label: "Packed", color: "#EF4444" };
  if (value >= 34) return { label: "Moderate", color: "#F59E0B" };
  return { label: "Dead", color: "#6B7280" };
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

function formatHoursText(hours: string): string {
  const separatorIndex = hours.indexOf(":");
  const value = separatorIndex >= 0 ? hours.slice(separatorIndex + 1) : hours;
  return value.trim().replace(/\s+-\s+/, " – ");
}

function getHoursDay(hours: string): string | null {
  return hours.match(/^([^:]+):/)?.[1]?.trim() ?? null;
}

function freshnessLabel(signal: ConsumerVenue["signal"]): string {
  if (!signal) return "No check-ins yet";
  if (signal.busynessSource === "live") return "● Live";
  const updatedAt = signal.lastBusynessRefresh ?? signal.computedAt ?? null;
  const relative = timeAgo(updatedAt);
  return relative === "Not updated yet" ? relative : `Updated ${relative}`;
}

function RatingLabel({ rating }: { rating: number | undefined }) {
  if (rating == null || !Number.isFinite(rating)) return null;

  return (
    <span className="text-sm text-white/60">⭐ {rating.toFixed(1)}</span>
  );
}

function OpenNowBadge({ openNow }: { openNow: boolean | undefined }) {
  if (openNow === undefined) return null;

  const isOpen = openNow === true;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
        isOpen ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isOpen ? "bg-green-400" : "bg-red-400"}`}
        aria-hidden="true"
      />
      {isOpen ? "Open Now" : "Closed"}
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
      <Skeleton className="h-52 rounded-none bg-white/10 sm:h-[260px]" />
      <div className="px-4">
        <Skeleton className="h-8 w-2/3 bg-white/10" />
        <Skeleton className="mt-3 h-4 w-4/5 bg-white/10" />
        <Skeleton className="mt-5 h-28 rounded-2xl bg-white/10" />
      </div>
    </div>
  );
}

function clampPercent(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function VenuePageClient({
  venueId,
  initialVenue,
}: {
  venueId: string;
  initialVenue: ConsumerVenue | null;
}) {
  const track = useTrack();
  const [venue, setVenue] = useState<ConsumerVenue | null>(initialVenue);
  const [checkIns, setCheckIns] = useState<ConsumerCheckIn[]>([]);
  const [loading, setLoading] = useState(!initialVenue);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [hoursExpanded, setHoursExpanded] = useState(false);

  useEffect(() => {
    void track("venue_view", { venueId });
  }, [track, venueId]);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    setLoading(!initialVenue);
    setError(null);

    async function fetchData() {
      try {
        const checkInsPromise = fetch(`/api/check-ins?venueId=${encodeURIComponent(venueId)}&limit=10`);
        const venuePromise = initialVenue
          ? Promise.resolve(null)
          : fetch(`/api/venues/${encodeURIComponent(venueId)}`);
        const [venueRes, checkInsRes] = await Promise.all([venuePromise, checkInsPromise]);
        if (venueRes && !venueRes.ok) throw new Error(`${venueRes.status}`);
        const venueJson = venueRes ? await venueRes.json() : null;
        const checkInsJson = checkInsRes.ok ? await checkInsRes.json() : null;
        if (cancelled) return;
        if (venueJson) setVenue(venueJson?.data?.venue ?? null);
        setCheckIns((checkInsJson?.data?.checkIns ?? []).slice(0, 10));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load venue.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [initialVenue, venueId]);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    const client = createBrowserClient();

    async function fetchSavedState() {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (cancelled) return;

      setAccessToken(token);
      setAuthChecked(true);

      if (!token) {
        setSaved(false);
        return;
      }

      try {
        const res = await fetch("/api/saved-venues", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        const ids = json?.venueIds ?? json?.savedVenueIds ?? json?.data?.savedVenueIds ?? [];
        if (!cancelled) setSaved(Array.isArray(ids) && ids.includes(venueId));
      } catch {
        // Saving is non-critical; leave the default unsaved state if lookup fails.
      }
    }

    void fetchSavedState();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token ?? null;
      setAccessToken(token);
      setAuthChecked(true);
      if (!token) setSaved(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [venueId]);

  async function toggleSaved() {
    if (!accessToken || savePending) return;

    const nextSaved = !saved;
    setSaved(nextSaved);
    setSavePending(true);

    try {
      const res = await fetch("/api/saved-venues", {
        method: nextSaved ? "POST" : "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ venueId }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch {
      setSaved(!nextSaved);
    } finally {
      setSavePending(false);
    }
  }

  const signal = venue?.signal;
  const busyness = signal?.busyness0To100 ?? null;
  const busynessPercent = clampPercent(busyness);
  const busynessState = getBusynessState(busyness);
  const label = busynessState.label;
  const hasSignal = signal != null;
  const updatedAt = signal?.lastBusynessRefresh ?? signal?.computedAt ?? null;
  const malePercent = signal?.mfRatio != null && signal.sampleSize >= 3 ? clampPercent(signal.mfRatio) : null;
  const femalePercent = malePercent == null ? null : 100 - malePercent;
  const shareCaption = freshnessLabel(signal ?? null);
  const reportParams = useMemo(() => new URLSearchParams({
    venueId,
    venueName: venue?.name ?? "Venue",
  }), [venueId, venue?.name]);
  const reportUrl = `/vibe-check?${reportParams.toString()}`;
  const hoursSummary = useMemo(() => {
    const openingHours = venue?.openingHours ?? [];
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
    const todayHours = openingHours.find((hours) => getHoursDay(hours) === today);
    const restOfWeek = openingHours.filter((hours) => getHoursDay(hours) !== today);

    return {
      hasHours: openingHours.length > 0,
      restOfWeek,
      todayHours: todayHours ? formatHoursText(todayHours) : "Hours not available",
    };
  }, [venue?.openingHours]);
  const mapsHref = useMemo(() => {
    if (!venue) return "#";
    const query = venue.address || `${venue.lat},${venue.lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }, [venue]);

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0A0A0F]/90 px-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center gap-3 py-4">
          <Link
            href="/map"
            aria-label="Back to map"
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
            Back to map
          </Link>
          {venue?.name && <p className="truncate text-sm font-medium text-white/50">{venue.name}</p>}
        </div>
      </header>

      {loading && <LoadingSkeleton />}

      {!loading && error && (
        <div className="mx-auto max-w-lg px-4 py-6 pb-36">
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/40 bg-rose-950/60 p-5 text-center"
          >
            <p className="font-medium text-rose-300">Could not load venue</p>
            <p className="mt-1 text-sm text-rose-400/70">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && venue && (
        <>
          <section className="relative h-52 w-full overflow-hidden">
            {venue.photoUrl ? (
              <>
                <img
                  src={venue.photoUrl}
                  alt={venue.name}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0F] via-[#0A0A0F]/40 to-transparent" />
              </>
            ) : (
              <div className="flex h-52 w-full items-center justify-center bg-gradient-to-br from-[#1a1a2e] to-[#0A0A0F]">
                <span className="text-7xl font-black uppercase text-white/10">{venue.name.charAt(0)}</span>
              </div>
            )}

            <div className="absolute bottom-0 left-0 px-4 pb-4">
              <CategoryChip category={venue.category} />
              <h1 className="mt-2 max-w-[19rem] text-2xl font-black leading-tight text-white">{venue.name}</h1>
            </div>

            <div className="absolute right-4 top-4 flex items-center gap-2">
              <ShareButton venue={venue} caption={shareCaption} className="shrink-0" />
              {authChecked && !accessToken ? (
                <Link
                  href="/login"
                  aria-label={`Sign in to save ${venue.name}`}
                  className="rounded-full border border-white/15 bg-[#0A0A0F]/80 p-2 text-2xl text-white/75 shadow-lg backdrop-blur transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
                >
                  🤍
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={toggleSaved}
                  disabled={!authChecked || savePending}
                  aria-label={`${saved ? "Unsave" : "Save"} ${venue.name}`}
                  aria-pressed={saved}
                  className={`rounded-full border border-white/15 bg-[#0A0A0F]/80 p-2 text-2xl shadow-lg backdrop-blur transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70 disabled:opacity-60 ${
                    saved ? "text-red-400" : "text-white/75 hover:text-white"
                  }`}
                >
                  {saved ? "❤️" : "🤍"}
                </button>
              )}
            </div>
          </section>

          <div className="mx-auto max-w-lg space-y-4 px-4 py-5 pb-32">
            <section className="space-y-3">
              <p className="text-sm leading-relaxed text-white/50">{venue.address}</p>
              <div className="flex flex-wrap items-center gap-2">
                <RatingLabel rating={venue.rating} />
                <OpenNowBadge openNow={venue.openNow} />
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-[#00F5D4]/85 transition-colors hover:text-[#00F5D4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/50"
                >
                  Open in Google Maps
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={14}
                    height={14}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M7 17 17 7" />
                    <path d="M7 7h10v10" />
                  </svg>
                </a>
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4">
              {hasSignal ? (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Capacity</span>
                      <span className="text-sm font-black text-white">{busynessPercent}% capacity</span>
                    </div>
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-zinc-800"
                      role="meter"
                      aria-label={`${label} busyness`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={busynessPercent}
                      aria-valuetext={`${busynessPercent}% capacity`}
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-zinc-500 via-orange-400 to-red-500 transition-all duration-500"
                        style={{ width: `${busynessPercent}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                      {malePercent == null || femalePercent == null ? (
                        <div className="h-full w-full bg-white/15" />
                      ) : (
                        <div className="flex h-full w-full">
                          <div className="h-full bg-blue-400" style={{ width: `${malePercent}%` }} />
                          <div className="h-full bg-pink-400" style={{ width: `${femalePercent}%` }} />
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-white/55">
                      {malePercent == null || femalePercent == null
                        ? "M/F split needs 3+ check-ins"
                        : `👨 ${malePercent}% · 👩 ${femalePercent}%`}
                    </p>
                  </div>

                  <p className="text-xs text-white/40">
                    {signal?.sampleSize ?? 0} check-ins · updated {timeAgo(updatedAt)}
                  </p>
                </div>
              ) : (
                <p className="py-6 text-center text-sm font-semibold text-white/40">
                  No check-ins yet — be the first!
                </p>
              )}
            </section>

            <section className="overflow-hidden divide-y divide-white/[0.06] rounded-2xl border border-white/[0.06] bg-white/[0.04]">
              {venue.phone && (
                <a
                  href={`tel:${venue.phone}`}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-white/70 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                >
                  <span className="text-white/30" aria-hidden>📞</span>
                  <span>{venue.phone}</span>
                </a>
              )}
              {venue.website && (
                <a
                  href={venue.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 text-sm text-white/70 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/50"
                >
                  <span className="text-white/30" aria-hidden>🌐</span>
                  <span>Website</span>
                </a>
              )}
              <div className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="pt-0.5 text-white/30" aria-hidden>🕐</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[#00F5D4]">
                      Today · {hoursSummary.todayHours}
                    </p>
                    {hoursSummary.hasHours && hoursSummary.restOfWeek.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setHoursExpanded((expanded) => !expanded)}
                          className="mt-2 flex w-full items-center justify-between text-left text-xs font-semibold text-white/45 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/50"
                          aria-expanded={hoursExpanded}
                        >
                          <span>{hoursExpanded ? "Hide hours" : "See all hours"}</span>
                          <span
                            className={`text-white/30 transition-transform ${hoursExpanded ? "rotate-180" : ""}`}
                            aria-hidden
                          >
                            ⌄
                          </span>
                        </button>
                        {hoursExpanded && (
                          <ul className="mt-2 space-y-1">
                            {hoursSummary.restOfWeek.map((hour, index) => (
                              <li key={`${hour}-${index}`} className="text-xs text-white/50">
                                {hour.replace(/\s+-\s+/, " – ")}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
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
          </div>
        </>
      )}

      <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-2">
        <div className="mx-auto max-w-lg">
          <Link
            href={reportUrl}
            className="flex min-h-[54px] w-full items-center justify-center rounded-full bg-[#00F5D4] text-base font-black text-[#0A0A0F] shadow-[0_0_30px_rgba(0,245,212,0.4)] transition-all hover:bg-[#22FFE1] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60"
          >
            ＋ Report Vibe
          </Link>
        </div>
      </div>
    </div>
  );
}
