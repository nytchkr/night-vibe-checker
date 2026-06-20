"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { timeAgo } from "@/lib/timeAgo";
import type { ConsumerVenue } from "@/types";

type VenueBottomSheetProps = {
  venue: ConsumerVenue | null;
  onClose: () => void;
};

function busynessLabel(value: number | null | undefined) {
  if (value == null) return "No signal";
  if (value >= 67) return "Packed 🔥";
  if (value >= 34) return "Moderate";
  return "Quiet";
}

function busynessClass(value: number | null | undefined) {
  if (value == null) return "bg-white/10 text-white/50";
  if (value >= 67) return "bg-red-500/20 text-red-400";
  if (value >= 34) return "bg-yellow-500/20 text-yellow-400";
  return "bg-zinc-700/50 text-zinc-400";
}

function MFRatioBar({ venue }: { venue: ConsumerVenue }) {
  const signal = venue.signal;
  if (signal?.mfRatio == null || signal.sampleSize < 3) return null;

  const malePercent = Math.min(100, Math.max(0, Math.round(signal.mfRatio)));
  const femalePercent = 100 - malePercent;

  return (
    <div className="mt-3" aria-label={`${malePercent}% male, ${femalePercent}% female from ${signal.sampleSize} reports`}>
      <div className="flex h-1 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
        <div className="h-full bg-[#3B82F6]" style={{ width: `${malePercent}%` }} />
        <div className="h-full bg-[#EC4899]" style={{ width: `${femalePercent}%` }} />
      </div>
      <p className="mt-1 text-xs font-semibold text-white/45">👥 {signal.sampleSize} reports</p>
    </div>
  );
}

export function VenueBottomSheet({ venue, onClose }: VenueBottomSheetProps) {
  const touchStartYRef = useRef<number | null>(null);
  const [dragDelta, setDragDelta] = useState(0);

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
      onClose();
    }
  }

  function handleTouchCancel() {
    touchStartYRef.current = null;
    setDragDelta(0);
  }

  if (!venue) return null;

  const signal = venue.signal;
  const reportHref = `/vibe-check?venueId=${encodeURIComponent(venue.id)}&venueName=${encodeURIComponent(venue.name)}`;

  return (
    <>
      <button
        type="button"
        aria-label="Close venue details"
        className="fixed inset-0 z-40 cursor-default bg-black/35"
        onClick={onClose}
      />

      <aside
        className={`fixed bottom-0 left-0 right-0 z-50 max-h-[55vh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#111118] shadow-[0_-20px_60px_rgba(0,0,0,0.5)] ${
          dragDelta > 0 ? "" : "transition-transform duration-200"
        }`}
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          transform: dragDelta > 0 ? `translateY(${dragDelta}px)` : undefined,
        }}
        aria-label={`${venue.name} details`}
      >
        <div className="mx-auto w-full max-w-lg px-4 pb-4">
          <div
            className="mx-auto flex h-9 w-20 touch-none items-center justify-center"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            aria-label="Drag down to close"
          >
            <div className="h-1 w-10 rounded bg-white/20" />
          </div>

          {venue.photoUrl ? (
            <img src={venue.photoUrl} alt={`${venue.name} venue`} className="h-28 w-full rounded-xl object-cover" />
          ) : (
            <div className="flex h-28 w-full items-center justify-center rounded-xl bg-white/[0.06] text-4xl font-black text-white/25">
              {venue.name.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="mt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-white">{venue.name}</h2>
                <p className="mt-1 text-sm leading-snug text-white/50">
                  {venue.category}
                  {venue.address ? ` · ${venue.address}` : ""}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${busynessClass(signal?.busyness0To100)}`}>
                {busynessLabel(signal?.busyness0To100)}
              </span>
            </div>

            <MFRatioBar venue={venue} />

            {signal?.computedAt ? (
              <p className="mt-2 text-xs font-semibold text-white/40">{timeAgo(signal.computedAt)}</p>
            ) : null}

            <div className="mt-3 flex gap-2">
              <Link
                href={`/venues/${encodeURIComponent(venue.id)}`}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-full border border-white/15 px-4 text-sm font-black text-white transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
              >
                View Details
              </Link>
              <Link
                href={reportHref}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-full bg-[#00F5D4] px-4 text-sm font-black text-[#0A0A0F] shadow-[0_0_20px_rgba(0,245,212,0.35)] transition-colors hover:bg-[#2fffe2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
              >
                ＋ Report Vibe
              </Link>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

export default VenueBottomSheet;
