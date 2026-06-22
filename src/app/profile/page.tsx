"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, Bookmark, ChevronRight, Info, MapPin } from "lucide-react";
import type { Session, User } from "@supabase/supabase-js";
import { PageTransition } from "@/components/PageTransition";
import { PushOptIn } from "@/components/PushOptIn";
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
};

type VenuesResponse = APIResponse<{ venues: ConsumerVenue[] }>;
type ProfileStreakResponse = {
  currentStreak: number;
  longestStreak: number;
  totalCheckIns: number;
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

function getUserInitials(email: string): string {
  const name = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
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

function WelcomeBanner() {
  return (
    <section className="rounded-2xl border border-[#8B6CFF]/30 bg-[#8B6CFF]/10 p-5" aria-label="Welcome">
      <h2 className="text-xl font-bold text-white">Welcome to nytchkr</h2>
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
  onSignOut,
}: {
  email: string;
  onSignOut: () => void;
}) {
  return (
    <section
      id="profile-section"
      className="scroll-mt-24 rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-4"
      aria-label="Account"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#8B6CFF] font-display text-lg font-semibold text-white ring-1 ring-[#8B6CFF]/40">
          {getUserInitials(email)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-[#F4F5F8]">{email}</p>
          <p className="mt-1 text-[13px] font-medium text-[#9CA2AE]">Charlotte nightlife scout</p>
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
          <ul className="mt-5 divide-y divide-white/[0.08]">
            {recentCheckIns.map((item) => (
              <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-[15px] font-semibold text-[#F4F5F8]">{item.venueName}</p>
                  <time className="shrink-0 text-[12px] font-medium text-[#9CA2AE]" dateTime={item.createdAt}>
                    {formatRelativeTime(item.createdAt)}
                  </time>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.busyness && (
                    <span className="rounded-full bg-[#8B6CFF]/14 px-2.5 py-1 text-[12px] font-medium text-[#B7A8FF]">
                      {formatBusyness(item.busyness)}
                    </span>
                  )}
                  {item.crowdFeel && (
                    <span className="rounded-full bg-white/[0.055] px-2.5 py-1 text-[12px] font-medium text-[#9CA2AE]">
                      {formatCrowdFeel(item.crowdFeel)}
                    </span>
                  )}
                </div>
                {item.note && (
                  <p className="mt-2 text-[13px] font-medium leading-5 text-[#9CA2AE]">{item.note}</p>
                )}
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
  savedVenueIds,
  venues,
  loading,
  error,
}: {
  savedVenueIds: string[];
  venues: ConsumerVenue[];
  loading: boolean;
  error: string;
}) {
  const venuesById = new Map<string, ConsumerVenue>();
  venues.forEach((venue) => {
    venuesById.set(venue.id, venue);
    venuesById.set(venue.placeId, venue);
  });
  const savedVenues = savedVenueIds
    .slice(0, 5)
    .map((id) => venuesById.get(id) ?? { id, name: id, category: "Saved venue" });

  return (
    <section className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-4" aria-label="Saved venues">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[19px] font-semibold text-[#F4F5F8]">Saved venues</h2>
          <p className="mt-1 text-[13px] font-medium text-[#9CA2AE]">
            {loading ? "Loading..." : `${savedVenueIds.length.toLocaleString()} saved`}
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

      {!loading && !error && savedVenueIds.length === 0 && (
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

      {!loading && !error && savedVenueIds.length > 0 && (
        <>
          <ul className="mt-5 divide-y divide-white/[0.08]">
            {savedVenues.map((venue) => (
              <li key={venue.id} className="py-3 first:pt-0 last:pb-0">
                <Link
                  href={`/venues/${encodeURIComponent(venue.id)}`}
                  className="group flex items-center justify-between gap-4 rounded-[14px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-[#F4F5F8]">{venue.name}</span>
                    <span className="mt-1 block truncate text-[12px] font-medium text-[#9CA2AE]">{venue.category}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[#9CA2AE] transition-colors group-hover:text-[#F4F5F8]" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/profile/saved"
            className="mt-4 inline-flex min-h-11 items-center rounded-full px-1 text-[13px] font-semibold text-[#8B6CFF] transition-colors hover:text-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
          >
            See all {savedVenueIds.length.toLocaleString()} saved &rarr;
          </Link>
        </>
      )}
    </section>
  );
}

function SettingsSection() {
  return (
    <section className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-4" aria-label="Settings">
      <h2 className="font-display text-[19px] font-semibold text-[#F4F5F8]">Settings</h2>
      <div className="mt-4 divide-y divide-white/[0.08] border-y border-white/[0.08]">
        <div className="flex min-h-14 items-center justify-between gap-4 py-3">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.055] text-[#9CA2AE]">
              <Bell size={17} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span className="truncate text-[15px] font-medium text-[#F4F5F8]">Notifications</span>
          </span>
          <button
            type="button"
            aria-label="Notifications toggle placeholder"
            aria-pressed="false"
            className="relative h-7 w-12 shrink-0 rounded-full border border-white/[0.08] bg-white/[0.055] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
          >
            <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-[#646B79]" />
          </button>
        </div>
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
      </div>
    </section>
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
  const [savedVenuesLoading, setSavedVenuesLoading] = useState(false);
  const [savedVenuesError, setSavedVenuesError] = useState("");
  const [venues, setVenues] = useState<ConsumerVenue[]>([]);
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
        setSavedVenuesError("");
        setVenues([]);
      }
    }

    client.auth.getSession().then(({ data }) => applySession(data.session));

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
      const [savedRes, venuesRes] = await Promise.all([
        fetch("/api/saved-venues", {
          headers: { Authorization: `Bearer ${activeSession.access_token}` },
        }),
        fetch("/api/venues"),
      ]);

      if (!savedRes.ok || !venuesRes.ok) {
        setSavedVenueIds([]);
        setVenues([]);
        setSavedVenuesError("Could not load your saved venues right now.");
        return;
      }

      const savedJson = (await savedRes.json()) as SavedVenueIdsResponse;
      const venuesJson = (await venuesRes.json()) as VenuesResponse;
      const ids = savedJson.place_ids ?? savedJson.venueIds ?? savedJson.savedVenueIds ?? savedJson.data?.savedVenueIds ?? [];

      setSavedVenueIds(Array.isArray(ids) ? ids : []);
      setVenues(Array.isArray(venuesJson.data?.venues) ? venuesJson.data.venues : []);
    } catch {
      setSavedVenueIds([]);
      setVenues([]);
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

  const userEmail = getUserEmail(session?.user);
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
              {showWelcomeBanner && <WelcomeBanner />}
              {showVibeCTA && <VibeCTA />}
              <AccountHeader email={userEmail} onSignOut={() => void handleSignOut()} />
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
                savedVenueIds={savedVenueIds}
                venues={venues}
                loading={savedVenuesLoading}
                error={savedVenuesError}
              />
              <SettingsSection />
              <PushOptIn />
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
