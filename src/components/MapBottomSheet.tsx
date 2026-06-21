"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent } from "react";
import { Info } from "lucide-react";
import { BusynessBadge as SourceBadge } from "@/components/BusynessBadge";
import { getMFRatioPercents } from "@/components/MFRatioBar";
import { SaveVenueButton } from "@/components/SaveVenueButton";
import { SignalFreshnessLabel } from "@/components/SignalFreshnessLabel";
import { getBusynessState } from "@/lib/busyness";
import { useHaptic } from "@/hooks/useHaptic";
import type { ConsumerVenue } from "@/types";

export type MapSheetSnap = "collapsed" | "mid" | "expanded";
export type VenueCategoryFilter = "All" | "Bar" | "Club" | "Lounge" | "Rooftop" | "Live Music" | "Sports Bar";

const COLLAPSED_HEIGHT = 72;
const MID_RATIO = 0.4;
export const CATEGORY_FILTERS: VenueCategoryFilter[] = ["All", "Bar", "Club", "Lounge", "Rooftop", "Live Music", "Sports Bar"];

function getVisibleHeight(snap: MapSheetSnap) {
  if (typeof window === "undefined") return COLLAPSED_HEIGHT;
  if (snap === "collapsed") return COLLAPSED_HEIGHT;
  if (snap === "mid") return window.innerHeight * MID_RATIO;
  return window.innerHeight * 0.85;
}

function NoDataChip() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 text-[11.5px] font-semibold text-[#9CA2AE]">
      <Info className="h-3.5 w-3.5" aria-hidden="true" />
      No data
    </span>
  );
}

function OpenNowDot({ openNow }: { openNow: boolean | undefined }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white/55">
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${openNow ? "bg-white/55 shadow-[0_0_10px_rgba(255,255,255,0.35)]" : "bg-white/25"}`}
      />
      {openNow ? "Open now" : "Hours pending"}
    </span>
  );
}

function BusynessBadge({ venue }: { venue: ConsumerVenue }) {
  const value = venue.signal?.busyness0To100;
  if (value == null || !Number.isFinite(value)) {
    return (
      <span className="flex shrink-0 flex-col items-end gap-1">
        <NoDataChip />
      </span>
    );
  }

  const state = getBusynessState(value);
  const source = venue.signal?.busynessSource ?? null;
  const computedAt = venue.signal?.computedAt ?? null;
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <span
        className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-black text-white/55"
        style={state.level ? { borderColor: `${state.color}59`, backgroundColor: `${state.color}26`, color: state.color } : undefined}
      >
        {state.label}
      </span>
      <span className="flex max-w-[9rem] flex-wrap justify-end gap-1">
        <SourceBadge source={source} computedAt={computedAt} />
        <SignalFreshnessLabel signal={venue.signal} className="justify-end text-right" />
      </span>
    </span>
  );
}

function MfRatioChip({ venue }: { venue: ConsumerVenue }) {
  const signal = venue.signal;
  const sampleSize = signal?.sampleSize ?? 0;
  const percents = sampleSize >= 2 ? getMFRatioPercents(signal?.mfRatio) : null;

  if (!percents) return null;

  return (
    <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-1 text-[11px] font-black text-white/55">
      M/F {percents.male}/{percents.female}
    </span>
  );
}

function VenueRow({
  isSelected,
  onSelect,
  venue,
}: {
  isSelected: boolean;
  onSelect: () => void;
  venue: ConsumerVenue;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={onSelect}
        className={`block w-full rounded-2xl border px-4 py-3 pr-14 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
          isSelected
            ? "border-white/35 bg-white/[0.1] ring-1 ring-[#8B6CFF]/60"
            : "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07]"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black text-white">{venue.name}</h3>
            <p className="mt-1 truncate text-xs font-semibold text-white/55">{venue.category}</p>
          </div>
          <BusynessBadge venue={venue} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <OpenNowDot openNow={venue.openNow} />
          <div className="flex min-w-0 items-center justify-end gap-2">
            <MfRatioChip venue={venue} />
            <span className="truncate text-xs font-semibold text-white/55">{venue.address}</span>
          </div>
        </div>
      </button>
      <SaveVenueButton
        venueId={venue.id}
        venueName={venue.name}
        includeVenueNameInLabel={false}
        className="absolute right-3 top-3 h-9 w-9"
      />
    </div>
  );
}

function VenueRowSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-36 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-3 w-24 animate-pulse rounded bg-white/[0.06]" />
        </div>
        <div className="h-7 w-20 animate-pulse rounded-full bg-white/[0.06]" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
        <div className="h-3 w-32 animate-pulse rounded bg-white/[0.06]" />
      </div>
    </div>
  );
}

export default function MapBottomSheet({
  cityName,
  launchZoneNotice,
  loading = false,
  onVenueSelect,
  selectedVenueId,
  setSnap,
  snap,
  venues,
}: {
  cityName: string;
  launchZoneNotice?: string | null;
  loading?: boolean;
  onVenueSelect: (venue: ConsumerVenue) => void;
  selectedVenueId: string | null;
  setSnap: (snap: MapSheetSnap) => void;
  snap: MapSheetSnap;
  venues: ConsumerVenue[];
}) {
  const haptic = useHaptic();
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [dragTranslate, setDragTranslate] = useState<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({ pointerId: -1, startY: 0, startTranslate: 0, currentTranslate: 0 });
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  const sortedVenues = useMemo(
    () =>
      [...venues].sort((a, b) => {
        const busynessDiff = (b.signal?.busyness0To100 ?? -1) - (a.signal?.busyness0To100 ?? -1);
        if (busynessDiff !== 0) return busynessDiff;
        return a.name.localeCompare(b.name);
      }),
    [venues],
  );
  const topVenues = sortedVenues.slice(0, 5);
  const openCount = venues.filter((venue) => venue.openNow).length;

  useEffect(() => {
    if (!selectedVenueId || snap === "collapsed") return;
    window.requestAnimationFrame(() => {
      itemRefs.current.get(selectedVenueId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [selectedVenueId, snap]);

  function getTranslateForSnap(nextSnap: MapSheetSnap) {
    const sheetHeight = sheetRef.current?.getBoundingClientRect().height ?? window.innerHeight * 0.85;
    return Math.max(0, sheetHeight - getVisibleHeight(nextSnap));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const sheetTop = sheet.getBoundingClientRect().top;
    if (event.clientY - sheetTop > COLLAPSED_HEIGHT) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTranslate: getTranslateForSnap(snap),
      currentTranslate: getTranslateForSnap(snap),
    };
    setDragTranslate(getTranslateForSnap(snap));
  }

  function beginMouseDrag(clientY: number) {
    const startTranslate = getTranslateForSnap(snap);
    dragRef.current = {
      pointerId: -1,
      startY: clientY,
      startTranslate,
      currentTranslate: startTranslate,
    };
    setDragTranslate(startTranslate);
  }

  function updateMouseDrag(clientY: number) {
    const sheetHeight = sheetRef.current?.getBoundingClientRect().height ?? window.innerHeight * 0.85;
    const maxTranslate = Math.max(0, sheetHeight - COLLAPSED_HEIGHT);
    const nextTranslate = Math.min(maxTranslate, Math.max(0, dragRef.current.startTranslate + clientY - dragRef.current.startY));
    dragRef.current.currentTranslate = nextTranslate;
    setDragTranslate(nextTranslate);
  }

  function finishDrag() {
    const currentTranslate = dragRef.current.currentTranslate;
    const snapPoints: MapSheetSnap[] = ["expanded", "mid", "collapsed"];
    const nearestSnap = snapPoints.reduce((nearest, candidate) => {
      const nearestDistance = Math.abs(currentTranslate - getTranslateForSnap(nearest));
      const candidateDistance = Math.abs(currentTranslate - getTranslateForSnap(candidate));
      return candidateDistance < nearestDistance ? candidate : nearest;
    }, snap);

    dragRef.current.pointerId = -1;
    setDragTranslate(null);
    if (nearestSnap !== snap) {
      haptic.light();
    }
    setSnap(nearestSnap);
  }

  function snapTo(nextSnap: MapSheetSnap) {
    if (nextSnap !== snap) {
      haptic.light();
    }
    setSnap(nextSnap);
  }

  function handleMouseDown(event: ReactMouseEvent<HTMLElement>) {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const sheetTop = sheet.getBoundingClientRect().top;
    if (event.clientY - sheetTop > COLLAPSED_HEIGHT) return;

    event.preventDefault();
    beginMouseDrag(event.clientY);

    function handleMouseMove(moveEvent: MouseEvent) {
      updateMouseDrag(moveEvent.clientY);
    }

    function handleMouseUp(upEvent: MouseEvent) {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      updateMouseDrag(upEvent.clientY);
      finishDrag();
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp, { once: true });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current.pointerId !== event.pointerId) return;
    const sheetHeight = sheetRef.current?.getBoundingClientRect().height ?? window.innerHeight * 0.85;
    const maxTranslate = Math.max(0, sheetHeight - COLLAPSED_HEIGHT);
    const nextTranslate = Math.min(maxTranslate, Math.max(0, dragRef.current.startTranslate + event.clientY - dragRef.current.startY));
    dragRef.current.currentTranslate = nextTranslate;
    setDragTranslate(nextTranslate);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current.pointerId !== event.pointerId) return;

    updateMouseDrag(event.clientY);
    finishDrag();
  }

  const transform =
    dragTranslate == null ? `translateY(calc(100% - ${snap === "collapsed" ? "72px" : snap === "mid" ? "40dvh" : "85dvh"}))` : `translateY(${dragTranslate}px)`;
  const visibleVenues = snap === "collapsed" ? topVenues : sortedVenues;

  return (
    <section
      ref={sheetRef}
      aria-label={`${cityName} venues`}
      className="absolute inset-x-0 bottom-0 z-[1100] h-[85dvh] rounded-t-[18px] border-t border-white/[0.08] bg-[#0A0A0E]/95 shadow-[0_-22px_70px_rgba(0,0,0,0.68)] backdrop-blur-xl"
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseDown={handleMouseDown}
      style={{
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        transform,
        transition: dragTranslate == null && !prefersReduced ? "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
      }}
    >
      <div
        className="cursor-grab touch-none px-4 pb-3 pt-3 active:cursor-grabbing"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
        <button
          type="button"
          onClick={() => snapTo(snap === "expanded" ? "collapsed" : snap === "collapsed" ? "mid" : "expanded")}
          aria-label={`${snap === "expanded" ? "Collapse" : "Expand"} ${cityName} venue list`}
          className="mx-auto mt-3 flex max-w-full items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.06] px-4 py-2 text-sm font-black text-white shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          {loading ? (
            <span className="h-5 w-36 animate-pulse rounded-full bg-white/[0.06]" aria-hidden="true" />
          ) : (
            `${cityName} · ${openCount} spots open`
          )}
        </button>
      </div>

      <div className="h-[calc(100%-72px)] overflow-y-auto px-4 pb-6 [scrollbar-width:none]">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
          {launchZoneNotice && (
            <div className="rounded-2xl border border-[#8B6CFF]/20 bg-[#8B6CFF]/10 px-4 py-3 text-sm font-semibold leading-5 text-white/70">
              {launchZoneNotice}
            </div>
          )}

          {loading ? (
            <div className="space-y-3" role="status" aria-label="Loading map venues">
              {Array.from({ length: snap === "collapsed" ? 2 : 4 }).map((_, index) => (
                <VenueRowSkeleton key={index} />
              ))}
            </div>
          ) : venues.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-[#9CA2AE]">No venues in this area. Try moving the map.</p>
            </div>
          ) : (
            visibleVenues.map((venue) => (
              <div
                key={venue.id}
                ref={(node) => {
                  if (node) itemRefs.current.set(venue.id, node);
                  else itemRefs.current.delete(venue.id);
                }}
              >
                <VenueRow
                  isSelected={selectedVenueId === venue.id}
                  onSelect={() => {
                    haptic.light();
                    onVenueSelect(venue);
                  }}
                  venue={venue}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
