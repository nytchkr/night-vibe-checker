"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, Bookmark, ChevronRight, MapPin, X } from "lucide-react";
import type { Session, User } from "@supabase/supabase-js";
import { useOnboardingGate } from "@/components/OnboardingGate";
import { PageTransition } from "@/components/PageTransition";
import { PushOptIn } from "@/components/PushOptIn";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { APIResponse, ConsumerVenue } from "@/types";

type ProfileGender = "male" | "female" | "undisclosed";

type CheckInItem = {
  id: string;
  venueId: string;
  venueName: string;
  busyness: string | null;
  createdAt: string;
};

type CheckInRecord = {
  id: string;
  venue_id: string | null;
  venue_name?: string | null;
  busyness: string | null;
  created_at: string | null;
};

type SavedVenueIdsResponse = APIResponse<{ savedVenueIds: string[] }> & {
  venueIds?: string[];
  savedVenueIds?: string[];
};

type VenuesResponse = APIResponse<{ venues: ConsumerVenue[] }>;
type ProfileGenderResponse = { gender: ProfileGender | null };
type ProfileStreakResponse = {
  currentStreak: number;
  longestStreak: number;
  totalCheckIns: number;
};

const SAVED_VENUES_EVENT = "nightvibe:saved-venues-changed";
const WELCOME_DISMISSED_KEY = "nightvibe.welcomeDismissed";

const GENDER_OPTIONS: { value: ProfileGender; label: string }[] = [
  { value: "male", label: "Man" },
  { value: "female", label: "Woman" },
  { value: "undisclosed", label: "Rather not say" },
];

function getVenueName(row: CheckInRecord): string {
  return row.venue_name ?? row.venue_id ?? "Unknown venue";
}

function formatBusyness(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCheckInDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function getUserEmail(user: User | undefined): string {
  return user?.email ?? "Signed in";
}

function getUserDisplayName(user: User | undefined): string {
  const metadata = user?.user_metadata;
  const fullName = metadata?.full_name;
  const name = metadata?.name;

  if (typeof fullName === "string" && fullName.trim()) return fullName.trim();
  if (typeof name === "string" && name.trim()) return name.trim();

  return getUserEmail(user);
}

function getUserAvatarUrl(user: User | undefined): string | null {
  const avatarUrl = user?.user_metadata?.avatar_url;
  return typeof avatarUrl === "string" && avatarUrl.trim() ? avatarUrl : null;
}

function getUserInitial(email: string): string {
  return email.trim().charAt(0).toUpperCase() || "Y";
}

function readLocalTestSession(): Session | null {
  if (typeof window === "undefined") return null;
  if (process.env.NODE_ENV === "production") return null;
  if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return null;

  const keys = [
    "sb-gfsbqewkrcyclbktfyfk-auth-token",
    "sb-onlpwglwnqoivuykywrk-auth-token",
  ];

  for (const key of keys) {
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

function ProfileSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading profile">
      <Skeleton className="h-24 rounded-2xl bg-white/10" />
      <Skeleton className="h-44 rounded-2xl bg-white/10" />
      <Skeleton className="h-24 rounded-2xl bg-white/10" />
    </div>
  );
}

function LoggedOutState() {
  const { requireAuth } = useOnboardingGate();

  async function handleSignIn() {
    await requireAuth({
      id: "profile:onboarding",
      label: "Sign in to save spots, report the vibe, and keep your night history.",
      returnTo: "/profile",
    });
  }

  return (
    <section className="mx-auto mt-16 max-w-sm rounded-2xl border border-white/[0.09] bg-white/[0.04] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
      <p className="font-display text-[34px] font-semibold tracking-normal text-white">
        nyt<span className="text-[#8B6CFF]">chkr</span>
      </p>
      <p className="mt-3 text-base font-semibold text-white/72">Know the vibe before you go</p>
      <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-white/44">
        Sign in to keep your check-ins tied to your account and build a real history of nights out.
      </p>
      <Button
        type="button"
        onClick={() => void handleSignIn()}
        className="mt-7 min-h-[52px] w-full rounded-full bg-[#8B6CFF] text-base font-semibold text-[#0A0A0E] shadow-[0_0_24px_rgba(139,108,255,0.32)] hover:bg-[#8B6CFF]"
      >
        Sign in
      </Button>
    </section>
  );
}

function AccountCard({
  avatarUrl,
  displayName,
  email,
}: {
  avatarUrl: string | null;
  displayName: string;
  email: string;
}) {
  return (
    <section
      id="profile-section"
      className="scroll-mt-24 rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4"
      aria-label="Account"
    >
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={`${displayName} profile photo`}
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-white/15"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#4F9DFF]/18 text-lg font-black text-[#4F9DFF] ring-1 ring-[#4F9DFF]/35">
            {getUserInitial(email)}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-white">{displayName}</p>
          <p className="mt-1 truncate text-sm font-semibold text-white/45">{email}</p>
        </div>
      </div>
    </section>
  );
}

function WelcomeCard({ onDismiss }: { onDismiss: () => void }) {
  const ctas = [
    {
      title: "Report a vibe",
      subtitle: "Drop a live signal from the map.",
      href: "/map",
    },
    {
      title: "Browse venues",
      subtitle: "Scan South End spots before you go.",
      href: "/explore",
    },
    {
      title: "Set up profile",
      subtitle: "Confirm your account details.",
      href: "#profile-section",
    },
  ];

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-[#8B6CFF]/28 bg-[#0A0A0E] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.38),0_0_38px_rgba(139,108,255,0.14)]"
      aria-label="Welcome to NightVibe"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8B6CFF] to-transparent" />
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss welcome message"
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/55 transition-colors hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="pr-12">
        <p className="font-display text-2xl font-black text-white">Welcome to NightVibe</p>
        <p className="mt-1 text-sm font-semibold text-white/58">Here are your first moves.</p>
      </div>

      <div className="mt-5 grid gap-3">
        {ctas.map((cta) => (
          <Link
            key={cta.title}
            href={cta.href}
            className="group rounded-xl border border-white/[0.09] bg-white/[0.045] p-3 transition-colors hover:border-[#8B6CFF]/45 hover:bg-[#8B6CFF]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-white">{cta.title}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-white/45">{cta.subtitle}</p>
              </div>
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#8B6CFF]/16 text-sm font-black text-[#8B6CFF] transition-colors group-hover:bg-[#8B6CFF] group-hover:text-[#0A0A0E]"
                aria-hidden="true"
              >
                →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function StreakCard({
  streak,
  loading,
}: {
  streak: ProfileStreakResponse;
  loading: boolean;
}) {
  const showFire = streak.currentStreak >= 3;

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[#101018] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.3)]"
      aria-label="Night streak"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#F0568C]/70 to-transparent" />

      {loading ? (
        <div className="space-y-4" role="status" aria-label="Loading night streak">
          <Skeleton className="h-4 w-28 rounded-full bg-white/10" />
          <Skeleton className="h-16 w-32 rounded-2xl bg-white/10" />
          <Skeleton className="h-4 w-40 rounded-full bg-white/10" />
        </div>
      ) : (
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-[#F0568C]">Night streak</p>
          <div className="mt-3 flex items-end gap-3">
            <p className="font-display text-[64px] font-black leading-none tracking-normal text-white">
              {streak.currentStreak}
            </p>
            {showFire && (
              <span className="mb-2 text-3xl" aria-label="Streak fire" role="img">
                🔥
              </span>
            )}
          </div>
          <p className="mt-2 text-base font-black text-white">Nights out in a row</p>
          {streak.currentStreak === 0 && (
            <p className="mt-1 text-sm font-semibold text-white/50">Start your streak tonight.</p>
          )}
          <p className="mt-4 text-sm font-semibold text-white/45">
            {streak.totalCheckIns} check-ins total
          </p>
        </div>
      )}
    </section>
  );
}

function VibeIdentitySection({
  gender,
  loading,
  saving,
  error,
  onSelect,
}: {
  gender: ProfileGender | null;
  loading: boolean;
  saving: ProfileGender | null;
  error: string;
  onSelect: (gender: ProfileGender) => void;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4" aria-label="Your vibe identity">
      <div>
        <h2 className="font-display text-xl font-black text-white">Your vibe identity</h2>
        {!loading && !gender && (
          <p className="mt-1 text-sm font-semibold leading-6 text-white/45">
            Tell us so vibe ratios reflect real people.
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {GENDER_OPTIONS.map((option) => {
          const selected = gender === option.value;
          const isSaving = saving === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              disabled={loading || Boolean(saving)}
              className={`min-h-[44px] rounded-full border px-2 text-sm font-black transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? "border-[#8B6CFF] bg-[#8B6CFF] text-white"
                  : "border-white/15 bg-transparent text-white/55 hover:border-white/25 hover:text-white/75"
              }`}
              aria-pressed={selected}
            >
              {isSaving ? "Saving" : option.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-[#F0568C]/25 bg-[#F0568C]/10 p-3 text-sm font-semibold text-[#F0568C]">
          {error}
        </p>
      )}
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
  return (
    <section className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4" aria-label="Check-in History">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-black text-white">Check-in History</h2>
          <p className="mt-1 text-sm font-semibold text-white/45">
            {loading ? "Loading..." : `${count} total`}
          </p>
        </div>
        <span className="rounded-full bg-[#F0568C]/15 px-3 py-1 text-xs font-black text-[#F0568C]">
          Last 10
        </span>
      </div>

      {loading && (
        <div className="mt-5 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-xl bg-white/10" />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="mt-5 rounded-xl border border-[#F0568C]/25 bg-[#F0568C]/10 p-4 text-sm font-semibold text-[#F0568C]">
          {error}
        </p>
      )}

      {!loading && !error && checkIns.length === 0 && (
        <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-7 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#8B6CFF]/15 text-[#8B6CFF] ring-1 ring-[#8B6CFF]/25">
            <MapPin size={22} strokeWidth={2.4} aria-hidden="true" />
          </div>
          <p className="mt-4 text-base font-black text-white">No check-ins yet — start exploring!</p>
          <Link
            href="/map"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-sm font-black text-[#0A0A0E] shadow-[0_0_20px_rgba(139,108,255,0.28)] transition-colors hover:bg-[#9B82FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
          >
            Find venues on the map
          </Link>
        </div>
      )}

      {!loading && !error && checkIns.length > 0 && (
        <ul className="mt-5 space-y-3">
          {checkIns.map((item) => (
            <li key={item.id} className="rounded-xl border border-white/[0.08] bg-[#0A0A0E]/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-black text-white">{item.venueName}</p>
                <time className="shrink-0 text-xs font-semibold text-white/38" dateTime={item.createdAt}>
                  {formatCheckInDate(item.createdAt)}
                </time>
              </div>
              {item.busyness && (
                <p className="mt-2 inline-flex rounded-full bg-[#8B6CFF]/14 px-2.5 py-1 text-xs font-bold text-[#8B6CFF]">
                  {formatBusyness(item.busyness)}
                </p>
              )}
            </li>
          ))}
        </ul>
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
  const venuesById = new Map(venues.map((venue) => [venue.id, venue]));
  const savedVenues = savedVenueIds.map((id) => venuesById.get(id) ?? { id, name: id, category: "Saved venue" });

  return (
    <section className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4" aria-label="Saved venues">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-black text-white">Saved venues</h2>
          <p className="mt-1 text-sm font-semibold text-white/45">
            {loading ? "Loading..." : `${savedVenueIds.length} saved`}
          </p>
        </div>
        <span className="rounded-full bg-[#8B6CFF]/14 px-3 py-1 text-xs font-black text-[#8B6CFF]">
          Saves
        </span>
      </div>

      {loading && (
        <div className="mt-5 space-y-3">
          <Skeleton className="h-16 rounded-xl bg-white/10" />
        </div>
      )}

      {!loading && error && (
        <p className="mt-5 rounded-xl border border-[#F0568C]/25 bg-[#F0568C]/10 p-4 text-sm font-semibold text-[#F0568C]">
          {error}
        </p>
      )}

      {!loading && !error && savedVenueIds.length === 0 && (
        <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-7 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#8B6CFF]/15 text-[#8B6CFF] ring-1 ring-[#8B6CFF]/25">
            <Bookmark size={22} strokeWidth={2.4} aria-hidden="true" />
          </div>
          <p className="mt-4 text-base font-black text-white">No saved spots yet</p>
          <p className="mx-auto mt-2 max-w-[240px] text-sm font-semibold leading-6 text-white/50">
            Save venues you want to revisit
          </p>
          <Link
            href="/explore"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-sm font-black text-[#0A0A0E] shadow-[0_0_20px_rgba(139,108,255,0.28)] transition-colors hover:bg-[#9B82FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
          >
            Browse South End venues
          </Link>
        </div>
      )}

      {!loading && !error && savedVenueIds.length > 0 && (
        <ul className="mt-5 space-y-3">
          {savedVenues.map((venue) => (
            <li key={venue.id}>
              <Link
                href={`/venues/${encodeURIComponent(venue.id)}`}
                className="block rounded-xl border border-white/[0.08] bg-[#0A0A0E]/60 p-3 transition-colors hover:border-[#8B6CFF]/35 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
              >
                <p className="truncate text-sm font-black text-white">{venue.name}</p>
                <p className="mt-1 truncate text-xs font-semibold text-white/42">{venue.category}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authChecked, setAuthChecked] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [checkIns, setCheckIns] = useState<CheckInItem[]>([]);
  const [checkInCount, setCheckInCount] = useState(0);
  const [checkInsLoading, setCheckInsLoading] = useState(false);
  const [checkInsError, setCheckInsError] = useState("");
  const [streak, setStreak] = useState<ProfileStreakResponse>({
    currentStreak: 0,
    longestStreak: 0,
    totalCheckIns: 0,
  });
  const [streakLoading, setStreakLoading] = useState(false);
  const [savedVenueIds, setSavedVenueIds] = useState<string[]>([]);
  const [savedVenuesLoading, setSavedVenuesLoading] = useState(false);
  const [savedVenuesError, setSavedVenuesError] = useState("");
  const [venues, setVenues] = useState<ConsumerVenue[]>([]);
  const [gender, setGender] = useState<ProfileGender | null>(null);
  const [genderLoading, setGenderLoading] = useState(false);
  const [genderSaving, setGenderSaving] = useState<ProfileGender | null>(null);
  const [genderError, setGenderError] = useState("");

  useEffect(() => {
    const client = createBrowserClient();

    function applySession(nextSession: Session | null) {
      const activeSession = nextSession ?? readLocalTestSession();
      setSession(activeSession);
      setAuthChecked(true);

      if (activeSession?.user.id) {
        void fetchCheckIns(activeSession);
        void fetchStreak(activeSession);
        void fetchSavedVenues(activeSession);
        void fetchGender(activeSession);
      } else {
        setCheckIns([]);
        setCheckInCount(0);
        setCheckInsError("");
        setStreak({ currentStreak: 0, longestStreak: 0, totalCheckIns: 0 });
        setSavedVenueIds([]);
        setSavedVenuesError("");
        setVenues([]);
        setGender(null);
        setGenderError("");
      }
    }

    client.auth.getSession().then(({ data }) => applySession(data.session));

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => applySession(nextSession));

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (searchParams.get("welcome") !== "1") {
      setShowWelcome(false);
      return;
    }

    try {
      setShowWelcome(window.sessionStorage.getItem(WELCOME_DISMISSED_KEY) !== "1");
    } catch {
      setShowWelcome(true);
    }
  }, [searchParams]);

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

      const rows = (await res.json()) as CheckInRecord[];
      setCheckInCount(rows.length);
      setCheckIns(rows.map((row) => ({
        id: row.id,
        venueId: row.venue_id ?? "",
        venueName: getVenueName(row),
        busyness: row.busyness,
        createdAt: row.created_at ?? new Date().toISOString(),
      })));
    } catch {
      setCheckIns([]);
      setCheckInCount(0);
      setCheckInsError("Could not load your check-ins right now.");
    } finally {
      setCheckInsLoading(false);
    }
  }

  async function fetchStreak(activeSession: Session) {
    setStreakLoading(true);

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
      setStreakLoading(false);
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
      const ids = savedJson.venueIds ?? savedJson.savedVenueIds ?? savedJson.data?.savedVenueIds ?? [];

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

  async function fetchGender(activeSession: Session) {
    setGenderLoading(true);
    setGenderError("");

    try {
      const res = await fetch("/api/profile/gender", {
        headers: { Authorization: `Bearer ${activeSession.access_token}` },
      });

      if (!res.ok) {
        setGender(null);
        setGenderError("Could not load your vibe identity right now.");
        return;
      }

      const json = (await res.json()) as ProfileGenderResponse;
      setGender(json.gender ?? null);
    } catch {
      setGender(null);
      setGenderError("Could not load your vibe identity right now.");
    } finally {
      setGenderLoading(false);
    }
  }

  async function handleGenderSelect(nextGender: ProfileGender) {
    if (!session) return;

    setGenderSaving(nextGender);
    setGenderError("");

    try {
      const res = await fetch("/api/profile/gender", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ gender: nextGender }),
      });

      if (!res.ok) {
        setGenderError("Could not save your vibe identity right now.");
        return;
      }

      setGender(nextGender);
    } catch {
      setGenderError("Could not save your vibe identity right now.");
    } finally {
      setGenderSaving(null);
    }
  }

  async function handleSignOut() {
    const client = createBrowserClient();
    await client.auth.signOut();
    router.push("/login");
  }

  function handleDismissWelcome() {
    try {
      window.sessionStorage.setItem(WELCOME_DISMISSED_KEY, "1");
    } catch {
      // Storage can be unavailable in private contexts. Dismiss for the current render either way.
    }
    setShowWelcome(false);
  }

  const userEmail = getUserEmail(session?.user);
  const userDisplayName = getUserDisplayName(session?.user);
  const userAvatarUrl = getUserAvatarUrl(session?.user);

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#0A0A0E] text-white">
        <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0A0A0E]/92 px-4 backdrop-blur-xl">
          <div className="mx-auto max-w-lg py-4">
            <h1 className="font-display text-[34px] font-semibold tracking-normal text-white">You</h1>
          </div>
        </header>

        <div className="mx-auto max-w-lg px-4 py-6 pb-44">
          {!authChecked && <ProfileSkeleton />}
          {authChecked && !session && <LoggedOutState />}

          {authChecked && session && (
            <div className="space-y-5">
              {showWelcome && <WelcomeCard onDismiss={handleDismissWelcome} />}
              <AccountCard
                avatarUrl={userAvatarUrl}
                displayName={userDisplayName}
                email={userEmail}
              />
              <StreakCard streak={streak} loading={streakLoading} />
              <VibeIdentitySection
                gender={gender}
                loading={genderLoading}
                saving={genderSaving}
                error={genderError}
                onSelect={(nextGender) => void handleGenderSelect(nextGender)}
              />
              <CheckInsSection
                checkIns={checkIns}
                count={checkInCount}
                loading={checkInsLoading}
                error={checkInsError}
              />
              <SavedVenuesSection
                savedVenueIds={savedVenueIds}
                venues={venues}
                loading={savedVenuesLoading}
                error={savedVenuesError}
              />
              <PushOptIn />
              <Link
                href="/notifications"
                className="flex min-h-[64px] w-full items-center justify-between gap-4 rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4 transition-colors hover:border-[#8B6CFF]/35 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[#8B6CFF]">
                    <Bell size={18} strokeWidth={2.4} aria-hidden="true" />
                  </span>
                  <span className="truncate text-base font-black text-white">
                    Notification preferences
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-white/35" aria-hidden="true" />
              </Link>

              <Button
                type="button"
                onClick={handleSignOut}
                className="min-h-[52px] w-full rounded-full border border-white/12 bg-white/[0.06] text-sm font-black text-white hover:bg-white/[0.1]"
              >
                Sign out
              </Button>
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
