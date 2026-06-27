"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import dynamic from "next/dynamic";
import NextImage from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import { motion } from "framer-motion";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, Clock, Globe, MapPin, Phone, X } from "lucide-react";
import { BusynessMeter } from "@/components/BusynessMeter";
import { CategoryBadge, PriceLevelDisplay } from "@/components/CategoryBadge";
import { CheckInButton } from "@/components/CheckInButton";
import { MFRatioBar, getMFRatioPercents } from "@/components/MFRatioBar";
import { OpenNowBadge } from "@/components/OpenNowBadge";
import { useOnboardingGate } from "@/components/OnboardingGate";
import { SaveButton } from "@/components/SaveButton";
import { ShareButton } from "@/components/ShareButton";
import { SignalFreshnessLabel } from "@/components/SignalFreshnessLabel";
import { SkeletonVenueDetail } from "@/components/SkeletonVenueDetail";
import { StarRating } from "@/components/StarRating";
import { Toast } from "@/components/Toast";
import { TrendingBadge } from "@/components/TrendingBadge";
import { VenuePhoto } from "@/components/VenuePhoto";
import { VenueRating } from "@/components/VenueRating";
import { getNeighborhood } from "@/lib/neighborhood";
import { createBrowserClient } from "@/lib/supabase-browser";
import { fetchTrendingVenueIds } from "@/lib/clientTrendingVenueIds";
import { summarizeVenueHours } from "@/lib/venueHours";
import { useHaptic } from "@/hooks/useHaptic";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { ConsumerVenue, CrowdFeel, ReportedBusyness } from "@/types";

const PushOptIn = dynamic(() => import("@/components/PushOptIn").then((mod) => mod.PushOptIn), {
  ssr: false,
  loading: () => null,
});
const VenuePredictionCard = dynamic(() => import("@/components/VenuePredictionCard").then((mod) => mod.VenuePredictionCard), {
  ssr: false,
  loading: () => <div className="h-40 rounded-2xl border border-white/[0.06] bg-white/[0.04]" aria-hidden="true" />,
});
const VenueTips = dynamic(() => import("@/components/VenueTips").then((mod) => mod.VenueTips), {
  ssr: false,
  loading: () => <div className="h-28 rounded-2xl border border-white/[0.06] bg-white/[0.04]" aria-hidden="true" />,
});

type VenueActivityItem = {
  displayName: string;
  avatarUrl: string | null;
  checkedInAt: string;
  minutesAgo: number;
};

type RecentCheckIn = {
  id: string;
  busynessLevel: number | null;
  crowdFeel: string | null;
  gender: "M" | "F" | null;
  createdAt: string;
};

type BestTimeHourlyForecast = {
  hour: number;
  busyness: number;
};

type VenueReportReason = "wrong_hours" | "wrong_location" | "permanently_closed" | "duplicate" | "other";

type VibeBusynessOption = {
  id: "dead" | "moderate" | "busy" | "packed";
  value: ReportedBusyness;
  label: string;
  score: 10 | 40 | 70 | 95;
  selectedBackground: string;
  selectedBorder: string;
};

type VibeCrowdFeelOption = {
  value: Extract<CrowdFeel, "chill" | "hyped" | "mixed" | "dead" | "packed">;
  label: string;
};

type GenderSelfReport = "M" | "F" | "prefer_not";

type VenueDetailTab = "overview" | "vibe" | "tips";

const VENUE_DETAIL_TABS: Array<{ value: VenueDetailTab; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "vibe", label: "Vibe" },
  { value: "tips", label: "Tips" },
];

type CheckInRewardResponse = {
  status?: string;
  data?: {
    pointsAwarded?: number;
    events?: string[];
  };
  error?: {
    message?: string;
  };
};

const VENUE_REPORT_REASONS: Array<{ value: VenueReportReason; label: string }> = [
  { value: "wrong_hours", label: "Wrong hours" },
  { value: "wrong_location", label: "Wrong location" },
  { value: "permanently_closed", label: "Permanently closed" },
  { value: "duplicate", label: "Duplicate" },
  { value: "other", label: "Other" },
];

const VIBE_BUSYNESS_OPTIONS: VibeBusynessOption[] = [
  { id: "dead", value: "dead", label: "Dead", score: 10, selectedBackground: "rgba(92,101,115,0.2)", selectedBorder: "#5C6573" },
  { id: "moderate", value: "moderate", label: "Moderate", score: 40, selectedBackground: "rgba(255,176,32,0.2)", selectedBorder: "#FFB020" },
  { id: "busy", value: "packed", label: "Busy", score: 70, selectedBackground: "rgba(255,176,32,0.2)", selectedBorder: "#FFB020" },
  { id: "packed", value: "packed", label: "Packed", score: 95, selectedBackground: "rgba(255,91,106,0.2)", selectedBorder: "#FF5B6A" },
];

const VIBE_CROWD_FEEL_OPTIONS: VibeCrowdFeelOption[] = [
  { value: "chill", label: "Chill" },
  { value: "hyped", label: "Hyped" },
  { value: "mixed", label: "Mixed" },
  { value: "dead", label: "Dead" },
  { value: "packed", label: "Packed" },
];

const GENDER_SELF_REPORT_OPTIONS: Array<{ value: GenderSelfReport; label: string }> = [
  { value: "M", label: "Man" },
  { value: "F", label: "Woman" },
  { value: "prefer_not", label: "Rather not say" },
];

const DETAIL_MF_SAMPLE_THRESHOLD = 5;
const LIVE_CHECK_IN_WINDOW_HOURS = 2;

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "Not updated yet";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "Just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes === 1) return "1m ago";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1d ago" : `${days}d ago`;
}

function getCurrentPositionForReport(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 },
    );
  });
}

function rewardToast(pointsAwarded: number, events: string[]): string {
  if (pointsAwarded <= 0) return "Check-in recorded!";
  const parts = [`+${pointsAwarded} pts`];
  if (events.includes("first_report")) parts.push("first report tonight +5");
  if (events.includes("streak")) parts.push("streak +20");
  return parts.join(" · ");
}

function getGoogleRatingData(venue: ConsumerVenue | null | undefined): { rating: number; count: number } | null {
  if (!venue) return null;
  const rating = venue.googleRating ?? venue.rating;
  const count = venue.userRatingCount ?? venue.totalRatings;
  if (rating == null || count == null || !Number.isFinite(rating) || !Number.isFinite(count)) return null;
  return { rating, count };
}

function EmptySignalState({
  icon: Icon,
  message,
  compact = false,
}: {
  icon: typeof Clock;
  message: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#0A0A0E] text-white/40 ${
        compact ? "px-3 py-2 text-xs font-semibold" : "px-4 py-3 text-sm font-semibold"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function clampPercent(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function sourceLabel(signal: ConsumerVenue["signal"], fallbackUpdatedAt: string | null | undefined): string {
  if (!signal || signal.busyness0To100 == null) return "";
  if (signal.busynessSource === "forecast") return "via BestTime forecast";
  if (signal.busynessSource === "live") return "via live venue data";
  const sampleSize = signal.sampleSize ?? 0;
  return `from ${sampleSize} check-ins · ${timeAgo(fallbackUpdatedAt)}`;
}

function getCrowdFeel(malePercent: number | null): { emoji: string; label: string } {
  if (malePercent == null) return { emoji: "⚖️", label: "No read yet" };
  if (malePercent >= 58) return { emoji: "👨", label: "Male-leaning" };
  if (malePercent <= 42) return { emoji: "👩", label: "Female-leaning" };
  return { emoji: "⚖️", label: "Balanced" };
}

function getBusynessColor(percent: number): string {
  if (percent >= 67) return "#FF5B6A";
  if (percent >= 34) return "#FFB020";
  return "#00F5D4";
}

function getBusynessLabel(percent: number): string {
  if (percent >= 67) return "Packed";
  if (percent >= 34) return "Moderate";
  return "Quiet";
}

function normalizeLiveCheckInCount(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function liveCheckInCutoffIso(now = Date.now()): string {
  return new Date(now - LIVE_CHECK_IN_WINDOW_HOURS * 60 * 60_000).toISOString();
}

function LiveBusynessBadge({
  hasRead,
  percent,
  source,
}: {
  hasRead: boolean;
  percent: number;
  source: NonNullable<ConsumerVenue["signal"]>["busynessSource"] | null | undefined;
}) {
  const color = hasRead ? getBusynessColor(percent) : "#646B79";
  const label = hasRead ? getBusynessLabel(percent) : "No live read";
  const sourceText = source === "forecast" ? "forecast" : source === "crowd" ? "crowd" : source === "live" ? "live" : null;

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-2 text-xs font-black text-white shadow-lg backdrop-blur">
      <span className="h-2.5 w-2.5 rounded-full shadow-[0_0_12px_currentColor]" style={{ backgroundColor: color, color }} aria-hidden="true" />
      <span>{label}</span>
      {sourceText ? <span className="font-semibold text-white/45">via {sourceText}</span> : null}
    </span>
  );
}

function LiveCheckInCountBadge({ count }: { count: number }) {
  if (count < 1) return null;

  return (
    <span
      className="inline-flex items-center rounded-full border border-[#00F5D4]/35 bg-[#00F5D4]/10 px-3 py-2 text-xs font-black shadow-[0_0_18px_rgba(0,245,212,0.18)] backdrop-blur"
      style={{ color: "#00F5D4" }}
      aria-label={`${count} here tonight`}
    >
      <span className="sr-only" aria-hidden="true">
        {count} here tonight
      </span>
      <motion.span
        key={count}
        aria-hidden="true"
        initial={{ scale: 1.3, color: "#8B6CFF" }}
        animate={{ scale: 1, color: "#ffffff" }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      >
        {count}
      </motion.span>{" "}
      here tonight
    </span>
  );
}

function busynessLevelLabel(level: number | null): string {
  if (level == null) return "Reported";
  if (level <= 15) return "Dead";
  if (level <= 35) return "Quiet";
  if (level <= 60) return "Moderate";
  if (level <= 85) return "Busy";
  return "Packed";
}

function trackAnalytics(event: string, properties: Record<string, string | number | boolean | null>) {
  try {
    track(event, properties);
  } catch {
    // Analytics must never break the UI.
  }
}

function useSwipeDownToClose(isOpen: boolean, onClose: () => void, disabled = false) {
  const dragRef = useRef({ pointerId: -1, startY: 0, currentY: 0 });

  return {
    onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
      if (!isOpen || disabled) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { pointerId: event.pointerId, startY: event.clientY, currentY: event.clientY };
    },
    onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
      if (dragRef.current.pointerId !== event.pointerId) return;
      dragRef.current.currentY = event.clientY;
    },
    onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
      if (dragRef.current.pointerId !== event.pointerId) return;
      const draggedDown = dragRef.current.currentY - dragRef.current.startY;
      dragRef.current.pointerId = -1;
      if (draggedDown > 80) onClose();
    },
    onPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
      if (dragRef.current.pointerId !== event.pointerId) return;
      dragRef.current.pointerId = -1;
    },
  };
}

function initialFor(name: string): string {
  const trimmed = name.trim();
  return (trimmed[0] ?? "?").toUpperCase();
}

function WhoHereSection({ activity }: { activity: VenueActivityItem[] }) {
  if (activity.length === 0) return null;

  const visibleActivity = activity.slice(0, 5);
  const extraCount = Math.max(0, activity.length - visibleActivity.length);
  const peopleLabel = activity.length === 1 ? "1 person checked in recently" : `${activity.length} people checked in recently`;

  return (
    <section
      className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4"
      role="region"
      aria-label="Who's here"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-sm font-black text-white">Who's here</h2>
          <p className="mt-1 text-xs font-medium text-white/40">{peopleLabel}</p>
        </div>
        <div className="flex items-center pl-2" aria-label={peopleLabel}>
          {visibleActivity.map((item, index) => (
            <div
              key={`${item.displayName}-${item.checkedInAt}-${index}`}
              className={`${index > 0 ? "-ml-2" : ""} relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-[#0A0A0E] bg-[#8B6CFF] text-sm font-black text-[#0A0A0E] shadow-lg`}
              title={item.displayName}
            >
              <span aria-hidden="true">{initialFor(item.displayName)}</span>
              {item.avatarUrl && (
                <NextImage
                  src={item.avatarUrl}
                  alt={item.displayName}
                  width={36}
                  height={36}
                  sizes="36px"
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              )}
            </div>
          ))}
          {extraCount > 0 && (
            <div className="-ml-2 flex h-9 min-w-9 items-center justify-center rounded-full border-2 border-[#0A0A0E] bg-white/[0.07] text-[11px] font-semibold text-[#F4F5F8] shadow-lg">
              +{extraCount}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CheckInFeed({ checkIns }: { checkIns: RecentCheckIn[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleCheckIns = expanded ? checkIns : checkIns.slice(0, 5);
  const hasMore = checkIns.length > 5;

  return (
    <section className="space-y-3" role="region" aria-label="Recent vibes">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-[#F4F5F8]">Recent vibes</h2>
        {checkIns.length > 0 && (
          <span className="text-xs font-semibold text-white/35">
            Last {Math.min(checkIns.length, 10)}
          </span>
        )}
      </div>

      {checkIns.length === 0 ? (
        <p className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4 text-sm font-medium text-white/45">
          No vibes reported yet — be the first!
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {visibleCheckIns.map((checkIn) => {
              const label = busynessLevelLabel(checkIn.busynessLevel);
              return (
                <li
                  key={checkIn.id}
                  className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-white">{label}</span>
                        {checkIn.gender && (
                          <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] font-black text-white/65">
                            {checkIn.gender}
                          </span>
                        )}
                      </div>
                      {checkIn.crowdFeel && (
                        <p className="mt-2 text-sm leading-relaxed text-white/65">{checkIn.crowdFeel}</p>
                      )}
                    </div>
                    <time
                      dateTime={checkIn.createdAt}
                      className="shrink-0 text-xs font-semibold text-white/35"
                    >
                      {timeAgo(checkIn.createdAt)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>

          {hasMore && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full rounded-xl border border-white/[0.09] bg-white/[0.04] px-4 py-3 text-sm font-black text-white/70 transition-colors hover:bg-white/[0.07] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              Show more
            </button>
          )}
        </>
      )}
    </section>
  );
}

function AuthRequiredReportAction({ venueId, venueName }: { venueId: string; venueName: string }) {
  const returnTo = `/venues/${encodeURIComponent(venueId)}`;
  return (
    <a
      href={`/login?return=${encodeURIComponent(returnTo)}`}
      aria-label={`Sign in to report the vibe at ${venueName}`}
      className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full border border-[#8B6CFF]/35 bg-[#8B6CFF]/10 px-5 text-base font-black text-[#F4F5F8] transition-colors hover:bg-[#8B6CFF]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
    >
      Sign in to report vibe
    </a>
  );
}

export function VenuePageClient({
  venueId,
  initialVenue,
  initialLiveCheckInCount = 0,
}: {
  venueId: string;
  initialVenue: ConsumerVenue | null;
  initialLiveCheckInCount?: number;
}) {
  const router = useRouter();
  const { consumePendingAction, requireAuth } = useOnboardingGate();
  const haptic = useHaptic();
  const trackedVenueView = useRef(false);
  const [venue, setVenue] = useState<ConsumerVenue | null | undefined>(initialVenue ?? undefined);
  const [loading, setLoading] = useState(!initialVenue);
  const [error, setError] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const [tab, setTab] = useState<VenueDetailTab>("overview");
  const [venueActivity, setVenueActivity] = useState<VenueActivityItem[]>([]);
  const [recentCheckIns, setRecentCheckIns] = useState<RecentCheckIn[]>([]);
  const [liveCheckInCount, setLiveCheckInCount] = useState(() => normalizeLiveCheckInCount(initialLiveCheckInCount));
  const [bestTimeForecast, setBestTimeForecast] = useState<BestTimeHourlyForecast[]>([]);
  const [bestTimeForecastLoading, setBestTimeForecastLoading] = useState(false);
  const [bestTimeForecastUpdatedOn, setBestTimeForecastUpdatedOn] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<VenueReportReason>("wrong_hours");
  const [reportNotes, setReportNotes] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [vibeReportOpen, setVibeReportOpen] = useState(false);
  const [vibeStep, setVibeStep] = useState<1 | 2 | 3>(1);
  const [vibeBusynessOptionId, setVibeBusynessOptionId] = useState<VibeBusynessOption["id"] | null>(null);
  const [vibeCrowdFeel, setVibeCrowdFeel] = useState<VibeCrowdFeelOption["value"] | null>(null);
  const [vibeGenderSelfReport, setVibeGenderSelfReport] = useState<GenderSelfReport>("prefer_not");
  const [vibeSubmitting, setVibeSubmitting] = useState(false);
  const [vibeError, setVibeError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [checkInConfirmed, setCheckInConfirmed] = useState(false);
  const [showPostCheckInRatingPrompt, setShowPostCheckInRatingPrompt] = useState(false);
  const [trendingVenueIds, setTrendingVenueIds] = useState<Set<string>>(() => new Set());
  const reportDialogRef = useRef<HTMLDivElement | null>(null);
  const vibeDialogRef = useRef<HTMLDivElement | null>(null);
  const reportSwipeHandlers = useSwipeDownToClose(reportOpen, () => setReportOpen(false), reportSubmitting);
  const vibeSwipeHandlers = useSwipeDownToClose(vibeReportOpen, closeVibeReport, vibeSubmitting);

  useFocusTrap(reportOpen, reportDialogRef, () => {
    if (!reportSubmitting) setReportOpen(false);
  });
  useFocusTrap(vibeReportOpen, vibeDialogRef, () => {
    if (!vibeSubmitting) setVibeReportOpen(false);
  });

  useEffect(() => {
    if (!checkInConfirmed) return;
    const timer = window.setTimeout(() => setCheckInConfirmed(false), 1500);
    return () => window.clearTimeout(timer);
  }, [checkInConfirmed]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTrendingVenues() {
      try {
        setTrendingVenueIds(await fetchTrendingVenueIds(controller.signal));
      } catch {
        if (!controller.signal.aborted) setTrendingVenueIds(new Set());
      }
    }

    void loadTrendingVenues();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (trackedVenueView.current || !venueId || !venue?.name) return;
    trackedVenueView.current = true;
    trackAnalytics("venue_viewed", {
      venue_id: venueId,
      venue_name: venue.name,
      category: venue.category,
    });
  }, [venue?.category, venue?.name, venueId]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 120);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setLiveCheckInCount(normalizeLiveCheckInCount(initialLiveCheckInCount));
  }, [initialLiveCheckInCount, venueId]);

  const fetchLiveCheckInCount = useCallback(async (targetVenueId: string, isCancelled?: () => boolean) => {
    try {
      const client = createBrowserClient();
      const { count, error } = await client
        .from("check_ins")
        .select("id", { count: "exact", head: true })
        .eq("venue_id", targetVenueId)
        .eq("hidden", false)
        .gte("created_at", liveCheckInCutoffIso());

      if (!error && !isCancelled?.()) {
        setLiveCheckInCount(normalizeLiveCheckInCount(count));
      }
    } catch {
      // Keep the server-rendered count if the browser cannot read realtime data.
    }
  }, []);

  const fetchRecentCheckIns = useCallback(async (targetVenueId: string, isCancelled?: () => boolean) => {
    try {
      const res = await fetch(`/api/venues/${encodeURIComponent(targetVenueId)}/check-ins`);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      const checkIns = Array.isArray(json) ? json : json?.data?.checkIns;
      if (!isCancelled?.()) setRecentCheckIns(Array.isArray(checkIns) ? checkIns.slice(0, 10) : []);
    } catch {
      if (!isCancelled?.()) setRecentCheckIns([]);
    }
  }, []);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    setLoading(!initialVenue);
    setError(null);

    async function fetchData() {
      try {
        const venueRes = initialVenue
          ? null
          : await fetch(`/api/venues/${encodeURIComponent(venueId)}`);
        if (venueRes && !venueRes.ok) throw new Error(`${venueRes.status}`);
        const venueJson = venueRes ? await venueRes.json() : null;
        if (cancelled) return;
        if (venueJson) setVenue(venueJson?.data?.venue ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load venue.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [initialVenue, venueId]);

  useEffect(() => {
    const activityVenueId = venue?.id ?? venueId;
    if (!activityVenueId) return;

    let cancelled = false;

    async function fetchVenueActivity() {
      try {
        const res = await fetch(`/api/venues/${encodeURIComponent(activityVenueId)}/activity`);
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        const activity = json?.data?.activity;
        if (!cancelled) setVenueActivity(Array.isArray(activity) ? activity : []);
      } catch {
        if (!cancelled) setVenueActivity([]);
      }
    }

    void fetchVenueActivity();
    return () => {
      cancelled = true;
    };
  }, [venue?.id, venueId]);

  useEffect(() => {
    const feedVenueId = venue?.id ?? venueId;
    if (!feedVenueId) return;

    let cancelled = false;
    void fetchRecentCheckIns(feedVenueId, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchRecentCheckIns, venue?.id, venueId]);

  useEffect(() => {
    const realtimeVenueId = venue?.id ?? venueId;
    if (!realtimeVenueId) return;

    let cancelled = false;
    let removeRealtimeChannel: (() => void) | undefined;

    const client = createBrowserClient();
    const refresh = () => {
      void fetchLiveCheckInCount(realtimeVenueId, () => cancelled);
    };
    const channel = client
      .channel(`venue-check-ins:${realtimeVenueId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "check_ins",
          filter: `venue_id=eq.${realtimeVenueId}`,
        },
        refresh,
      )
      .subscribe();

    removeRealtimeChannel = () => {
      void client.removeChannel(channel);
    };
    refresh();

    return () => {
      cancelled = true;
      removeRealtimeChannel?.();
    };
  }, [fetchLiveCheckInCount, venue?.id, venueId]);

  useEffect(() => {
    function handleCheckInCreated(event: Event) {
      const detail = (event as CustomEvent<{ venueId?: string }>).detail;
      const checkedVenueId = detail?.venueId;
      const currentVenueId = venue?.id ?? venueId;
      if (checkedVenueId !== currentVenueId) return;

      setCheckInConfirmed(true);
      setShowPostCheckInRatingPrompt(true);
      void fetchLiveCheckInCount(currentVenueId);
      void fetchRecentCheckIns(currentVenueId);
      void fetch(`/api/venues/${encodeURIComponent(currentVenueId)}`)
        .then((response) => response.ok ? response.json() : null)
        .then((json) => {
          if (json?.data?.venue) setVenue(json.data.venue);
        })
        .catch(() => undefined);
    }

    window.addEventListener("nightvibe:check-in-created", handleCheckInCreated);
    return () => window.removeEventListener("nightvibe:check-in-created", handleCheckInCreated);
  }, [fetchLiveCheckInCount, fetchRecentCheckIns, venue?.id, venueId]);

  useEffect(() => {
    let cancelled = false;

    async function fetchAuthState() {
      const client = createBrowserClient();
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token ?? null;
      const sessionUserId = data.session?.user?.id ?? null;
      if (cancelled) return;

      setAccessToken(token);
      setUserId(sessionUserId);
      setAuthChecked(true);
    }

    let unsubscribe: (() => void) | undefined;

    const client = createBrowserClient();
    void fetchAuthState();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token ?? null;
      const sessionUserId = session?.user?.id ?? null;
      setAccessToken(token);
      setUserId(sessionUserId);
      setAuthChecked(true);
    });
    unsubscribe = () => subscription.unsubscribe();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    if (!consumePendingAction(`report:${venueId}`)) return;
    startVibeReport();
  }, [accessToken, consumePendingAction, venueId]);

  useEffect(() => {
    const forecastVenueId = venue?.id ?? venueId;
    if (!forecastVenueId || !venue?.besttimeVenueId) {
      setBestTimeForecast([]);
      setBestTimeForecastUpdatedOn(null);
      setBestTimeForecastLoading(false);
      return;
    }

    let cancelled = false;
    setBestTimeForecastLoading(true);

    async function fetchBestTimeForecast() {
      try {
        const res = await fetch(`/api/venues/${encodeURIComponent(forecastVenueId)}/besttime-forecast`);
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        const hours = json?.data?.hours;
        if (cancelled) return;
        setBestTimeForecast(Array.isArray(hours) ? hours : []);
        setBestTimeForecastUpdatedOn(json?.data?.updatedOn ?? null);
      } catch {
        if (!cancelled) {
          setBestTimeForecast([]);
          setBestTimeForecastUpdatedOn(null);
        }
      } finally {
        if (!cancelled) setBestTimeForecastLoading(false);
      }
    }

    void fetchBestTimeForecast();
    return () => {
      cancelled = true;
    };
  }, [venue?.besttimeVenueId, venue?.id, venueId]);

  function currentPath() {
    if (typeof window === "undefined") return `/venues/${venueId}`;
    return `${window.location.pathname}${window.location.search}`;
  }

  async function getActiveAccessToken(): Promise<string | null> {
    if (accessToken) return accessToken;
    try {
      const client = createBrowserClient();
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (token) {
        setAccessToken(token);
        setAuthChecked(true);
      }
      return token;
    } catch {
      setAuthChecked(true);
      return null;
    }
  }

  function startVibeReport() {
    setVibeError(null);
    setVibeStep(1);
    setVibeReportOpen(true);
  }

  async function submitVenueReport() {
    if (reportSubmitting) return;

    setReportSubmitting(true);
    setReportError(null);

    try {
      const res = await fetch(`/api/venues/${encodeURIComponent(venue?.id ?? venueId)}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reportReason,
          notes: reportNotes.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);

      setReportOpen(false);
      setReportReason("wrong_hours");
      setReportNotes("");
      setToast("Thanks for the report!");
      haptic.success();
    } catch {
      setReportError("Could not submit that report. Try again.");
      haptic.error();
    } finally {
      setReportSubmitting(false);
    }
  }

  function closeReportFormWithHaptic() {
    if (reportSubmitting) return;
    haptic.light();
    setReportOpen(false);
  }

  async function openVibeReport() {
    if (!authChecked) return;
    haptic.light();
    trackAnalytics("check_in", { venue_id: venueId });
    const token = await getActiveAccessToken();
    if (!token) {
      await requireAuth({
        id: `report:${venueId}`,
        label: venue ? `Sign in to report the vibe at ${venue.name}.` : "Sign in to report the vibe.",
        returnTo: currentPath(),
        onAuthenticated: startVibeReport,
      });
      return;
    }
    startVibeReport();
  }

  function closeVibeReport() {
    if (vibeSubmitting) return;
    setVibeReportOpen(false);
    setVibeStep(1);
    setVibeBusynessOptionId(null);
    setVibeCrowdFeel(null);
    setVibeGenderSelfReport("prefer_not");
    setVibeError(null);
  }

  function closeVibeReportWithHaptic() {
    if (vibeSubmitting) return;
    haptic.light();
    closeVibeReport();
  }

  function chooseVibeBusyness(option: VibeBusynessOption) {
    setVibeBusynessOptionId(option.id);
    setVibeStep(2);
    if (vibeError) setVibeError(null);
    haptic.light();
  }

  function chooseVibeCrowdFeel(option: VibeCrowdFeelOption) {
    setVibeCrowdFeel(option.value);
    setVibeStep(3);
    if (vibeError) setVibeError(null);
    haptic.light();
  }

  async function submitVibeReport(genderSelfReport: GenderSelfReport) {
    const selectedBusynessOption = VIBE_BUSYNESS_OPTIONS.find((option) => option.id === vibeBusynessOptionId);
    if (vibeSubmitting || !selectedBusynessOption || !vibeCrowdFeel || !accessToken) return;

    setVibeSubmitting(true);
    setVibeError(null);

    try {
      const reportVenueId = venue?.id ?? venueId;
      const position = await getCurrentPositionForReport();
      const res = await fetch(`/api/venues/${encodeURIComponent(reportVenueId)}/check-in`, {
        method: "POST",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          busyness: selectedBusynessOption.value,
          crowd_feel: vibeCrowdFeel,
          gender: genderSelfReport,
          lat: position?.lat,
          lng: position?.lng,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as CheckInRewardResponse;
      if (!res.ok) {
        if (res.status === 401) {
          setVibeReportOpen(false);
          router.push(`/login?return=${encodeURIComponent(`/venues/${venueId}`)}`);
          return;
        }
        if (res.status === 403) throw new Error("Get closer to the venue to report the vibe.");
        throw new Error(json?.error?.message ?? "Could not submit vibe.");
      }

      setVibeReportOpen(false);
      setVibeStep(1);
      setVibeBusynessOptionId(null);
      setVibeCrowdFeel(null);
      setVibeGenderSelfReport("prefer_not");
      setToast(rewardToast(Number(json.data?.pointsAwarded ?? 0), json.data?.events ?? []));
      setCheckInConfirmed(true);
      setShowPostCheckInRatingPrompt(true);
      haptic.success();
      trackAnalytics("vibe_check_submitted", {
        venue_id: reportVenueId,
        busyness_level: selectedBusynessOption.value,
        busyness_score: selectedBusynessOption.score,
        crowd_feel: vibeCrowdFeel,
        gender: genderSelfReport,
      });

      const venueRes = await fetch(`/api/venues/${encodeURIComponent(reportVenueId)}`);
      if (venueRes.ok) {
        const json = await venueRes.json();
        setVenue(json?.data?.venue ?? venue);
      }
      void fetchLiveCheckInCount(reportVenueId);
      void fetchRecentCheckIns(reportVenueId);
    } catch (error) {
      setVibeError(error instanceof Error ? error.message : "Could not submit vibe.");
      haptic.error();
    } finally {
      setVibeSubmitting(false);
    }
  }

  const signal = venue?.signal;
  const busyness = signal?.busyness0To100 ?? null;
  const busynessPercent = clampPercent(busyness);
  const hasBusynessRead = busyness != null;
  const updatedAt = signal?.lastBusynessRefresh ?? signal?.updatedAt ?? signal?.computedAt ?? null;
  const signalSourceLabel = sourceLabel(signal ?? null, updatedAt);
  const busynessSource = signal?.busynessSource ?? null;
  const mfSampleSize = signal?.sampleSize ?? 0;
  const mfPercents = getMFRatioPercents(signal?.mfRatio);
  const hasEnoughMfSample = mfSampleSize >= DETAIL_MF_SAMPLE_THRESHOLD && mfPercents !== null;
  const crowdFeel = getCrowdFeel(hasEnoughMfSample ? mfPercents?.male ?? null : null);
  const googleRatingData = getGoogleRatingData(venue);
  const neighborhood = venue ? getNeighborhood(venue.lat, venue.lng) : "Charlotte";
  const hoursSummary = useMemo(() => summarizeVenueHours(venue?.openingHours), [venue?.openingHours]);
  const mapsHref = useMemo(() => {
    if (!venue) return "#";
    if (venue.googleMapsUri?.includes("google.com/maps")) return venue.googleMapsUri;
    const query = venue.address || `${venue.lat},${venue.lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }, [venue]);
  const phoneHref = venue?.phoneNumber || venue?.phone ? `tel:${(venue.phoneNumber ?? venue.phone ?? "").replace(/[^\d+]/g, "")}` : null;
  const reportCharactersRemaining = 200 - reportNotes.length;
  const selectedVibeBusynessOption = VIBE_BUSYNESS_OPTIONS.find((option) => option.id === vibeBusynessOptionId);
  const hoursPanelId = "venue-hours-list";
  const canReportVibe = authChecked && Boolean(accessToken);
  const statusText = venue?.openNow === false
    ? "Closed"
    : hoursSummary.hasHours
      ? hoursSummary.todayStatus
      : venue?.openNow == null
        ? "Hours not available"
        : "Open now";
  const statusClassName = statusText.startsWith("Open")
    ? "text-[#8B6CFF]"
    : statusText === "Hours not available"
      ? "text-[#9CA2AE]"
      : "text-[#F0568C]";
  const isTrending = venue ? trendingVenueIds.has(venue.id) : false;
  const nextSixForecast = useMemo(() => {
    if (bestTimeForecast.length === 0) return [];
    const currentHour = new Date().getHours();
    const upcoming = bestTimeForecast.filter((item) => item.hour >= currentHour);
    const wrapped = upcoming.length >= 6
      ? upcoming
      : [...upcoming, ...bestTimeForecast.filter((item) => item.hour < currentHour)];
    return wrapped.slice(0, 6);
  }, [bestTimeForecast]);

  function goBackToMap() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/map");
  }

  function handleVenueSavedChange(saved: boolean) {
    setToast(saved ? "Saved!" : "Removed");
    if (saved) {
      haptic.success();
    } else {
      haptic.light();
    }
  }

  return (
    <div className="min-h-screen-safe bg-[#0A0A0E] pb-56">
      {toast && (
        <Toast
          message={toast}
          durationMs={toast === "Copied!" ? 2000 : 2500}
          onDone={() => setToast(null)}
        className="bottom-[calc(env(safe-area-inset-bottom)+8.75rem)] rounded-[14px] border-white/[0.08] bg-[#0A0A0E] px-5 py-3 font-semibold text-[#F4F5F8] shadow-2xl shadow-black/30"
        />
      )}

      {(loading || venue === undefined) && <SkeletonVenueDetail />}

      {!loading && error && (
        <div className="mx-auto max-w-lg px-4 py-6 pb-36">
          <div
            role="alert"
            className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-5 text-center"
          >
            <p className="font-medium text-[#F4F5F8]">Could not load venue</p>
            <p className="mt-1 text-sm text-[#9CA2AE]">{error}</p>
            <Link
              href="/explore"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              Back to Explore
            </Link>
          </div>
        </div>
      )}

      {!loading && !error && venue === null && (
        <main className="mx-auto flex min-h-screen-safe max-w-lg flex-col items-center justify-center px-5 pb-36 text-center">
          <p className="font-display text-7xl font-black text-[#8B6CFF]">404</p>
          <h1 className="mt-5 font-display text-2xl font-black text-white">This spot doesn't exist</h1>
          <p className="mt-3 max-w-sm text-sm font-medium leading-6 text-white/55">
            It may have been removed from the launch-zone list, or the link may be stale.
          </p>
          <Link
            href="/explore"
            className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[#8B6CFF] px-6 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
          >
            Back to Explore
          </Link>
        </main>
      )}

      {!loading && !error && venue && (
        <>
          {scrolled && (
            <div className="fixed top-0 inset-x-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.08] bg-[#0A0A0E]/90 px-4 backdrop-blur-md transition-all duration-200">
              <button type="button" onClick={() => router.back()} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06]">
                <ChevronLeft className="h-4 w-4 text-white/70" />
              </button>
              <span className="flex-1 truncate text-[15px] font-medium text-white">{venue.name}</span>
              <CategoryBadge category={venue.category} />
            </div>
          )}

          <section className="w-full border-b border-white/[0.06] bg-[#0A0A0E]" role="region" aria-label="Venue hero">
            <div className="relative min-h-[340px] w-full overflow-hidden sm:min-h-[420px]">
              <VenuePhoto
                name={venue.name}
                photoUrl={venue.photoUrl}
                photoUrls={venue.photoUrls}
                alt={`${venue.name} venue photo`}
                className="absolute inset-0 h-full w-full"
                imageClassName="scale-[1.01]"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 600px, 800px"
                priority={true}
                fetchPriority="high"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,#0A0A0E)]" aria-hidden="true" />
              <button
                type="button"
                onClick={goBackToMap}
                aria-label="Go back"
                className="absolute left-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="absolute right-4 top-4 flex items-center gap-2">
                <SaveButton
                  placeId={venue.id}
                  onSavedChange={handleVenueSavedChange}
                  className="h-11 w-11 bg-black/40 text-white/70 shadow-lg backdrop-blur hover:bg-black/55"
                />
                <ShareButton
                  venueId={venue.id}
                  venueName={venue.name}
                  className="h-11 w-11 border-white/15 bg-black/40 text-white/70 shadow-lg backdrop-blur hover:bg-black/55 hover:text-white focus-visible:ring-[#8B6CFF]/70"
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 mx-auto max-w-lg px-4 pb-6">
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category={venue.category} />
                  <PriceLevelDisplay priceLevel={venue.priceLevel} />
                  <LiveBusynessBadge
                    hasRead={hasBusynessRead}
                    percent={busynessPercent}
                    source={busynessSource}
                  />
                  <LiveCheckInCountBadge count={liveCheckInCount} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <h1 className="font-display max-w-[22rem] text-4xl font-black leading-[1.02] text-white drop-shadow-lg">{venue.name}</h1>
                  <PriceLevelDisplay
                    priceLevel={venue.priceLevel}
                    className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs backdrop-blur"
                  />
                  <OpenNowBadge openNow={venue.openNow ?? null} />
                  {isTrending ? <TrendingBadge /> : null}
                </div>
                {venue.address && (
                  <p className="mt-3 max-w-[24rem] text-sm font-medium leading-relaxed text-white/60">{venue.address}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-white/55">{neighborhood}</p>
                  <span className={`rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-xs font-black backdrop-blur ${statusClassName}`}>
                    {statusText}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <div className="mx-auto max-w-lg px-4 pt-4">
            <div
              className="grid grid-cols-3 border-b border-white/[0.08]"
              role="tablist"
              aria-label="Venue detail sections"
            >
              {VENUE_DETAIL_TABS.map((item) => {
                const active = tab === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls={`venue-${item.value}-panel`}
                    id={`venue-${item.value}-tab`}
                    onClick={() => setTab(item.value)}
                    className={`min-h-11 border-b-2 px-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
                      active
                        ? "border-[#8B6CFF] text-white font-semibold"
                        : "border-transparent text-white/50 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {tab === "overview" && (
            <div className="relative mx-auto max-w-lg px-4 pb-6 pt-5">
              <div
                id="venue-overview-panel"
                role="tabpanel"
                aria-labelledby="venue-overview-tab"
              >
              <div>
                {googleRatingData && (
                  <div
                    className="mt-4 inline-flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-sm"
                  >
                    <StarRating {...googleRatingData} className="text-base" />
                  </div>
                )}
                <div className="mt-5 space-y-3">
                  <CheckInButton venueId={venue.id} venueName={venue.name} />
                  <PushOptIn accessToken={accessToken} venueId={venue.id} venueName={venue.name} />
                  {canReportVibe ? (
                    <button
                      type="button"
                      onClick={() => void openVibeReport()}
                      aria-label="Report the vibe"
                      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.06] px-5 text-sm font-black text-white/80 transition-colors hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                    >
                      Report the vibe
                    </button>
                  ) : authChecked ? (
                    <AuthRequiredReportAction venueId={venue.id} venueName={venue.name} />
                  ) : (
                    <div className="min-h-[54px] rounded-full bg-white/10" aria-hidden="true" />
                  )}
                  <VenueRating
                    venueId={venue.id}
                    accessToken={accessToken}
                    userId={userId}
                    googleRating={venue.googleRating ?? venue.rating ?? null}
                    userRatingCount={venue.userRatingCount ?? venue.totalRatings ?? null}
                    promptAfterCheckIn={showPostCheckInRatingPrompt}
                    onRated={() => {
                      setShowPostCheckInRatingPrompt(false);
                      haptic.success();
                    }}
                  />
                </div>
                <section className="mt-4" role="region" aria-label="Venue hours">
                  <button
                    type="button"
                    onClick={() => setHoursExpanded((expanded) => !expanded)}
                    className="flex w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-left transition-colors hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                    aria-expanded={hoursExpanded}
                    aria-controls={hoursPanelId}
                  >
                    <span>
                      <span className="block text-sm font-black text-white">Hours</span>
                      <span className="mt-1 block text-[13px] font-medium text-white/45">
                        {hoursSummary.hasHours ? hoursSummary.todayStatus : "Hours not available"}
                      </span>
                    </span>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-white/45 transition-transform ${hoursExpanded ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                  {hoursExpanded && (
                    hoursSummary.hasHours ? (
                      <ul id={hoursPanelId} className="mt-2 space-y-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                        {hoursSummary.weekHours.map((hour, index) => {
                          const isToday = hour.day === hoursSummary.today;
                          return (
                            <li
                              key={`${hour.day}-${index}`}
                              className={`grid grid-cols-[6.5rem_1fr] gap-3 text-[13px] ${
                                isToday ? "text-[#8B6CFF]" : hour.closed || !hour.available ? "text-white/35" : "text-white/55"
                              }`}
                            >
                              <span className="font-bold">{hour.day}</span>
                              <span>{hour.hours}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p id={hoursPanelId} className="mt-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-[13px] font-medium text-white/45">
                        Hours not available
                      </p>
                    )
                  )}
                </section>
              </div>
              <div className="mt-6 grid gap-3" role="group" aria-label="Venue sharing and directions">
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.06] p-3 text-sm font-bold text-white/80 transition-colors hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                >
                  <MapPin size={17} aria-hidden="true" />
                  Get Directions
                </a>
                {venue.website && (
                  <a
                    href={venue.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.06] p-3 text-sm font-bold text-white/80 transition-colors hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                  >
                    <Globe size={17} aria-hidden="true" />
                    Website
                  </a>
                )}
                {phoneHref && (
                  <a
                    href={phoneHref}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.06] p-3 text-sm font-bold text-white/80 transition-colors hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                  >
                    <Phone size={17} aria-hidden="true" />
                    {venue.phoneNumber ?? venue.phone}
                  </a>
                )}
              </div>

              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setReportError(null);
                    setReportOpen(true);
                  }}
                  className="text-xs font-medium text-white/35 underline-offset-4 transition-colors hover:text-white/55 hover:underline focus:outline-none focus-visible:text-white focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                >
                  Report
                </button>
              </div>
              </div>
            </div>
          )}

          {tab === "vibe" && (
            <div
              id="venue-vibe-panel"
              role="tabpanel"
              aria-labelledby="venue-vibe-tab"
            >
          <div className="border-b border-white/[0.06]">
            <div className="mx-auto max-w-lg overflow-x-auto px-4 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max min-w-full gap-3">
                <div className="min-w-[9.5rem] rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11.5px] font-semibold text-[#646B79]">Busyness</span>
                    <span className="text-sm font-black text-white">{hasBusynessRead ? `${busynessPercent}%` : "--"}</span>
                  </div>
                  {hasBusynessRead ? (
                    <div>
                      <BusynessMeter
                        value={busyness}
                        source={busynessSource}
                        sampleSize={mfSampleSize}
                        computedAt={signal?.computedAt ?? null}
                        className="mt-3"
                      />
                      <SignalFreshnessLabel signal={signal} className="mt-2 block" />
                    </div>
                  ) : (
                    <div className="mt-3">
                      <EmptySignalState
                        compact
                        icon={Clock}
                        message="No crowd data yet"
                      />
                    </div>
                  )}
                </div>

                {hasEnoughMfSample ? (
                  <div className="min-w-[13rem] rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3">
                    <span className="text-[11.5px] font-semibold text-[#646B79]">M/F ratio</span>
                    <MFRatioBar
                      mfRatio={signal?.mfRatio}
                      sampleSize={mfSampleSize}
                      className="mt-3"
                    />
                  </div>
                ) : null}

                <div className="min-w-[9.5rem] rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3">
                  <span className="text-[11.5px] font-semibold text-[#646B79]">Check-ins</span>
                  <p className="mt-2 text-sm font-black text-white">
                    {liveCheckInCount > 0 ? `${liveCheckInCount} tonight` : "None yet"}
                  </p>
                </div>

                <div className="min-w-[9.5rem] rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3">
                  <span className="text-[11.5px] font-semibold text-[#646B79]">Status</span>
                  <p className={`mt-2 text-sm font-semibold ${statusClassName}`}>
                    {statusText}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-lg space-y-6 px-4 py-5">
            <WhoHereSection activity={venueActivity} />

            <section className="space-y-4" role="region" aria-label="Current venue signal">
              <p className="text-[13px] font-medium text-[#9CA2AE]">Right now</p>
              <div className="space-y-5">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-sm font-black text-white">Busyness</span>
                    <span className="text-sm font-black" style={{ color: hasBusynessRead ? getBusynessColor(busynessPercent) : undefined }}>
                      {hasBusynessRead ? `${getBusynessLabel(busynessPercent)} · ${busynessPercent}%` : "--"}
                    </span>
                  </div>
                  {hasBusynessRead ? (
                    <div>
                      <BusynessMeter
                        value={busyness}
                        source={busynessSource}
                        sampleSize={mfSampleSize}
                        computedAt={signal?.computedAt ?? null}
                      />
                      <SignalFreshnessLabel signal={signal} className="mt-2 block" />
                    </div>
                  ) : (
                    <EmptySignalState
                      icon={Clock}
                      message="No crowd data yet"
                    />
                  )}
                  <ShareButton
                    venueId={venue.id}
                    venueName={venue.name}
                    aria-label="Share current vibe"
                    className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white/[0.04] px-5 text-sm font-black text-[#E5E7EB] shadow-none transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-[#8B6CFF]/70 disabled:bg-white/10 disabled:text-white/35"
                  >
                    <span>Share Vibe</span>
                  </ShareButton>
                </div>

                {hasEnoughMfSample ? (
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-sm font-black text-white">M/F ratio</span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/45">
                        <span aria-hidden="true">{crowdFeel.emoji}</span>
                        {crowdFeel.label}
                      </span>
                    </div>
                    <MFRatioBar
                      mfRatio={signal?.mfRatio}
                      sampleSize={mfSampleSize}
                    />
                  </div>
                ) : null}

                <CheckInFeed checkIns={recentCheckIns} />

                {signalSourceLabel && (
                  <p className="text-[11px] text-white/35">
                    {signalSourceLabel}
                  </p>
                )}
                <SignalFreshnessLabel signal={signal} />
                {canReportVibe ? (
                  <button
                    type="button"
                    onClick={() => void openVibeReport()}
                    aria-label={checkInConfirmed ? "Check-in recorded" : "Report the vibe"}
                    className={`flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full px-5 text-base font-black shadow-[0_0_24px_rgba(139,108,255,0.28)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
                      checkInConfirmed
                        ? "bg-[#0A0A0E] text-[#F4F5F8] hover:bg-[#0A0A0E]"
                        : "bg-[#8B6CFF] text-[#0A0A0E] hover:bg-[#A896FF]"
                    }`}
                  >
                    {checkInConfirmed ? (
                      <>
                        <Check size={20} strokeWidth={3} aria-hidden="true" />
                        Recorded
                      </>
                    ) : (
                      "Report the vibe"
                    )}
                  </button>
                ) : authChecked ? (
                  <AuthRequiredReportAction venueId={venue.id} venueName={venue.name} />
                ) : (
                  <div className="min-h-[54px] rounded-full bg-white/10" aria-hidden="true" />
                )}
              </div>
              {!hasBusynessRead && !signal?.sampleSize && (
                <p className="text-[13px] text-[#9CA2AE]">
                  No live reads yet — be the first to report
                </p>
              )}
            </section>

            <VenuePredictionCard
              venueId={venue.id}
              checkInCount={mfSampleSize}
              hasBestTimeVenue={Boolean(venue.besttimeVenueId)}
              hourlyForecast={nextSixForecast}
              hourlyLoading={bestTimeForecastLoading}
              hourlyUpdatedOn={bestTimeForecastUpdatedOn}
            />
          </div>
            </div>
          )}

          {tab === "tips" && (
            <div
              id="venue-tips-panel"
              role="tabpanel"
              aria-labelledby="venue-tips-tab"
              className="mx-auto max-w-lg px-4 py-5"
            >
              <VenueTips venueId={venue.id} />
            </div>
          )}

          <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-white/[0.08] bg-[#0A0A0E]/95 px-4 py-3 backdrop-blur-xl sm:hidden">
            <div className="mx-auto grid max-w-lg grid-cols-[minmax(0,1fr)_4rem] gap-3">
              <CheckInButton venueId={venue.id} venueName={venue.name} />
              <SaveButton
                placeId={venue.id}
                ariaLabel="Bookmark shortcut"
                onSavedChange={handleVenueSavedChange}
                className="h-[52px] w-full rounded-full border border-white/[0.08] bg-white/[0.06] text-white/75 hover:text-[#8B6CFF] focus-visible:ring-[#8B6CFF]/70"
              />
            </div>
          </div>
        </>
      )}

      {venue && reportOpen && (
        <div
          ref={reportDialogRef}
          className="fixed inset-0 z-[80] flex items-end overscroll-contain bg-black/60 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="venue-report-title"
          tabIndex={-1}
        >
          <button
            type="button"
            aria-label="Close report form"
            aria-hidden="true"
            tabIndex={-1}
            className="absolute inset-0 cursor-default"
            onClick={closeReportFormWithHaptic}
          />
          <div
            className="relative mx-auto w-full max-w-lg touch-pan-y rounded-[18px] border border-white/[0.08] bg-[#0A0A0E] p-4 shadow-2xl"
            {...reportSwipeHandlers}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
            <div className="flex items-center justify-between gap-4">
              <h2 id="venue-report-title" className="font-display text-lg font-black text-white">
                Report an issue
              </h2>
              <button
                type="button"
                aria-label="Close report form"
                onClick={closeReportFormWithHaptic}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:opacity-50"
                disabled={reportSubmitting}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            <fieldset className="mt-4 space-y-2">
              <legend className="sr-only">Report reason</legend>
              {VENUE_REPORT_REASONS.map((reason) => (
                <label
                  key={reason.value}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                    reportReason === reason.value
                      ? "border-[#8B6CFF]/65 bg-[#8B6CFF]/10 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06]"
                  }`}
                >
                  <input aria-label={reason.label}
                    type="radio"
                    name="venue-report-reason"
                    value={reason.value}
                    checked={reportReason === reason.value}
                    onChange={() => setReportReason(reason.value)}
                    className="h-4 w-4 accent-[#8B6CFF]"
                  />
                  {reason.label}
                </label>
              ))}
            </fieldset>

            <div className="mt-4 space-y-2">
              <label htmlFor="venue-report-notes" className="text-sm font-black text-white">
                Additional notes (optional)
              </label>
              <textarea
                id="venue-report-notes"
                value={reportNotes}
                onChange={(event) => {
                  setReportNotes(event.target.value.slice(0, 200));
                  if (reportError) setReportError(null);
                }}
                maxLength={200}
                rows={3}
                placeholder="What should we correct?"
                className="w-full resize-none rounded-[12px] border border-white/[0.08] bg-white/[0.07] px-3 py-2 text-base text-[#F4F5F8] placeholder:text-[#9CA2AE] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
              />
              <div className="flex items-center justify-between gap-3">
                <span className={`text-xs ${reportCharactersRemaining < 20 ? "text-amber-300" : "text-white/35"}`}>
                  {reportCharactersRemaining} characters remaining
                </span>
                {reportError && <span className="text-right text-xs font-medium text-[#FF5B6A]">{reportError}</span>}
              </div>
            </div>

            <button
              type="button"
              onClick={submitVenueReport}
              disabled={reportSubmitting}
              aria-busy={reportSubmitting}
              className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-[#8B6CFF] px-4 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
            >
              {reportSubmitting ? "Submitting" : "Submit report"}
            </button>
          </div>
        </div>
      )}

      {venue && vibeReportOpen && (
        <div
          ref={vibeDialogRef}
          className="fixed inset-0 z-50 overscroll-contain bg-black/65 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vibe-report-title"
          tabIndex={-1}
        >
          <button
            type="button"
            aria-label="Close vibe report"
            aria-hidden="true"
            tabIndex={-1}
            className="absolute inset-0 cursor-default"
            onClick={closeVibeReportWithHaptic}
          />
          <div
            className="fixed bottom-0 left-0 right-0 mx-auto w-full max-w-lg touch-pan-y rounded-t-[18px] border border-white/[0.08] bg-[#0A0A0E] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-2xl"
            {...vibeSwipeHandlers}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 id="vibe-report-title" className="font-display text-lg font-black text-white">
                  {vibeStep === 1
                    ? "How busy is it?"
                    : vibeStep === 2
                      ? "What is the crowd feel?"
                      : "Your M/F signal"}
                </h2>
                <p className="mt-1 text-xs font-medium text-white/40">
                  {vibeStep === 1
                    ? "Tap the crowd level you see right now."
                    : vibeStep === 2
                      ? "Choose the closest read from the room."
                      : "Choose one, or keep the default."}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close vibe report"
                onClick={closeVibeReportWithHaptic}
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:opacity-50"
                disabled={vibeSubmitting}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            {vibeStep === 1 ? (
              <fieldset className="mt-5">
                <legend className="sr-only">How busy is it?</legend>
                <div className="grid grid-cols-2 gap-2">
                  {VIBE_BUSYNESS_OPTIONS.map((option) => {
                    const selected = vibeBusynessOptionId === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => chooseVibeBusyness(option)}
                        aria-pressed={selected}
                        className="min-h-[86px] rounded-2xl border px-3 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                        style={{
                          backgroundColor: selected ? option.selectedBackground : "rgba(255,255,255,0.03)",
                          borderColor: selected ? option.selectedBorder : "rgba(255,255,255,0.1)",
                          borderWidth: selected ? 2 : 1,
                        }}
                      >
                        <span className="block text-base font-black text-white">{option.label}</span>
                        <span className="mt-1 block text-xs font-bold text-white/40">{option.score}/100</span>
                      </button>
                    );
                  })}
                </div>
                {vibeError && <p className="mt-3 text-sm font-medium text-[#FF5B6A]">{vibeError}</p>}
              </fieldset>
            ) : vibeStep === 2 ? (
              <div className="mt-5 space-y-4">
                <fieldset>
                  <legend className="sr-only">Crowd feel</legend>
                  <div className="flex flex-wrap gap-2">
                    {VIBE_CROWD_FEEL_OPTIONS.map((option) => {
                      const selected = vibeCrowdFeel === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => chooseVibeCrowdFeel(option)}
                          aria-pressed={selected}
                          className={`min-h-11 rounded-full border px-4 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
                            selected
                              ? "border-[#8B6CFF]/65 bg-[#8B6CFF]/15 text-white"
                              : "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                {vibeError && <p className="text-sm font-medium text-[#FF5B6A]">{vibeError}</p>}
                <button
                  type="button"
                  onClick={() => {
                    setVibeStep(1);
                    setVibeError(null);
                  }}
                  disabled={vibeSubmitting}
                  className="w-full rounded-xl py-2 text-xs font-bold text-white/40 transition-colors hover:text-white/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:opacity-50"
                >
                  Back
                </button>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-sm font-black text-white">
                    How should this check-in count?
                  </p>
                  <p className="mt-1 text-xs font-semibold text-white/40">
                    This only updates the venue M/F signal.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {GENDER_SELF_REPORT_OPTIONS.map((option) => {
                    const selected = vibeGenderSelfReport === option.value;
                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => {
                          setVibeGenderSelfReport(option.value);
                          void submitVibeReport(option.value);
                        }}
                        disabled={vibeSubmitting}
                        aria-pressed={selected}
                        aria-busy={vibeSubmitting && selected}
                        className={`flex min-h-12 items-center justify-center rounded-2xl border px-3 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:cursor-not-allowed disabled:opacity-50 ${
                          selected
                            ? "border-[#8B6CFF]/65 bg-[#8B6CFF]/15 text-white"
                            : "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white"
                        }`}
                      >
                        {vibeSubmitting && selected ? "Saving" : option.label}
                      </button>
                    );
                  })}
                </div>
                {vibeError && <p className="text-sm font-medium text-[#FF5B6A]">{vibeError}</p>}
                <button
                  type="button"
                  onClick={() => {
                    setVibeStep(2);
                    setVibeError(null);
                  }}
                  disabled={vibeSubmitting}
                  className="w-full rounded-xl py-2 text-xs font-bold text-white/40 transition-colors hover:text-white/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:opacity-50"
                >
                  Back
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
