"use client";

// ============================================================
// Profile Page  — NV-062, NV-065
//
// Logged-in: profile, recent check-ins, saved venues, and settings.
// Logged-out: pitch card with sign-up CTA.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConsumerVenue, VenueSignal } from "@/types";

// --------------- Crowd badge --------------------------------

type Busyness = "dead" | "moderate" | "packed";
type CrowdFeel = "mostly_male" | "mostly_female" | "balanced" | "mixed";
type SignalBusyness = "No signal" | "Quiet" | "Moderate" | "Packed";

const BUSYNESS_CFG: Record<Busyness, { label: string; bg: string; text: string }> = {
  dead:     { label: "Dead",     bg: "rgba(34,197,94,0.40)",  text: "#fff" },
  moderate: { label: "Moderate", bg: "rgba(251,191,36,0.40)", text: "#fff" },
  packed:   { label: "Packed",   bg: "rgba(249,115,22,0.40)", text: "#fff" },
};

const CROWD_FEEL_LABEL: Record<CrowdFeel, string> = {
  mostly_male: "Mostly male",
  mostly_female: "Mostly female",
  balanced: "Balanced",
  mixed: "Mixed / unsure",
};

const SOURCE_LABEL: Record<NonNullable<VenueSignal["busynessSource"]>, string> = {
  live: "Source: live check-in",
  forecast: "Source: BestTime forecast",
  crowd: "Source: crowd report",
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

function getSignalBusyness(value: number | null | undefined): SignalBusyness {
  if (value == null) return "No signal";
  if (value >= 67) return "Packed";
  if (value >= 34) return "Moderate";
  return "Quiet";
}

function SignalBusynessPill({ venue }: { venue: ConsumerVenue }) {
  if (venue.signal?.busyness0To100 == null) return null;

  const label = getSignalBusyness(venue.signal?.busyness0To100);
  const className =
    label === "Packed"
      ? "border-red-400/30 bg-red-500/15 text-red-200"
      : label === "Moderate"
      ? "border-yellow-400/30 bg-yellow-500/15 text-yellow-100"
      : label === "Quiet"
      ? "border-emerald-400/25 bg-emerald-500/12 text-emerald-100"
      : "border-white/10 bg-white/[0.06] text-white/45";

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${className}`}>
      {label}
    </span>
  );
}

function sourceLabel(source: VenueSignal["busynessSource"] | null | undefined): string {
  return source ? SOURCE_LABEL[source] : "Source: no current signal";
}

// --------------- Time ago -----------------------------------

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 1000 / 60);
  if (mins < 1) return "Just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return h === 1 ? "1 hr ago" : `${h} hr ago`;
}

// --------------- Check-in row -------------------------------

interface CheckInItem {
  id: string;
  venueId: string;
  placeId: string;
  venueName?: string;
  busyness: string;
  crowdFeel: string;
  note?: string;
  createdAt: string;
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

function CheckInRow({ item }: { item: CheckInItem }) {
  const venueLabel = item.venueName || item.placeId || item.venueId || "Venue";

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
            <Badge className="border border-[#00F5D4]/25 bg-[#00F5D4]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#00F5D4] hover:bg-[#00F5D4]/10">
              {CROWD_FEEL_LABEL[item.crowdFeel as CrowdFeel] ?? item.crowdFeel}
            </Badge>
          </div>
          {item.note && <p className="mt-1 text-xs text-white/40 line-clamp-2">{item.note}</p>}
        </div>
      </div>
    </div>
  );
}

function SavedVenueRow({ venue }: { venue: ConsumerVenue }) {
  return (
    <li className="rounded-2xl border border-white/[0.09] px-3 py-3" style={{ background: "rgba(255,255,255,0.04)" }}>
      <Link href={`/venues/${encodeURIComponent(venue.id)}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold leading-snug text-white">{venue.name}</p>
            <p className="mt-1 truncate text-xs font-semibold text-white/42">{venue.category || "Venue"}</p>
          </div>
          <SignalBusynessPill venue={venue} />
        </div>
        <p className="mt-2 text-[11px] font-semibold text-white/35">{sourceLabel(venue.signal?.busynessSource)}</p>
      </Link>
    </li>
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
      <section className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-6 shadow-[0_0_32px_rgba(0,245,212,0.05)]" aria-label="Sign up benefits">
        <h2 className="text-2xl font-black text-white">Your Night Out HQ</h2>
        <p className="mt-1 text-sm text-white/50">Sign up to unlock everything</p>
        <ul className="mt-6 space-y-3">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#00F5D4]/10 text-[#00F5D4] text-sm">
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
  const [checkInsLoading, setCheckInsLoading] = useState(false);
  const [savedVenuesLoading, setSavedVenuesLoading] = useState(false);

  useEffect(() => {
    const client = createBrowserClient();

    client.auth.getSession().then(({ data }) => {
      const activeSession = data.session ?? readLocalTestSession();
      if (!activeSession) {
        setSession(null);
        setCheckIns([]);
        setSavedVenues([]);
        setAuthChecked(true);
        return;
      }
      setSession(activeSession);
      setAuthChecked(true);
      fetchCheckIns(activeSession.access_token);
      fetchSavedVenues(activeSession.access_token);
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, sess) => {
      const activeSession = sess ?? readLocalTestSession();
      if (!activeSession) {
        setSession(null);
        setCheckIns([]);
        setSavedVenues([]);
        setAuthChecked(true);
        return;
      }
      setSession(activeSession);
      setAuthChecked(true);
      fetchCheckIns(activeSession.access_token);
      fetchSavedVenues(activeSession.access_token);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchCheckIns(token: string) {
    setCheckInsLoading(true);
    try {
      const res = await fetch("/api/check-ins/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      const rows = (json.data?.checkIns ?? []) as Array<{
        id: string;
        venue_id?: string; venueId?: string;
        place_id?: string; placeId?: string;
        venue_name?: string; venueName?: string;
        busyness?: string;
        crowd_feel?: string; crowdFeel?: string;
        note?: string;
        created_at?: string; createdAt?: string;
      }>;
      setCheckIns(rows.map((r) => ({
        id: r.id,
        venueId: r.venue_id ?? r.venueId ?? "",
        placeId: r.place_id ?? r.placeId ?? "",
        venueName: r.venue_name ?? r.venueName,
        busyness: r.busyness ?? "",
        crowdFeel: r.crowd_feel ?? r.crowdFeel ?? "",
        note: r.note,
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

  async function handleSignOut() {
    const client = createBrowserClient();
    await client.auth.signOut();
    router.push("/");
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <header className="sticky top-0 z-40 bg-[#0A0A0F]/92 backdrop-blur-xl border-b border-white/[0.08] px-4">
        <div className="max-w-lg mx-auto py-4">
          <h1 className="truncate text-white font-black text-2xl tracking-[-0.01em]">
            {session?.user.email ?? (authChecked ? "You" : "Loading profile...")}
          </h1>
          <p className="mt-0.5 text-sm font-semibold text-white/45">{session ? "Your Reports" : "Sign in to unlock your night out tools"}</p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5 pb-44">
        {!authChecked && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <CheckInSkeleton key={i} />)}
          </div>
        )}

        {authChecked && !session && <LoggedOutPitch />}

        {/* Logged-in header */}
        {session && (
          <div className="flex items-center gap-3 rounded-2xl border border-white/[0.09] p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="w-10 h-10 rounded-full bg-[#00F5D4]/15 border border-[#00F5D4]/30 flex-shrink-0 flex items-center justify-center">
              <span className="text-[#00F5D4] font-bold text-base uppercase">
                {session.user.email?.[0] ?? "?"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">Recent check-ins</p>
              <p className="mt-0.5 text-xs text-white/40">
                {checkIns.length} report{checkIns.length === 1 ? "" : "s"} saved to this account
              </p>
            </div>
          </div>
        )}

        {/* Check-in history */}
        {session && (
          <section aria-label="Your reports">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="text-lg font-black text-white">Check-in History</h2>
              <span className="text-xs font-semibold text-white/35">{checkIns.length} total</span>
            </div>
            {checkInsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <CheckInSkeleton key={i} />)}
              </div>
            ) : checkIns.length === 0 ? (
              <div className="rounded-2xl bg-white/5 border border-white/[0.08] p-6 text-center">
                <p className="text-white/40 text-sm">No reports yet. Be the first to vibe-check a venue!</p>
              </div>
            ) : (
              <ul className="space-y-3 list-none">
                {checkIns.map((ci) => (
                  <li key={ci.id}><CheckInRow item={ci} /></li>
                ))}
              </ul>
            )}
          </section>
        )}

        {session && (
          <section aria-label="Saved spots">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="text-lg font-black text-white">Saved Spots</h2>
              <span className="text-xs font-semibold text-white/35">{savedVenues.length} saved</span>
            </div>
            {savedVenuesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => <CheckInSkeleton key={i} />)}
              </div>
            ) : savedVenues.length === 0 ? (
              <div className="rounded-2xl bg-white/5 border border-white/[0.08] p-6 text-center">
                <p className="text-white/40 text-sm">No saved spots yet — tap ❤ on any venue</p>
              </div>
            ) : (
              <ul className="space-y-3 list-none">
                {savedVenues.map((venue) => <SavedVenueRow key={venue.id} venue={venue} />)}
              </ul>
            )}
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
          <Button
            onClick={handleSignOut}
            variant="ghost"
            className="min-h-[48px] w-full border border-white/10 bg-white/[0.04] text-sm font-semibold text-white/55 hover:bg-white/[0.08] hover:text-white"
          >
            Sign out
          </Button>
        )}
      </div>
    </div>
  );
}
