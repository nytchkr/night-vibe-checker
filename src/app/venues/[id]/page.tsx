"use client";

// ============================================================
// Venue Detail Page  /venues/[id]  (NV-008)
//
// - Back button (← arrow) at top
// - Venue name as large heading
// - VibeScoreRing (80px) with cached score or grey placeholder
// - VibeTagBadge row for tags
// - Info section: type, address, rating, price level
// - "Check Vibe" primary button → /vibe-check?venueId=&venueName=
// - "Past vibes" section with empty state
// - Full dark theme Tailwind styling
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { VibeScoreRing } from "@/components/VibeScoreRing";
import { VibeTagBadge } from "@/components/VibeTagBadge";
import type { VenueBasic } from "@/types";

// --------------- Back button --------------------------------

function BackButton() {
  return (
    <Link
      href="/"
      aria-label="Back to home"
      className="
        inline-flex items-center gap-1.5
        text-white/50 hover:text-white
        text-sm transition-colors duration-150
        focus:outline-none focus-visible:text-white
      "
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Back
    </Link>
  );
}

// --------------- Score ring (80px) or grey placeholder ------

function VenueScoreRing({ score }: { score?: number }) {
  if (score != null) {
    return <VibeScoreRing score={score} size={80} strokeWidth={7} />;
  }
  return (
    <div
      className="w-20 h-20 rounded-full bg-white/[0.07] border border-white/15
                 flex flex-col items-center justify-center flex-shrink-0"
      aria-label="No vibe score yet"
    >
      <span className="text-white/25 text-xl font-bold">?</span>
      <span className="text-white/20 text-[9px] uppercase tracking-widest mt-0.5">vibe</span>
    </div>
  );
}

// --------------- Info row item ------------------------------

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/[0.07] last:border-0">
      <span className="text-white/35 mt-0.5 flex-shrink-0" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-white/40 text-xs uppercase tracking-wider font-medium mb-0.5">
          {label}
        </p>
        <p className="text-white/80 text-sm leading-snug">{value}</p>
      </div>
    </div>
  );
}

// --------------- Price level text --------------------------

function priceLevelText(level?: number): string {
  if (!level) return "—";
  const labels: Record<number, string> = {
    1: "$ · Inexpensive",
    2: "$$ · Moderate",
    3: "$$$ · Expensive",
    4: "$$$$ · Very Expensive",
  };
  return labels[level] ?? "—";
}

// --------------- Venue type label --------------------------

function venueTypeLabel(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// --------------- Skeleton components -----------------------

function HeaderSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading venue"
      className="rounded-3xl bg-[#141420] border border-white/10 p-5 animate-pulse"
    >
      <div className="flex items-center gap-4 mb-4">
        <div className="w-20 h-20 rounded-full bg-white/10 flex-shrink-0" />
        <div className="flex-1 space-y-3">
          <div className="h-5 bg-white/10 rounded-md w-2/3" />
          <div className="h-3 bg-white/10 rounded-md w-1/2" />
          <div className="flex gap-2">
            <div className="h-5 bg-white/10 rounded-full w-16" />
            <div className="h-5 bg-white/10 rounded-full w-14" />
          </div>
        </div>
      </div>
      <div className="h-3 bg-white/10 rounded-md w-full mb-2" />
      <div className="h-3 bg-white/10 rounded-md w-4/5" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function InfoSectionSkeleton() {
  return (
    <div className="rounded-3xl bg-[#141420] border border-white/10 p-5 animate-pulse space-y-4">
      {[70, 55, 65, 48].map((w, i) => (
        <div
          key={i}
          className="h-3 bg-white/10 rounded-md"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}

function CTASkeleton() {
  return (
    <div className="h-12 rounded-2xl bg-white/10 animate-pulse" aria-hidden="true" />
  );
}

// --------------- Main page component -----------------------

export default function VenueDetailPage() {
  const params = useParams<{ id: string }>();
  const venueId = params.id;

  const [venue, setVenue] = useState<VenueBasic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!venueId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetchVenue() {
      try {
        const res = await fetch(`/api/venues/${venueId}`);
        if (!res.ok) {
          throw new Error(`Venue not found (${res.status})`);
        }
        const json = await res.json();
        const data: VenueBasic = json.data?.venue ?? json.data ?? json;
        if (!cancelled) setVenue(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load venue details."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchVenue();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  const displayName = venue?.name ?? "Venue";

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 bg-[#0A0A0F]/90 backdrop-blur-xl border-b border-white/10 px-4">
        <div className="max-w-lg mx-auto py-4 flex items-center gap-3">
          <BackButton />
          {!loading && venue && (
            <h2 className="text-white/60 font-medium text-sm leading-none truncate">
              {displayName}
            </h2>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4 pb-10">

        {/* ---- Error state ---- */}
        {error && (
          <div
            role="alert"
            className="rounded-2xl bg-rose-950/60 border border-rose-500/40 p-5 text-center space-y-2"
          >
            <p className="text-rose-300 font-medium">Could not load venue</p>
            <p className="text-rose-400/70 text-sm">{error}</p>
            <Link href="/" className="text-rose-200 underline text-sm hover:text-white">
              Back to feed
            </Link>
          </div>
        )}

        {/* ---- Loading skeletons ---- */}
        {loading && !error && (
          <>
            <HeaderSkeleton />
            <InfoSectionSkeleton />
            <CTASkeleton />
          </>
        )}

        {/* ---- Loaded content ---- */}
        {!loading && !error && venue && (
          <>
            {/* Hero card: score ring + name + type badge row */}
            <div className="rounded-3xl bg-[#141420] border border-white/10 p-5">
              <div className="flex items-start gap-4 mb-4">
                {/* Score ring */}
                <VenueScoreRing score={venue.cachedVibeScore} />

                {/* Name + meta */}
                <div className="flex-1 min-w-0 pt-1">
                  <h1 className="text-white font-extrabold text-xl leading-tight mb-1">
                    {venue.name}
                  </h1>
                  <p className="text-white/40 text-xs truncate mb-2">{venue.address}</p>

                  {/* Rating + price row */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {venue.googleRating != null && (
                      <span
                        className="text-amber-400 text-xs font-semibold"
                        aria-label={`${venue.googleRating} star rating`}
                      >
                        ★ {venue.googleRating.toFixed(1)}
                        {venue.totalRatings != null && (
                          <span className="text-white/30 font-normal ml-1">
                            ({venue.totalRatings.toLocaleString()})
                          </span>
                        )}
                      </span>
                    )}
                    {venue.priceLevel != null && (
                      <span
                        className="text-white/40 text-xs"
                        aria-label={`Price level ${venue.priceLevel} of 4`}
                      >
                        {"$".repeat(venue.priceLevel)}
                        <span className="opacity-30">
                          {"$".repeat(4 - venue.priceLevel)}
                        </span>
                      </span>
                    )}
                    <span className="text-white/30 text-xs capitalize">
                      {venueTypeLabel(venue.type)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Score availability note */}
              {venue.cachedVibeScore == null && (
                <p className="text-white/30 text-xs italic border-t border-white/[0.06] pt-3 mt-1">
                  No vibe score yet — be the first to check it!
                </p>
              )}
            </div>

            {/* Tag badges (placeholder tags based on type) */}
            {(() => {
              // Derive placeholder tags from venue type when no VibeReport tags exist.
              // In production these would come from the cached VibeReport.
              const placeholderTags = derivePlaceholderTags(venue);
              if (placeholderTags.length === 0) return null;
              return (
                <div aria-label="Vibe tags">
                  <h2 className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-2 px-1">
                    Vibe Tags
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {placeholderTags.map((tag) => (
                      <VibeTagBadge key={tag} tag={tag} variant="primary" />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Info section */}
            <div className="rounded-3xl bg-[#141420] border border-white/10 px-5 py-2">
              <InfoRow
                icon={<VenueTypeIcon />}
                label="Type"
                value={venueTypeLabel(venue.type)}
              />
              <InfoRow
                icon={<LocationIcon />}
                label="Address"
                value={venue.address}
              />
              {venue.googleRating != null && (
                <InfoRow
                  icon={<StarIcon />}
                  label="Google Rating"
                  value={`${venue.googleRating.toFixed(1)} / 5.0${
                    venue.totalRatings != null
                      ? ` · ${venue.totalRatings.toLocaleString()} reviews`
                      : ""
                  }`}
                />
              )}
              <InfoRow
                icon={<PriceIcon />}
                label="Price Level"
                value={priceLevelText(venue.priceLevel)}
              />
            </div>

            {/* Check Vibe primary CTA */}
            <Link
              href={`/vibe-check?venueId=${venueId}&venueName=${encodeURIComponent(displayName)}`}
              className="
                block w-full py-3.5 rounded-2xl text-center
                text-sm font-bold text-[#0A0A0F]
                bg-[#00F5D4] hover:bg-[#00dfc0]
                shadow-[0_0_20px_rgba(0,245,212,0.35)]
                hover:shadow-[0_0_28px_rgba(0,245,212,0.5)]
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70
                transition-all duration-150 active:scale-[0.98]
              "
            >
              Check Vibe Tonight
            </Link>

            {/* Past vibes section — empty state */}
            <section aria-label="Past vibe reports">
              <h2 className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-3 px-1">
                Past Vibes
              </h2>
              <div className="rounded-3xl bg-[#141420] border border-white/10 p-8 flex flex-col items-center text-center gap-3">
                <span className="text-3xl" aria-hidden="true">📋</span>
                <p className="text-white/50 font-semibold text-sm">No past vibes yet</p>
                <p className="text-white/30 text-xs max-w-xs">
                  Once someone checks the vibe here, reports will appear in this section.
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// --------------- Placeholder tag deriver --------------------
// Generates sensible placeholder tags from the venue type so
// the badge row always has something to show without a VibeReport.

function derivePlaceholderTags(venue: VenueBasic): string[] {
  const type = venue.type.toLowerCase();
  if (type.includes("night_club") || type.includes("nightclub") || type.includes("club")) {
    return ["Lively", "EDM", "Young Crowd", "Cover Charge"];
  }
  if (type.includes("bar")) {
    return ["Chill", "Craft Beer", "Locals Hangout", "Easy Entry"];
  }
  if (type.includes("restaurant")) {
    return ["Great Cocktails", "Good for Dates", "Classy"];
  }
  if (type.includes("live_music") || type.includes("music")) {
    return ["Live Music", "Mixed Crowd", "Lively"];
  }
  return ["Mixed Crowd", "Chill"];
}

// --------------- Inline SVG icons ---------------------------

function VenueTypeIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
      <circle cx={12} cy={10} r={3} />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function PriceIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1={12} y1={1} x2={12} y2={23} />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  );
}
