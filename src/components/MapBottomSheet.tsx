"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { getBusynessState } from "@/lib/busyness";
import type { ConsumerVenue } from "@/types";

export type MapSheetSnap = "collapsed" | "mid" | "expanded";

const COLLAPSED_HEIGHT = 72;
const MID_RATIO = 0.4;

function getBusynessLabel(value: number | null | undefined) {
  if (value == null) return "No signal";
  return getBusynessState(value).label;
}

function getVisibleHeight(snap: MapSheetSnap) {
  if (typeof window === "undefined") return COLLAPSED_HEIGHT;
  if (snap === "collapsed") return COLLAPSED_HEIGHT;
  if (snap === "mid") return window.innerHeight * MID_RATIO;
  return window.innerHeight * 0.85;
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

function BusynessBadge({ value }: { value: number | null | undefined }) {
  const state = getBusynessState(value);
  return (
    <span
      className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-black text-white/55"
      style={state.level ? { borderColor: `${state.color}59`, backgroundColor: `${state.color}26`, color: state.color } : undefined}
    >
      {getBusynessLabel(value)}
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
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      className={`block w-full rounded-2xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70 ${
        isSelected
          ? "border-white/35 bg-white/[0.1] ring-1 ring-[#00F5D4]/60"
          : "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-black text-white">{venue.name}</h3>
          <p className="mt-1 truncate text-xs font-semibold text-white/45">{venue.category}</p>
        </div>
        <BusynessBadge value={venue.signal?.busyness0To100} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <OpenNowDot openNow={venue.openNow} />
        <span className="truncate text-xs font-semibold text-white/35">{venue.address}</span>
      </div>
    </button>
  );
}

export default function MapBottomSheet({
  onVenueSelect,
  selectedVenueId,
  setSnap,
  snap,
  venues,
}: {
  onVenueSelect: (venue: ConsumerVenue) => void;
  selectedVenueId: string | null;
  setSnap: (snap: MapSheetSnap) => void;
  snap: MapSheetSnap;
  venues: ConsumerVenue[];
}) {
  const [dragTranslate, setDragTranslate] = useState<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({ pointerId: -1, startY: 0, startTranslate: 0 });
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

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTranslate: getTranslateForSnap(snap),
    };
    setDragTranslate(getTranslateForSnap(snap));
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current.pointerId !== event.pointerId) return;
    const sheetHeight = sheetRef.current?.getBoundingClientRect().height ?? window.innerHeight * 0.85;
    const maxTranslate = Math.max(0, sheetHeight - COLLAPSED_HEIGHT);
    const nextTranslate = Math.min(maxTranslate, Math.max(0, dragRef.current.startTranslate + event.clientY - dragRef.current.startY));
    setDragTranslate(nextTranslate);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current.pointerId !== event.pointerId) return;

    const currentTranslate = dragTranslate ?? getTranslateForSnap(snap);
    const snapPoints: MapSheetSnap[] = ["expanded", "mid", "collapsed"];
    const nearestSnap = snapPoints.reduce((nearest, candidate) => {
      const nearestDistance = Math.abs(currentTranslate - getTranslateForSnap(nearest));
      const candidateDistance = Math.abs(currentTranslate - getTranslateForSnap(candidate));
      return candidateDistance < nearestDistance ? candidate : nearest;
    }, snap);

    dragRef.current.pointerId = -1;
    setDragTranslate(null);
    setSnap(nearestSnap);
  }

  const transform =
    dragTranslate == null ? `translateY(calc(100% - ${snap === "collapsed" ? "72px" : snap === "mid" ? "40dvh" : "85dvh"}))` : `translateY(${dragTranslate}px)`;
  const visibleVenues = snap === "collapsed" ? topVenues : sortedVenues;

  return (
    <section
      ref={sheetRef}
      aria-label="South End venues"
      className="absolute inset-x-0 bottom-0 z-[1100] h-[85dvh] rounded-t-3xl border-t border-white/[0.08] bg-[#0A0A0F]/95 shadow-[0_-22px_70px_rgba(0,0,0,0.68)] backdrop-blur-xl"
      style={{
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        transform,
        transition: dragTranslate == null ? "transform 300ms ease-out" : "none",
      }}
    >
      <div
        className="cursor-grab touch-none px-4 pb-3 pt-3 active:cursor-grabbing"
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
        <button
          type="button"
          onClick={() => setSnap(snap === "expanded" ? "collapsed" : snap === "collapsed" ? "mid" : "expanded")}
          className="mx-auto mt-3 flex max-w-full items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.06] px-4 py-2 text-sm font-black text-white shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
        >
          South End · {openCount} spots open
        </button>
      </div>

      <div className="h-[calc(100%-72px)] overflow-y-auto px-4 pb-6 [scrollbar-width:none]">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
          {venues.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-5 text-center">
              <p className="text-sm font-black text-white">No venues loaded for South End yet.</p>
              <p className="mt-1 text-xs font-semibold text-white/45">Check back tonight.</p>
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
                <VenueRow isSelected={selectedVenueId === venue.id} onSelect={() => onVenueSelect(venue)} venue={venue} />
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
