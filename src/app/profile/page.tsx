"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronRight, Flame, LogOut, MapPin, Moon, UserRound } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { OnboardingOverlay } from "@/components/OnboardingOverlay";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase-browser";

type TopVenue = {
  venueId: string;
  venueName: string | null;
  checkInCount: number;
};

type UserProfile = {
  userId: string;
  totalCheckIns: number;
  uniqueVenues: number;
  streak: number;
  topVenues: TopVenue[];
};

const EMPTY_PROFILE: UserProfile = {
  userId: "",
  totalCheckIns: 0,
  uniqueVenues: 0,
  streak: 0,
  topVenues: [],
};

function initialsFrom(name: string, email: string): string {
  const source = name.trim() || email.trim();
  const parts = source
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);

  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.slice(0, 2) || "NV").toUpperCase();
}

function displayNameFrom(session: Session): string {
  const metadata = session.user.user_metadata ?? {};
  const candidate =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : typeof metadata.user_name === "string"
          ? metadata.user_name
          : "";

  if (candidate.trim()) return candidate;
  return session.user.email?.split("@")[0] || "Night Vibe";
}

function avatarUrlFrom(session: Session): string | null {
  const metadata = session.user.user_metadata ?? {};
  const candidate = metadata.avatar_url ?? metadata.picture;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

function ProfileSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading profile">
      <Card className="rounded-[8px] border-white/[0.08] bg-[#14141A] p-5">
        <div className="flex flex-col items-center text-center">
          <Skeleton className="h-24 w-24 rounded-full bg-white/10" />
          <Skeleton className="mt-5 h-5 w-40 bg-white/10" />
          <Skeleton className="mt-2 h-4 w-52 bg-white/10" />
        </div>
      </Card>

      <Card className="rounded-[8px] border-white/[0.08] bg-[#14141A] p-4">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-[8px] bg-white/10" />
          ))}
        </div>
      </Card>

      <Card className="rounded-[8px] border-white/[0.08] bg-[#14141A] p-4">
        <Skeleton className="h-4 w-28 bg-white/10" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 rounded-[8px] bg-white/10" />
          ))}
        </div>
      </Card>
    </div>
  );
}

function LoggedOutState({
  signingIn,
  onGoogleSignIn,
}: {
  signingIn: boolean;
  onGoogleSignIn: () => void;
}) {
  return (
    <section className="flex min-h-[calc(100dvh-9rem)] flex-col items-center justify-center text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#8B6CFF]/35 bg-[#8B6CFF]/15 text-[#8B6CFF] shadow-[0_0_34px_rgba(139,108,255,0.25)]">
        <Moon className="h-9 w-9" aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-2xl font-black tracking-tight text-white">Know before you go.</h1>
      <p className="mt-3 max-w-xs text-sm leading-6 text-white/62">
        Sign in to see your check-in stats, top spots, and streaks.
      </p>
      <Button
        type="button"
        onClick={onGoogleSignIn}
        disabled={signingIn}
        className="mt-8 h-12 w-full max-w-sm rounded-full bg-[#8B6CFF] text-sm font-black text-white hover:bg-[#9B82FF] focus-visible:ring-[#8B6CFF]/70"
      >
        {signingIn ? "Opening Google..." : "Continue with Google"}
      </Button>
      <Button
        asChild
        variant="ghost"
        className="mt-3 h-11 rounded-full px-5 text-sm font-bold text-[#00F5D4] hover:bg-[#00F5D4]/10 hover:text-[#00F5D4]"
      >
        <Link href="/login?return=/profile">Or sign in with email</Link>
      </Button>
    </section>
  );
}

function ProfileHero({ session }: { session: Session }) {
  const email = session.user.email ?? "Signed in";
  const displayName = displayNameFrom(session);
  const avatarUrl = avatarUrlFrom(session);
  const initials = initialsFrom(displayName, email);

  return (
    <Card className="rounded-[8px] border-white/[0.08] bg-[#14141A] p-5">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#8B6CFF,#00F5D4)] p-[3px] shadow-[0_0_36px_rgba(139,108,255,0.38)]">
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#0A0A0E]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span className="text-3xl font-black tracking-normal text-white">{initials}</span>
            )}
          </div>
        </div>
        <h1 className="mt-5 max-w-full truncate text-2xl font-black tracking-tight text-white">{displayName}</h1>
        <p className="mt-1 max-w-full truncate text-sm font-semibold text-white/58">{email}</p>
      </div>
    </Card>
  );
}

function StatCard({
  label,
  value,
  icon,
  accentClassName,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accentClassName: string;
}) {
  const statId = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const labelId = `profile-stat-${statId}-label`;
  const valueId = `profile-stat-${statId}-value`;

  return (
    <Card
      role="group"
      aria-labelledby={labelId}
      aria-describedby={valueId}
      className="min-h-28 rounded-[8px] border-white/[0.08] bg-[#14141A] p-4"
    >
      <div className="flex h-full flex-col justify-between gap-4">
        <span className={accentClassName}>{icon}</span>
        <div className="min-w-0">
          <p id={valueId} className="truncate text-2xl font-black leading-none tracking-normal text-white">{value}</p>
          <h2 id={labelId} className="mt-2 text-xs font-bold uppercase leading-4 tracking-[0.12em] text-white/45">{label}</h2>
        </div>
      </div>
    </Card>
  );
}

function StatsGrid({ profile }: { profile: UserProfile }) {
  const topVenue = profile.topVenues[0]?.venueName || "None yet";

  return (
    <section aria-label="Profile stats" className="grid grid-cols-2 gap-3">
      <StatCard
        label="Total Check-ins"
        value={profile.totalCheckIns.toLocaleString()}
        icon={<Moon className="h-5 w-5" aria-hidden="true" />}
        accentClassName="text-[#8B6CFF]"
      />
      <StatCard
        label="Unique Venues"
        value={profile.uniqueVenues.toLocaleString()}
        icon={<MapPin className="h-5 w-5" aria-hidden="true" />}
        accentClassName="text-[#00F5D4]"
      />
      <StatCard
        label="Current Streak"
        value={`${profile.streak}`}
        icon={<Flame className="h-5 w-5" aria-hidden="true" />}
        accentClassName="text-[#FFB020]"
      />
      <StatCard
        label="Top Venue"
        value={topVenue}
        icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
        accentClassName="text-[#8B6CFF]"
      />
    </section>
  );
}

function EmptyProfileState() {
  return (
    <Card className="rounded-[8px] border-[#8B6CFF]/30 bg-[#14141A] p-6 text-center shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#00F5D4]/25 bg-[#00F5D4]/10 text-[#00F5D4]">
        <UserRound className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="mx-auto mt-4 max-w-xs text-base font-black leading-6 text-white">
        Start exploring and check in to see your stats
      </p>
      <Button
        asChild
        className="mt-5 h-11 rounded-full bg-[#8B6CFF] px-5 text-sm font-black text-white hover:bg-[#9B82FF] focus-visible:ring-[#8B6CFF]/70"
      >
        <Link href="/explore">Explore spots</Link>
      </Button>
    </Card>
  );
}

function TopVenuesList({ venues }: { venues: TopVenue[] }) {
  return (
    <section className="space-y-3" aria-labelledby="top-venues-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="top-venues-heading" className="text-sm font-black uppercase tracking-[0.14em] text-white/72">
          Top Venues
        </h2>
        <span className="text-xs font-bold text-[#00F5D4]">Top 3</span>
      </div>
      <Card className="overflow-hidden rounded-[8px] border-white/[0.08] bg-[#14141A]">
        {venues.map((venue, index) => (
          <Link
            key={venue.venueId}
            href={`/venues/${venue.venueId}`}
            className="flex min-h-16 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 transition-colors last:border-b-0 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#8B6CFF]/15 text-xs font-black text-[#8B6CFF]">
                {index + 1}
              </span>
              <span className="min-w-0 truncate text-sm font-bold text-white">{venue.venueName || "Unknown venue"}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-[#00F5D4]/30 bg-[#00F5D4]/10 px-2.5 py-1 text-xs font-black text-[#00F5D4]">
                {venue.checkInCount}
              </span>
              <ChevronRight className="h-4 w-4 text-white/38" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </Card>
    </section>
  );
}

function ProfileContent({
  session,
  profile,
  onSignOut,
  onChangeArea,
}: {
  session: Session;
  profile: UserProfile;
  onSignOut: () => void;
  onChangeArea: () => void;
}) {
  const hasStats = profile.totalCheckIns > 0 || profile.uniqueVenues > 0 || profile.topVenues.length > 0;

  return (
    <div className="space-y-5 pb-8">
      <ProfileHero session={session} />
      <StatsGrid profile={profile} />
      {hasStats ? <TopVenuesList venues={profile.topVenues.slice(0, 3)} /> : <EmptyProfileState />}

      <div className="flex flex-col gap-3 pt-1">
        <Button
          type="button"
          onClick={onChangeArea}
          variant="ghost"
          className="h-11 justify-start rounded-[8px] border border-white/[0.08] bg-[#14141A] px-4 text-sm font-bold text-white/72 hover:bg-white/[0.06] hover:text-white"
        >
          <MapPin className="h-4 w-4 text-[#00F5D4]" aria-hidden="true" />
          Change my area
        </Button>
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex min-h-11 items-center gap-2 rounded-[8px] px-2 text-sm font-bold text-red-300 transition-colors hover:text-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const supabaseBrowser = useMemo(() => createBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [profileLoading, setProfileLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [showAreaPicker, setShowAreaPicker] = useState(false);

  const loadProfile = useCallback(async (currentSession: Session) => {
    setProfileLoading(true);
    try {
      const res = await fetch("/api/user/profile", {
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
        cache: "no-store",
      });

      if (!res.ok) {
        setProfile({ ...EMPTY_PROFILE, userId: currentSession.user.id });
        return;
      }

      const data = (await res.json()) as UserProfile;
      setProfile({
        ...EMPTY_PROFILE,
        ...data,
        topVenues: Array.isArray(data.topVenues) ? data.topVenues.slice(0, 3) : [],
      });
    } catch {
      setProfile({ ...EMPTY_PROFILE, userId: currentSession.user.id });
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initAuth() {
      const { data } = await supabaseBrowser.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setAuthChecked(true);
      if (data.session) void loadProfile(data.session);
    }

    void initAuth();

    const {
      data: { subscription },
    } = supabaseBrowser.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        void loadProfile(nextSession);
      } else {
        setProfile(EMPTY_PROFILE);
        setProfileLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadProfile, supabaseBrowser]);

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
    setProfile(EMPTY_PROFILE);
  }

  return (
    <PageTransition>
      <main className="mx-auto min-h-screen-safe w-full max-w-lg bg-[#0A0A0E] px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5 text-white">
        {!authChecked && <ProfileSkeleton />}
        {authChecked && !session && (
          <LoggedOutState signingIn={signingIn} onGoogleSignIn={() => void handleGoogleSignIn()} />
        )}
        {authChecked && session && profileLoading && <ProfileSkeleton />}
        {authChecked && session && !profileLoading && (
          <ProfileContent
            session={session}
            profile={profile}
            onSignOut={() => void handleSignOut()}
            onChangeArea={() => setShowAreaPicker(true)}
          />
        )}
        {showAreaPicker && <OnboardingOverlay forceOpen onClose={() => setShowAreaPicker(false)} />}
      </main>
    </PageTransition>
  );
}
