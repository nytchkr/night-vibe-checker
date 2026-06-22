"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, Bookmark, ChevronRight, Info, Lock, LogOut, MapPin, Pencil, Trash2, UsersRound } from "lucide-react";
import type { Session, User } from "@supabase/supabase-js";
import { PageTransition } from "@/components/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { APIResponse, ConsumerVenue, CrowdFeel, ReportedBusyness } from "@/types";

type CheckInItem = {
  id: string;
  venueId: string;
  venueName: string;
  busyness: ReportedBusyness | null;
  crowdFeel: CrowdFeel | null;
  note: string | null;
  createdAt: string;
};

type ProfileCheckInRecord = {
  id: string;
  venue_id: string | null;
  venue_name: string | null;
  busyness: ReportedBusyness | null;
  crowd_feel: CrowdFeel | null;
  note: string | null;
  created_at: string;
};

type SavedVenueIdsResponse = APIResponse<{ savedVenueIds: string[] }> & {
  place_ids?: string[];
  venueIds?: string[];
  savedVenueIds?: string[];
  savedVenues?: SavedVenueItem[];
  data?: {
    savedVenueIds?: string[];
    savedVenues?: SavedVenueItem[];
  };
};

type ProfileStreakResponse = {
  currentStreak: number;
  longestStreak: number;
  totalCheckIns: number;
};

type SavedVenueItem = {
  venueId: string;
  placeId: string | null;
  alertThreshold: number;
  createdAt: string | null;
  currentBusyness: number | null;
  venue: ConsumerVenue | null;
};

const SAVED_VENUES_EVENT = "nightvibe:saved-venues-changed";
const LOCAL_TEST_SESSION_KEYS = [
  "sb-gfsbqewkrcyclbktfyfk-auth-token",
  "sb-onlpwglwnqoivuykywrk-auth-token",
] as const;

function getVenueName(row: ProfileCheckInRecord): string {
  return row.venue_name ?? row.venue_id ?? "Unknown venue";
}

function formatBusyness(value: ReportedBusyness): string {
  if (value === "dead") return "Dead";
  if (value === "moderate") return "Moderate";
  return "Packed";
}

function formatCrowdFeel(value: CrowdFeel): string {
  if (value === "mostly_male") return "More guys";
  if (value === "mostly_female") return "More women";
  if (value === "balanced") return "Balanced";
  return "Mixed";
}

function getBusynessChipClass(value: ReportedBusyness): string {
  if (value === "dead") return "bg-white/[0.08] text-[#D1D5DB] ring-white/[0.12]";
  if (value === "moderate") return "bg-yellow-400/15 text-yellow-200 ring-yellow-300/20";
  return "bg-red-500/15 text-red-200 ring-red-400/25";
}

function getBusynessPercentChipClass(value: number | null): string {
  if (value == null) return "bg-white/[0.08] text-[#9CA2AE] ring-white/[0.12]";
  if (value >= 70) return "bg-red-500/15 text-red-200 ring-red-400/25";
  if (value >= 40) return "bg-yellow-400/15 text-yellow-200 ring-yellow-300/20";
  return "bg-emerald-400/15 text-emerald-200 ring-emerald-300/20";
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60 * 1000) return "Just now";

  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w ago`;

  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function getUserEmail(user: User | undefined): string {
  return user?.email ?? "Signed in";
}

function getEmailPrefix(email: string): string {
  return email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || email;
}

function getUserDisplayName(user: User | undefined): string {
  const displayName = user?.user_metadata?.display_name;
  if (typeof displayName === "string" && displayName.trim()) return displayName.trim();
  return getEmailPrefix(getUserEmail(user));
}

function getUserInitials(displayName: string, email: string): string {
  const name = displayName.trim() || getEmailPrefix(email);
  const initials = name
    ? name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("")
    : email.charAt(0).toUpperCase();

  return initials || "Y";
}

function readLocalTestSession(): Session | null {
  if (typeof window === "undefined") return null;
  if (process.env.NODE_ENV === "production") return null;
  if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return null;

  for (const key of LOCAL_TEST_SESSION_KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<Session>;
      if (parsed.access_token && parsed.user?.email) return parsed as Session;
    } catch {
      // Ignore malformed local test session data.
    }
  }

  return null;
}

function clearLocalTestSession() {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return;

  for (const key of LOCAL_TEST_SESSION_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures; Supabase signOut still clears its cookie session.
    }
  }

  const authCookieNames = new Set<string>(LOCAL_TEST_SESSION_KEYS);
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (name?.startsWith("sb-") && name.endsWith("-auth-token")) authCookieNames.add(name);
  }

  for (const name of authCookieNames) {
    document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    document.cookie = `${name}=; path=/; domain=${window.location.hostname}; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading profile">
      <Skeleton className="h-28 rounded-[18px] bg-white/10" />
      <Skeleton className="h-20 rounded-[18px] bg-white/10" />
      <Skeleton className="h-44 rounded-[18px] bg-white/10" />
    </div>
  );
}

function LoggedOutState() {
  return (
    <section className="flex min-h-[calc(100vh-13rem)] flex-col justify-between py-6 text-center" aria-label="Sign in">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center">
        <p className="font-display text-[34px] font-semibold tracking-normal text-white">
          nyt<span className="text-[#8B6CFF]">chkr</span>
        </p>
        <h2 className="mt-6 font-display text-2xl font-semibold leading-tight tracking-normal text-[#F4F5F8]">
          Know before you go.
        </h2>
        <p className="mt-3 text-[15px] font-medium leading-6 text-[#9CA2AE]">
          Check in to venues · see the M/F vibe · save your spots
        </p>
        <p className="mt-4 text-[13px] font-medium text-[#9CA2AE]">
          Join Charlotte nightlife scouts
        </p>

        <a
          href="/api/auth/google?return=/profile"
          className="mt-8 flex min-h-12 w-full items-center justify-center rounded-[14px] bg-white/[0.07] px-5 text-[15px] font-semibold text-[#F4F5F8] transition-colors hover:bg-white/[0.1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
        >
          Continue with Google
        </a>
        <Link
          href="/login?return=/profile"
          className="mt-4 text-[13px] font-medium text-[#9CA2AE] underline-offset-4 transition-colors hover:text-white hover:underline"
        >
          Or sign in with email
        </Link>
      </div>

      <p className="px-4 pb-2 text-[12px] font-medium text-[#9CA2AE]">
        Guest view — sign in to check in and save venues
      </p>
    </section>
  );
}

function WelcomeBanner({ displayName }: { displayName: string }) {
  return (
    <section className="rounded-2xl border border-[#8B6CFF]/30 bg-[#8B6CFF]/10 p-5" aria-label="Welcome">
      <h2 className="text-xl font-bold text-white">Hey, {displayName}</h2>
      <p className="mt-2 text-sm leading-6 text-white/60">
        Find a spot on the map, tap it, and report the vibe. Your check-ins show up here.
      </p>
      <Link
        href="/map"
        className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-[#8B6CFF] px-6 py-3 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#9B82FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
      >
        Explore the map
      </Link>
    </section>
  );
}

function VibeCTA() {
  return (
    <section
      className="flex items-center justify-between gap-4 rounded-[18px] border border-[#8B6CFF]/25 bg-[#8B6CFF]/[0.08] p-4"
      aria-label="Drop a vibe check"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#8B6CFF] shadow-[0_0_12px_rgba(139,108,255,0.55)]"
          aria-hidden="true"
        />
        <p className="min-w-0 text-[14px] font-semibold text-[#F4F5F8]">
          South End is live right now
        </p>
      </div>
      <Link
        href="/map"
        className="shrink-0 rounded-full bg-[#8B6CFF] px-4 py-2 text-[13px] font-black text-[#0A0A0E] transition-colors hover:bg-[#9B82FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
      >
        Check in →
      </Link>
    </section>
  );
}

function AccountHeader({
  email,
  displayName,
  onDisplayNameSave,
  onSignOut,
}: {
  email: string;
  displayName: string;
  onDisplayNameSave: (value: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(displayName);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isEditing) setDraftName(displayName);
  }, [displayName, isEditing]);

  async function handleSave() {
    const nextName = draftName.trim();
    if (!nextName) {
      setError("Enter a display name.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await onDisplayNameSave(nextName);
      setIsEditing(false);
    } catch {
      setError("Could not save your display name.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      id="profile-section"
      className="scroll-mt-24 rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-4"
      aria-label="Account"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#8B6CFF] font-display text-lg font-semibold text-white ring-1 ring-[#8B6CFF]/40">
          {getUserInitials(displayName, email)}
        </div>
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="space-y-2">
              <div className="flex min-w-0 items-center gap-2">
                <input
                  type="text"
                  value={draftName}
                  onChange={(event) => {
                    setDraftName(event.target.value);
                    if (error) setError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleSave();
                    if (event.key === "Escape") {
                      setDraftName(displayName);
                      setError("");
                      setIsEditing(false);
                    }
                  }}
                  disabled={isSaving}
                  aria-label="Display name"
                  className="min-h-10 min-w-0 flex-1 rounded-[12px] border border-white/[0.12] bg-[#0A0A0E] px-3 text-[15px] font-semibold text-[#F4F5F8] outline-none transition-colors placeholder:text-[#9CA2AE] focus:border-[#8B6CFF] focus:ring-2 focus:ring-[#8B6CFF]/25 disabled:cursor-not-allowed disabled:opacity-70"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                  className="min-h-10 shrink-0 rounded-full bg-[#8B6CFF] px-4 text-[13px] font-black text-[#0A0A0E] transition-colors hover:bg-[#9B82FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? "Saving" : "Save"}
                </button>
              </div>
              {error && <p className="text-[12px] font-medium text-[#F0568C]">{error}</p>}
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-[15px] font-semibold text-[#F4F5F8]">{displayName}</p>
              <button
                type="button"
                onClick={() => {
                  setDraftName(displayName);
                  setError("");
                  setIsEditing(true);
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#9CA2AE] transition-colors hover:bg-white/[0.06] hover:text-[#F4F5F8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
                aria-label="Edit display name"
              >
                <Pencil size={15} strokeWidth={2.3} aria-hidden="true" />
              </button>
            </div>
          )}
          <p className="mt-1 truncate text-[13px] font-medium text-[#9CA2AE]">{email}</p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="shrink-0 rounded-full px-2 py-2 text-[13px] font-medium text-[#9CA2AE] transition-colors hover:text-[#F4F5F8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
        >
          Sign out
        </button>
      </div>
    </section>
  );
}

function StatsRow({
  totalCheckIns,
  savedCount,
  currentStreak,
  longestStreak,
}: {
  totalCheckIns: number;
  savedCount: number;
  currentStreak: number;
  longestStreak: number;
}) {
  const stats = [
    { label: "Check-ins", value: totalCheckIns.toLocaleString() },
    { label: "Saved", value: savedCount.toLocaleString() },
    { label: "Streak", value: currentStreak.toLocaleString() },
    { label: "Best", value: longestStreak.toLocaleString() },
  ];

  return (
    <section
      className="grid grid-cols-2 overflow-hidden rounded-[18px] border border-white/[0.08] bg-white/[0.035]"
      aria-label="You stats"
    >
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={`min-w-0 px-3 py-4 text-center ${index % 2 === 1 ? "border-l border-white/[0.08]" : ""} ${
            index >= 2 ? "border-t border-white/[0.08]" : ""
          }`}
        >
          <p className="truncate font-display text-[19px] font-semibold leading-tight text-[#F4F5F8]">
            {stat.value}
          </p>
          <p className="mt-1 truncate text-[11.5px] font-medium text-[#9CA2AE]">{stat.label}</p>
        </div>
      ))}
    </section>
  );
}

function CheckInCard({ item }: { item: CheckInItem }) {
  const cardContent = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-[15px] font-bold text-[#F4F5F8]">{item.venueName}</p>
        <time
          className="shrink-0 text-right text-[12px] font-medium text-[#9CA2AE]"
          dateTime={item.createdAt}
        >
          {formatRelativeTime(item.createdAt)}
        </time>
      </div>

      {item.busyness && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ${getBusynessChipClass(item.busyness)}`}
          >
            {formatBusyness(item.busyness)}
          </span>
        </div>
      )}

      {item.crowdFeel && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-[#9CA2AE]">
          {item.crowdFeel === "balanced" && (
            <UsersRound className="h-3.5 w-3.5 text-[#8B6CFF]" strokeWidth={2.3} aria-hidden="true" />
          )}
          <span>{formatCrowdFeel(item.crowdFeel)}</span>
        </p>
      )}

      {item.note && (
        <p className="mt-2 text-[13px] font-medium italic leading-5 text-[#D6DAE2]">{item.note}</p>
      )}
    </>
  );

  const cardClassName =
    "block rounded-[14px] border border-white/10 bg-white/5 p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60";

  if (!item.venueId) {
    return <div className={cardClassName}>{cardContent}</div>;
  }

  return (
    <Link
      href={`/venues/${encodeURIComponent(item.venueId)}`}
      className={`${cardClassName} hover:border-[#8B6CFF]/35 hover:bg-white/[0.07]`}
    >
      {cardContent}
    </Link>
  );
}

function CheckInsSection({
  checkIns,
  count,
  loading,
  error,
}: {
  checkIns: CheckInItem[];
  count: number;
  loading: boolean;
  error: string;
}) {
  const recentCheckIns = checkIns.slice(0, 5);

  return (
    <section className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-4" aria-label="Recent check-ins">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[19px] font-semibold text-[#F4F5F8]">Recent check-ins</h2>
          <p className="mt-1 text-[13px] font-medium text-[#9CA2AE]">
            {loading ? "Loading..." : `${count.toLocaleString()} total`}
          </p>
        </div>
        <span className="rounded-full border border-white/[0.08] px-3 py-1 text-[11.5px] font-medium text-[#9CA2AE]">
          Last 5
        </span>
      </div>

      {loading && (
        <div className="mt-5 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-[14px] bg-white/10" />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="mt-5 rounded-[14px] border border-[#F0568C]/25 bg-[#F0568C]/10 p-4 text-[13px] font-medium text-[#F0568C]">
          {error}
        </p>
      )}

      {!loading && !error && recentCheckIns.length === 0 && (
        <div className="mt-5 rounded-[14px] border border-white/[0.08] bg-[#0A0A0E]/60 px-4 py-7 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#8B6CFF]/15 text-[#8B6CFF] ring-1 ring-[#8B6CFF]/25">
            <MapPin size={22} strokeWidth={2.4} aria-hidden="true" />
          </div>
          <p className="mt-4 text-[15px] font-semibold text-[#9CA2AE]">No check-ins yet. Head out and check one in!</p>
          <Link
            href="/map"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-[13px] font-semibold text-[#0A0A0E] transition-colors hover:bg-[#9B82FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
          >
            Find venues on the map
          </Link>
        </div>
      )}

      {!loading && !error && recentCheckIns.length > 0 && (
        <>
          <ul className="mt-5 space-y-3">
            {recentCheckIns.map((item) => (
              <li key={item.id}>
                <CheckInCard item={item} />
              </li>
            ))}
          </ul>
          <Link
            href="/profile/check-ins"
            className="mt-4 inline-flex min-h-11 items-center rounded-full px-1 text-[13px] font-semibold text-[#8B6CFF] transition-colors hover:text-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
          >
            See all {count.toLocaleString()} check-ins &rarr;
          </Link>
        </>
      )}
    </section>
  );
}

function SavedVenuesSection({
  savedVenues,
  loading,
  error,
  accessToken,
  onThresholdChange,
}: {
  savedVenues: SavedVenueItem[];
  loading: boolean;
  error: string;
  accessToken: string;
  onThresholdChange: (venueId: string, threshold: number) => void;
}) {
  const visibleSavedVenues = savedVenues.slice(0, 5);

  async function updateThreshold(item: SavedVenueItem, threshold: number) {
    onThresholdChange(item.venueId, threshold);
    await fetch(`/api/venues/${encodeURIComponent(item.venueId)}/save`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ alertThreshold: threshold }),
    }).catch(() => undefined);
  }

  return (
    <section className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-4" aria-label="Saved venues">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[19px] font-semibold text-[#F4F5F8]">Saved venues</h2>
          <p className="mt-1 text-[13px] font-medium text-[#9CA2AE]">
            {loading ? "Loading..." : `${savedVenues.length.toLocaleString()} saved`}
          </p>
        </div>
        <span className="rounded-full border border-white/[0.08] px-3 py-1 text-[11.5px] font-medium text-[#9CA2AE]">
          Last 5
        </span>
      </div>

      {loading && (
        <div className="mt-5 space-y-3">
          <Skeleton className="h-16 rounded-[14px] bg-white/10" />
        </div>
      )}

      {!loading && error && (
        <p className="mt-5 rounded-[14px] border border-[#F0568C]/25 bg-[#F0568C]/10 p-4 text-[13px] font-medium text-[#F0568C]">
          {error}
        </p>
      )}

      {!loading && !error && savedVenues.length === 0 && (
        <div className="mt-5 rounded-[14px] border border-white/[0.08] bg-[#0A0A0E]/60 px-4 py-7 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#8B6CFF]/15 text-[#8B6CFF] ring-1 ring-[#8B6CFF]/25">
            <Bookmark size={22} strokeWidth={2.4} aria-hidden="true" />
          </div>
          <p className="mt-4 text-[15px] font-semibold text-[#9CA2AE]">No saved spots yet</p>
          <p className="mx-auto mt-2 max-w-[240px] text-[13px] font-medium leading-6 text-[#9CA2AE]">
            Save venues you want to revisit
          </p>
          <Link
            href="/explore"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-[13px] font-semibold text-[#0A0A0E] transition-colors hover:bg-[#9B82FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
          >
            Browse South End venues
          </Link>
        </div>
      )}

      {!loading && !error && savedVenues.length > 0 && (
        <>
          <ul className="mt-5 divide-y divide-white/[0.08]">
            {visibleSavedVenues.map((item) => {
              const venue = item.venue;
              const venueName = venue?.name ?? item.venueId;
              const venueHref = `/venues/${encodeURIComponent(venue?.id ?? item.venueId)}`;
              const busynessLabel = item.currentBusyness == null ? "No live read" : `${Math.round(item.currentBusyness)}% busy`;

              return (
                <li key={item.venueId} className="py-3 first:pt-0 last:pb-0">
                  <Link
                    href={venueHref}
                    className="group flex items-center justify-between gap-3 rounded-[14px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-[#F4F5F8]">{venueName}</span>
                      <span className="mt-1 block truncate text-[12px] font-medium text-[#9CA2AE]">
                        {venue?.category ?? "Saved venue"}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ${getBusynessPercentChipClass(item.currentBusyness)}`}
                    >
                      {busynessLabel}
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-[#9CA2AE] transition-colors group-hover:text-[#F4F5F8]" aria-hidden="true" />
                  </Link>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-[11.5px] font-semibold text-[#9CA2AE]">Set Alert</span>
                    {[50, 70, 90].map((threshold) => (
                      <button
                        key={threshold}
                        type="button"
                        onClick={() => void updateThreshold(item, threshold)}
                        className={`min-h-8 rounded-full px-3 text-[12px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 ${
                          item.alertThreshold === threshold
                            ? "bg-[#8B6CFF] text-[#0A0A0E]"
                            : "border border-white/[0.08] bg-white/[0.04] text-[#D6DAE2] hover:bg-white/[0.08]"
                        }`}
                      >
                        {threshold}%
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <Link
            href="/profile/saved"
            className="mt-4 inline-flex min-h-11 items-center rounded-full px-1 text-[13px] font-semibold text-[#8B6CFF] transition-colors hover:text-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
          >
            See all {savedVenues.length.toLocaleString()} saved &rarr;
          </Link>
        </>
      )}
    </section>
  );
}

type PreferenceKey = "push_enabled" | "private_checkins";
type SavingPreference = PreferenceKey | null;

function PreferenceToggleRow({
  icon,
  label,
  subLabel,
  enabled,
  saving,
  onToggle,
}: {
  icon: ReactNode;
  label: string;
  subLabel: string;
  enabled: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex min-h-[72px] items-center justify-between gap-4 py-3">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.055] text-[#9CA2AE]">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium text-[#F4F5F8]">{label}</span>
          <span className="mt-0.5 block text-[12px] font-medium leading-4 text-[#9CA2AE]">{subLabel}</span>
          {saving && <span className="mt-1 block text-[11px] font-semibold text-[#8B6CFF]">Saving...</span>}
        </span>
      </span>
      <button
        type="button"
        aria-label={`${label} ${enabled ? "enabled" : "disabled"}`}
        aria-pressed={enabled}
        disabled={saving}
        onClick={onToggle}
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 disabled:cursor-wait disabled:opacity-70 ${
          enabled ? "border-[#8B6CFF]/70 bg-[#8B6CFF]" : "border-white/[0.08] bg-[#2E333D]"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function SettingsSection({
  session,
  onSignOut,
}: {
  session: Session;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const user = session.user;
  const [preferences, setPreferences] = useState({
    push_enabled: user.user_metadata?.push_enabled === true,
    private_checkins: user.user_metadata?.private_checkins === true,
  });
  const [savingPreference, setSavingPreference] = useState<SavingPreference>(null);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    setPreferences({
      push_enabled: user.user_metadata?.push_enabled === true,
      private_checkins: user.user_metadata?.private_checkins === true,
    });
  }, [user.id, user.user_metadata?.push_enabled, user.user_metadata?.private_checkins]);

  async function updatePreference(key: PreferenceKey, value: boolean) {
    setSavingPreference(key);
    setError("");

    const previousPreferences = preferences;
    const nextPreferences = { ...preferences, [key]: value };

    try {
      const { error: updateError } = await createBrowserClient().auth.updateUser({
        data: nextPreferences,
      });

      if (updateError) throw updateError;
      setPreferences(nextPreferences);
    } catch {
      setPreferences(previousPreferences);
      setError("Could not save setting. Try again.");
    } finally {
      setSavingPreference(null);
    }
  }

  async function handleDeleteAccount() {
    setDeleteLoading(true);
    setDeleteError("");

    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setDeleteError(json.error ?? "Could not delete your account right now.");
        return;
      }

      const client = createBrowserClient();
      await client.auth.signOut();
      clearLocalTestSession();
      router.push("/");
    } catch {
      setDeleteError("Could not delete your account right now.");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <>
      <section className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-4" aria-label="Settings">
        <h2 className="font-display text-[19px] font-semibold text-[#F4F5F8]">Settings</h2>
        <div className="mt-4 divide-y divide-white/[0.08] border-y border-white/[0.08]">
          <PreferenceToggleRow
            icon={<Bell size={17} strokeWidth={2.2} aria-hidden="true" />}
            label="Push notifications"
            subLabel="Get notified when saved venues get packed"
            enabled={preferences.push_enabled}
            saving={savingPreference === "push_enabled"}
            onToggle={() => void updatePreference("push_enabled", !preferences.push_enabled)}
          />
          <PreferenceToggleRow
            icon={<Lock size={17} strokeWidth={2.2} aria-hidden="true" />}
            label="Private check-ins"
            subLabel="Your check-ins won't appear in public vibe data"
            enabled={preferences.private_checkins}
            saving={savingPreference === "private_checkins"}
            onToggle={() => void updatePreference("private_checkins", !preferences.private_checkins)}
          />
          <Link
            href="/about"
            className="flex min-h-14 items-center justify-between gap-4 py-3 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.055] text-[#9CA2AE]">
                <Info size={17} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="truncate text-[15px] font-medium text-[#F4F5F8]">About</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[#9CA2AE]" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.055] text-[#9CA2AE]">
                <LogOut size={17} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="truncate text-[15px] font-medium text-[#9CA2AE]">Sign out</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[#9CA2AE]" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4 border-t border-white/[0.08] pt-1">
          <button
            type="button"
            onClick={() => {
              setDeleteError("");
              setShowDeleteConfirm(true);
            }}
            className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left transition-colors hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600/15 text-red-400">
                <Trash2 size={17} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="truncate text-[15px] font-semibold text-red-400">Delete account</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
          </button>
        </div>
        {error && (
          <p
            className="mt-3 rounded-[14px] border border-[#F0568C]/25 bg-[#F0568C]/10 px-3 py-2 text-[12px] font-medium text-[#F0568C]"
            role="alert"
          >
            {error}
          </p>
        )}
      </section>

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/70 px-4 pb-6 pt-20 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div className="w-full max-w-sm rounded-[18px] border border-white/[0.1] bg-[#0A0A0E] p-5 shadow-2xl">
            <h3 id="delete-account-title" className="font-display text-[21px] font-semibold text-[#F4F5F8]">
              Delete your account?
            </h3>
            <p className="mt-3 text-[14px] font-medium leading-6 text-[#9CA2AE]">
              This permanently deletes your check-ins, saved venues, and account. Cannot be undone.
            </p>
            {deleteError && (
              <p className="mt-4 rounded-[14px] border border-[#F0568C]/25 bg-[#F0568C]/10 p-3 text-[13px] font-medium text-[#F0568C]">
                {deleteError}
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  if (deleteLoading) return;
                  setShowDeleteConfirm(false);
                  setDeleteError("");
                }}
                disabled={deleteLoading}
                className="min-h-12 rounded-full border border-white/[0.1] bg-white/[0.055] px-4 text-[14px] font-semibold text-[#F4F5F8] transition-colors hover:bg-white/[0.09] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteAccount()}
                disabled={deleteLoading}
                className="min-h-12 rounded-full bg-red-600 px-4 text-[14px] font-bold text-white transition-colors hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {deleteLoading ? "Deleting..." : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authChecked, setAuthChecked] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);
  const [checkIns, setCheckIns] = useState<CheckInItem[]>([]);
  const [checkInCount, setCheckInCount] = useState(0);
  const [checkInsLoading, setCheckInsLoading] = useState(false);
  const [checkInsLoaded, setCheckInsLoaded] = useState(false);
  const [checkInsError, setCheckInsError] = useState("");
  const [streak, setStreak] = useState<ProfileStreakResponse>({
    currentStreak: 0,
    longestStreak: 0,
    totalCheckIns: 0,
  });
  const [streakLoaded, setStreakLoaded] = useState(false);
  const [savedVenueIds, setSavedVenueIds] = useState<string[]>([]);
  const [savedVenueItems, setSavedVenueItems] = useState<SavedVenueItem[]>([]);
  const [savedVenuesLoading, setSavedVenuesLoading] = useState(false);
  const [savedVenuesError, setSavedVenuesError] = useState("");
  const totalCheckIns = streak.totalCheckIns || checkInCount;

  useEffect(() => {
    const client = createBrowserClient();

    function applySession(nextSession: Session | null) {
      const activeSession = nextSession ?? readLocalTestSession();
      setSession(activeSession);
      setAuthChecked(true);

      if (activeSession?.user.id) {
        setCheckInsLoaded(false);
        setStreakLoaded(false);
        void fetchCheckIns(activeSession);
        void fetchStreak(activeSession);
        void fetchSavedVenues(activeSession);
      } else {
        setCheckIns([]);
        setCheckInCount(0);
        setCheckInsLoaded(false);
        setCheckInsError("");
        setStreak({ currentStreak: 0, longestStreak: 0, totalCheckIns: 0 });
        setStreakLoaded(false);
        setSavedVenueIds([]);
        setSavedVenueItems([]);
        setSavedVenuesError("");
      }
    }

    client.auth.getSession()
      .then(({ data }) => applySession(data.session))
      .catch(() => applySession(null));

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => applySession(nextSession));

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (searchParams.get("welcome") !== "1") return;
    if (!checkInsLoaded || !streakLoaded || checkInsLoading || checkInsError || totalCheckIns !== 0) return;

    setShowWelcomeBanner(true);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("welcome");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `/profile?${nextQuery}` : "/profile", { scroll: false });
  }, [checkInsError, checkInsLoaded, checkInsLoading, router, searchParams, streakLoaded, totalCheckIns]);

  useEffect(() => {
    if (!session) return;
    const activeSession: Session = session;

    function handleSavedVenuesChanged() {
      void fetchSavedVenues(activeSession);
    }

    window.addEventListener(SAVED_VENUES_EVENT, handleSavedVenuesChanged);

    return () => {
      window.removeEventListener(SAVED_VENUES_EVENT, handleSavedVenuesChanged);
    };
  }, [session]);

  async function fetchCheckIns(activeSession: Session) {
    setCheckInsLoading(true);
    setCheckInsError("");

    try {
      const res = await fetch("/api/profile/check-ins", {
        headers: { Authorization: `Bearer ${activeSession.access_token}` },
      });

      if (!res.ok) {
        setCheckIns([]);
        setCheckInCount(0);
        setCheckInsError("Could not load your check-ins right now.");
        return;
      }

      const rows = (await res.json()) as ProfileCheckInRecord[];
      const visibleRows = Array.isArray(rows) ? rows.slice(0, 20) : [];
      setCheckInCount(visibleRows.length);
      setCheckIns(visibleRows.map((row) => ({
        id: row.id,
        venueId: row.venue_id ?? "",
        venueName: getVenueName(row),
        busyness: row.busyness,
        crowdFeel: row.crowd_feel,
        note: row.note,
        createdAt: row.created_at,
      })));
    } catch {
      setCheckIns([]);
      setCheckInCount(0);
      setCheckInsError("Could not load your check-ins right now.");
    } finally {
      setCheckInsLoaded(true);
      setCheckInsLoading(false);
    }
  }

  async function fetchStreak(activeSession: Session) {
    try {
      const res = await fetch("/api/profile/streak", {
        headers: { Authorization: `Bearer ${activeSession.access_token}` },
      });

      if (!res.ok) {
        setStreak({ currentStreak: 0, longestStreak: 0, totalCheckIns: 0 });
        return;
      }

      const json = (await res.json()) as ProfileStreakResponse;
      setStreak({
        currentStreak: Number.isFinite(json.currentStreak) ? json.currentStreak : 0,
        longestStreak: Number.isFinite(json.longestStreak) ? json.longestStreak : 0,
        totalCheckIns: Number.isFinite(json.totalCheckIns) ? json.totalCheckIns : 0,
      });
    } catch {
      setStreak({ currentStreak: 0, longestStreak: 0, totalCheckIns: 0 });
    } finally {
      setStreakLoaded(true);
    }
  }

  async function fetchSavedVenues(activeSession: Session) {
    setSavedVenuesLoading(true);
    setSavedVenuesError("");

    try {
      const savedRes = await fetch("/api/venues/saved", {
        headers: { Authorization: `Bearer ${activeSession.access_token}` },
      });

      if (!savedRes.ok) {
        setSavedVenueIds([]);
        setSavedVenueItems([]);
        setSavedVenuesError("Could not load your saved venues right now.");
        return;
      }

      const savedJson = (await savedRes.json()) as SavedVenueIdsResponse;
      const ids = savedJson.place_ids ?? savedJson.venueIds ?? savedJson.savedVenueIds ?? savedJson.data?.savedVenueIds ?? [];
      const items = savedJson.savedVenues ?? savedJson.data?.savedVenues ?? [];

      setSavedVenueIds(Array.isArray(ids) ? ids : []);
      setSavedVenueItems(Array.isArray(items) ? items : []);
    } catch {
      setSavedVenueIds([]);
      setSavedVenueItems([]);
      setSavedVenuesError("Could not load your saved venues right now.");
    } finally {
      setSavedVenuesLoading(false);
    }
  }

  async function handleSignOut() {
    const client = createBrowserClient();
    await client.auth.signOut();
    clearLocalTestSession();
    setSession(null);
    router.replace("/profile");
  }

  async function handleDisplayNameSave(value: string) {
    const nextDisplayName = value.trim();
    const client = createBrowserClient();
    const { data, error } = await client.auth.updateUser({
      data: { display_name: nextDisplayName },
    });

    if (error) throw error;

    setSession((currentSession) => {
      if (!currentSession) return currentSession;

      const currentMetadata = currentSession.user.user_metadata ?? {};
      const nextUser = data.user ?? {
        ...currentSession.user,
        user_metadata: {
          ...currentMetadata,
          display_name: nextDisplayName,
        },
      };

      return {
        ...currentSession,
        user: nextUser,
      };
    });
  }

  function handleAlertThresholdChange(venueId: string, threshold: number) {
    setSavedVenueItems((current) => current.map((item) => (
      item.venueId === venueId ? { ...item, alertThreshold: threshold } : item
    )));
  }

  const userEmail = getUserEmail(session?.user);
  const displayName = getUserDisplayName(session?.user);
  const showVibeCTA = Boolean(session) && !checkInsLoading && (totalCheckIns > 0 || checkInsLoaded);

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#0A0A0E] text-white">
        <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0A0A0E]/92 px-4 backdrop-blur-xl">
          <div className="mx-auto max-w-lg py-4">
            <h1 className="font-display text-[34px] font-semibold tracking-normal text-[#F4F5F8]">You</h1>
          </div>
        </header>

        <div className="mx-auto max-w-lg px-4 py-6 pb-44">
          {!authChecked && <ProfileSkeleton />}
          {authChecked && !session && <LoggedOutState />}

          {authChecked && session && (
            <div className="space-y-4">
              {showWelcomeBanner && <WelcomeBanner displayName={displayName} />}
              {showVibeCTA && <VibeCTA />}
              <AccountHeader
                email={userEmail}
                displayName={displayName}
                onDisplayNameSave={handleDisplayNameSave}
                onSignOut={() => void handleSignOut()}
              />
              <StatsRow
                totalCheckIns={totalCheckIns}
                savedCount={savedVenueIds.length}
                currentStreak={streak.currentStreak}
                longestStreak={streak.longestStreak}
              />
              <CheckInsSection
                checkIns={checkIns}
                count={totalCheckIns}
                loading={checkInsLoading}
                error={checkInsError}
              />
              <SavedVenuesSection
                savedVenues={savedVenueItems}
                loading={savedVenuesLoading}
                error={savedVenuesError}
                accessToken={session.access_token}
                onThresholdChange={handleAlertThresholdChange}
              />
              <SettingsSection session={session} onSignOut={() => void handleSignOut()} />
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0E]" />}>
      <ProfileContent />
    </Suspense>
  );
}
