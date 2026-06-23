"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, ChevronRight, LogOut, MapPin, Moon, Settings } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase-browser";

type SavedVenue = {
  venue_id: string;
  venue_name: string;
  created_at: string;
};

type CheckIn = {
  id: string;
  venue_id: string | null;
  created_at: string;
  venues?: { name?: string | null } | { name?: string | null }[] | null;
};

const YOU_TAB_LIMIT = 5;

function venueNameFrom(checkIn: CheckIn): string {
  const venues = checkIn.venues;
  if (Array.isArray(venues)) return venues[0]?.name ?? "Unknown venue";
  return venues?.name ?? "Unknown venue";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function initialFor(email: string): string {
  return email.trim().charAt(0).toUpperCase() || "Y";
}

function YouSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading You tab">
      <Skeleton className="h-24 rounded-[18px] bg-white/10" />
      <Skeleton className="h-44 rounded-[18px] bg-white/10" />
      <Skeleton className="h-44 rounded-[18px] bg-white/10" />
    </div>
  );
}

function LogoMark() {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#8B6CFF]/35 bg-[#8B6CFF]/15 text-[#8B6CFF] shadow-[0_0_28px_rgba(139,108,255,0.25)]">
      <Moon className="h-8 w-8" aria-hidden="true" />
    </div>
  );
}

function LoggedOutState({ onSignIn, signingIn }: { onSignIn: () => void; signingIn: boolean }) {
  return (
    <section className="flex min-h-[calc(100dvh-9rem)] flex-col items-center justify-center px-1 py-10 text-center">
      <LogoMark />
      <h1 className="mt-6 text-xl font-bold text-white">Sign in to track your nights</h1>
      <p className="mt-3 max-w-xs text-sm leading-6 text-white/60">
        Save venues, log check-ins, see your vibe history
      </p>
      <Button
        type="button"
        onClick={onSignIn}
        disabled={signingIn}
        className="mt-8 h-12 w-full max-w-sm rounded-full bg-[#8B6CFF] text-sm font-bold text-white hover:bg-[#9B82FF] focus-visible:ring-[#8B6CFF]/70"
      >
        {signingIn ? "Opening Google..." : "Sign in with Google"}
      </Button>
    </section>
  );
}

function ProfileHeader({ email }: { email: string }) {
  return (
    <section className="flex items-center gap-4 rounded-[18px] border border-white/[0.08] bg-white/[0.04] p-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#8B6CFF] text-xl font-black text-white">
        {initialFor(email)}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#F0568C]">You</p>
        <h1 className="truncate text-lg font-bold text-white">{email}</h1>
      </div>
    </section>
  );
}

function SectionShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white/70">{title}</h2>
      {children}
    </section>
  );
}

function SavedVenuesSection({ venues, loading }: { venues: SavedVenue[]; loading: boolean }) {
  return (
    <SectionShell title="Saved Venues">
      <div className="space-y-2">
        {loading &&
          Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-[16px] bg-white/10" />
          ))}

        {!loading &&
          venues.map((venue) => (
            <Link
              key={venue.venue_id}
              href={`/venues/${venue.venue_id}`}
              className="flex min-h-14 items-center justify-between gap-3 rounded-[16px] border border-white/[0.08] bg-white/[0.04] px-4 py-3 transition-colors hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              <span className="min-w-0 truncate text-sm font-semibold text-white">{venue.venue_name}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/45" aria-hidden="true" />
            </Link>
          ))}

        {!loading && venues.length === 0 && (
          <Card className="rounded-[18px] border-white/[0.08] bg-white/[0.04] p-4 text-sm leading-6 text-white/60">
            No saved venues yet. Tap ♡ on any venue to save it.
          </Card>
        )}
      </div>
    </SectionShell>
  );
}

function RecentCheckInsSection({ checkIns, loading }: { checkIns: CheckIn[]; loading: boolean }) {
  return (
    <SectionShell title="Recent Check-ins">
      <div className="space-y-2">
        {loading &&
          Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-[16px] bg-white/10" />
          ))}

        {!loading &&
          checkIns.map((checkIn) => (
            <Link
              key={checkIn.id}
              href={checkIn.venue_id ? `/venues/${checkIn.venue_id}` : "/map"}
              className="flex min-h-16 items-center gap-3 rounded-[16px] border border-white/[0.08] bg-white/[0.04] px-4 py-3 transition-colors hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              <MapPin className="h-4 w-4 shrink-0 text-[#8B6CFF]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{venueNameFrom(checkIn)}</span>
                <span className="block text-sm text-white/60">{formatDate(checkIn.created_at)}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/45" aria-hidden="true" />
            </Link>
          ))}

        {!loading && checkIns.length === 0 && (
          <Card className="rounded-[18px] border-white/[0.08] bg-white/[0.04] p-4 text-sm leading-6 text-white/60">
            No check-ins yet. Check in at a venue to track your nights.
          </Card>
        )}
      </div>
    </SectionShell>
  );
}

function SettingsSection() {
  return (
    <SectionShell title="Settings">
      <div className="space-y-2">
        <Link
          href="/notifications"
          className="flex min-h-14 items-center justify-between rounded-[16px] border border-white/[0.08] bg-white/[0.04] px-4 py-3 transition-colors hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          <span className="flex items-center gap-3 text-sm font-semibold text-white">
            <Bell className="h-4 w-4 text-[#F0568C]" aria-hidden="true" />
            Notifications
          </span>
          <ChevronRight className="h-4 w-4 text-white/45" aria-hidden="true" />
        </Link>
        <div className="flex min-h-14 items-center gap-3 rounded-[16px] border border-white/[0.08] bg-white/[0.04] px-4 py-3">
          <Settings className="h-4 w-4 text-[#8B6CFF]" aria-hidden="true" />
          <span className="text-sm font-semibold text-white">Google account connected</span>
        </div>
      </div>
    </SectionShell>
  );
}

function LoggedInState({
  session,
  savedVenues,
  checkIns,
  loadingSaved,
  loadingCheckIns,
  onSignOut,
}: {
  session: Session;
  savedVenues: SavedVenue[];
  checkIns: CheckIn[];
  loadingSaved: boolean;
  loadingCheckIns: boolean;
  onSignOut: () => void;
}) {
  const email = session.user.email ?? "Signed in";

  return (
    <div className="space-y-7 pb-8">
      <ProfileHeader email={email} />
      <SavedVenuesSection venues={savedVenues} loading={loadingSaved} />
      <RecentCheckInsSection checkIns={checkIns} loading={loadingCheckIns} />
      <SettingsSection />
      <button
        type="button"
        onClick={onSignOut}
        className="inline-flex items-center gap-2 px-1 py-2 text-sm font-semibold text-red-400 transition-colors hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
}

export default function ProfilePage() {
  const supabaseBrowser = useMemo(() => createBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [savedVenues, setSavedVenues] = useState<SavedVenue[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [loadingCheckIns, setLoadingCheckIns] = useState(false);

  const loadSavedVenues = useCallback(
    async (currentSession: Session) => {
      setLoadingSaved(true);
      try {
        const res = await fetch("/api/user/saved-venues", {
          headers: { Authorization: `Bearer ${currentSession.access_token}` },
          cache: "no-store",
        });
        if (!res.ok) {
          setSavedVenues([]);
          return;
        }
        const rows = (await res.json()) as SavedVenue[];
        setSavedVenues(rows.slice(0, YOU_TAB_LIMIT));
      } catch {
        setSavedVenues([]);
      } finally {
        setLoadingSaved(false);
      }
    },
    [],
  );

  const loadCheckIns = useCallback(async (currentSession: Session) => {
    setLoadingCheckIns(true);
    try {
      const { data, error } = await supabaseBrowser
        .from("check_ins")
        .select("id,venue_id,created_at,venues(name)")
        .eq("user_id", currentSession.user.id)
        .order("created_at", { ascending: false })
        .limit(YOU_TAB_LIMIT);

      if (error) {
        setCheckIns([]);
        return;
      }

      setCheckIns(((data ?? []) as CheckIn[]).slice(0, YOU_TAB_LIMIT));
    } catch {
      setCheckIns([]);
    } finally {
      setLoadingCheckIns(false);
    }
  }, [supabaseBrowser]);

  useEffect(() => {
    let cancelled = false;

    async function initAuth() {
      const { data } = await supabaseBrowser.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setAuthChecked(true);
      if (data.session) {
        void loadSavedVenues(data.session);
        void loadCheckIns(data.session);
      }
    }

    void initAuth();

    const {
      data: { subscription },
    } = supabaseBrowser.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        void loadSavedVenues(nextSession);
        void loadCheckIns(nextSession);
      } else {
        setSavedVenues([]);
        setCheckIns([]);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadCheckIns, loadSavedVenues, supabaseBrowser]);

  async function handleGoogleSignIn() {
    setSigningIn(true);
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabaseBrowser.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) setSigningIn(false);
  }

  async function handleSignOut() {
    await supabaseBrowser.auth.signOut();
    setSession(null);
    setSavedVenues([]);
    setCheckIns([]);
  }

  return (
    <PageTransition>
      <main className="mx-auto min-h-screen w-full max-w-lg bg-[#0A0A0E] px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5 text-white">
        {!authChecked && <YouSkeleton />}
        {authChecked && !session && <LoggedOutState onSignIn={handleGoogleSignIn} signingIn={signingIn} />}
        {authChecked && session && (
          <LoggedInState
            session={session}
            savedVenues={savedVenues}
            checkIns={checkIns}
            loadingSaved={loadingSaved}
            loadingCheckIns={loadingCheckIns}
            onSignOut={handleSignOut}
          />
        )}
      </main>
    </PageTransition>
  );
}
