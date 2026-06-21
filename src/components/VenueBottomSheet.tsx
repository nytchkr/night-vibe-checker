"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { MFBar } from "@/components/MFBar";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { getBusynessState } from "@/lib/busyness";
import type { ConsumerVenue } from "@/types";

type VenueBottomSheetProps = {
  loading?: boolean;
  venue: ConsumerVenue | null;
  onClose: () => void;
};

function busynessLabel(value: number | null | undefined) {
  if (value == null) return "No data yet";
  return getBusynessState(value).level === "dead" ? "Dead" : getBusynessState(value).label;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function BusynessMeter({ value }: { value: number | null | undefined }) {
  const state = getBusynessState(value);
  const percent = value == null ? 0 : clampPercent(value);
  const label = busynessLabel(value);

  return (
    <section className="mt-2" aria-label="Busyness">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#F4F5F8]">{label}</p>
        <p className="text-xs font-semibold" style={{ color: state.level ? state.color : "#9CA2AE" }}>
          {value == null ? "--" : percent}
          <span className="text-[11px] text-white/35">/100</span>
        </p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${percent}%`,
            backgroundColor: state.level ? state.color : "#5C6573",
          }}
        />
      </div>
    </section>
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
        className="fixed inset-0 z-[1190] cursor-default bg-black/35"
        onClick={onClose}
      />

      <aside
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 z-[1200] max-h-[180px] translate-y-0 overflow-hidden rounded-t-2xl border-t border-white/10 bg-[#0A0A0E] shadow-[0_-20px_60px_rgba(0,0,0,0.5)] transition-transform duration-200 ease-out"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Loading venue details"
        tabIndex={-1}
      >
        <div role="status" className="sr-only">Loading venue details</div>
        <div className="mx-auto w-full max-w-lg px-4 pb-4 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-44 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-4 w-28 animate-pulse rounded bg-white/[0.06]" />
            </div>
            <div className="h-9 w-9 animate-pulse rounded-full bg-white/[0.06]" />
          </div>
          <div className="mt-3 h-2 w-full animate-pulse rounded-full bg-white/[0.06]" />
          <div className="mt-4 h-9 w-32 animate-pulse rounded-full bg-white/[0.06]" />
        </div>
      </aside>
    </>
  );
}

export function VenueBottomSheet({ loading = false, venue, onClose }: VenueBottomSheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragDelta, setDragDelta] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!venue && !loading) return;

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

  useFocusTrap(Boolean(loading || venue), sheetRef, handleClose);

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
    setDragDelta(0);
  }

  function handleTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    if (touchStartYRef.current == null) return;

    const currentY = event.touches[0]?.clientY;
    if (currentY == null) return;

    setDragDelta(Math.max(0, currentY - touchStartYRef.current));
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (touchStartYRef.current == null) return;

    const endY = event.changedTouches[0]?.clientY;
    const deltaY = endY == null ? dragDelta : endY - touchStartYRef.current;
    touchStartYRef.current = null;
    setDragDelta(0);

    if (deltaY > 80) {
      handleClose();
    }
  }

  function handleTouchCancel() {
    touchStartYRef.current = null;
    setDragDelta(0);
  }

  if (loading) return <VenueBottomSheetSkeleton onClose={handleClose} sheetRef={sheetRef} />;
  if (!venue) return null;

  const signal = venue.signal;
  const mfSource = signal?.busynessSource === "live" ? "live" : signal?.busynessSource === "forecast" ? "forecast" : null;
  const malePercent = signal?.mfRatio != null ? clampPercent(signal.mfRatio) : null;

  return (
    <>
      <button
        type="button"
        aria-label="Close venue details"
        className="fixed inset-0 z-[1190] cursor-default bg-black/35"
        onClick={handleClose}
      />

      <aside
        ref={sheetRef}
        className={`fixed bottom-0 left-0 right-0 z-[1200] max-h-[180px] overflow-hidden rounded-t-2xl border-t border-white/10 bg-[#0A0A0E] shadow-[0_-20px_60px_rgba(0,0,0,0.5)] ${
          dragDelta > 0 ? "" : "transition-transform duration-200 ease-out"
        }`}
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          transform: dragDelta > 0 ? `translateY(${dragDelta}px)` : isVisible ? "translateY(0)" : "translateY(100%)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`${venue.name} details`}
        tabIndex={-1}
      >
        <div className="mx-auto w-full max-w-lg px-4 pb-3 pt-4">
          <div
            className="absolute left-1/2 top-1.5 flex h-4 w-20 -translate-x-1/2 touch-none items-center justify-center"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            aria-label="Drag down to close"
          >
            <div className="h-1 w-10 rounded bg-white/20" />
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-1">
              <h2 className="font-display truncate text-[18px] font-semibold text-[#F4F5F8]">{venue.name}</h2>
              <p className="mt-0.5 truncate text-xs font-medium text-white/45">{venue.category}</p>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <Link
                href={`/venues/${encodeURIComponent(venue.id)}`}
                className="inline-flex min-h-9 items-center rounded-full border border-white/15 px-3 text-sm font-semibold text-[#F4F5F8] transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
              >
                View details →
              </Link>
              <button
                type="button"
                aria-label="Close venue details"
                onClick={handleClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/75 transition hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>

          <BusynessMeter value={signal?.busyness0To100} />

          {malePercent !== null && (
            <div className="mt-3">
              <MFBar
                malePercent={malePercent}
                sampleSize={signal?.sampleSize ?? 0}
                source={mfSource}
                showWhenRatioPresent
              />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export default VenueBottomSheet;
