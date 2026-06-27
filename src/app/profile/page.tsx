"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Check, ChevronRight, Crown, Flame, LogOut, MapPin, Moon, Settings, Share2, Star } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { OnboardingOverlay } from "@/components/OnboardingOverlay";
import { PageTransition } from "@/components/PageTransition";
import { Toast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getHapticsPreference, setHapticsPreference } from "@/lib/haptics";
import { savePushSubscription, unsubscribeFromPush } from "@/lib/push";
import { createBrowserClient } from "@/lib/supabase-browser";

type SavedVenue = {
  venue_id: string;
  venue_name: string;
  created_at: string;
};

type CheckIn = {
  id: string;
  venue_id: string | null;
  venue_name?: string | null;
  busyness?: string | null;
  crowd_feel?: string | null;
  note?: string | null;
  created_at: string;
  venues?: { name?: string | null } | { name?: string | null }[] | null;
};

type RewardLevel = "newcomer" | "regular" | "local" | "insider";

type RewardScore = {
  points_total: number;
  level: RewardLevel;
  streak_count: number;
  trusted_reporter: boolean;
  confirmed_checkins: number;
};

type NotificationPrefs = {
  notifyBusyVenues: boolean;
  notifyWeeklySummary: boolean;
};

const DEFAULT_REWARD_SCORE: RewardScore = {
  points_total: 0,
  level: "newcomer",
  streak_count: 0,
  trusted_reporter: false,
  confirmed_checkins: 0,
};

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  notifyBusyVenues: false,
  notifyWeeklySummary: false,
};

const YOU_TAB_LIMIT = 5;

function venueNameFrom(checkIn: CheckIn): string {
  if (checkIn.venue_name) return checkIn.venue_name;
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

function levelLabel(level: RewardLevel): string {
  if (level === "regular") return "Regular";
  if (level === "local") return "Local";
  if (level === "insider") return "Insider";
  return "Newcomer";
}

function levelClassName(level: RewardLevel): string {
  if (level === "regular") return "bg-[#8B6CFF]/15 text-[#8B6CFF] border border-[#8B6CFF]/35";
  if (level === "local") return "bg-[#F0568C]/15 text-[#F0568C] border border-[#F0568C]/35";
  if (level === "insider") return "bg-[#FFB020]/15 text-[#FFB020] border border-[#FFB020]/35";
  return "bg-white/10 text-white/70 border border-white/15";
}

function busynessLabel(value: string | null | undefined): string | null {
  if (value === "packed") return "Packed";
  if (value === "moderate") return "Moderate";
  if (value === "dead" || value === "quiet") return "Quiet";
  return null;
}

function busynessDotClassName(value: string | null | undefined): string {
  if (value === "packed") return "bg-[#FF5B6A] shadow-[0_0_16px_rgba(255,91,106,0.55)]";
  if (value === "moderate") return "bg-[#FFB020] shadow-[0_0_16px_rgba(255,176,32,0.45)]";
  if (value === "dead" || value === "quiet") return "bg-[#5C6573] shadow-[0_0_14px_rgba(92,101,115,0.35)]";
  return "bg-[#8B6CFF] shadow-[0_0_16px_rgba(139,108,255,0.45)]";
}

function busynessBadgeClassName(value: string | null | undefined): string {
  if (value === "packed") return "border-[#FF5B6A]/40 bg-[#FF5B6A]/15 text-[#FF8A94]";
  if (value === "moderate") return "border-[#FFB020]/40 bg-[#FFB020]/15 text-[#FFCB66]";
  if (value === "dead" || value === "quiet") return "border-white/15 bg-white/10 text-white/65";
  return "border-[#8B6CFF]/35 bg-[#8B6CFF]/15 text-[#B9AAFF]";
}

function nextLevelProgress(level: RewardLevel, confirmedCheckins: number): { level: RewardLevel; threshold: number } | null {
  if (level === "newcomer") return { level: "regular", threshold: 5 };
  if (level === "regular") return { level: "local", threshold: 20 };
  if (level === "local") return { level: "insider", threshold: 50 };
  return null;
}

function YouSkeleton() {
  return (
    <div className="space-y-7" role="status" aria-label="Loading You tab">
      <section className="flex items-center gap-4 rounded-[18px] border border-white/[0.08] bg-white/[0.04] p-4">
        <Skeleton className="h-16 w-16 shrink-0 rounded-full bg-white/10" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-3 w-12 bg-white/10" />
          <Skeleton className="h-5 w-2/3 bg-white/10" />
          <Skeleton className="h-6 w-32 rounded-full bg-white/10" />
        </div>
      </section>
      <section className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-[104px] rounded-[18px] bg-white/10" />
        ))}
      </section>
      <Skeleton className="h-36 rounded-[18px] bg-white/10" />
      <Skeleton className="h-20 rounded-[18px] bg-white/10" />
      <section className="space-y-2">
        <Skeleton className="h-4 w-28 bg-white/10" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-14 rounded-[16px] bg-white/10" />
        ))}
      </section>
      <section className="space-y-2">
        <Skeleton className="h-4 w-24 bg-white/10" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-16 rounded-[16px] bg-white/10" />
        ))}
      </section>
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

function LoggedOutState({
  onSignIn,
  signingIn,
  onChangeArea,
}: {
  onSignIn: () => void;
  signingIn: boolean;
  onChangeArea: () => void;
}) {
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
      <button
        type="button"
        onClick={onChangeArea}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold text-white/65 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      >
        <MapPin className="h-4 w-4" aria-hidden="true" />
        Change my area
      </button>
    </section>
  );
}

function ProfileHeader({ email, trustedReporter }: { email: string; trustedReporter: boolean }) {
  return (
    <section className="flex items-center gap-4 rounded-[18px] border border-white/[0.08] bg-white/[0.04] p-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8B6CFF,#F0568C)] p-[3px] shadow-[0_0_28px_rgba(139,108,255,0.45),0_0_36px_rgba(240,86,140,0.25)]">
        <div className="flex h-full w-full items-center justify-center rounded-full bg-[#111118] text-xl font-black text-white">
          {initialFor(email)}
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#F0568C]">You</p>
        <h1 className="truncate text-lg font-bold text-white">{email}</h1>
        {trustedReporter && (
          <span className="mt-2 inline-flex rounded-full border border-[#FFB020]/35 bg-[#FFB020]/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#FFB020]">
            Trusted reporter
          </span>
        )}
      </div>
    </section>
  );
}

function ProfileStatsGrid({ score, loading }: { score: RewardScore; loading: boolean }) {
  const stats = [
    { label: "Total Nights Out", value: score.confirmed_checkins, icon: Moon, color: "text-[#8B6CFF]" },
    { label: "Current Streak", value: score.streak_count, icon: Flame, color: "text-[#FFB020]" },
    { label: "Points", value: score.points_total, icon: Star, color: "text-[#F0568C]" },
  ];

  return (
    <section className="grid grid-cols-3 gap-2">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label} className="min-h-[104px] rounded-[18px] border-white/[0.08] bg-[#111118] p-3">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-4 rounded-full bg-white/10" />
                <Skeleton className="h-6 w-12 bg-white/10" />
                <Skeleton className="h-3 w-full bg-white/10" />
              </div>
            ) : (
              <div className="flex h-full flex-col justify-between">
                <Icon className={`h-4 w-4 ${stat.color}`} aria-hidden="true" />
                <div>
                  <p className="text-xl font-black leading-none text-white">{stat.value.toLocaleString()}</p>
                  <p className="mt-1 text-[11px] font-semibold leading-4 text-white/50">{stat.label}</p>
                </div>
              </div>
            )}
          </Card>
        );
      })}
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
            You haven&apos;t saved any venues yet
          </Card>
        )}
      </div>
    </SectionShell>
  );
}

function TopSpotCard({ topSpot, loading }: { topSpot: { venueId: string; venueName: string; count: number } | null; loading: boolean }) {
  if (loading) {
    return (
      <SectionShell title="Top Spot">
        <Skeleton className="h-20 rounded-[18px] bg-white/10" />
      </SectionShell>
    );
  }

  if (!topSpot) return null;

  return (
    <SectionShell title="Top Spot">
      <Link
        href={`/venues/${topSpot.venueId}`}
        className="flex min-h-20 items-center justify-between gap-4 rounded-[18px] border border-[#FFB020]/25 bg-[#FFB020]/10 px-4 py-3 transition-colors hover:bg-[#FFB020]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#FFB020]/35 bg-[#FFB020]/15">
            <Crown className="h-5 w-5 text-[#FFB020]" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-white">{topSpot.venueName}</span>
            <span className="block text-sm text-white/55">
              {topSpot.count} {topSpot.count === 1 ? "check-in" : "check-ins"}
            </span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/45" aria-hidden="true" />
      </Link>
    </SectionShell>
  );
}

function ProfileCompletionNudge({ savedCount, checkInCount }: { savedCount: number; checkInCount: number }) {
  if (savedCount > 0 || checkInCount > 0) return null;

  return (
    <section className="rounded-[18px] border border-[#8B6CFF]/40 bg-gradient-to-r from-[#8B6CFF]/10 to-[#F0568C]/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white">Get started</h2>
          <p className="mt-1 text-sm leading-6 text-white/75">Save a venue or log your first check-in to build your nightlife profile.</p>
        </div>
        <Button
          asChild
          className="min-h-11 rounded-full bg-[#8B6CFF] text-sm font-bold text-white transition-transform active:scale-95 hover:bg-[#9B82FF] focus-visible:ring-[#8B6CFF]/70"
        >
          <Link href="/explore">Explore</Link>
        </Button>
      </div>
    </section>
  );
}

function RecentCheckInsSection({ checkIns, loading }: { checkIns: CheckIn[]; loading: boolean }) {
  const visibleCheckIns = checkIns.slice(0, YOU_TAB_LIMIT);

  return (
    <SectionShell title="My Nights">
      <div className="space-y-0">
        {loading &&
          Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="mb-2 h-16 rounded-[16px] bg-white/10" />
          ))}

        {!loading &&
          visibleCheckIns.map((checkIn, index) => {
            const label = busynessLabel(checkIn.busyness);
            return (
              <Link
                key={checkIn.id}
                href={checkIn.venue_id ? `/venues/${checkIn.venue_id}` : "/map"}
                className="group grid min-h-16 grid-cols-[1.5rem_1fr_auto] gap-3 rounded-[16px] px-1 py-2 transition-colors hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
              >
                <span className="relative flex justify-center pt-3" aria-hidden="true">
                  <span className={`h-3 w-3 rounded-full ${busynessDotClassName(checkIn.busyness)}`} />
                  {index < visibleCheckIns.length - 1 && (
                    <span className="absolute top-7 h-[calc(100%-0.25rem)] w-px bg-white/10" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{venueNameFrom(checkIn)}</span>
                  <span className="block text-sm text-white/60">{formatDate(checkIn.created_at)}</span>
                </span>
                <span className="flex items-center gap-2">
                  {label && (
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${busynessBadgeClassName(checkIn.busyness)}`}
                    >
                      {label}
                    </span>
                  )}
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-white/45 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            );
          })}

        {!loading && checkIns.length === 0 && (
          <Card className="rounded-[18px] border-[#8B6CFF]/25 bg-[linear-gradient(135deg,rgba(139,108,255,0.14),rgba(240,86,140,0.08))] p-5 text-center shadow-[0_18px_44px_rgba(0,0,0,0.28)]">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#F0568C]/35 bg-[#F0568C]/15 text-[#F0568C] shadow-[0_0_24px_rgba(240,86,140,0.18)]">
              <Moon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-base font-black text-white">Your night starts here.</h3>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-white/65">
              Check in at your first spot to start your history
            </p>
            <Button
              asChild
              className="mt-5 min-h-11 rounded-full bg-[#8B6CFF] px-5 text-sm font-bold text-white hover:bg-[#9B82FF] focus-visible:ring-[#8B6CFF]/70"
            >
              <Link href="/explore">Explore spots</Link>
            </Button>
          </Card>
        )}
      </div>
    </SectionShell>
  );
}

function RewardsSection({ score, loading }: { score: RewardScore; loading: boolean }) {
  const next = nextLevelProgress(score.level, score.confirmed_checkins);
  const progressPercent = next ? Math.min(100, (score.confirmed_checkins / next.threshold) * 100) : 100;

  return (
    <SectionShell title="Rewards">
      {loading ? (
        <Skeleton className="h-36 rounded-[18px] bg-white/10" />
      ) : (
        <Card className="rounded-[18px] border-white/[0.08] bg-white/[0.04] p-4">
          <div className="flex items-start justify-between gap-4">
            <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${levelClassName(score.level)}`}>
              {levelLabel(score.level)}
            </span>
            <div className="text-right">
              <p className="text-3xl font-black leading-none text-white">{score.points_total.toLocaleString()}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-white/45">pts</p>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 text-sm font-semibold text-white">
            <span className="inline-flex items-center gap-2">
              <Flame className="h-4 w-4 text-[#FFB020]" aria-hidden="true" />
              {score.streak_count}-night streak
            </span>
            <span className="text-white/55">{score.confirmed_checkins} confirmed</span>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#8B6CFF]" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="mt-2 text-sm text-white/60">
            {next
              ? `${score.confirmed_checkins} / ${next.threshold} confirmed check-ins to ${levelLabel(next.level)}`
              : "Top trust tier unlocked"}
          </p>
        </Card>
      )}
    </SectionShell>
  );
}

function SettingsSection({ onChangeArea }: { onChangeArea: () => void }) {
  const [toastVisible, setToastVisible] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);

  useEffect(() => {
    setHapticsEnabled(getHapticsPreference() === "on");
  }, []);

  async function handleShareProfile() {
    if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(window.location.href);
    setToastVisible(true);
  }

  function toggleHaptics() {
    const nextEnabled = !hapticsEnabled;
    setHapticsEnabled(nextEnabled);
    setHapticsPreference(nextEnabled ? "on" : "off");
  }

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
        <button
          type="button"
          onClick={onChangeArea}
          className="flex min-h-14 w-full items-center justify-between rounded-[16px] border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-left transition-colors hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          <span className="flex items-center gap-3 text-sm font-semibold text-white">
            <MapPin className="h-4 w-4 text-[#8B6CFF]" aria-hidden="true" />
            Change my area
          </span>
          <ChevronRight className="h-4 w-4 text-white/45" aria-hidden="true" />
        </button>
        <div className="flex min-h-14 items-center gap-3 rounded-[16px] border border-white/[0.08] bg-white/[0.04] px-4 py-3">
          <Settings className="h-4 w-4 text-[#8B6CFF]" aria-hidden="true" />
          <span className="text-sm font-semibold text-white">Google account connected</span>
        </div>
        <div className="flex min-h-14 items-center gap-3 rounded-[16px] border border-white/[0.08] bg-white/[0.04] px-4 py-3">
          <Check className="h-4 w-4 text-[#00F5D4]" aria-hidden="true" />
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-white/75">
            Dark mode always on ✓
          </span>
        </div>
        <div className="flex min-h-14 items-center justify-between gap-4 rounded-[16px] border border-white/[0.08] bg-white/[0.04] px-4 py-3">
          <span className="flex min-w-0 items-center gap-3">
            <Settings className="h-4 w-4 shrink-0 text-[#00F5D4]" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">Haptic feedback</span>
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={hapticsEnabled}
            aria-label="Haptic feedback"
            onClick={toggleHaptics}
            className={`relative min-h-11 w-14 shrink-0 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
              hapticsEnabled ? "border-[#8B6CFF]/60 bg-[#8B6CFF]/28" : "border-white/15 bg-white/[0.06]"
            }`}
          >
            <span
              className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border border-white/20 bg-[#111117] shadow-lg transition-transform ${
                hapticsEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <Button
          type="button"
          onClick={handleShareProfile}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[16px] border border-[#8B6CFF]/35 bg-[#8B6CFF]/15 px-4 py-3 text-sm font-bold text-white hover:bg-[#8B6CFF]/25 focus-visible:ring-[#8B6CFF]/70"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Share Profile
        </Button>
      </div>
      {toastVisible && <Toast message="Link copied!" onDone={() => setToastVisible(false)} />}
    </SectionShell>
  );
}

function NotificationPreferenceToggle({
  session,
  prefs,
  onPrefsChange,
}: {
  session: Session;
  prefs: NotificationPrefs;
  onPrefsChange: (prefs: NotificationPrefs) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function savePrefs(nextPrefs: NotificationPrefs) {
    const res = await fetch("/api/profile/notification-prefs", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ notificationPrefs: nextPrefs }),
    });

    if (!res.ok) throw new Error("Preference save failed");
  }

  async function toggleBusyAlerts() {
    if (saving) return;
    setSaving(true);
    setStatus(null);

    const previousPrefs = prefs;
    const nextPrefs = { ...prefs, notifyBusyVenues: !prefs.notifyBusyVenues };
    onPrefsChange(nextPrefs);

    try {
      if (nextPrefs.notifyBusyVenues) {
        const subscription = await savePushSubscription(session.access_token);
        if (!subscription) throw new Error("Push unavailable");
      } else {
        await unsubscribeFromPush();
      }

      await savePrefs(nextPrefs);
      setStatus(nextPrefs.notifyBusyVenues ? "Busy alerts enabled." : "Busy alerts disabled.");
    } catch {
      onPrefsChange(previousPrefs);
      setStatus("Could not update alerts.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionShell title="Notifications">
      <div className="flex items-center justify-between gap-4 rounded-[18px] border border-white/[0.08] bg-white/[0.04] p-4">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F0568C]/15 text-[#F0568C]">
            <Bell className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-black leading-tight text-white">Notify me when saved venues get busy</h3>
            <p className="mt-1 text-sm font-semibold leading-5 text-white/40">
              Browser prompt appears only after you turn this on.
            </p>
            {status && (
              <p className={`mt-2 text-xs font-bold ${status.startsWith("Could") ? "text-[#F0568C]" : "text-[#00F5D4]"}`} role="status">
                {status}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.notifyBusyVenues}
          aria-label="Notify me when saved venues get busy"
          disabled={saving}
          onClick={() => void toggleBusyAlerts()}
          className={`relative min-h-11 w-14 shrink-0 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:cursor-not-allowed disabled:opacity-60 ${
            prefs.notifyBusyVenues ? "border-[#8B6CFF]/60 bg-[#8B6CFF]/28" : "border-white/15 bg-white/[0.06]"
          }`}
        >
          <span
            className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border border-white/20 bg-[#111117] shadow-lg transition-transform ${
              prefs.notifyBusyVenues ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </SectionShell>
  );
}

function LoggedInState({
  session,
  savedVenues,
  checkIns,
  rewardScore,
  notificationPrefs,
  loadingSaved,
  loadingCheckIns,
  loadingRewards,
  onNotificationPrefsChange,
  onSignOut,
  onChangeArea,
}: {
  session: Session;
  savedVenues: SavedVenue[];
  checkIns: CheckIn[];
  rewardScore: RewardScore;
  notificationPrefs: NotificationPrefs;
  loadingSaved: boolean;
  loadingCheckIns: boolean;
  loadingRewards: boolean;
  onNotificationPrefsChange: (prefs: NotificationPrefs) => void;
  onSignOut: () => void;
  onChangeArea: () => void;
}) {
  const email = session.user.email ?? "Signed in";
  const topSpot = useMemo(() => {
    const counts = new Map<string, { venueId: string; venueName: string; count: number }>();
    for (const checkIn of checkIns) {
      if (!checkIn.venue_id) continue;
      const current = counts.get(checkIn.venue_id);
      counts.set(checkIn.venue_id, {
        venueId: checkIn.venue_id,
        venueName: current?.venueName ?? venueNameFrom(checkIn),
        count: (current?.count ?? 0) + 1,
      });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.venueName.localeCompare(b.venueName))[0] ?? null;
  }, [checkIns]);

  return (
    <div className="space-y-7 pb-8">
      <ProfileHeader email={email} trustedReporter={rewardScore.trusted_reporter} />
      <ProfileStatsGrid score={rewardScore} loading={loadingRewards} />
      <ProfileCompletionNudge savedCount={savedVenues.length} checkInCount={checkIns.length} />
      <RewardsSection score={rewardScore} loading={loadingRewards} />
      <TopSpotCard topSpot={topSpot} loading={loadingCheckIns} />
      <SavedVenuesSection venues={savedVenues} loading={loadingSaved} />
      <RecentCheckInsSection checkIns={checkIns} loading={loadingCheckIns} />
      <NotificationPreferenceToggle
        session={session}
        prefs={notificationPrefs}
        onPrefsChange={onNotificationPrefsChange}
      />
      <SettingsSection onChangeArea={onChangeArea} />
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
  const [rewardScore, setRewardScore] = useState<RewardScore>(DEFAULT_REWARD_SCORE);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [loadingCheckIns, setLoadingCheckIns] = useState(false);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [showAreaPicker, setShowAreaPicker] = useState(false);

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
      const res = await fetch("/api/profile/check-ins", {
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        setCheckIns([]);
        return;
      }
      setCheckIns((await res.json()) as CheckIn[]);
    } catch {
      setCheckIns([]);
    } finally {
      setLoadingCheckIns(false);
    }
  }, []);

  const loadRewards = useCallback(async (currentSession: Session) => {
    setLoadingRewards(true);
    try {
      const res = await fetch("/api/profile/rewards", {
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        setRewardScore(DEFAULT_REWARD_SCORE);
        return;
      }
      setRewardScore({ ...DEFAULT_REWARD_SCORE, ...((await res.json()) as Partial<RewardScore>) });
    } catch {
      setRewardScore(DEFAULT_REWARD_SCORE);
    } finally {
      setLoadingRewards(false);
    }
  }, []);

  const loadNotificationPrefs = useCallback(async (currentSession: Session) => {
    try {
      const res = await fetch("/api/profile/notification-prefs", {
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        setNotificationPrefs(DEFAULT_NOTIFICATION_PREFS);
        return;
      }

      const json = (await res.json()) as { data?: { notificationPrefs?: Partial<NotificationPrefs> } };
      setNotificationPrefs({
        ...DEFAULT_NOTIFICATION_PREFS,
        ...json.data?.notificationPrefs,
      });
    } catch {
      setNotificationPrefs(DEFAULT_NOTIFICATION_PREFS);
    }
  }, []);

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
        void loadRewards(data.session);
        void loadNotificationPrefs(data.session);
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
        void loadRewards(nextSession);
        void loadNotificationPrefs(nextSession);
      } else {
        setSavedVenues([]);
        setCheckIns([]);
        setRewardScore(DEFAULT_REWARD_SCORE);
        setNotificationPrefs(DEFAULT_NOTIFICATION_PREFS);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadCheckIns, loadNotificationPrefs, loadRewards, loadSavedVenues, supabaseBrowser]);

  useEffect(() => {
    if (!session) return;
    const activeSession = session;

    function refreshProfileCheckIns() {
      void loadCheckIns(activeSession);
      void loadRewards(activeSession);
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === "nightvibe.check-in-refresh") refreshProfileCheckIns();
    }

    window.addEventListener("nightvibe:check-in-created", refreshProfileCheckIns);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("nightvibe:check-in-created", refreshProfileCheckIns);
      window.removeEventListener("storage", handleStorage);
    };
  }, [loadCheckIns, loadRewards, session]);

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
    setRewardScore(DEFAULT_REWARD_SCORE);
  }

  return (
    <PageTransition>
      <main className="mx-auto min-h-screen-safe w-full max-w-lg bg-[#0A0A0E] px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5 text-white">
        {!authChecked && <YouSkeleton />}
        {authChecked && !session && (
          <LoggedOutState
            onSignIn={handleGoogleSignIn}
            signingIn={signingIn}
            onChangeArea={() => setShowAreaPicker(true)}
          />
        )}
        {authChecked && session && (
          <LoggedInState
            session={session}
            savedVenues={savedVenues}
            checkIns={checkIns}
            rewardScore={rewardScore}
            notificationPrefs={notificationPrefs}
            loadingSaved={loadingSaved}
            loadingCheckIns={loadingCheckIns}
            loadingRewards={loadingRewards}
            onNotificationPrefsChange={setNotificationPrefs}
            onSignOut={handleSignOut}
            onChangeArea={() => setShowAreaPicker(true)}
          />
        )}
        {showAreaPicker && <OnboardingOverlay forceOpen onClose={() => setShowAreaPicker(false)} />}
      </main>
    </PageTransition>
  );
}
