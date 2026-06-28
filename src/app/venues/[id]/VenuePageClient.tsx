"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import { ArrowLeft, ChevronDown, Clock, Globe, MapPin, Phone } from "lucide-react";
import { BusynessForecast } from "@/components/BusynessForecast";
import { BusynessMeter } from "@/components/BusynessMeter";
import { CategoryBadge, PriceLevelDisplay } from "@/components/CategoryBadge";
import { OpenNowBadge } from "@/components/OpenNowBadge";
import { SaveButton } from "@/components/SaveButton";
import { ShareButton } from "@/components/ShareButton";
import { SkeletonVenueDetail } from "@/components/SkeletonVenueDetail";
import { StarRating } from "@/components/StarRating";
import { Toast } from "@/components/Toast";
import { VenuePhoto } from "@/components/VenuePhoto";
import { getNeighborhood } from "@/lib/neighborhood";
import { summarizeVenueHours } from "@/lib/venueHours";
import { useHaptic } from "@/hooks/useHaptic";
import type { BusynessSource, ConsumerVenue } from "@/types";

const VenueTips = dynamic(() => import("@/components/VenueTips").then((mod) => mod.VenueTips), {
  ssr: false,
  loading: () => <div className="h-28 rounded-2xl border border-white/[0.06] bg-white/[0.04]" aria-hidden="true" />,
});

function clampPercent(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function getBusynessColor(percent: number): string {
  if (percent >= 67) return "#FF5B6A";
  if (percent >= 50) return "#FFB020";
  return "#00F5D4";
}

function getDecisionLabel({
  openNow,
  busyness,
}: {
  openNow: boolean | null | undefined;
  busyness: number | null | undefined;
}): "PACKED" | "MODERATE" | "QUIET" | "CLOSED" | "NO READ" {
  if (openNow === false) return "CLOSED";
  if (busyness == null || !Number.isFinite(busyness)) return "NO READ";
  if (busyness >= 67) return "PACKED";
  if (busyness >= 50) return "MODERATE";
  return "QUIET";
}

function getSourceChip(source: BusynessSource | null | undefined): "LIVE" | "FORECAST" {
  return source === "forecast" ? "FORECAST" : "LIVE";
}

function getGoogleRatingData(venue: ConsumerVenue | null | undefined): { rating: number; count: number } | null {
  if (!venue) return null;
  const rating = venue.googleRating ?? venue.rating;
  const count = venue.totalRatings;
  if (rating == null || count == null || !Number.isFinite(rating) || !Number.isFinite(count)) return null;
  return { rating, count };
}

function getMapsHref(venue: ConsumerVenue): string {
  if (venue.googleMapsUri?.includes("google.com/maps")) return venue.googleMapsUri;
  const query = venue.address || `${venue.lat},${venue.lng}`;
  if (typeof navigator !== "undefined" && /iPad|iPhone|Macintosh/.test(navigator.userAgent)) {
    return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function trackAnalytics(event: string, properties: Record<string, string | number | boolean | null>) {
  try {
    track(event, properties);
  } catch {
    // Analytics must never block venue detail rendering.
  }
}

function FactRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#8B6CFF]" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-black uppercase text-white/35">{label}</p>
        <div className="mt-1 text-sm font-semibold leading-6 text-white/78">{children}</div>
      </div>
    </div>
  );
}

export function VenuePageClient({
  venueId,
  initialVenue,
}: {
  venueId: string;
  initialVenue: ConsumerVenue | null;
  initialLiveCheckInCount?: number;
}) {
  const router = useRouter();
  const haptic = useHaptic();
  const trackedVenueView = useRef(false);
  const [venue, setVenue] = useState<ConsumerVenue | null | undefined>(initialVenue ?? undefined);
  const [loading, setLoading] = useState(!initialVenue);
  const [error, setError] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (trackedVenueView.current || !venueId || !venue?.name) return;
    trackedVenueView.current = true;
    trackAnalytics("venue_viewed", {
      venue_id: venueId,
      venue_name: venue.name,
      category: venue.category,
    });
  }, [venue?.category, venue?.name, venueId]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 120);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [initialVenue, venueId]);

  const signal = venue?.signal;
  const busyness = signal?.busyness0To100 ?? null;
  const busynessPercent = clampPercent(busyness);
  const hasBusynessRead = busyness != null;
  const busynessSource = signal?.busynessSource ?? null;
  const sourceChip = getSourceChip(busynessSource);
  const decisionLabel = getDecisionLabel({ openNow: venue?.openNow, busyness });
  const decisionColor = decisionLabel === "CLOSED" || decisionLabel === "NO READ" ? "#9CA2AE" : getBusynessColor(busynessPercent);
  const googleRatingData = getGoogleRatingData(venue);
  const neighborhood = venue ? getNeighborhood(venue.lat, venue.lng) : "Charlotte";
  const hoursSummary = useMemo(() => summarizeVenueHours(venue?.openingHours), [venue?.openingHours]);
  const mapsHref = useMemo(() => (venue ? getMapsHref(venue) : "#"), [venue]);
  const phoneHref = venue?.phoneNumber || venue?.phone ? `tel:${(venue.phoneNumber ?? venue.phone ?? "").replace(/[^\d+]/g, "")}` : null;
  const phoneDisplay = venue?.phoneNumber ?? venue?.phone ?? null;
  const websiteHref = venue?.website ?? null;
  const statusText = venue?.openNow === false
    ? "Closed now"
    : venue?.openNow === true
      ? "Open now"
      : hoursSummary.hasHours
        ? hoursSummary.todayStatus
        : "Hours not available";
  const openAndUncrowded = venue?.openNow !== false && hasBusynessRead && busynessPercent < 50;
  const hoursPanelId = "venue-hours-list";

  function goBackToMap() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/map");
  }

  function handleVenueSavedChange(saved: boolean) {
    setToast(saved ? "Saved!" : "Removed");
    if (saved) {
      haptic.success();
    } else {
      haptic.light();
    }
  }

  return (
    <div className="min-h-screen-safe bg-[#0A0A0E] pb-24">
      {toast && (
        <Toast
          message={toast}
          durationMs={2500}
          onDone={() => setToast(null)}
          className="bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] rounded-[14px] border-white/[0.08] bg-[#0A0A0E] px-5 py-3 font-semibold text-[#F4F5F8] shadow-2xl shadow-black/30"
        />
      )}

      {(loading || venue === undefined) && <SkeletonVenueDetail />}

      {!loading && error && (
        <div className="mx-auto max-w-lg px-4 py-6 pb-36">
          <div
            role="alert"
            className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-5 text-center"
          >
            <p className="font-medium text-[#F4F5F8]">Could not load venue</p>
            <p className="mt-1 text-sm text-[#9CA2AE]">{error}</p>
            <Link
              href="/explore"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              Back to Explore
            </Link>
          </div>
        </div>
      )}

      {!loading && !error && venue === null && (
        <main className="mx-auto flex min-h-screen-safe max-w-lg flex-col items-center justify-center px-5 pb-36 text-center">
          <p className="font-display text-7xl font-black text-[#8B6CFF]">404</p>
          <h1 className="mt-5 font-display text-2xl font-black text-white">This spot doesn't exist</h1>
          <p className="mt-3 max-w-sm text-sm font-medium leading-6 text-white/55">
            It may have been removed from the launch-zone list, or the link may be stale.
          </p>
          <Link
            href="/explore"
            className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[#8B6CFF] px-6 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
          >
            Back to Explore
          </Link>
        </main>
      )}

      {!loading && !error && venue && (
        <>
          {scrolled && (
            <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.08] bg-[#0A0A0E]/90 px-4 backdrop-blur-md transition-all duration-200">
              <button
                type="button"
                onClick={goBackToMap}
                aria-label="Go back"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/70"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="flex-1 truncate text-[15px] font-medium text-white">{venue.name}</span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-black text-white/55">
                nytchkr
              </span>
            </div>
          )}

          <section className="w-full bg-[#0A0A0E]" role="region" aria-label="Venue hero">
            <div className="relative min-h-[390px] w-full overflow-hidden sm:min-h-[480px]">
              <VenuePhoto
                name={venue.name}
                photoUrl={venue.photoUrl}
                photoUrls={venue.photoUrls}
                alt={`${venue.name} venue photo`}
                className="absolute inset-0 h-full w-full"
                imageClassName="scale-[1.01]"
                sizes="100vw"
                priority={true}
                fetchPriority="high"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.42),rgba(10,10,14,0.22)_40%,#0A0A0E_100%)]" aria-hidden="true" />
              <button
                type="button"
                onClick={goBackToMap}
                aria-label="Go back"
                className="absolute left-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <SaveButton
                placeId={venue.id}
                ariaLabel="Save venue"
                onSavedChange={handleVenueSavedChange}
                className="absolute right-4 top-4 h-11 w-11 bg-black/40 text-white/80 shadow-lg backdrop-blur hover:bg-black/55"
              />
              <div className="absolute inset-x-0 bottom-0 mx-auto max-w-lg px-4 pb-7">
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category={venue.category} />
                  <PriceLevelDisplay
                    priceLevel={venue.priceLevel}
                    className="rounded-full border border-white/15 bg-black/35 px-3 py-1 text-xs text-white/65 backdrop-blur"
                  />
                  <span className="rounded-full border border-white/15 bg-black/35 px-3 py-1 text-xs font-black text-white/65 backdrop-blur">
                    {neighborhood}
                  </span>
                </div>
                <h1 className="mt-4 font-display max-w-[24rem] text-4xl font-black leading-[1.02] text-white drop-shadow-lg sm:text-5xl">
                  {venue.name}
                </h1>
                {venue.address && (
                  <p className="mt-3 max-w-[24rem] text-sm font-medium leading-relaxed text-white/68">{venue.address}</p>
                )}
              </div>
            </div>
          </section>

          <main className="mx-auto max-w-lg space-y-6 px-4 pb-8 pt-2">
            <section className="rounded-[22px] border border-white/[0.08] bg-white/[0.045] p-4 shadow-2xl shadow-black/20" aria-label="Decision block">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-white/35">Busyness right now</p>
                  <div
                    className="mt-3 inline-flex rounded-2xl border px-4 py-3 text-3xl font-black leading-none shadow-[0_0_24px_rgba(139,108,255,0.12)]"
                    style={{
                      borderColor: `${decisionColor}66`,
                      color: decisionColor,
                      backgroundColor: `${decisionColor}1A`,
                    }}
                  >
                    {decisionLabel}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-white/12 bg-[#0A0A0E]/75 px-3 py-1.5 text-xs font-black text-white/72">
                  {sourceChip}
                </span>
              </div>

              <div className="mt-5">
                <BusynessMeter
                  value={busyness}
                  source={busynessSource}
                  sampleSize={signal?.sampleSize ?? 0}
                  computedAt={signal?.computedAt ?? null}
                />
              </div>

              {openAndUncrowded ? (
                <p className="mt-4 rounded-2xl border border-[#00F5D4]/25 bg-[#00F5D4]/10 px-4 py-3 text-sm font-black text-[#00F5D4]">
                  Not too crowded right now
                </p>
              ) : null}

              {!hasBusynessRead ? (
                <p className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm font-semibold text-white/45">
                  Live busyness is not available for this venue yet.
                </p>
              ) : null}
            </section>

            <BusynessForecast venueId={venue.id} />

            <section className="space-y-3" aria-label="Venue facts">
              <div className="flex items-end justify-between gap-3">
                <h2 className="font-display text-xl font-black text-white">The facts</h2>
                <span className="text-xs font-semibold text-white/35">Google venue data</span>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04]">
                <button
                  type="button"
                  onClick={() => setHoursExpanded((expanded) => !expanded)}
                  className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-white/[0.035] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                  aria-expanded={hoursExpanded}
                  aria-controls={hoursPanelId}
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-black text-white">
                      <Clock className="h-4 w-4 text-[#8B6CFF]" aria-hidden="true" />
                      <OpenNowBadge openNow={venue.openNow ?? null} />
                      {statusText}
                    </span>
                    <span className="mt-1 block truncate text-sm font-semibold text-white/45">
                      {hoursSummary.hasHours ? hoursSummary.todayStatus : "Today's hours unavailable"}
                    </span>
                  </span>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-white/45 transition-transform ${hoursExpanded ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {hoursExpanded ? (
                  hoursSummary.hasHours ? (
                    <ul id={hoursPanelId} className="space-y-2 border-t border-white/[0.06] p-4">
                      {hoursSummary.weekHours.map((hour, index) => {
                        const isToday = hour.day === hoursSummary.today;
                        return (
                          <li
                            key={`${hour.day}-${index}`}
                            className={`grid grid-cols-[6.5rem_1fr] gap-3 text-[13px] ${
                              isToday ? "text-[#8B6CFF]" : hour.closed || !hour.available ? "text-white/35" : "text-white/55"
                            }`}
                          >
                            <span className="font-bold">{hour.day}</span>
                            <span>{hour.hours}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p id={hoursPanelId} className="border-t border-white/[0.06] p-4 text-[13px] font-medium text-white/45">
                      Hours not available
                    </p>
                  )
                ) : null}
              </div>

              {venue.address ? (
                <a href={mapsHref} target="_blank" rel="noreferrer" className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70">
                  <FactRow icon={MapPin} label="Address">
                    <span className="underline decoration-white/20 underline-offset-4">{venue.address}</span>
                  </FactRow>
                </a>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4">
                  <p className="text-xs font-black uppercase text-white/35">Price</p>
                  <div className="mt-2 text-lg font-black text-white">
                    {venue.priceLevel ? "$".repeat(venue.priceLevel) : <span className="text-sm text-white/42">Not listed</span>}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4">
                  <p className="text-xs font-black uppercase text-white/35">Google rating</p>
                  <div className="mt-2 min-h-6">
                    {googleRatingData ? (
                      <StarRating {...googleRatingData} />
                    ) : (
                      <span className="text-sm font-semibold text-white/42">Not listed</span>
                    )}
                  </div>
                </div>
              </div>

              {phoneHref && phoneDisplay ? (
                <a href={phoneHref} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70">
                  <FactRow icon={Phone} label="Phone">
                    <span className="underline decoration-white/20 underline-offset-4">{phoneDisplay}</span>
                  </FactRow>
                </a>
              ) : null}

              {websiteHref ? (
                <a href={websiteHref} target="_blank" rel="noreferrer" className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70">
                  <FactRow icon={Globe} label="Website">
                    <span className="underline decoration-white/20 underline-offset-4">Open website</span>
                  </FactRow>
                </a>
              ) : null}
            </section>

            <section className="space-y-3" aria-label="What locals say">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#8B6CFF]">AI insider tips</p>
              </div>
              <VenueTips
                venueId={venue.id}
                title="What locals say"
                subtitle="AI-organized tips from real review text."
                maxTips={3}
              />
            </section>

            <section className="space-y-3 rounded-[22px] border border-white/[0.08] bg-white/[0.04] p-4" aria-label="Save and share">
              <h2 className="font-display text-xl font-black text-white">Save + share</h2>
              <SaveButton
                placeId={venue.id}
                ariaLabel="Save venue"
                onSavedChange={handleVenueSavedChange}
                className="h-12 w-full rounded-2xl border-white/[0.12] bg-transparent text-white/82 hover:border-[#8B6CFF]/55 hover:bg-[#8B6CFF]/10 hover:text-white"
              >
                Save this place
              </SaveButton>
              <ShareButton
                venueId={venue.id}
                venueName={venue.name}
                className="h-12 w-full rounded-2xl border border-white/[0.12] bg-transparent px-4 text-sm font-black text-white/82 hover:border-[#8B6CFF]/55 hover:bg-[#8B6CFF]/10 hover:text-white"
              >
                Share
              </ShareButton>
            </section>
          </main>
        </>
      )}
    </div>
  );
}
