"use client";

// ============================================================
// Profile Page  /profile
//
// Placeholder UI for:
//   - Saved Spots   (will be backed by Supabase saved_spots table)
//   - Past Vibe Checks (will be backed by Supabase check_ins table)
//
// Supabase auth wiring is deferred to a future sprint.
// ============================================================

import Link from "next/link";
import type { SavedSpot, CheckIn } from "@/types";

// --------------- Placeholder data (empty for now) ----------

const savedSpots: SavedSpot[] = [];
const pastVibeChecks: CheckIn[] = [];

// --------------- Section header ----------------------------

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-white font-semibold text-base">{title}</h2>
      {count > 0 && (
        <span className="text-white/40 text-xs font-medium">{count}</span>
      )}
    </div>
  );
}

// --------------- Empty state card --------------------------

interface EmptyStateCardProps {
  icon: string;
  message: string;
  cta?: { label: string; href: string };
}

function EmptyStateCard({ icon, message, cta }: EmptyStateCardProps) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/[0.08] p-8 flex flex-col items-center gap-3 text-center">
      <span className="text-3xl" aria-hidden="true">{icon}</span>
      <p className="text-white/40 text-sm max-w-xs">{message}</p>
      {cta && (
        <Link
          href={cta.href}
          className="
            mt-1 px-4 py-2 rounded-xl text-xs font-semibold text-white
            bg-gradient-to-r from-purple-600 to-pink-600
            hover:from-purple-500 hover:to-pink-500
            focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400
            transition-all duration-150
          "
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}

// --------------- Saved spot row ----------------------------

function SavedSpotRow({ spot }: { spot: SavedSpot }) {
  return (
    <Link
      href={`/venues/${spot.venueId}`}
      className="
        flex items-center gap-3 px-4 py-3.5
        rounded-2xl bg-white/5 border border-white/10
        hover:bg-white/[0.07] hover:border-white/20
        transition-all duration-150
      "
    >
      {/* Score snapshot pill */}
      <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center">
        {spot.vibeScoreSnapshot != null ? (
          <span className="text-cyan-400 text-xs font-bold tabular-nums">
            {spot.vibeScoreSnapshot.toFixed(1)}
          </span>
        ) : (
          <span className="text-white/25 text-xs">?</span>
        )}
      </div>

      {/* Name + address */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-sm truncate">{spot.venueName}</p>
        <p className="text-white/35 text-xs truncate">{spot.address}</p>
      </div>

      {/* Chevron */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-white/25 flex-shrink-0"
        aria-hidden="true"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}

// --------------- Past check-in row -------------------------

function CheckInRow({ checkIn }: { checkIn: CheckIn }) {
  const date = new Date(checkIn.checkedInAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <Link
      href={`/venues/${checkIn.venueId}`}
      className="
        flex items-center gap-3 px-4 py-3.5
        rounded-2xl bg-white/5 border border-white/10
        hover:bg-white/[0.07] hover:border-white/20
        transition-all duration-150
      "
    >
      {/* Date badge */}
      <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0 flex flex-col items-center justify-center leading-none gap-0.5">
        <span className="text-white/50 text-[9px] uppercase tracking-wide">
          {date.split(" ")[0]}
        </span>
        <span className="text-white text-xs font-bold">{date.split(" ")[1]}</span>
      </div>

      {/* Venue name + note */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-sm truncate">{checkIn.venueName}</p>
        {checkIn.note && (
          <p className="text-white/35 text-xs truncate">{checkIn.note}</p>
        )}
      </div>

      {/* Chevron */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-white/25 flex-shrink-0"
        aria-hidden="true"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}

// --------------- Auth placeholder banner -------------------

function AuthBanner() {
  return (
    <div className="rounded-2xl bg-[#1E1E2E] border border-white/10 p-5 flex items-center gap-4">
      {/* Avatar placeholder */}
      <div className="w-14 h-14 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={24}
          height={24}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white/30"
          aria-hidden="true"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx={12} cy={7} r={4} />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm">Sign in to save spots</p>
        <p className="text-white/40 text-xs mt-0.5">
          Your vibe history syncs across devices once you sign in.
        </p>
      </div>

      {/* TODO: wire Supabase auth — for now this is a placeholder */}
      <button
        disabled
        aria-label="Sign in (coming soon)"
        title="Auth coming soon"
        className="
          flex-shrink-0 px-4 py-2 rounded-xl text-xs font-semibold
          text-white/50 bg-white/10 border border-white/10
          cursor-not-allowed opacity-60
        "
      >
        Sign in
      </button>
    </div>
  );
}

// --------------- Main page component -----------------------

export default function ProfilePage() {
  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0A0A0F]/90 backdrop-blur-xl border-b border-white/10 px-4">
        <div className="max-w-lg mx-auto py-4">
          <h1 className="text-white font-bold text-xl">Profile</h1>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-8">

        {/* Auth / identity placeholder */}
        <AuthBanner />

        {/* ---- Saved Spots section ---- */}
        <section aria-label="Saved spots">
          <SectionHeader title="Saved Spots" count={savedSpots.length} />

          {savedSpots.length === 0 ? (
            <EmptyStateCard
              icon="🔖"
              message="Spots you save will appear here. Browse venues and tap the bookmark icon to save."
              cta={{ label: "Explore Venues", href: "/" }}
            />
          ) : (
            <ul className="space-y-2 list-none">
              {savedSpots.map((spot) => (
                <li key={spot.id}>
                  <SavedSpotRow spot={spot} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- Past Vibe Checks section ---- */}
        <section aria-label="Past vibe checks">
          <SectionHeader title="Past Vibe Checks" count={pastVibeChecks.length} />

          {pastVibeChecks.length === 0 ? (
            <EmptyStateCard
              icon="🎛️"
              message="Vibe checks you run will be saved here so you can revisit past reports."
              cta={{ label: "Check a Vibe", href: "/vibe-check" }}
            />
          ) : (
            <ul className="space-y-2 list-none">
              {pastVibeChecks.map((ci) => (
                <li key={ci.id}>
                  <CheckInRow checkIn={ci} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Bottom spacer for nav clearance */}
        <div className="h-4" aria-hidden="true" />
      </div>
    </div>
  );
}
