"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentPropsWithoutRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import { ArrowLeft, Clock, ExternalLink, MapPin } from "lucide-react";
import { CategoryBadge, PriceLevelDisplay } from "@/components/CategoryBadge";
import { SaveVenueButton } from "@/components/SaveVenueButton";
import { SkeletonVenueDetail } from "@/components/SkeletonVenueDetail";
import { StarRating } from "@/components/StarRating";
import { Toast } from "@/components/Toast";
import { VenuePhoto } from "@/components/VenuePhoto";
import { summarizeVenueHours } from "@/lib/venueHours";
import { useHaptic } from "@/hooks/useHaptic";
import type { BusynessSource, ConsumerVenue } from "@/types";

const VenueTips = dynamic(() => import("@/components/VenueTips").then((mod) => mod.VenueTips), {
  ssr: false,
  loading: () => <div className="h-28 rounded-2xl border border-white/[0.08] bg-white/[0.035]" aria-hidden="true" />,
});

function clampPercent(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function getBusynessColor(percent: number): string {
  if (percent >= 67) return "#FF5B6A";
  if (percent >= 34) return "#FFB020";
  return "#5C6573";
}

function getBusynessLabel(percent: number): "Packed" | "Moderate" | "Dead" {
  if (percent >= 67) return "Packed";
  if (percent >= 34) return "Moderate";
  return "Dead";
}

function formatZoneLabel(zoneId: string | null | undefined): string {
  if (!zoneId) return "Charlotte";
  return zoneId
    .split("-")
    .filter((part) => part && part.toLowerCase() !== "charlotte")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCategoryLabel(category: string | null | undefined): string {
  const value = (category ?? "Venue").replace(/[_-]+/g, " ").trim();
  if (!value) return "Venue";
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

type BestTimeSourceChip = {
  label: "LIVE" | "FORECAST";
  className: string;
};

function getBestTimeSourceChip(source: BusynessSource | null | undefined): BestTimeSourceChip | null {
  if (source === "live") {
    return {
      label: "LIVE",
      className: "border-[#20E58F]/40 bg-[#20E58F]/12 text-[#20E58F]",
    };
  }
  if (source === "forecast") {
    return {
      label: "FORECAST",
      className: "border-[#8B6CFF]/40 bg-[#8B6CFF]/15 text-[#F4F5F8]",
    };
  }
  return null;
}

function getBestTimeEmptyCopy(source: BusynessSource | null | undefined): string {
  if (source === "crowd") {
    return "Crowd reports exist, but BestTime has not returned a live or forecast read for this venue yet.";
  }
  if (source === "unavailable") {
    return "BestTime marked this venue unavailable, so no live or forecast percentage is shown.";
  }
  return "We do not have a live or forecast BestTime read for this venue.";
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

function SurfaceCard({ children, className = "", ...props }: ComponentPropsWithoutRef<"section">) {
  return (
    <section {...props} className={`rounded-[22px] border border-white/[0.08] bg-white/[0.035] p-4 ${className}`}>
      {children}
    </section>
  );
}

export function VenuePageClient({
  venueId,
  initialVenue,
}: {
  venueId: string;
  initialVenue: ConsumerVenue | null;
}) {
  const router = useRouter();
  const haptic = useHaptic();
  const trackedVenueView = useRef(false);
  const [venue, setVenue] = useState<ConsumerVenue | null | undefined>(initialVenue ?? undefined);
  const [loading, setLoading] = useState(!initialVenue);
  const [error, setError] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
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
        const venueRes = initialVenue ? null : await fetch(`/api/venues/${encodeURIComponent(venueId)}`);
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
  const sourceChip = getBestTimeSourceChip(signal?.busynessSource ?? null);
  const hasBusynessRead = busyness != null && sourceChip !== null;
  const busynessColor = getBusynessColor(busynessPercent);
  const busynessLabel = getBusynessLabel(busynessPercent);
  const bestTimeEmptyCopy = getBestTimeEmptyCopy(signal?.busynessSource ?? null);
  const googleRatingData = getGoogleRatingData(venue);
  const hoursSummary = useMemo(() => summarizeVenueHours(venue?.openingHours), [venue?.openingHours]);
  const mapsHref = useMemo(() => (venue ? getMapsHref(venue) : "#"), [venue]);
  const statusText = venue?.openNow === false
    ? "Closed"
    : venue?.openNow === true
      ? "Open now"
      : hoursSummary.hasHours
        ? hoursSummary.todayStatus
        : "Hours not available";
  const todayHours = hoursSummary.hasHours ? hoursSummary.weekHours.find((hour) => hour.day === hoursSummary.today)?.hours : null;
  const hoursHeadline = hoursSummary.hasHours ? hoursSummary.todayStatus : statusText;
  const statusColor = hoursHeadline === "Closed" || venue?.openNow === false
    ? "text-[#FF5B6A]"
    : hoursHeadline.startsWith("Open") || hoursHeadline.startsWith("Opens")
      ? "text-[#20E58F]"
      : "text-[#9CA2AE]";
  const neighborhoodLabel = venue?.neighborhood || formatZoneLabel(venue?.zoneId);

  function goBackToMap() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/map");
  }

  function handleVenueSavedChange(_venueId: string, saved: boolean) {
    setToast(saved ? "Saved!" : "Removed");
    if (saved) {
      haptic.success();
    } else {
      haptic.light();
    }
  }

  return (
    <div className="min-h-screen-safe bg-[#0A0A0E] pb-24 font-sans text-[#F4F5F8]">
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
          <div role="alert" className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-5 text-center">
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
          <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.08] bg-[#0A0A0E]/80 px-4 backdrop-blur-xl transition-all duration-200">
            <button
              type="button"
              onClick={goBackToMap}
              aria-label="Go back"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] text-[#F4F5F8] transition-colors hover:border-[#8B6CFF]/45 hover:text-[#8B6CFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className={`flex-1 truncate font-display text-[15px] font-semibold text-[#F4F5F8] transition-opacity duration-200 ${scrolled ? "opacity-100" : "opacity-0"}`}>
              {venue.name}
            </span>
          </div>

          <section className="w-full bg-[#0A0A0E]" role="region" aria-label="Venue hero">
            <div className="relative aspect-[16/9] min-h-[360px] w-full overflow-hidden sm:min-h-[460px]">
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
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0A0A0E] via-[#0A0A0E]/60 to-transparent" aria-hidden="true" />
              <div className="absolute inset-x-0 bottom-0 px-4 pb-6 pt-28 sm:px-6 sm:pb-8">
                <div className="mx-auto max-w-lg" aria-label="Venue identity">
                  <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.12] px-3 py-1.5 text-xs font-semibold text-[#F4F5F8] shadow-lg shadow-black/20 backdrop-blur-xl">
                    {formatCategoryLabel(venue.category)}
                  </span>
                  <h1 className="mt-3 max-w-[14ch] font-display text-[42px] font-black leading-[0.98] tracking-normal text-[#F4F5F8] drop-shadow-2xl sm:max-w-[16ch] sm:text-6xl">
                    {venue.name}
                  </h1>
                </div>
              </div>
            </div>
          </section>

          <main className="mx-auto max-w-lg space-y-5 px-4 pb-8 pt-4">
            <section className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Venue quick facts">
              <div className="flex min-w-max items-center gap-2">
                <CategoryBadge category={venue.category} className="border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-[#F4F5F8]" />
                {venue.priceLevel ? (
                  <PriceLevelDisplay priceLevel={venue.priceLevel} className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-xs text-[#9CA2AE]" />
                ) : (
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-xs font-semibold text-[#9CA2AE]">
                    Price not listed
                  </span>
                )}
                <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-xs font-semibold text-[#9CA2AE]">
                  {googleRatingData ? <StarRating {...googleRatingData} className="text-xs" /> : "Rating not listed"}
                </span>
                <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-xs font-semibold text-[#9CA2AE]">
                  {neighborhoodLabel}
                </span>
              </div>
            </section>

            <div className="grid grid-cols-2 gap-3" aria-label="Venue actions">
              <SaveVenueButton
                venueId={venue.id}
                venueName={venue.name}
                apiPath="/api/favorites"
                label="Save"
                includeVenueNameInLabel={false}
                onSavedChange={handleVenueSavedChange}
                className="h-12 w-full border-[#8B6CFF] bg-[#8B6CFF] px-5 text-sm font-black text-[#0A0A0E] shadow-[0_0_28px_rgba(139,108,255,0.28)] hover:border-[#A896FF] hover:bg-[#A896FF]"
              />
              <a
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-5 text-sm font-black text-[#F4F5F8] transition-colors hover:border-[#8B6CFF]/45 hover:text-[#8B6CFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Directions
              </a>
            </div>

            <SurfaceCard aria-label="BestTime busyness meter" className="p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <p className="text-sm font-semibold text-[#9CA2AE]">BestTime busyness</p>
              {hasBusynessRead ? (
                <>
                  <p className="mt-2 font-display text-[48px] font-black leading-none tracking-normal" style={{ color: busynessColor }}>
                    {busynessPercent}%
                  </p>
                  <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/[0.08]" aria-hidden="true">
                    <div className="h-full rounded-full transition-[width]" style={{ width: `${busynessPercent}%`, backgroundColor: busynessColor }} />
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    {sourceChip ? (
                      <span
                        className={`rounded-full border px-3 py-1.5 text-xs font-black ${sourceChip.className}`}
                        aria-label={`Busyness source ${sourceChip.label.toLowerCase()}`}
                      >
                        {sourceChip.label}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-sm font-black" style={{ color: busynessColor }}>
                      {busynessLabel}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-3 font-display text-2xl font-black text-[#F4F5F8]">No busyness data yet</p>
                  <p className="mt-3 text-sm font-semibold leading-6 text-[#9CA2AE]">{bestTimeEmptyCopy}</p>
                </>
              )}
            </SurfaceCard>

            <a href={mapsHref} target="_blank" rel="noreferrer" className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70">
              <SurfaceCard className="flex gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#8B6CFF]" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#9CA2AE]">Address</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[#F4F5F8] underline decoration-white/20 underline-offset-4">
                    {venue.address || "Open in Maps"}
                  </p>
                </div>
              </SurfaceCard>
            </a>

            <SurfaceCard>
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#8B6CFF]" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#9CA2AE]">Hours</p>
                  <p className={`mt-1 font-display text-2xl font-black leading-tight ${statusColor}`}>{hoursHeadline}</p>
                  {statusText !== hoursHeadline ? <span className="sr-only">{statusText}</span> : null}
                  <p className="mt-2 text-sm font-semibold leading-6 text-[#9CA2AE]">
                    Today: <span className="text-[#F4F5F8]">{todayHours ?? "Hours unavailable"}</span>
                  </p>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard aria-label="Insider tips" className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="text-xl leading-none text-[#8B6CFF]" aria-hidden="true">✦</span>
                <h2 className="font-display text-xl font-black text-[#F4F5F8]">Insider tips</h2>
              </div>
              <VenueTips venueId={venue.id} title="" subtitle="Tips organized from real review text." maxTips={3} />
            </SurfaceCard>
          </main>
        </>
      )}
    </div>
  );
}
