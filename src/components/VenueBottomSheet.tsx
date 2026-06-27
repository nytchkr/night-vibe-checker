"use client";

import Link from "next/link";
import { Clock3, MapPin, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { MIN_SAMPLE_SIZE_FOR_RATIO, getMFRatioPercents } from "@/components/MFRatioBar";
import { OpenNowBadge } from "@/components/OpenNowBadge";
import { SaveButton } from "@/components/SaveButton";
import { ShareButton } from "@/components/ShareButton";
import { StarRating } from "@/components/StarRating";
import { VenuePhoto } from "@/components/VenuePhoto";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useHaptic } from "@/hooks/useHaptic";
import { getNeighborhood } from "@/lib/neighborhood";
import type { BusynessSource, ConsumerVenue } from "@/types";

type VenueBottomSheetProps = {
  loading?: boolean;
  venue: ConsumerVenue | null;
  onClose: () => void;
};

type VenueSheetSnap = "peek" | "full";

const PEEK_RATIO = 0.5;
const FULL_RATIO = 0.9;
const FAST_CLOSE_VELOCITY = 0.85;
const FAST_CLOSE_DISTANCE = 56;

const SNAP_HEIGHTS: Record<VenueSheetSnap, string> = {
  peek: "50dvh",
  full: "90dvh",
};

function getSnapHeightPx(snap: VenueSheetSnap) {
  if (typeof window === "undefined") return snap === "peek" ? 360 : 720;
  if (snap === "peek") return window.innerHeight * PEEK_RATIO;
  return window.innerHeight * FULL_RATIO;
}

function getNearestSnap(height: number): VenueSheetSnap {
  const snaps: VenueSheetSnap[] = ["peek", "full"];
  return snaps.reduce((nearest, candidate) => {
    const nearestDistance = Math.abs(height - getSnapHeightPx(nearest));
    const candidateDistance = Math.abs(height - getSnapHeightPx(candidate));
    return candidateDistance < nearestDistance ? candidate : nearest;
  }, "peek");
}

function formatCategory(category: string) {
  const normalized = category.toLowerCase();
  if (normalized.includes("club") || normalized.includes("night_club")) return "Club";
  if (normalized.includes("lounge")) return "Lounge";
  if (normalized.includes("restaurant") || normalized.includes("food")) return "Restaurant";
  return "Bar";
}

function formatBusyness(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return { label: "No data", color: "#666666" };
  }

  if (value < 35) return { label: "Quiet", color: "#00F5D4" };
  if (value <= 65) return { label: "Moderate", color: "#FFD166" };
  return { label: "Packed", color: "#F0568C" };
}

function BusynessBar({ color, label, value }: { color: string; label: string; value: number | null | undefined }) {
  const width = value == null || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div className="mt-3" aria-label={`Busyness: ${label}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-black uppercase text-white/45">Busyness</span>
        <span className="text-xs font-black" style={{ color }}>
          {label}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="venue-fill-motion h-full rounded-full"
          style={{ width: `${width}%`, backgroundColor: color, boxShadow: `0 0 18px ${color}66` }}
        />
      </div>
    </div>
  );
}

function formatPriceLevel(priceLevel: ConsumerVenue["priceLevel"]) {
  if (!priceLevel) return null;
  return "$".repeat(priceLevel);
}

function getGoogleRatingData(venue: ConsumerVenue): { rating: number; count: number } | null {
  const rating = venue.googleRating ?? venue.rating;
  const count = venue.userRatingCount ?? venue.totalRatings;
  if (rating == null || count == null || !Number.isFinite(rating) || !Number.isFinite(count)) return null;
  return { rating, count };
}

function getOpenStatus(venue: ConsumerVenue) {
  if (venue.openNow === true) {
    return {
      label: "Open now",
      detail: getTodayHours(venue.openingHours),
      dotClass: "bg-[#22C55E] shadow-[0_0_10px_rgba(34,197,94,0.75)]",
      toneClass: "border-[#22C55E]/35 bg-[#22C55E]/12 text-[#86EFAC]",
    };
  }

  if (venue.openNow === false) {
    return {
      label: "Closed now",
      detail: getTodayHours(venue.openingHours),
      dotClass: "bg-[#F0568C] shadow-[0_0_10px_rgba(240,86,140,0.55)]",
      toneClass: "border-[#F0568C]/35 bg-[#F0568C]/12 text-[#FDA4C4]",
    };
  }

  return {
    label: "Hours unknown",
    detail: getTodayHours(venue.openingHours),
    dotClass: "bg-white/30",
    toneClass: "border-white/[0.08] bg-white/[0.05] text-white/58",
  };
}

function getTodayHours(openingHours: string[] | undefined) {
  if (!openingHours?.length) return null;

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(new Date());
  return openingHours.find((line) => line.toLowerCase().startsWith(`${weekday.toLowerCase()}:`)) ?? openingHours[0];
}

function SourceChip({ source }: { source: BusynessSource | null | undefined }) {
  if (source !== "live" && source !== "crowd" && source !== "forecast") return null;

  const isLive = source === "live";
  const label = source === "forecast" ? "FORECAST" : source === "crowd" ? "CROWD" : "LIVE";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/55">
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${isLive ? "bg-[#22C55E] shadow-[0_0_10px_rgba(34,197,94,0.75)]" : "bg-[#646B79]"}`}
      />
      {label}
    </span>
  );
}

function MiniMFRatio({ venue }: { venue: ConsumerVenue }) {
  const sampleSize = venue.signal?.sampleSize ?? 0;
  const percents = sampleSize >= MIN_SAMPLE_SIZE_FOR_RATIO ? getMFRatioPercents(venue.signal?.mfRatio) : null;

  if (!percents) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-2" role="img" aria-label={`${percents.male}% male, ${percents.female}% female`}>
      <div className="flex h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <span className="venue-fill-motion h-full bg-[#8B6CFF]" style={{ width: `${percents.male}%` }} />
        <span className="venue-fill-motion h-full bg-[#F0568C]" style={{ width: `${percents.female}%` }} />
      </div>
      <span className="truncate text-[12px] font-semibold text-white/58">
        {percents.male}% M · {percents.female}% F
      </span>
    </div>
  );
}

function VenueBottomSheetSkeleton({
  onClose,
  sheetRef,
}: {
  onClose: () => void;
  sheetRef: RefObject<HTMLElement>;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Close venue details"
        className="fixed inset-0 z-[1190] cursor-default bg-transparent"
        onClick={onClose}
      />

      <aside
        ref={sheetRef}
        className="bottom-sheet gpu-layer fixed bottom-0 left-0 right-0 z-[1200] h-24 translate-y-0 overflow-hidden rounded-t-[18px] border-t border-white/[0.08] bg-[#0A0A0E] shadow-[0_-20px_60px_rgba(0,0,0,0.5)] transition-transform duration-200 ease-out"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Loading venue details"
        tabIndex={-1}
      >
        <div role="status" className="sr-only">Loading venue details</div>
        <div className="mx-auto w-full max-w-lg px-4 pb-4 pt-4">
          <div className="mx-auto h-1 w-10 rounded-full bg-[#646B79]" aria-hidden="true" />
          <div className="mt-3 space-y-2">
            <div className="h-5 w-44 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-4 w-64 animate-pulse rounded bg-white/[0.06]" />
          </div>
        </div>
      </aside>
    </>
  );
}

export function VenueBottomSheet({ loading = false, venue, onClose }: VenueBottomSheetProps) {
  const haptic = useHaptic();
  const sheetRef = useRef<HTMLElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef({ pointerId: -1, startY: 0, currentY: 0, startHeight: 360, currentHeight: 360, startedAt: 0 });
  const [snap, setSnap] = useState<VenueSheetSnap>("peek");
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!venue && !loading) return;

    setSnap("peek");
    setDragHeight(null);
    const frameId = requestAnimationFrame(() => setIsVisible(true));
    return () => {
      cancelAnimationFrame(frameId);
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, [loading, venue]);

  function handleClose() {
    setIsVisible(false);
    closeTimeoutRef.current = setTimeout(onClose, 200);
  }

  function handleCloseTap() {
    haptic.light();
    handleClose();
  }

  useFocusTrap(Boolean(loading || venue), sheetRef, handleClose);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startHeight = dragHeight ?? getSnapHeightPx(snap);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      currentY: event.clientY,
      startHeight,
      currentHeight: startHeight,
      startedAt: performance.now(),
    };
    setDragHeight(startHeight);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current.pointerId !== event.pointerId) return;
    const maxHeight = getSnapHeightPx("full");
    const minHeight = 96;
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, dragRef.current.startHeight + dragRef.current.startY - event.clientY));
    dragRef.current.currentY = event.clientY;
    dragRef.current.currentHeight = nextHeight;
    setDragHeight(nextHeight);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current.currentY = event.clientY;
    const downwardDrag = dragRef.current.currentY - dragRef.current.startY;
    const elapsed = Math.max(1, performance.now() - dragRef.current.startedAt);
    const velocity = downwardDrag / elapsed;
    const shouldClose =
      downwardDrag > FAST_CLOSE_DISTANCE &&
      (velocity >= FAST_CLOSE_VELOCITY || dragRef.current.currentHeight <= getSnapHeightPx("peek") - 72);

    if (shouldClose) {
      dragRef.current.pointerId = -1;
      setDragHeight(null);
      handleClose();
      return;
    }
    const nearestSnap = getNearestSnap(dragRef.current.currentHeight);
    dragRef.current.pointerId = -1;
    setDragHeight(null);
    setSnap(nearestSnap);
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current.pointerId = -1;
    setDragHeight(null);
  }

  if (loading) return <VenueBottomSheetSkeleton onClose={handleCloseTap} sheetRef={sheetRef} />;
  if (!venue) return null;

  const signal = venue.signal;
  const busyness = formatBusyness(signal?.busyness0To100);
  const category = formatCategory(venue.category);
  const isPeek = snap === "peek";
  const googleRatingData = getGoogleRatingData(venue);
  const priceLevel = formatPriceLevel(venue.priceLevel);
  const photoUrl = venue.photoUrl ?? venue.photoUrls?.[0] ?? null;
  const openStatus = getOpenStatus(venue);
  const neighborhood = getNeighborhood(venue.lat, venue.lng);

  return (
    <>
      {isPeek ? (
        <button
          type="button"
          aria-label="Close venue details"
          className="fixed inset-0 z-[1190] cursor-default bg-transparent"
          onClick={handleCloseTap}
        />
      ) : (
        <div className="fixed inset-0 z-[1190] bg-black/40" aria-hidden="true" />
      )}

      <aside
        ref={sheetRef}
        className="bottom-sheet gpu-layer fixed bottom-0 left-0 right-0 z-[1200] overflow-hidden overscroll-contain rounded-t-[18px] border-t border-white/[0.08] bg-[#0A0A0E] shadow-[0_-24px_70px_rgba(0,0,0,0.62)]"
        style={{
          height: dragHeight == null ? SNAP_HEIGHTS[snap] : `${dragHeight}px`,
          maxHeight: "90dvh",
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
          transform: isVisible ? "translateY(0)" : "translateY(100%)",
          transition: dragHeight == null ? "height 220ms cubic-bezier(0.22, 1, 0.36, 1), transform 200ms ease-out" : "none",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`${venue.name} details`}
        tabIndex={-1}
      >
        <div className="mx-auto flex h-full w-full max-w-lg flex-col px-4 pb-2 pt-4">
          <div
            className="absolute left-1/2 top-1.5 flex h-8 w-28 -translate-x-1/2 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
            onPointerCancel={handlePointerCancel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            aria-label="Drag venue details"
          >
            <div className="h-1.5 w-12 rounded-full bg-white/45" />
          </div>

          <div className="scroll-touch mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [will-change:scroll-position] [&::-webkit-scrollbar]:hidden">
            <VenuePhoto
              name={venue.name}
              photoUrl={photoUrl}
              alt=""
              className={`${isPeek ? "mb-3 h-[min(24dvh,12rem)]" : "mb-4 h-40"} w-full rounded-[14px] border border-white/[0.08]`}
              sizes="(max-width: 640px) calc(100vw - 2rem), 512px"
            />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 pr-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="font-display truncate text-[19px] font-semibold leading-tight text-[#F4F5F8]">{venue.name}</h2>
                  {priceLevel && (
                    <span className="shrink-0 text-xs font-semibold text-white/55" aria-label={`Price level ${venue.priceLevel} of 4`}>
                      {priceLevel}
                    </span>
                  )}
                  <OpenNowBadge openNow={venue.openNow ?? null} />
                </div>
                <p className="mt-1 truncate text-xs font-semibold text-white/45">{neighborhood}</p>
                <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2">
                  {!isPeek && (
                    <span className="rounded-full bg-[#5C6573]/35 px-2.5 py-1 text-[11px] font-semibold text-white/66">
                      {category}
                    </span>
                  )}
                  <SourceChip source={signal?.busynessSource} />
                </div>
              </div>

              {!isPeek && (
                <button
                  type="button"
                  aria-label="Close venue details"
                  onClick={handleCloseTap}
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/75 transition hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </div>

            <BusynessBar color={busyness.color} label={busyness.label} value={signal?.busyness0To100} />

            {!isPeek && (
              <div className="mt-5 space-y-4 pb-4">
                <div className="flex items-center justify-between gap-3">
                  <MiniMFRatio venue={venue} />
                  <div className="flex shrink-0 items-center gap-2">
                    <SaveButton
                      placeId={venue.placeId}
                      className="h-11 w-11 text-white/75 hover:text-[#8B6CFF] focus-visible:ring-[#8B6CFF]/70"
                    />
                    <ShareButton
                      venueId={venue.id}
                      venueName={venue.name}
                      className="h-11 w-11 text-white/75 hover:text-white focus-visible:ring-[#8B6CFF]/70"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[13px] font-semibold text-white/62">
                  {googleRatingData && <StarRating {...googleRatingData} />}
                  {priceLevel && <span>{priceLevel}</span>}
                  {!googleRatingData && !priceLevel && <span>Venue details pending</span>}
                </div>

                <p className="flex min-w-0 items-center gap-2 truncate text-[13px] font-medium text-white/55">
                  <MapPin className="h-4 w-4 shrink-0 text-white/55" aria-hidden="true" />
                  <span className="truncate">{venue.address}</span>
                </p>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-[#F4F5F8]">
                    <Clock3 className="h-4 w-4 shrink-0 text-white/55" aria-hidden="true" />
                    <span>{openStatus.label}</span>
                  </div>
                  <p className="mt-1 truncate text-xs font-semibold text-[#9CA2AE]">
                    {openStatus.detail ?? "Hours unknown"}
                  </p>
                </div>

                <Link
                  href={`/venues/${encodeURIComponent(venue.id)}`}
                  className="flex min-h-[54px] w-full items-center justify-center rounded-2xl bg-[#8B6CFF] px-5 text-base font-black text-[#0A0A0E] shadow-[0_0_24px_rgba(139,108,255,0.28)] transition-colors hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                >
                  View Venue
                </Link>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export default VenueBottomSheet;
