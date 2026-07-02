"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent } from "react";
import { Info, MapPin } from "lucide-react";
import { BusynessBadge as SourceBadge } from "@/components/BusynessBadge";
import { OpenNowBadge } from "@/components/OpenNowBadge";
import { SaveVenueButton } from "@/components/SaveVenueButton";
import { SignalFreshnessLabel } from "@/components/SignalFreshnessLabel";
import { VenuePhoto } from "@/components/VenuePhoto";
import { getBusynessState } from "@/lib/busyness";
import { getNeighborhood } from "@/lib/neighborhood";
import { useHaptic } from "@/hooks/useHaptic";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { ConsumerVenue } from "@/types";

export type MapSheetSnap = "collapsed" | "mid" | "expanded";
export type VenueCategoryFilter = "All" | "Bar" | "Club" | "Lounge" | "Rooftop" | "Live Music" | "Sports Bar";
type VenueZoneFilter = "all" | "south-end-charlotte" | "dilworth-charlotte" | "south-park-charlotte";

const COLLAPSED_HEIGHT = 210;
const MID_RATIO = 0.4;
const EXPANDED_RATIO = 0.68;
export const CATEGORY_FILTERS: VenueCategoryFilter[] = ["All", "Bar", "Club", "Lounge", "Rooftop", "Live Music", "Sports Bar"];
const ZONE_FILTERS: { id: VenueZoneFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "south-end-charlotte", label: "South End" },
  { id: "dilworth-charlotte", label: "Dilworth" },
  { id: "south-park-charlotte", label: "SouthPark" },
];

const BUSYNESS_ACCENT = {
  packed: "#FF5B6A",
  moderate: "#FFB020",
  dead: "#5C6573",
} as const;

function getBusynessAccent(venue: ConsumerVenue): string | null {
  const value = venue.signal?.busyness0To100;
  if (value == null || !Number.isFinite(value)) return null;
  const state = getBusynessState(value);
  if (state.level === "packed") return BUSYNESS_ACCENT.packed;
  if (state.level === "moderate") return BUSYNESS_ACCENT.moderate;
  if (state.level === "dead") return BUSYNESS_ACCENT.dead;
  return null;
}

function matchesCategoryFilter(venue: ConsumerVenue, filter: VenueCategoryFilter) {
  if (filter === "All") return true;

  const category = venue.category.toLowerCase();
  const name = venue.name.toLowerCase();
  if (filter === "Bar") return category.includes("bar") && !category.includes("sports") && !name.includes("rooftop");
  if (filter === "Club") return category.includes("club") || category.includes("night_club");
  if (filter === "Lounge") return category.includes("lounge") || name.includes("lounge");
  if (filter === "Rooftop") return category.includes("rooftop") || name.includes("rooftop") || name.includes("sky bar");
  if (filter === "Live Music") return category.includes("live") || category.includes("music") || name.includes("music");
  return category.includes("sports") || name.includes("sports");
}

function getVenueZoneId(venue: ConsumerVenue) {
  return venue.zoneId ?? (venue as ConsumerVenue & { zone_id?: string | null }).zone_id ?? null;
}

function matchesZoneFilter(venue: ConsumerVenue, filter: VenueZoneFilter) {
  return filter === "all" || getVenueZoneId(venue) === filter;
}

function getVisibleHeight(snap: MapSheetSnap) {
  if (typeof window === "undefined") return COLLAPSED_HEIGHT;
  if (snap === "collapsed") return COLLAPSED_HEIGHT;
  if (snap === "mid") return window.innerHeight * MID_RATIO;
  return window.innerHeight * EXPANDED_RATIO;
}

function NoDataChip() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 text-[11.5px] font-semibold text-[#9CA2AE]">
      <Info className="h-3.5 w-3.5" aria-hidden="true" />
      No data
    </span>
  );
}

function BusynessBadge({ venue }: { venue: ConsumerVenue }) {
  const value = venue.signal?.busyness0To100;
  if (value == null || !Number.isFinite(value)) {
    return (
      <span className="flex shrink-0 flex-col items-end gap-1" role="status" aria-live="polite" aria-atomic="true">
        <NoDataChip />
      </span>
    );
  }

  const state = getBusynessState(value);
  const source = venue.signal?.busynessSource ?? null;
  const computedAt = venue.signal?.computedAt ?? null;
  return (
    <span className="flex shrink-0 flex-col items-end gap-1" role="status" aria-live="polite" aria-atomic="true">
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

function SelectedVenueSourceBadge({ venue }: { venue: ConsumerVenue }) {
  const source = venue.signal?.busynessSource;
  const label = source === "live" || source === "crowd" ? "LIVE" : source === "forecast" ? "FORECAST" : "NO DATA";
  const className = source === "live" || source === "crowd"
    ? "border-[#00F5D4]/35 bg-[#00F5D4]/12 text-[#00F5D4]"
    : source === "forecast"
      ? "border-[#FFB020]/35 bg-[#FFB020]/12 text-[#FFB020]"
      : "border-white/[0.08] bg-white/[0.035] text-white/45";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black tracking-normal ${className}`}>
      {label}
    </span>
  );
}

function SelectedVenueOpenStatus({ openNow }: { openNow: boolean | null | undefined }) {
  const label = openNow === true ? "Open now" : openNow === false ? "Closed" : "Hours unknown";
  const className = openNow === true
    ? "border-[#00F5D4]/35 bg-[#00F5D4]/12 text-[#00F5D4]"
    : openNow === false
      ? "border-[#FF5B6A]/35 bg-[#FF5B6A]/12 text-[#FF5B6A]"
      : "border-white/[0.08] bg-white/[0.035] text-white/45";

  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-black tracking-normal ${className}`}>
      {label}
    </span>
  );
}

function venueHref(venue: ConsumerVenue) {
  return `/venues/${encodeURIComponent(venue.id)}`;
}

function SelectedVenueCard({ venue }: { venue: ConsumerVenue }) {
  const busyness = venue.signal?.busyness0To100;
  const busynessState = getBusynessState(busyness ?? null);

  return (
    <section className="rounded-[18px] border border-white/[0.08] bg-[rgba(255,255,255,0.035)] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
      <VenuePhoto
        name={venue.name}
        photoUrl={venue.photoUrl}
        photoUrls={venue.photoUrls ?? venue.photo_urls}
        className="mb-4 aspect-[16/9] w-full rounded-[14px]"
        sizes="(max-width: 640px) calc(100vw - 2rem), 560px"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-[22px] font-semibold leading-tight text-white">
            {venue.name}
          </h2>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-sm font-black text-white/72">{venue.category}</p>
            <SelectedVenueOpenStatus openNow={venue.openNow ?? venue.open_now ?? venue.opening_hours?.open_now ?? null} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <SelectedVenueSourceBadge venue={venue} />
          <span
            className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-black text-white/55"
            style={busynessState.level ? { borderColor: `${busynessState.color}59`, backgroundColor: `${busynessState.color}26`, color: busynessState.color } : undefined}
          >
            {busynessState.label}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        <Link
          href={venueHref(venue)}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#9C85FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
        >
          View details
        </Link>
      </div>
    </section>
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
  const neighborhood = getNeighborhood(venue.lat, venue.lng);
  const accentColor = getBusynessAccent(venue);

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
        } ${accentColor ? "border-l-[3px]" : ""}`}
        style={accentColor ? { borderLeftColor: accentColor } : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-sm font-black text-white">{venue.name}</h3>
              <OpenNowBadge openNow={venue.openNow ?? null} />
            </div>
            <p className="mt-1 truncate text-xs font-semibold text-white/55">{neighborhood}</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-white/40">{venue.category}</p>
          </div>
          <BusynessBadge venue={venue} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center justify-end gap-2">
            <span className="truncate text-xs font-semibold text-white/55">{venue.address}</span>
          </div>
        </div>
      </button>
      <SaveVenueButton
        venueId={venue.id}
        venueName={venue.name}
        includeVenueNameInLabel={false}
        className="absolute right-3 top-3 h-11 w-11"
      />
    </div>
  );
}

function CollapsedVenueRow({
  onSelect,
  venue,
}: {
  onSelect: () => void;
  venue: ConsumerVenue;
}) {
  const busyness = getBusynessState(venue.signal?.busyness0To100 ?? null);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex min-h-10 w-full items-center justify-between gap-3 rounded-[14px] border border-white/[0.08] bg-white/[0.035] px-3 text-left transition-colors hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
    >
      <span className="truncate text-sm font-black text-[#F4F5F8]">{venue.name}</span>
      <span
        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black text-[#646B79]"
        style={busyness.level ? { backgroundColor: `${busyness.color}22`, color: busyness.color } : undefined}
      >
        {busyness.label}
      </span>
    </button>
  );
}

function EmptyVenueState() {
  return (
    <div className="rounded-[18px] border border-[#00F5D4]/20 bg-[#00F5D4]/[0.06] px-4 py-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#00F5D4]/30 bg-[#00F5D4]/10 text-[#00F5D4]">
        <MapPin className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="mt-3 font-display text-base font-semibold text-[#F4F5F8]">No venues found in this area</p>
      <p className="mt-1 text-sm font-semibold text-[#9CA2AE]">Try moving the map or changing your filters.</p>
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
  const prefersReduced = useReducedMotion();
  const [dragTranslate, setDragTranslate] = useState<number | null>(null);
  const [selectedZone, setSelectedZone] = useState<VenueZoneFilter>("all");
  const [selectedCategory, setSelectedCategory] = useState<VenueCategoryFilter>("All");
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
  const filteredVenues = useMemo(
    () =>
      sortedVenues.filter(
        (venue) => matchesZoneFilter(venue, selectedZone) && matchesCategoryFilter(venue, selectedCategory),
      ),
    [selectedCategory, selectedZone, sortedVenues],
  );
  const topVenues = filteredVenues.slice(0, 3);
  const openCount = venues.filter((venue) => venue.openNow).length;
  const selectedVenue = useMemo(
    () => venues.find((venue) => venue.id === selectedVenueId) ?? null,
    [selectedVenueId, venues],
  );

  useEffect(() => {
    if (!selectedVenueId || snap === "collapsed") return;
    window.requestAnimationFrame(() => {
      itemRefs.current.get(selectedVenueId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [selectedVenueId, snap]);

  function getTranslateForSnap(nextSnap: MapSheetSnap) {
    const sheetHeight = sheetRef.current?.getBoundingClientRect().height ?? window.innerHeight * EXPANDED_RATIO;
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
    const sheetHeight = sheetRef.current?.getBoundingClientRect().height ?? window.innerHeight * EXPANDED_RATIO;
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
    dragTranslate == null ? `translateY(calc(100% - ${snap === "collapsed" ? `${COLLAPSED_HEIGHT}px` : snap === "mid" ? "40dvh" : "68dvh"}))` : `translateY(${dragTranslate}px)`;
  const visibleVenues = snap === "collapsed" ? topVenues : filteredVenues;
  const selectedZoneLabel = ZONE_FILTERS.find((zone) => zone.id === selectedZone)?.label ?? "selected zone";

  return (
    <section
      ref={sheetRef}
      aria-label={`${cityName} venues`}
      role="region"
      className="bottom-sheet scroll-touch gpu-layer absolute inset-x-0 bottom-0 z-[1100] h-[calc(100dvh_-_4rem_-_env(safe-area-inset-bottom))] max-h-[68dvh] rounded-t-[18px] border-t border-white/[0.08] bg-[rgba(255,255,255,0.035)] shadow-[0_-22px_70px_rgba(0,0,0,0.68)] backdrop-blur-xl"
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
            <span className="inline-flex items-center gap-2">
              {openCount > 0 && <span className="h-2 w-2 rounded-full bg-[#00F5D4] animate-pulse" aria-hidden="true" />}
              <span>{cityName} · {openCount} spots open</span>
            </span>
          )}
        </button>
      </div>

      <div className="scroll-touch flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
        {ZONE_FILTERS.map((zone) => {
          const isActive = selectedZone === zone.id;

          return (
            <button
              key={zone.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setSelectedZone(zone.id)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
                isActive
                  ? "bg-[#8B6CFF] text-white"
                  : "bg-white/[0.08] text-[#AAB2C0] hover:bg-white/[0.1]"
              }`}
            >
              {zone.label}
            </button>
          );
        })}
      </div>

      <div className="scroll-touch flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
        {CATEGORY_FILTERS.map((filter) => {
          const isActive = selectedCategory === filter;

          return (
            <button
              key={filter}
              type="button"
              aria-pressed={isActive}
              onClick={() => setSelectedCategory(filter)}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
                isActive
                  ? "border-[#8B6CFF] bg-[#8B6CFF] text-[#0A0A0E]"
                  : "border-white/[0.08] bg-[rgba(255,255,255,0.035)] text-[#9CA2AE] hover:bg-white/[0.07] hover:text-[#F4F5F8]"
              }`}
            >
              {filter}
            </button>
          );
        })}
      </div>

      <div className="scroll-touch h-[calc(100%-144px)] overflow-y-auto overscroll-contain px-4 pb-6 [scrollbar-width:none] [will-change:scroll-position]">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
          {launchZoneNotice && snap !== "collapsed" && (
            <div className="rounded-2xl border border-[#8B6CFF]/20 bg-[#8B6CFF]/10 px-4 py-3 text-sm font-semibold leading-5 text-white/70">
              {launchZoneNotice}
            </div>
          )}

          {selectedVenue && snap !== "collapsed" && (
            <SelectedVenueCard venue={selectedVenue} />
          )}

          {loading ? (
            <div className="space-y-3" role="status" aria-label="Loading..." aria-live="polite" aria-atomic="true">
              {Array.from({ length: snap === "collapsed" ? 2 : 4 }).map((_, index) => (
                <VenueRowSkeleton key={index} />
              ))}
            </div>
          ) : venues.length === 0 ? (
            <EmptyVenueState />
          ) : visibleVenues.length === 0 ? (
            <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] px-4 py-6 text-center text-sm font-semibold text-[#9CA2AE]">
              No {selectedCategory.toLowerCase()} venues found in {selectedZone === "all" ? "this area" : selectedZoneLabel}.
            </div>
          ) : snap === "collapsed" ? (
            visibleVenues.map((venue) => (
              <CollapsedVenueRow
                key={venue.id}
                onSelect={() => {
                  haptic.light();
                  onVenueSelect(venue);
                  snapTo("mid");
                }}
                venue={venue}
              />
            ))
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
