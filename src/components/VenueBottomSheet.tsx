"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useOnboardingGate } from "@/components/OnboardingGate";
import { SaveVenueButton } from "@/components/SaveVenueButton";
import { ShareButton } from "@/components/ShareButton";
import { SignalFreshnessLabel } from "@/components/SignalFreshnessLabel";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { getBusynessState } from "@/lib/busyness";
import { VENUE_PHOTO_BLUR_DATA_URL } from "@/lib/imagePlaceholders";
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

function SourceBadge({ source }: { source: ConsumerVenue["signal"] }) {
  if (source?.busynessSource === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.85)]" aria-hidden="true" />
        Live
      </span>
    );
  }

  if (source?.busynessSource === "forecast") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11.5px] font-semibold text-[#9CA2AE]">
        <Clock aria-hidden="true" className="h-3 w-3" />
        forecast
      </span>
    );
  }

  return null;
}

function BusynessMeter({ value }: { value: number | null | undefined }) {
  const state = getBusynessState(value);
  const percent = value == null ? 0 : clampPercent(value);
  const label = busynessLabel(value);

  return (
    <section className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.045] p-3" aria-label="Busyness">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11.5px] font-semibold text-[#9CA2AE]">Busyness</p>
          <p className="mt-1 text-[19px] font-semibold text-[#F4F5F8]">{label}</p>
        </div>
        <p className="text-sm font-semibold" style={{ color: state.level ? state.color : "#9CA2AE" }}>
          {value == null ? "--" : percent}
          <span className="text-xs text-white/35">/100</span>
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
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

function MFRatioBar({ venue }: { venue: ConsumerVenue }) {
  const signal = venue.signal;
  if (signal?.mfRatio == null || signal.confidence0To1 <= 0.3) {
    return null;
  }

  const malePercent = clampPercent(signal.mfRatio);
  const femalePercent = 100 - malePercent;

  return (
    <div className="mt-3" aria-label={`${malePercent}% male, ${femalePercent}% female from ${signal.sampleSize} reports`}>
      <p className="mb-2 text-sm font-semibold">
        <span style={{ color: "#4F9DFF" }}>~{malePercent}% M</span>
        <span className="text-white/35"> / </span>
        <span style={{ color: "#F0568C" }}>~{femalePercent}% F</span>
      </p>
      <div className="flex h-1 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
        <div className="h-full bg-[#4F9DFF]" style={{ width: `${malePercent}%` }} />
        <div className="h-full bg-[#F0568C]" style={{ width: `${femalePercent}%` }} />
      </div>
      <p className="mt-1 text-xs font-semibold text-white/45">{signal.sampleSize} live reads</p>
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
        className="fixed inset-0 z-[1190] cursor-default bg-black/35"
        onClick={onClose}
      />

      <aside
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 z-[1200] max-h-[72vh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#0A0A0E] shadow-[0_-20px_60px_rgba(0,0,0,0.5)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Loading venue details"
        tabIndex={-1}
      >
        <div role="status" className="sr-only">Loading venue details</div>
        <div className="mx-auto w-full max-w-lg px-4 pb-4">
          <div className="mx-auto flex h-9 w-20 items-center justify-center">
            <div className="h-1 w-10 rounded bg-white/20" />
          </div>
          <div className="h-28 w-full animate-pulse rounded-xl bg-white/[0.06]" />
          <div className="mt-4 space-y-3">
            <div className="h-6 w-48 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-4 w-64 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-24 animate-pulse rounded-2xl bg-white/[0.06]" />
            <div className="h-10 animate-pulse rounded-full bg-white/[0.06]" />
          </div>
        </div>
      </aside>
    </>
  );
}

export function VenueBottomSheet({ loading = false, venue, onClose }: VenueBottomSheetProps) {
  const router = useRouter();
  const { requireAuth } = useOnboardingGate();
  const sheetRef = useRef<HTMLElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const [dragDelta, setDragDelta] = useState(0);
  const [photoLoading, setPhotoLoading] = useState(false);
  const photoUrl = venue?.photoUrls?.[0] ?? venue?.photoUrl;

  useEffect(() => {
    setPhotoLoading(Boolean(photoUrl));
  }, [photoUrl]);

  useFocusTrap(Boolean(loading || venue), sheetRef, onClose);

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

  async function handleReportClick() {
    if (!venue) return;

    const canContinue = await requireAuth({
      id: `check-in:${venue.id}`,
      label: `Sign in to report the vibe at ${venue.name}.`,
      returnTo: reportHref,
      onAuthenticated: () => router.push(reportHref),
    });

    if (canContinue) router.push(reportHref);
  }

  if (loading) return <VenueBottomSheetSkeleton onClose={onClose} sheetRef={sheetRef} />;
  if (!venue) return null;

  const signal = venue.signal;
  const reportParams = new URLSearchParams({
    venue: venue.id,
    venueId: venue.id,
    venueName: venue.name,
  });
  const reportHref = `/vibe-check?${reportParams.toString()}`;

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
        className={`fixed bottom-0 left-0 right-0 z-[1200] max-h-[72vh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#0A0A0E] shadow-[0_-20px_60px_rgba(0,0,0,0.5)] ${
          dragDelta > 0 ? "" : "transition-transform duration-200"
        }`}
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          transform: dragDelta > 0 ? `translateY(${dragDelta}px)` : undefined,
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`${venue.name} details`}
        tabIndex={-1}
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

          {photoUrl ? (
            <div className="relative h-28 w-full overflow-hidden rounded-xl bg-white/[0.06]">
              {photoLoading && (
                <div className="absolute inset-0 z-10 animate-pulse bg-white/[0.06]" aria-hidden="true" />
              )}
              <Image
                src={photoUrl}
                alt={`${venue.name} venue`}
                fill
                sizes="(max-width: 640px) 100vw, 400px"
                loading="lazy"
                placeholder="blur"
                blurDataURL={VENUE_PHOTO_BLUR_DATA_URL}
                className="object-cover"
                onLoad={() => setPhotoLoading(false)}
                onError={() => setPhotoLoading(false)}
              />
            </div>
          ) : (
            <div className="flex h-28 w-full items-center justify-center rounded-xl bg-white/[0.06] text-4xl font-black text-white/35">
              {venue.name.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="mt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display truncate text-[19px] font-semibold text-[#F4F5F8]">{venue.name}</h2>
                <p className="mt-1 text-sm leading-snug text-white/50">
                  {venue.category}
                  {venue.address ? ` · ${venue.address}` : ""}
                </p>
              </div>
              <div className="relative flex shrink-0 items-center gap-2">
                <ShareButton
                  venue={venue}
                  className="[&_button]:h-9 [&_button]:w-9 [&_button]:border-white/15 [&_button]:bg-white/[0.06] [&_button]:text-white/70 [&_button:hover]:border-white/25 [&_button:hover]:bg-white/10 [&_button:hover]:text-white"
                />
                <span className="flex flex-col items-end gap-1">
                  <SourceBadge source={signal} />
                </span>
              </div>
            </div>

            <SignalFreshnessLabel signal={signal} className="mt-2" />

            <BusynessMeter value={signal?.busyness0To100} />

            <MFRatioBar venue={venue} />

            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.045] px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#F4F5F8]">Save this venue</p>
                <p className="mt-0.5 text-xs font-semibold text-white/42">Keep it handy on your profile</p>
              </div>
              <SaveVenueButton venueId={venue.id} venueName={venue.name} />
            </div>

            <div className="mt-3 flex gap-2">
              <Link
                href={`/venues/${encodeURIComponent(venue.id)}`}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-full border border-white/15 px-4 text-sm font-semibold text-[#F4F5F8] transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
              >
                View details
              </Link>
              <button
                type="button"
                onClick={handleReportClick}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-full bg-[#8B6CFF] px-4 text-sm font-semibold text-[#0A0A0E] shadow-[0_0_20px_rgba(139,108,255,0.35)] transition-colors hover:bg-[#8B6CFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
              >
                Report the vibe
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

export default VenueBottomSheet;
