"use client";

// ============================================================
// Profile Page  — NV-062, NV-065
//
// Logged-in: profile, recent check-ins, saved venues, and settings.
// Logged-out: pitch card with sign-up CTA.
// ============================================================

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/PageTransition";
import { PushOptIn } from "@/components/PushOptIn";
import { getBusynessState } from "@/lib/busyness";
import {
  getHapticsPreference,
  setHapticsPreference,
  triggerHapticFeedback,
  type HapticsPreference,
} from "@/lib/haptics";
import { VENUE_PHOTO_BLUR_DATA_URL } from "@/lib/imagePlaceholders";
import type { ConsumerVenue } from "@/types";

// --------------- Crowd badge --------------------------------

type Busyness = "dead" | "moderate" | "packed";
type CrowdFeel = "mostly_male" | "mostly_female" | "balanced" | "mixed";

const BUSYNESS_CFG: Record<Busyness, { label: string; bg: string; text: string }> = {
  dead:     { label: "Dead",     bg: "rgba(74,222,128,0.24)", text: "#4ADE80" },
  moderate: { label: "Moderate", bg: "rgba(251,191,36,0.24)", text: "#FBBF24" },
  packed:   { label: "Packed",   bg: "rgba(248,113,113,0.24)", text: "#F87171" },
};

const CROWD_FEEL_LABEL: Record<CrowdFeel, string> = {
  mostly_male: "Mostly male",
  mostly_female: "Mostly female",
  balanced: "Balanced",
  mixed: "Mixed / unsure",
};

const SAVED_BUSYNESS_CLASSES = {
  dead: "bg-[#4ADE80]/20 text-[#4ADE80]",
  moderate: "bg-[#FBBF24]/20 text-[#FBBF24]",
  packed: "bg-[#F87171]/20 text-[#F87171]",
  none: "bg-white/[0.06] text-white/45",
};

function BusynessBadge({ level }: { level: string }) {
  const cfg = BUSYNESS_CFG[level as Busyness];
  if (!cfg) return null;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}

function getCategoryIcon(category: string | null | undefined): string {
  const value = (category ?? "").toLowerCase();
  if (value.includes("night_club") || value.includes("nightclub") || value.includes("club")) return "♪";
  if (value.includes("restaurant") || value.includes("food")) return "R";
  if (value.includes("bar")) return "B";
  return "P";
}

// --------------- Time ago -----------------------------------

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 1000 / 60);
  if (mins < 1) return "Just now";
  if (mins === 1) return "1m ago";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return h === 1 ? "1h ago" : `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1d ago" : `${d}d ago`;
}

function joinedDate(iso: string | undefined): string {
  if (!iso) return "Joined recently";
  return `Joined ${new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(new Date(iso))}`;
}

// --------------- Check-in row -------------------------------

interface CheckInItem {
  id: string;
  venueId: string;
  venueName?: string;
  busyness: string;
  crowdFeel: string;
  createdAt: string;
}

type ProfileCheckInResponse = {
  id: string;
  venue_id?: string | null;
  venue_name?: string | null;
  busyness?: string | null;
  crowd_feel?: string | null;
  created_at?: string | null;
};

type ProfileStreakResponse = {
  streak?: number | null;
};

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

function CheckInRow({ item }: { item: CheckInItem }) {
  const venueLabel = item.venueName || item.venueId || "Venue";

  return (
    <div className="rounded-2xl border border-white/[0.09] overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
      <div className="flex items-center px-3 py-3 gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 truncate text-white text-[15px] font-bold leading-snug">{venueLabel}</p>
            <span className="shrink-0 text-white/40 text-[11px]">{timeAgo(item.createdAt)}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <BusynessBadge level={item.busyness} />
            {item.crowdFeel && (
              <Badge className="border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/60 hover:bg-white/[0.06]">
                {CROWD_FEEL_LABEL[item.crowdFeel as CrowdFeel] ?? item.crowdFeel}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SavedVenueCard({ venue }: { venue: ConsumerVenue }) {
  const state = getBusynessState(venue.signal?.busyness0To100);
  const busynessClass = state.level ? SAVED_BUSYNESS_CLASSES[state.level] : SAVED_BUSYNESS_CLASSES.none;

  return (
    <li className="shrink-0 snap-start">
      <Link
        href={`/venues/${encodeURIComponent(venue.id)}`}
        className="flex w-[238px] items-center gap-3 rounded-2xl border border-white/[0.09] bg-white/[0.04] p-2.5 transition-colors hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60"
        aria-label={`Open ${venue.name}`}
      >
        <div className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-lg bg-white/[0.06]">
          {venue.photoUrl ? (
            <Image
              src={venue.photoUrl}
              alt={venue.name}
              fill
              sizes="60px"
              loading="lazy"
              placeholder="blur"
              blurDataURL={VENUE_PHOTO_BLUR_DATA_URL}
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-black text-white/45" aria-hidden="true">
              {getCategoryIcon(venue.category)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold leading-snug text-white">{venue.name}</p>
          <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${busynessClass}`}>
            {state.level ? state.label : "No signal"}
          </span>
        </div>
      </Link>
    </li>
  );
}

function SavedVenuesSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" aria-label="Loading saved places">
      <p className="sr-only">Loading...</p>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex w-[238px] shrink-0 items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5">
          <Skeleton className="h-[60px] w-[60px] shrink-0 rounded-lg bg-white/10" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-28 bg-white/10" />
            <Skeleton className="h-5 w-16 rounded-full bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SavedPlacesEmptyState() {
  return (
    <div className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-6 text-center">
      <div className="text-5xl" aria-hidden="true">🔖</div>
      <h3 className="mt-4 text-lg font-bold text-white/40">No saved places yet</h3>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-white/40">Tap ♡ on any venue to save it</p>
    </div>
  );
}

function CheckInsEmptyState() {
  return (
    <div className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-6 text-center">
      <div className="text-5xl" aria-hidden="true">🌃</div>
      <h3 className="mt-4 text-lg font-bold text-white/40">No nights out yet</h3>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-white/40">
        Check in at a venue to start your nightlife history
      </p>
      <Link
        href="/map"
        className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#00F5D4] px-5 text-sm font-black text-[#0A0A0F] shadow-[0_0_20px_rgba(0,245,212,0.24)] transition-colors hover:bg-[#22FFE1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
      >
        Find venues →
      </Link>
    </div>
  );
}

function LoggedOutPitch() {
  const benefits = [
    "Report the vibe — tell others how packed it is",
    "Save your spots — bookmark bars for quick access",
    "Check-in history — all your nights in one place",
  ];

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <section className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-6" aria-label="Sign up benefits">
        <h2 className="text-2xl font-black text-white">Your Night Out HQ</h2>
        <p className="mt-1 text-sm text-white/50">Sign up to unlock everything</p>
        <ul className="mt-6 space-y-3">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/65 text-sm">
                ✓
              </span>
              <span className="text-sm text-white/80">{benefit}</span>
            </li>
          ))}
        </ul>
        <Button
          asChild
          className="mt-8 min-h-[52px] w-full rounded-xl bg-[#00F5D4] text-base font-black text-[#0A0A0F] shadow-[0_0_24px_rgba(0,245,212,0.32)] hover:bg-[#2fffe2]"
        >
          <Link href="/login">Sign up free</Link>
        </Button>
        <p className="mt-3 text-center text-xs text-white/40">
          Already have an account?{" "}
          <Link href="/login" className="underline underline-offset-2 hover:text-white/60">
            Sign in
          </Link>
        </p>
      </section>
    </div>
  );
}

// --------------- Skeleton -----------------------------------

function CheckInSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.09] overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
      <Skeleton className="h-7 w-full rounded-none bg-white/10" />
      <div className="flex items-center px-3 py-3 gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3 bg-white/10" />
          <Skeleton className="h-3 w-1/3 bg-white/10" />
        </div>
      </div>
    </div>
  );
}

// --------------- Main page ----------------------------------

export default function ProfilePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [checkIns, setCheckIns] = useState<CheckInItem[]>([]);
  const [savedVenues, setSavedVenues] = useState<ConsumerVenue[]>([]);
  const [streak, setStreak] = useState(0);
  const [checkInsLoading, setCheckInsLoading] = useState(false);
  const [savedVenuesLoading, setSavedVenuesLoading] = useState(false);
  const [hapticsPreference, setHapticsPreferenceState] = useState<HapticsPreference>("on");

  useEffect(() => {
    setHapticsPreferenceState(getHapticsPreference());

    const client = createBrowserClient();

    client.auth.getSession().then(({ data }) => {
      const activeSession = data.session ?? readLocalTestSession();
      if (!activeSession) {
        setSession(null);
        setCheckIns([]);
        setSavedVenues([]);
        setStreak(0);
        setAuthChecked(true);
        return;
      }
      setSession(activeSession);
      setAuthChecked(true);
      fetchCheckIns(activeSession.access_token);
      fetchSavedVenues(activeSession.access_token);
      fetchStreak(activeSession.access_token);
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, sess) => {
      const activeSession = sess ?? readLocalTestSession();
      if (!activeSession) {
        setSession(null);
        setCheckIns([]);
        setSavedVenues([]);
        setStreak(0);
        setAuthChecked(true);
        return;
      }
      setSession(activeSession);
      setAuthChecked(true);
      fetchCheckIns(activeSession.access_token);
      fetchSavedVenues(activeSession.access_token);
      fetchStreak(activeSession.access_token);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchCheckIns(token: string) {
    setCheckInsLoading(true);
    try {
      const profileRes = await fetch("/api/profile/check-ins", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (profileRes.ok) {
        const rows = (await profileRes.json()) as ProfileCheckInResponse[];
        if (rows.length > 0) {
          setCheckIns(rows.map((r) => ({
            id: r.id,
            venueId: r.venue_id ?? "",
            venueName: r.venue_name ?? undefined,
            busyness: r.busyness ?? "",
            crowdFeel: r.crowd_feel ?? "",
            createdAt: r.created_at ?? new Date().toISOString(),
          })));
          return;
        }
      }

      const legacyRes = await fetch("/api/check-ins/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!legacyRes.ok) {
        setCheckIns([]);
        return;
      }
      const json = await legacyRes.json();
      const rows = (json.data?.checkIns ?? []) as Array<{
        id: string;
        venue_id?: string; venueId?: string;
        place_id?: string; placeId?: string;
        venue_name?: string; venueName?: string;
        busyness?: string;
        crowd_feel?: string; crowdFeel?: string;
        created_at?: string; createdAt?: string;
      }>;
      setCheckIns(rows.map((r) => ({
        id: r.id,
        venueId: r.venue_id ?? r.venueId ?? r.place_id ?? r.placeId ?? "",
        venueName: r.venue_name ?? r.venueName ?? r.place_id ?? r.placeId,
        busyness: r.busyness ?? "",
        crowdFeel: r.crowd_feel ?? r.crowdFeel ?? "",
        createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString(),
      })));
    } catch {
      // non-fatal
    } finally {
      setCheckInsLoading(false);
    }
  }

  async function fetchSavedVenues(token: string) {
    setSavedVenuesLoading(true);
    try {
      const [savedRes, venuesRes] = await Promise.all([
        fetch("/api/saved-venues", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/venues"),
      ]);

      if (!savedRes.ok || !venuesRes.ok) return;

      const [savedJson, venuesJson] = await Promise.all([savedRes.json(), venuesRes.json()]);
      const savedIds = (savedJson.data?.savedVenueIds ?? []) as string[];
      const venues = (venuesJson.data?.venues ?? []) as ConsumerVenue[];
      const venueById = new Map(venues.map((venue) => [venue.id, venue]));
      setSavedVenues(savedIds.map((id) => venueById.get(id)).filter((venue): venue is ConsumerVenue => Boolean(venue)));
    } catch {
      // Non-fatal: profile history still renders if saved venues cannot load.
    } finally {
      setSavedVenuesLoading(false);
    }
  }

  async function fetchStreak(token: string) {
    try {
      const res = await fetch("/api/profile/streak", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setStreak(0);
        return;
      }
      const json = (await res.json()) as ProfileStreakResponse;
      setStreak(Math.max(0, Number(json.streak ?? 0)));
    } catch {
      setStreak(0);
    }
  }

  const userEmail = session?.user.email ?? "";
  const userInitial = userEmail.trim().charAt(0).toUpperCase() || "?";
  const hapticsEnabled = hapticsPreference === "on";

  async function handleSignOut() {
    const client = createBrowserClient();
    await client.auth.signOut();
    router.push("/");
  }

  function toggleHapticsPreference() {
    const nextPreference = hapticsPreference === "on" ? "off" : "on";
    if (hapticsPreference === "on") {
      triggerHapticFeedback(20);
    }
    setHapticsPreference(nextPreference);
    setHapticsPreferenceState(nextPreference);
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#0A0A0F]">
      <header className="sticky top-0 z-40 bg-[#0A0A0F]/92 backdrop-blur-xl border-b border-white/[0.08] px-4">
        <div className="max-w-lg mx-auto py-4">
          <h1 className="truncate text-2xl font-black tracking-tight text-white">
            {session ? "Profile" : authChecked ? "You" : "Loading profile..."}
          </h1>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="min-w-0 text-sm font-semibold text-white/45">{session ? "Your night out account" : "Sign in to unlock your night out tools"}</p>
            <Link href="/leaderboard" className="shrink-0 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-black text-white/65 transition-colors hover:bg-white/[0.1]">
              Leaderboard
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6 pb-44">
        {!authChecked && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <CheckInSkeleton key={i} />)}
          </div>
        )}

        {authChecked && !session && <LoggedOutPitch />}

        {/* Logged-in header */}
        {session && (
          <section className="space-y-4 text-center" aria-label="Account summary">
            <div className="flex flex-col items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00F5D4] text-2xl font-black text-[#0A0A0F]">
                {userInitial}
              </div>
              <p className="mt-3 max-w-full truncate text-sm text-white/50">{userEmail}</p>
              <p className="mt-1 text-xs font-semibold text-white/35">{joinedDate(session.user.created_at)}</p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-left">
              <p className="text-2xl font-black text-[#00F5D4]">🔥 {streak}-night streak</p>
              <p className="mt-1 text-sm font-semibold text-white/45">
                {streak > 0 ? "Keep it up! Check in tonight to extend your streak." : "Start your streak tonight!"}
              </p>
            </div>
            <Link
              href="/notifications"
              className="flex w-full items-center justify-between rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4 text-left transition-colors hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
            >
              <span>
                <span className="block text-base font-black leading-tight text-white">Notifications</span>
                <span className="mt-1 block text-xs font-semibold text-white/45">Control your NightVibe alerts</span>
              </span>
              <span className="text-lg font-black text-white/35" aria-hidden="true">→</span>
            </Link>
            <div className="flex flex-wrap justify-center gap-2">
              <span className="rounded-full bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/65">
                {checkIns.length} vibe{checkIns.length === 1 ? "" : "s"} reported
              </span>
              <span className="rounded-full bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/65">
                {savedVenues.length} saved spot{savedVenues.length === 1 ? "" : "s"}
              </span>
            </div>
          </section>
        )}

        {session && (
          <section aria-label="Saved places">
            <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.15em] text-white/40">Saved Places</h2>
            {savedVenuesLoading ? (
              <SavedVenuesSkeleton />
            ) : savedVenues.length === 0 ? (
              <SavedPlacesEmptyState />
            ) : (
              <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 list-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {savedVenues.map((venue) => <SavedVenueCard key={venue.id} venue={venue} />)}
              </ul>
            )}
          </section>
        )}

        {session && <div className="border-t border-white/[0.06] my-6" />}

        {/* Check-in history */}
        {session && (
          <section aria-label="Your vibes">
            <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.15em] text-white/40">Your Vibes</h2>
            {checkInsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <CheckInSkeleton key={i} />)}
              </div>
            ) : checkIns.length === 0 ? (
              <CheckInsEmptyState />
            ) : (
              <ul className="space-y-3 list-none">
                {checkIns.map((ci) => (
                  <li key={ci.id}><CheckInRow item={ci} /></li>
                ))}
              </ul>
            )}
          </section>
        )}

        {session && <div className="border-t border-white/[0.06] my-6" />}

        {session && (
          <section aria-label="Preferences">
            <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.15em] text-white/40">Preferences</h2>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4">
              <div className="min-w-0">
                <h3 className="text-base font-black leading-tight text-white">Haptics</h3>
                <p className="mt-1 text-xs font-semibold text-white/45">
                  Short taps for core interactions on supported phones.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hapticsEnabled}
                onClick={toggleHapticsPreference}
                className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70 ${
                  hapticsEnabled
                    ? "border-[#00F5D4]/60 bg-[#00F5D4]/28"
                    : "border-white/15 bg-white/[0.06]"
                }`}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-lg transition-transform ${
                    hapticsEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
                <span className="sr-only">{hapticsEnabled ? "Turn haptics off" : "Turn haptics on"}</span>
              </button>
            </div>
          </section>
        )}

        {session && <div className="border-t border-white/[0.06] my-6" />}

        {session && (
          <section aria-label="Notifications">
            <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.15em] text-white/40">Notifications</h2>
            <PushOptIn />
          </section>
        )}

        {/* Report CTA */}
        {session && (
          <Link
            href="/vibe-check"
            className="flex items-center justify-center w-full min-h-[52px] rounded-2xl text-[#0A0A0F] font-black text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/80 transition-all duration-150 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #00F5D4 0%, #00dfc0 100%)", boxShadow: "0 0 24px rgba(0,245,212,0.35)" }}
          >
            Report another spot
          </Link>
        )}

        {session && (
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-10 w-full bg-transparent py-2 text-sm text-white/30 underline underline-offset-4 hover:text-white/50"
          >
            Sign out
          </button>
        )}
      </div>
      </div>
    </PageTransition>
  );
}
