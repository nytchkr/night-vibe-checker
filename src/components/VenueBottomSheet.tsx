"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { getBusynessState } from "@/lib/busyness";
import { VENUE_PHOTO_BLUR_DATA_URL } from "@/lib/imagePlaceholders";
import { timeAgo } from "@/lib/timeAgo";
import { buildVenueShareData } from "@/lib/venueShare";
import { BusynessBadge } from "@/components/BusynessBadge";
import type { ConsumerVenue } from "@/types";

type VenueBottomSheetProps = {
  venue: ConsumerVenue | null;
  onClose: () => void;
};

function busynessLabel(value: number | null | undefined) {
  if (value == null) return "No signal";
  return getBusynessState(value).label;
}

function MFRatioBar({ venue }: { venue: ConsumerVenue }) {
  const signal = venue.signal;
  if (signal?.mfRatio == null || signal.sampleSize < 2) {
    return (
      <p className="mt-3 text-sm text-[#9CA2AE]">
        No live reads yet — be the first to report
      </p>
    );
  }

  const malePercent = Math.min(100, Math.max(0, Math.round(signal.mfRatio)));
  const femalePercent = 100 - malePercent;

  return (
    <div className="mt-3" aria-label={`${malePercent}% male, ${femalePercent}% female from ${signal.sampleSize} reports`}>
      <div className="flex h-1 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
        <div className="h-full bg-[#4F9DFF]" style={{ width: `${malePercent}%` }} />
        <div className="h-full bg-[#F0568C]" style={{ width: `${femalePercent}%` }} />
      </div>
      <p className="mt-1 text-xs font-semibold text-white/45">👥 {signal.sampleSize} reports</p>
    </div>
  );
}

export function VenueBottomSheet({ venue, onClose }: VenueBottomSheetProps) {
  const touchStartYRef = useRef<number | null>(null);
  const [dragDelta, setDragDelta] = useState(0);
  const [copied, setCopied] = useState(false);

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

  async function handleShare() {
    if (!venue || typeof navigator === "undefined") return;

    const shareData = buildVenueShareData(venue);

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      if (!navigator.clipboard) return;
      await navigator.clipboard.writeText(shareData.url ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (!venue) return null;

  const signal = venue.signal;
  const reportHref = `/vibe-check?venueId=${encodeURIComponent(venue.id)}&venueName=${encodeURIComponent(venue.name)}`;
  const busyness = getBusynessState(signal?.busyness0To100);
  const busynessSource = signal?.busyness0To100 != null ? signal.busynessSource : null;

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
            <div className="relative h-28 w-full overflow-hidden rounded-xl bg-white/[0.06]">
              <Image
                src={venue.photoUrl}
                alt={`${venue.name} venue`}
                fill
                sizes="(max-width: 640px) 100vw, 400px"
                loading="lazy"
                placeholder="blur"
                blurDataURL={VENUE_PHOTO_BLUR_DATA_URL}
                className="object-cover"
              />
            </div>
          ) : (
            <div className="flex h-28 w-full items-center justify-center rounded-xl bg-white/[0.06] text-4xl font-black text-white/25">
              {venue.name.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="mt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display truncate text-lg font-bold text-white">{venue.name}</h2>
                <p className="mt-1 text-sm leading-snug text-white/50">
                  {venue.category}
                  {venue.address ? ` · ${venue.address}` : ""}
                </p>
              </div>
              <div className="relative flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/70 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/55"
                  aria-label={`Share ${venue.name}`}
                  title={copied ? "Link copied!" : "Share"}
                >
                  <ShareIcon />
                  <span className="sr-only">Share</span>
                </button>
                <span className="flex flex-col items-end gap-1">
                  <span
                    className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-black text-white/55"
                    style={busyness.level ? { borderColor: `${busyness.color}59`, backgroundColor: `${busyness.color}26`, color: busyness.color } : undefined}
                  >
                    {busynessLabel(signal?.busyness0To100)}
                  </span>
                  <BusynessBadge source={busynessSource} />
                </span>
                {copied ? (
                  <span role="status" className="absolute right-0 top-full mt-2 whitespace-nowrap rounded-md border border-white/15 bg-[#0A0A0E] px-2 py-1 text-xs font-bold text-white/70 shadow-lg">
                    Link copied!
                  </span>
                ) : null}
              </div>
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
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-full bg-[#8B6CFF] px-4 text-sm font-black text-[#0A0A0E] shadow-[0_0_20px_rgba(139,108,255,0.35)] transition-colors hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
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

function ShareIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx={18} cy={5} r={3} />
      <circle cx={6} cy={12} r={3} />
      <circle cx={18} cy={19} r={3} />
      <line x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
      <line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
    </svg>
  );
}

export default VenueBottomSheet;
