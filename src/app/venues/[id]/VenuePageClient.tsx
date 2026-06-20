"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareButton } from "@/components/ShareButton";
import { getBusynessState } from "@/lib/busyness";
import { VENUE_PHOTO_BLUR_DATA_URL } from "@/lib/imagePlaceholders";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useTrack } from "@/lib/useTrack";
import type { ConsumerVenue } from "@/types";

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

function CategoryChip({ category }: { category: string }) {
  return (
    <span className="inline-flex rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[11px] font-medium capitalize text-white/75 backdrop-blur">
      {category.replaceAll("_", " ")}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading venue">
      <Skeleton className="aspect-video w-full rounded-none bg-white/10" />
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

function formatRating(rating: number | undefined): string | null {
  if (rating == null || !Number.isFinite(rating)) return null;
  return `★ ${rating.toFixed(1)}`;
}

function formatPriceLevel(priceLevel: ConsumerVenue["priceLevel"]): string | null {
  if (!priceLevel || !Number.isFinite(priceLevel)) return null;
  return "$".repeat(priceLevel);
}

function formatOpenNow(openNow: boolean | undefined): string | null {
  if (openNow === undefined) return null;
  return openNow ? "● Open now" : "○ Closed";
}

function sourceLabel(signal: ConsumerVenue["signal"], fallbackUpdatedAt: string | null | undefined): string {
  if (!signal || signal.busyness0To100 == null) return "";
  if (signal.busynessSource === "forecast") return "via BestTime forecast";
  if (signal.busynessSource === "live") return "via BestTime live";
  const sampleSize = signal.sampleSize ?? 0;
  return `from ${sampleSize} check-ins · ${timeAgo(fallbackUpdatedAt)}`;
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
        const venueRes = initialVenue
          ? null
          : await fetch(`/api/venues/${encodeURIComponent(venueId)}`);
        if (venueRes && !venueRes.ok) throw new Error(`${venueRes.status}`);
        const venueJson = venueRes ? await venueRes.json() : null;
        if (cancelled) return;
        if (venueJson) setVenue(venueJson?.data?.venue ?? null);
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
  const hasBusynessRead = busyness != null;
  const updatedAt = signal?.lastBusynessRefresh ?? signal?.computedAt ?? null;
  const malePercent = signal?.mfRatio != null && signal.sampleSize >= 3 ? clampPercent(signal.mfRatio) : null;
  const femalePercent = malePercent == null ? null : 100 - malePercent;
  const signalSourceLabel = sourceLabel(signal ?? null, updatedAt);
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
  const statItems = useMemo(() => {
    if (!venue) return [];
    return [
      formatRating(venue.rating),
      formatPriceLevel(venue.priceLevel),
      formatOpenNow(venue.openNow),
      venue.address || null,
    ].filter((item): item is string => Boolean(item));
  }, [venue]);

  return (
    <div className="min-h-screen bg-[#0A0A0F] pb-28">
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
          <section className="relative aspect-video w-full overflow-hidden">
            {venue.photoUrl ? (
              <>
                <Image
                  src={venue.photoUrl}
                  alt={venue.name}
                  fill
                  sizes="100vw"
                  priority
                  placeholder="blur"
                  blurDataURL={VENUE_PHOTO_BLUR_DATA_URL}
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0F] via-[#0A0A0F]/40 to-transparent" />
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/[0.04]">
                <span className="text-7xl font-medium uppercase text-white/10">{venue.name.charAt(0)}</span>
              </div>
            )}

            <Link
              href="/map"
              aria-label="Back to map"
              className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/80 shadow-lg backdrop-blur transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={17}
                height={17}
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
            </Link>

            <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
              <div className="max-w-lg">
                <CategoryChip category={venue.category} />
                <h1 className="mt-2 max-w-[21rem] text-2xl font-medium leading-tight text-white">{venue.name}</h1>
              </div>
            </div>
          </section>

          <div className="border-b border-white/[0.06]">
            <div className="mx-auto max-w-lg overflow-x-auto px-4 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max items-center gap-2 text-[13px] text-white/60">
                {statItems.map((item, index) => (
                  <div key={`${item}-${index}`} className="flex items-center gap-2">
                    {index > 0 && <span className="text-white/25">·</span>}
                    <span className="whitespace-nowrap">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-lg space-y-6 px-4 py-5">
            <section className="space-y-4">
              <p className="text-[13px] font-medium uppercase tracking-wide text-white/40">Right now</p>
              {hasBusynessRead ? (
                <div className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-[13px] text-white/60">{label}</span>
                      <span className="text-[13px] text-white/60">{busynessPercent}%</span>
                    </div>
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-zinc-800"
                      role="meter"
                      aria-label={`${label} busyness`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={busynessPercent}
                      aria-valuetext={`${busynessPercent}% busy`}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${busynessPercent}%`, backgroundColor: busynessState.color }}
                      />
                    </div>
                  </div>

                  <div>
                    <p className="text-[13px] text-white/60">
                      {malePercent == null || femalePercent == null
                        ? "No M/F read yet"
                        : `👨 ${malePercent}% · 👩 ${femalePercent}%`}
                    </p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full w-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500 ${
                          malePercent == null || femalePercent == null ? "opacity-35" : ""
                        }`}
                      />
                    </div>
                  </div>

                  {signalSourceLabel && (
                    <p className="text-[11px] text-white/30">
                      {signalSourceLabel}
                    </p>
                  )}
                </div>
              ) : (
                <p className="py-4 text-[15px] text-white/45">
                  No reads yet — be the first
                </p>
              )}
            </section>

            <section className="space-y-3 border-t border-white/[0.06] pt-5">
              <p className="text-[15px] font-medium text-white">
                Today · {hoursSummary.todayHours}
              </p>
              {hoursSummary.hasHours && hoursSummary.restOfWeek.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setHoursExpanded((expanded) => !expanded)}
                    className="text-[13px] font-medium text-white/45 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/50"
                    aria-expanded={hoursExpanded}
                  >
                    {hoursExpanded ? "Hide hours" : "See all hours"}
                  </button>
                  {hoursExpanded && (
                    <ul className="space-y-1">
                      {hoursSummary.restOfWeek.map((hour, index) => (
                        <li key={`${hour}-${index}`} className="text-[13px] text-white/50">
                          {hour.replace(/\s+-\s+/, " – ")}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>

            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-[13px] font-medium text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/50"
            >
              Open in Google Maps
            </a>
          </div>
        </>
      )}

      {venue && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.08] bg-[#0A0A0F]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-xl">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            {authChecked && !accessToken ? (
              <Link
                href="/login"
                aria-label={`Sign in to save ${venue.name}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
              >
                <Heart size={19} aria-hidden="true" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={toggleSaved}
                disabled={!authChecked || savePending}
                aria-label={`${saved ? "Unsave" : "Save"} ${venue.name}`}
                aria-pressed={saved}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70 disabled:opacity-60 ${
                  saved ? "text-white" : "text-white/55 hover:text-white"
                }`}
              >
                <Heart size={19} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
              </button>
            )}

            <Link
              href={reportUrl}
              className="flex min-h-[50px] flex-1 items-center justify-center rounded-full bg-[#00F5D4] px-5 text-[15px] font-medium text-[#0A0A0F] shadow-[0_0_24px_rgba(0,245,212,0.28)] transition-all hover:bg-[#22FFE1] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60"
            >
              Report vibe +
            </Link>

            <ShareButton venue={venue} className="shrink-0" />
          </div>
        </div>
      )}
    </div>
  );
}
