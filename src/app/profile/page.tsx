"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, MapPin } from "lucide-react";
import type { Session, User } from "@supabase/supabase-js";
import { useOnboardingGate } from "@/components/OnboardingGate";
import { PageTransition } from "@/components/PageTransition";
import { PushOptIn } from "@/components/PushOptIn";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { APIResponse, ConsumerVenue } from "@/types";

type CrowdFeel = "mostly_male" | "mostly_female" | "balanced" | "mixed";

type CheckInItem = {
  id: string;
  venueId: string;
  venueName: string;
  crowdFeel: CrowdFeel | string;
  createdAt: string;
};

type CheckInRecord = {
  id: string;
  venue_id: string | null;
  crowd_feel: string | null;
  created_at: string | null;
  venues?: { name?: string | null } | { name?: string | null }[] | null;
};

type SavedVenueIdsResponse = APIResponse<{ savedVenueIds: string[] }> & {
  venueIds?: string[];
  savedVenueIds?: string[];
};

type VenuesResponse = APIResponse<{ venues: ConsumerVenue[] }>;

const SAVED_VENUES_EVENT = "nightvibe:saved-venues-changed";

const CROWD_FEEL_LABELS: Record<CrowdFeel, string> = {
  mostly_male: "Mostly male",
  mostly_female: "Mostly female",
  balanced: "Balanced",
  mixed: "Mixed",
};

function getVenueName(row: CheckInRecord): string {
  const venue = Array.isArray(row.venues) ? row.venues[0] : row.venues;
  return venue?.name ?? row.venue_id ?? "Unknown venue";
}

function formatCrowdFeel(value: string): string {
  return CROWD_FEEL_LABELS[value as CrowdFeel] ?? value.replaceAll("_", " ");
}

function formatCheckInTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getUserEmail(user: User | undefined): string {
  return user?.email ?? "Signed in";
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

function AccountCard({ email }: { email: string }) {
  return (
    <section className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4" aria-label="Account">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#4F9DFF]/18 text-xl font-black text-[#4F9DFF] ring-1 ring-[#4F9DFF]/35">
          {getUserInitial(email)}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#9CA2AE]">Signed in as</p>
          <p className="mt-1 truncate text-base font-semibold text-white">{email}</p>
        </div>
      </div>
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
    <section className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4" aria-label="Your check-ins">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-black text-white">Your check-ins</h2>
          <p className="mt-1 text-sm font-semibold text-white/45">
            {loading ? "Loading..." : `${count} total`}
          </p>
        </div>
        <span className="rounded-full bg-[#F0568C]/15 px-3 py-1 text-xs font-black text-[#F0568C]">
          Last 3
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
          <p className="mt-4 text-base font-black text-white">No check-ins yet</p>
          <p className="mx-auto mt-2 max-w-[240px] text-sm font-semibold leading-6 text-white/50">
            Be the first to report the vibe tonight
          </p>
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
                  {formatCheckInTime(item.createdAt)}
                </time>
              </div>
              <p className="mt-2 inline-flex rounded-full bg-[#8B6CFF]/14 px-2.5 py-1 text-xs font-bold text-[#8B6CFF]">
                {formatCrowdFeel(item.crowdFeel)}
              </p>
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

export default function ProfilePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [checkIns, setCheckIns] = useState<CheckInItem[]>([]);
  const [checkInCount, setCheckInCount] = useState(0);
  const [checkInsLoading, setCheckInsLoading] = useState(false);
  const [checkInsError, setCheckInsError] = useState("");
  const [savedVenueIds, setSavedVenueIds] = useState<string[]>([]);
  const [savedVenuesLoading, setSavedVenuesLoading] = useState(false);
  const [savedVenuesError, setSavedVenuesError] = useState("");
  const [venues, setVenues] = useState<ConsumerVenue[]>([]);

  useEffect(() => {
    const client = createBrowserClient();

    function applySession(nextSession: Session | null) {
      const activeSession = nextSession ?? readLocalTestSession();
      setSession(activeSession);
      setAuthChecked(true);

      if (activeSession?.user.id) {
        void fetchCheckIns(activeSession.user.id);
        void fetchSavedVenues(activeSession);
      } else {
        setCheckIns([]);
        setCheckInCount(0);
        setCheckInsError("");
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

  async function fetchCheckIns(userId: string) {
    setCheckInsLoading(true);
    setCheckInsError("");

    try {
      const client = createBrowserClient();
      const { data, error, count } = await client
        .from("check_ins")
        .select("id, venue_id, crowd_feel, created_at, venues(name)", { count: "exact" })
        .eq("user_id", userId)
        .eq("hidden", false)
        .order("created_at", { ascending: false })
        .limit(3);

      if (error) {
        setCheckIns([]);
        setCheckInCount(0);
        setCheckInsError("Could not load your check-ins right now.");
        return;
      }

      const rows = (data ?? []) as CheckInRecord[];
      setCheckInCount(count ?? rows.length);
      setCheckIns(rows.map((row) => ({
        id: row.id,
        venueId: row.venue_id ?? "",
        venueName: getVenueName(row),
        crowdFeel: row.crowd_feel ?? "mixed",
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

  async function handleSignOut() {
    const client = createBrowserClient();
    await client.auth.signOut();
    router.push("/login");
  }

  const userEmail = getUserEmail(session?.user);

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
              <AccountCard email={userEmail} />
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
