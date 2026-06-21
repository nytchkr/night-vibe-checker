"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import { Check, ChevronDown, ChevronLeft, Heart, MapPin, Share2, X } from "lucide-react";
import { BusynessMeter } from "@/components/BusynessMeter";
import { MFBar } from "@/components/MFBar";
import { Toast } from "@/components/Toast";
import { VenueRating } from "@/components/VenueRating";
import { Skeleton } from "@/components/ui/skeleton";
import { getBusynessState } from "@/lib/busyness";
import { VENUE_PHOTO_BLUR_DATA_URL } from "@/lib/imagePlaceholders";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useHaptic } from "@/hooks/useHaptic";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { buildVenueShareClipboardText, buildVenueShareData } from "@/lib/venueShare";
import type { ConsumerVenue, CrowdFeel, ReportedBusyness } from "@/types";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type VenueActivityItem = {
  displayName: string;
  avatarUrl: string | null;
  checkedInAt: string;
  minutesAgo: number;
};

type VenueTip = {
  id: string;
  venueId: string;
  userId: string | null;
  tip: string;
  helpfulCount: number;
  createdAt: string;
};

type VenueReportReason = "wrong_hours" | "wrong_location" | "permanently_closed" | "duplicate" | "other";

type VibeBusynessOption = {
  value: ReportedBusyness;
  label: string;
  selectedBackground: string;
  selectedBorder: string;
};

type VibeCrowdOption = {
  value: CrowdFeel;
  label: string;
};

const VENUE_REPORT_REASONS: Array<{ value: VenueReportReason; label: string }> = [
  { value: "wrong_hours", label: "Wrong hours" },
  { value: "wrong_location", label: "Wrong location" },
  { value: "permanently_closed", label: "Permanently closed" },
  { value: "duplicate", label: "Duplicate" },
  { value: "other", label: "Other" },
];

const VIBE_BUSYNESS_OPTIONS: VibeBusynessOption[] = [
  { value: "dead", label: "Dead 💀", selectedBackground: "rgba(92,101,115,0.2)", selectedBorder: "#5C6573" },
  { value: "moderate", label: "Moderate 🔥", selectedBackground: "rgba(255,176,32,0.2)", selectedBorder: "#FFB020" },
  { value: "packed", label: "Packed 🎉", selectedBackground: "rgba(255,91,106,0.2)", selectedBorder: "#FF5B6A" },
];

const VIBE_CROWD_OPTIONS: VibeCrowdOption[] = [
  { value: "mostly_male", label: "Mostly guys 👨" },
  { value: "mostly_female", label: "Mostly girls 👩" },
  { value: "balanced", label: "Balanced ⚖️" },
  { value: "mixed", label: "Mixed 🎭" },
];

const VIBE_NOTE_MAX_LENGTH = 120;

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

function formatHoursText(hours: string): string {
  const separatorIndex = hours.indexOf(":");
  const value = separatorIndex >= 0 ? hours.slice(separatorIndex + 1) : hours;
  return value.trim().replace(/\s+-\s+/, " – ");
}

function getHoursDay(hours: string): string | null {
  return hours.match(/^([^:]+):/)?.[1]?.trim() ?? null;
}

function isClosedHours(hoursText: string): boolean {
  return /\bclosed\b/i.test(hoursText);
}

function formatShortTime(time: string): string {
  return time
    .trim()
    .replace(/\s+/g, " ")
    .replace(/:00\s*/i, " ")
    .replace(/\b(am|pm)\b/i, (period) => period.toUpperCase());
}

function parseTimeToMinutes(time: string): number | null {
  const match = time.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;

  const hour = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const period = match[3].toUpperCase();
  if (hour < 1 || hour > 12 || minutes < 0 || minutes > 59) return null;

  const hour24 = period === "AM"
    ? hour === 12 ? 0 : hour
    : hour === 12 ? 12 : hour + 12;
  return hour24 * 60 + minutes;
}

function parseHoursRange(hoursText: string): { open: string; close: string; openMinutes: number; closeMinutes: number } | null {
  if (isClosedHours(hoursText)) return null;

  const [open, close] = hoursText.split(/\s*[–-]\s*/);
  if (!open || !close) return null;

  const openMinutes = parseTimeToMinutes(open);
  const closeMinutes = parseTimeToMinutes(close);
  if (openMinutes == null || closeMinutes == null) return null;

  return { open, close, openMinutes, closeMinutes };
}

function formatTodayHoursStatus(hoursEntry: string | undefined, previousHoursEntry: string | undefined): string {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (previousHoursEntry) {
    const previousRange = parseHoursRange(formatHoursText(previousHoursEntry));
    if (previousRange && previousRange.closeMinutes <= previousRange.openMinutes && nowMinutes <= previousRange.closeMinutes) {
      return `Open until ${formatShortTime(previousRange.close)}`;
    }
  }

  if (!hoursEntry) return "Closed";

  const hoursText = formatHoursText(hoursEntry);
  if (isClosedHours(hoursText)) return "Closed";

  const range = parseHoursRange(hoursText);
  if (!range) return hoursText;

  const closeMinutes = range.closeMinutes <= range.openMinutes
    ? range.closeMinutes + 24 * 60
    : range.closeMinutes;

  if (nowMinutes < range.openMinutes) return `Opens at ${formatShortTime(range.open)}`;
  if (nowMinutes <= closeMinutes) return `Open until ${formatShortTime(range.close)}`;
  return "Closed";
}

function formatWeekHours(hoursEntry: string): { day: string; hours: string; closed: boolean } {
  const day = getHoursDay(hoursEntry) ?? "";
  const hours = formatHoursText(hoursEntry);
  return {
    day,
    hours: isClosedHours(hours) ? "Closed" : hours.split(/\s*[–-]\s*/).map(formatShortTime).join(" – "),
    closed: isClosedHours(hours),
  };
}

function getCategoryAccent(category: string): string {
  const value = category.toLowerCase();
  if (value.includes("club") || value.includes("night")) return "#F0568C";
  if (value.includes("bar") || value.includes("pub")) return "#8B6CFF";
  if (value.includes("lounge")) return "#8B6CFF";
  if (value.includes("restaurant")) return "#FFB020";
  return "#8B6CFF";
}

function CategoryChip({ category }: { category: string }) {
  return (
    <span className="inline-flex rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-white/85 backdrop-blur">
      {category.replaceAll("_", " ")}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading venue">
      <Skeleton className="aspect-video w-full rounded-none bg-white/10" />
      <div className="px-4">
        <Skeleton className="h-8 w-2/3 bg-white/10" />
        <Skeleton className="mt-3 h-4 w-4/5 bg-white/10" />
        <Skeleton className="mt-5 h-28 rounded-2xl bg-white/10" />
      </div>
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
  if (signal.busynessSource === "live") return "via BestTime live";
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
  if (percent >= 70) return "#FF5B6A";
  if (percent >= 40) return "#FFB020";
  return "#5C6573";
}

function trackAnalytics(event: string, properties: Record<string, string | number | boolean | null>) {
  try {
    track(event, properties);
  } catch {
    // Analytics must never break the UI.
  }
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
                <Image
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
            <div className="-ml-2 flex h-9 min-w-9 items-center justify-center rounded-full border-2 border-[#0A0A0E] bg-white text-[11px] font-black text-[#0A0A0E] shadow-lg">
              +{extraCount}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function VenuePageClient({
  venueId,
  initialVenue,
}: {
  venueId: string;
  initialVenue: ConsumerVenue | null;
}) {
  const router = useRouter();
  const haptic = useHaptic();
  const trackedVenueView = useRef(false);
  const [venue, setVenue] = useState<ConsumerVenue | null>(initialVenue);
  const [loading, setLoading] = useState(!initialVenue);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [alerting, setAlerting] = useState(false);
  const [alertPending, setAlertPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const [venueActivity, setVenueActivity] = useState<VenueActivityItem[]>([]);
  const [tips, setTips] = useState<VenueTip[]>([]);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipDraft, setTipDraft] = useState("");
  const [tipSubmitting, setTipSubmitting] = useState(false);
  const [tipError, setTipError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<VenueReportReason>("wrong_hours");
  const [reportNotes, setReportNotes] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [vibeReportOpen, setVibeReportOpen] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [vibeBusyness, setVibeBusyness] = useState<ReportedBusyness | null>(null);
  const [vibeCrowdFeel, setVibeCrowdFeel] = useState<CrowdFeel | null>(null);
  const [vibeNote, setVibeNote] = useState("");
  const [vibeSubmitting, setVibeSubmitting] = useState(false);
  const [vibeError, setVibeError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [checkInConfirmed, setCheckInConfirmed] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const photoStripRef = useRef<HTMLDivElement>(null);
  const reportDialogRef = useRef<HTMLDivElement | null>(null);
  const vibeDialogRef = useRef<HTMLDivElement | null>(null);
  const loginDialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(reportOpen, reportDialogRef, () => {
    if (!reportSubmitting) setReportOpen(false);
  });
  useFocusTrap(vibeReportOpen, vibeDialogRef, () => {
    if (!vibeSubmitting) setVibeReportOpen(false);
  });
  useFocusTrap(loginPromptOpen, loginDialogRef, () => setLoginPromptOpen(false));

  useEffect(() => {
    if (!checkInConfirmed) return;
    const timer = window.setTimeout(() => setCheckInConfirmed(false), 1500);
    return () => window.clearTimeout(timer);
  }, [checkInConfirmed]);

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
    const tipsVenueId = venue?.id ?? venueId;
    if (!tipsVenueId) return;

    let cancelled = false;
    setTipsLoading(true);

    async function fetchTips() {
      try {
        const res = await fetch(`/api/venues/${encodeURIComponent(tipsVenueId)}/tips`);
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        const nextTips = json?.data?.tips;
        if (!cancelled) setTips(Array.isArray(nextTips) ? nextTips : []);
      } catch {
        if (!cancelled) setTips([]);
      } finally {
        if (!cancelled) setTipsLoading(false);
      }
    }

    void fetchTips();
    return () => {
      cancelled = true;
    };
  }, [venue?.id, venueId]);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    const client = createBrowserClient();

    async function fetchSavedState() {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (cancelled) return;

      setAccessToken(token);
      setAuthChecked(true);

      if (!token) {
        setSaved(false);
        setAlerting(false);
        return;
      }

      try {
        const [savedRes, alertRes] = await Promise.all([
          fetch("/api/saved-venues", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/push/venue-alert?venueId=${encodeURIComponent(venueId)}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (savedRes.ok) {
          const json = await savedRes.json();
          const ids = json?.venueIds ?? json?.savedVenueIds ?? json?.data?.savedVenueIds ?? [];
          if (!cancelled) setSaved(Array.isArray(ids) && ids.includes(venueId));
        }

        if (alertRes.ok) {
          const json = await alertRes.json();
          if (!cancelled) setAlerting(Boolean(json?.alerting ?? json?.data?.alerting));
        }
      } catch {
        // Saved/alert lookup is non-critical; leave defaults if it fails.
      }
    }

    void fetchSavedState();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token ?? null;
      setAccessToken(token);
      setAuthChecked(true);
      if (!token) {
        setSaved(false);
        setAlerting(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [venueId]);

  async function toggleSaved() {
    if (!accessToken || savePending) return;

    const nextSaved = !saved;
    if (nextSaved) {
      haptic.light();
    } else {
      haptic.error();
    }
    setSaved(nextSaved);
    setSavePending(true);

    try {
      const res = await fetch("/api/saved-venues", {
        method: nextSaved ? "POST" : "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ venueId }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch {
      setSaved(!nextSaved);
    } finally {
      setSavePending(false);
    }
  }

  async function toggleVenueAlert() {
    if (alertPending) return;
    haptic.medium();

    if (!accessToken) {
      router.push(`/login?return=${encodeURIComponent(`/venues/${venueId}`)}`);
      return;
    }

    const nextAlerting = !alerting;
    setAlerting(nextAlerting);
    setAlertPending(true);

    try {
      const res = await fetch("/api/push/venue-alert", {
        method: nextAlerting ? "POST" : "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ venueId }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      trackAnalytics("venue_alert_toggled", {
        venue_id: venueId,
        action: nextAlerting ? "subscribe" : "unsubscribe",
      });
    } catch {
      setAlerting(!nextAlerting);
    } finally {
      setAlertPending(false);
    }
  }

  async function shareVenue() {
    if (!venue) return;
    const url = typeof window !== "undefined" ? window.location.href : "";
    const shareData = buildVenueShareData(venue);

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share(shareData);
        trackAnalytics("share_card_shared", {
          venue_id: venue.id,
          method: "native",
        });
        return;
      } catch {
        // User cancelled or browser blocked native sharing; use clipboard fallback.
      }
    }

    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) return;
      await navigator.clipboard.writeText(buildVenueShareClipboardText({ ...shareData, url: shareData.url ?? url }));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      trackAnalytics("share_card_shared", {
        venue_id: venue.id,
        method: "clipboard",
      });
    } catch {
      // Clipboard is non-critical for the venue page.
    }
  }

  async function submitTip() {
    if (tipSubmitting) return;

    if (!accessToken) {
      router.push(`/login?return=${encodeURIComponent(`/venues/${venueId}`)}`);
      return;
    }

    const tip = tipDraft.trim();
    if (tip.length < 10 || tip.length > 200) {
      setTipError("Tips must be 10 to 200 characters.");
      return;
    }

    setTipSubmitting(true);
    setTipError(null);

    try {
      const res = await fetch(`/api/venues/${encodeURIComponent(venue?.id ?? venueId)}/tips`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tip }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      const savedTip = json?.data?.tip;
      if (savedTip) {
        setTips((current) => [savedTip as VenueTip, ...current].slice(0, 10));
        setTipDraft("");
      }
    } catch {
      setTipError("Could not share that tip. Try again.");
    } finally {
      setTipSubmitting(false);
    }
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

  function openVibeReport() {
    if (!authChecked) return;
    haptic.light();
    trackAnalytics("check_in", { venue_id: venueId });
    if (!accessToken) {
      setLoginPromptOpen(true);
      return;
    }
    setVibeError(null);
    setVibeReportOpen(true);
  }

  async function submitVibeReport() {
    if (vibeSubmitting || !vibeBusyness || !vibeCrowdFeel || !accessToken) return;

    setVibeSubmitting(true);
    setVibeError(null);

    try {
      const reportVenueId = venue?.id ?? venueId;
      const res = await fetch(`/api/venues/${encodeURIComponent(reportVenueId)}/check-in`, {
        method: "POST",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          busyness: vibeBusyness,
          crowd_feel: vibeCrowdFeel,
          note: vibeNote.trim() || undefined,
        }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          setVibeReportOpen(false);
          setLoginPromptOpen(true);
          return;
        }
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error?.message ?? "Could not submit vibe.");
      }

      setVibeReportOpen(false);
      setVibeBusyness(null);
      setVibeCrowdFeel(null);
      setVibeNote("");
      setToast("Check-in recorded! Thanks for the vibe.");
      setCheckInConfirmed(true);
      haptic.success();
      trackAnalytics("vibe_check_submitted", {
        venue_id: reportVenueId,
        busyness_level: vibeBusyness,
        crowd_feel: vibeCrowdFeel,
      });

      const venueRes = await fetch(`/api/venues/${encodeURIComponent(reportVenueId)}`);
      if (venueRes.ok) {
        const json = await venueRes.json();
        setVenue(json?.data?.venue ?? venue);
      }
    } catch (error) {
      setVibeError(error instanceof Error ? error.message : "Could not submit vibe.");
      haptic.error();
    } finally {
      setVibeSubmitting(false);
    }
  }

  async function markTipHelpful(tipId: string) {
    haptic.light();
    const previousTips = tips;
    setTips((current) =>
      current.map((tip) => tip.id === tipId ? { ...tip, helpfulCount: tip.helpfulCount + 1 } : tip),
    );

    try {
      const res = await fetch(`/api/tips/${encodeURIComponent(tipId)}/helpful`, { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      const helpfulCount = json?.data?.tip?.helpfulCount;
      if (typeof helpfulCount === "number") {
        setTips((current) => current.map((tip) => tip.id === tipId ? { ...tip, helpfulCount } : tip));
      }
    } catch {
      setTips(previousTips);
    }
  }

  const signal = venue?.signal;
  const busyness = signal?.busyness0To100 ?? null;
  const busynessPercent = clampPercent(busyness);
  const busynessState = getBusynessState(busyness);
  const label = busynessState.label;
  const hasBusynessRead = busyness != null;
  const updatedAt = signal?.lastBusynessRefresh ?? signal?.computedAt ?? null;
  const malePercent = signal?.mfRatio != null ? clampPercent(signal.mfRatio) : null;
  const femalePercent = malePercent == null ? null : 100 - malePercent;
  const crowdFeel = getCrowdFeel(malePercent);
  const signalSourceLabel = sourceLabel(signal ?? null, updatedAt);
  const busynessSource = signal?.busynessSource ?? null;
  const mfSource = signal?.sampleSize ? "live" : null;
  const hoursSummary = useMemo(() => {
    const openingHours = venue?.openingHours ?? [];
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
    const previousDay = WEEKDAYS[(WEEKDAYS.indexOf(today) + WEEKDAYS.length - 1) % WEEKDAYS.length];
    const todayHours = openingHours.find((hours) => getHoursDay(hours) === today);
    const previousHours = openingHours.find((hours) => getHoursDay(hours) === previousDay);

    return {
      hasHours: openingHours.length > 0,
      todayStatus: formatTodayHoursStatus(todayHours, previousHours),
      weekHours: openingHours.map(formatWeekHours),
      today,
    };
  }, [venue?.openingHours]);
  const mapsHref = useMemo(() => {
    if (!venue) return "#";
    const query = venue.address || `${venue.lat},${venue.lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }, [venue]);
  const vibeCheckHref = useMemo(() => {
    if (!venue) return "/vibe-check";
    const params = new URLSearchParams({
      venue: venue.id,
      venueId: venue.id,
      venueName: venue.name,
    });
    return `/vibe-check?${params.toString()}`;
  }, [venue]);
  const galleryPhotoUrls = useMemo(() => {
    const urls = [venue?.photoUrl, ...(venue?.photoUrls ?? [])].filter((url): url is string => Boolean(url));
    return urls.filter((url, index) => url.length > 0 && urls.indexOf(url) === index);
  }, [venue?.photoUrl, venue?.photoUrls]);
  const hasGallery = galleryPhotoUrls.length > 1;
  const heroPhotoUrl = galleryPhotoUrls[Math.min(activePhotoIndex, galleryPhotoUrls.length - 1)];
  const tipCharactersRemaining = 200 - tipDraft.length;
  const canSubmitTip = tipDraft.trim().length >= 10 && tipDraft.trim().length <= 200 && !tipSubmitting;
  const reportCharactersRemaining = 200 - reportNotes.length;
  const canSubmitVibe = Boolean(vibeBusyness && vibeCrowdFeel && !vibeSubmitting);

  useEffect(() => {
    setActivePhotoIndex(0);
    photoStripRef.current?.scrollTo({ left: 0 });
  }, [venue?.id, galleryPhotoUrls.length]);

  function handlePhotoStripScroll() {
    const strip = photoStripRef.current;
    if (!strip || galleryPhotoUrls.length <= 1) return;
    const photoWidth = strip.querySelector<HTMLElement>("[data-gallery-photo]")?.offsetWidth ?? 320;
    const gap = 12;
    const nextIndex = Math.round(strip.scrollLeft / (photoWidth + gap));
    setActivePhotoIndex(Math.max(0, Math.min(galleryPhotoUrls.length - 1, nextIndex)));
  }

  function goBackToMap() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/map");
  }

  return (
    <div className="min-h-screen bg-[#0A0A0E] pb-48">
      {toast && (
        <Toast
          message={toast}
          durationMs={2500}
          onDone={() => setToast(null)}
          className="bottom-[calc(env(safe-area-inset-bottom)+8.75rem)] rounded-full border-white/10 bg-[#1A1A2E] px-5 py-3 font-semibold text-white shadow-2xl shadow-black/30"
        />
      )}

      {loading && <LoadingSkeleton />}

      {!loading && error && (
        <div className="mx-auto max-w-lg px-4 py-6 pb-36">
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/40 bg-rose-950/60 p-5 text-center"
          >
            <p className="font-medium text-rose-300">Could not load venue</p>
            <p className="mt-1 text-sm text-rose-400/70">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && venue && (
        <>
          <section
            className="w-full border-b border-white/[0.06] bg-[#0A0A0E] px-4 pb-6 pt-4"
            role="region"
            aria-label="Venue hero"
          >
            <button
              type="button"
              onClick={goBackToMap}
              aria-label="Back to map"
              className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#0A0A0E]/80 px-3 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-md transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
            >
              <ChevronLeft size={17} strokeWidth={2.5} aria-hidden="true" />
              Map
            </button>

            <div className="relative mx-auto max-w-lg">
              <div className="relative h-[240px] max-h-[240px] w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                {heroPhotoUrl ? (
                  <Image
                    src={heroPhotoUrl}
                    alt={venue.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 512px"
                    priority
                    placeholder="blur"
                    blurDataURL={VENUE_PHOTO_BLUR_DATA_URL}
                    className="object-cover"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center px-6 text-center"
                    style={{
                      background: `linear-gradient(155deg, ${getCategoryAccent(venue.category)}33 0%, rgba(255,255,255,0.05) 48%, rgba(0,0,0,0.25) 100%)`,
                    }}
                  >
                    <span className="text-sm font-black uppercase tracking-[0.16em] text-white/55">
                      {venue.category.replaceAll("_", " ")}
                    </span>
                  </div>
                )}
              </div>

              {hasGallery && (
                <div className="mt-3" aria-label={`${venue.name} photos`}>
                  <div
                    ref={photoStripRef}
                    onScroll={handlePhotoStripScroll}
                    className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {galleryPhotoUrls.map((photoUrl, index) => (
                      <button
                        key={photoUrl}
                        type="button"
                        data-gallery-photo
                        onClick={() => setActivePhotoIndex(index)}
                        className={`h-16 w-24 flex-shrink-0 snap-start overflow-hidden rounded-xl border text-left transition ${
                          activePhotoIndex === index ? "border-[#8B6CFF]/80" : "border-white/10"
                        }`}
                        aria-label={`Show photo ${index + 1} of ${galleryPhotoUrls.length}`}
                        aria-pressed={activePhotoIndex === index}
                      >
                        <Image
                          src={photoUrl}
                          alt={`${venue.name} photo ${index + 1}`}
                          width={96}
                          height={64}
                          sizes="96px"
                          placeholder="blur"
                          blurDataURL={VENUE_PHOTO_BLUR_DATA_URL}
                          className="h-16 w-24 object-cover"
                        />
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-center gap-1.5" aria-hidden="true">
                    {galleryPhotoUrls.map((photoUrl, index) => (
                      <span
                        key={`${photoUrl}-dot`}
                        className={`h-1.5 w-1.5 rounded-full transition ${
                          activePhotoIndex === index ? "bg-[#8B6CFF]" : "bg-white/25"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="pt-5">
                <CategoryChip category={venue.category} />
                <h1 className="font-display mt-3 max-w-[22rem] text-3xl font-black leading-[1.03] text-white">{venue.name}</h1>
                {venue.address && (
                  <p className="mt-3 max-w-[24rem] text-sm font-medium leading-relaxed text-white/60">{venue.address}</p>
                )}
              </div>
            </div>
          </section>

          <div className="border-b border-white/[0.06]">
            <div className="mx-auto max-w-lg overflow-x-auto px-4 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max min-w-full gap-3">
                <div className="min-w-[9.5rem] rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">Busyness</span>
                    <span className="text-sm font-black text-white">{hasBusynessRead ? `${busynessPercent}%` : "--"}</span>
                  </div>
                  <BusynessMeter value={busyness} source={busynessSource} computedAt={signal?.computedAt ?? null} className="mt-3" />
                </div>

                <div className="min-w-[13rem] rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">M/F ratio</span>
                  <MFBar
                    malePercent={malePercent}
                    sampleSize={signal?.sampleSize ?? 0}
                    source={mfSource}
                    className="mt-3"
                  />
                </div>

                <div className="min-w-[9.5rem] rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">Status</span>
                  <p className={`mt-2 text-sm font-black ${venue.openNow ? "text-[#8B6CFF]" : "text-white/35"}`}>
                    {venue.openNow ? "Open Now" : "Closed"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-lg space-y-6 px-4 py-5">
            <WhoHereSection activity={venueActivity} />

            {hoursSummary.hasHours && (
              <section className="space-y-3" role="region" aria-label="Venue hours">
                <button
                  type="button"
                  onClick={() => setHoursExpanded((expanded) => !expanded)}
                  className="flex w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4 text-left transition-colors hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
                  aria-expanded={hoursExpanded}
                  aria-controls="venue-hours-list"
                >
                  <span>
                    <span className="block text-sm font-black text-white">Hours</span>
                    <span className="mt-1 block text-[13px] font-medium text-white/45">{hoursSummary.todayStatus}</span>
                  </span>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-white/45 transition-transform ${hoursExpanded ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {hoursExpanded && (
                  <ul id="venue-hours-list" className="space-y-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                    {hoursSummary.weekHours.map((hour, index) => {
                      const isToday = hour.day === hoursSummary.today;
                      return (
                        <li
                          key={`${hour.day}-${index}`}
                          className={`grid grid-cols-[6.5rem_1fr] gap-3 text-[13px] ${
                            isToday ? "text-[#8B6CFF]" : hour.closed ? "text-white/35" : "text-white/55"
                          }`}
                        >
                          <span className="font-bold">{hour.day}</span>
                          <span>{hour.hours}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}

            <section className="space-y-4" role="region" aria-label="Current venue signal">
              <p className="text-[13px] font-medium uppercase tracking-wide text-white/40">Right now</p>
              <div className="space-y-5">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-sm font-black text-white">Busyness</span>
                    <span className="text-sm font-black text-white">{hasBusynessRead ? `${busynessPercent}%` : "--"}</span>
                  </div>
                  <BusynessMeter value={busyness} source={busynessSource} computedAt={signal?.computedAt ?? null} />
                </div>

                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-sm font-black text-white">M/F ratio</span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/45">
                      <span aria-hidden="true">{crowdFeel.emoji}</span>
                      {crowdFeel.label}
                    </span>
                  </div>
                  <MFBar
                    malePercent={malePercent}
                    sampleSize={signal?.sampleSize ?? 0}
                    source={mfSource}
                  />
                </div>

                {signalSourceLabel && (
                  <p className="text-[11px] text-white/35">
                    {signalSourceLabel}
                  </p>
                )}
              </div>
              {!hasBusynessRead && !signal?.sampleSize && (
                <p className="text-[13px] text-white/35">
                  No live reads yet — be the first to report
                </p>
              )}
            </section>

            <VenueRating venueId={venueId} accessToken={accessToken} />

            <section className="space-y-4" role="region" aria-label="Tips from locals">
              <h2 className="font-display text-lg font-bold text-white">💡 Tips from locals</h2>

              {tipsLoading ? (
                <div className="space-y-3" role="status" aria-label="Loading tips">
                  <Skeleton className="h-16 rounded-2xl bg-white/10" />
                  <Skeleton className="h-16 rounded-2xl bg-white/10" />
                </div>
              ) : tips.length > 0 ? (
                <ul className="space-y-3">
                  {tips.map((tip) => (
                    <li key={tip.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4">
                      <p className="text-sm leading-relaxed text-white/75">{tip.tip}</p>
                      <button
                        type="button"
                        onClick={() => markTipHelpful(tip.id)}
                        className="mt-3 text-xs font-bold text-[#8B6CFF] transition-colors hover:text-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
                      >
                        {tip.helpfulCount} found this helpful
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-sm text-white/35">
                  Be the first to leave a tip!
                </p>
              )}

              <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4">
                <label htmlFor="venue-tip" className="text-sm font-black text-white">Add a tip</label>
                <textarea
                  id="venue-tip"
                  value={tipDraft}
                  onChange={(event) => {
                    setTipDraft(event.target.value.slice(0, 200));
                    if (tipError) setTipError(null);
                  }}
                  maxLength={200}
                  rows={3}
                  placeholder="Share the best time to go, where to stand, or what to order."
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#8B6CFF]/60"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-xs ${tipCharactersRemaining < 20 ? "text-amber-300" : "text-white/35"}`}>
                    {tipCharactersRemaining} characters remaining
                  </span>
                  <button
                    type="button"
                    onClick={submitTip}
                    disabled={!canSubmitTip}
                    className="rounded-xl bg-[#8B6CFF] px-4 py-2 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
                  >
                    {tipSubmitting ? "Sharing" : "Share"}
                  </button>
                </div>
                {tipError && <p className="text-xs font-medium text-rose-300">{tipError}</p>}
              </div>
            </section>

            <div className="grid grid-cols-2 gap-3" role="group" aria-label="Venue sharing and directions">
              <a
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.06] p-3 text-sm font-bold text-white/80 transition-colors hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
              >
                <MapPin size={17} aria-hidden="true" />
                Get Directions
              </a>
              <button
                type="button"
                onClick={shareVenue}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.06] p-3 text-sm font-bold text-white/80 transition-colors hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
              >
                <Share2 size={17} aria-hidden="true" />
                {copied ? "Copied" : "Share"}
              </button>
            </div>

            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={() => {
                  setReportError(null);
                  setReportOpen(true);
                }}
                className="text-xs font-medium text-white/35 underline-offset-4 transition-colors hover:text-white/55 hover:underline focus:outline-none focus-visible:text-white focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
              >
                Report
              </button>
            </div>
          </div>
        </>
      )}

      {venue && reportOpen && (
        <div
          ref={reportDialogRef}
          className="fixed inset-0 z-[80] flex items-end bg-black/60 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="venue-report-title"
          tabIndex={-1}
        >
          <button
            type="button"
            aria-label="Close report form"
            className="absolute inset-0 cursor-default"
            onClick={() => {
              if (!reportSubmitting) setReportOpen(false);
            }}
          />
          <div className="relative mx-auto w-full max-w-lg rounded-2xl border border-white/10 bg-[#11111A] p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <h2 id="venue-report-title" className="font-display text-lg font-black text-white">
                Report an issue
              </h2>
              <button
                type="button"
                aria-label="Close report form"
                onClick={() => {
                  if (!reportSubmitting) setReportOpen(false);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 disabled:opacity-50"
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
                className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#8B6CFF]/60"
              />
              <div className="flex items-center justify-between gap-3">
                <span className={`text-xs ${reportCharactersRemaining < 20 ? "text-amber-300" : "text-white/35"}`}>
                  {reportCharactersRemaining} characters remaining
                </span>
                {reportError && <span className="text-right text-xs font-medium text-rose-300">{reportError}</span>}
              </div>
            </div>

            <button
              type="button"
              onClick={submitVenueReport}
              disabled={reportSubmitting}
              className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-[#8B6CFF] px-4 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
            >
              {reportSubmitting ? "Submitting" : "Submit Report"}
            </button>
          </div>
        </div>
      )}

      {venue && vibeReportOpen && (
        <div
          ref={vibeDialogRef}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vibe-report-title"
          tabIndex={-1}
        >
          <button
            type="button"
            aria-label="Close vibe report"
            className="absolute inset-0 cursor-default"
            onClick={() => {
              if (!vibeSubmitting) setVibeReportOpen(false);
            }}
          />
          <div className="fixed bottom-0 left-0 right-0 mx-auto w-full max-w-lg rounded-t-3xl border border-white/10 bg-[#11111A] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 id="vibe-report-title" className="font-display text-lg font-black text-white">
                  Report the vibe
                </h2>
                <p className="mt-1 text-xs font-medium text-white/40">
                  Help people know what it feels like right now.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close vibe report"
                onClick={() => {
                  if (!vibeSubmitting) setVibeReportOpen(false);
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 disabled:opacity-50"
                disabled={vibeSubmitting}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            <fieldset className="mt-5">
              <legend className="text-sm font-black text-white">Busyness</legend>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {VIBE_BUSYNESS_OPTIONS.map((option) => {
                  const selected = vibeBusyness === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setVibeBusyness(option.value);
                        if (vibeError) setVibeError(null);
                        haptic.light();
                      }}
                      aria-pressed={selected}
                      className="min-h-[72px] rounded-2xl border px-2 text-center text-sm font-black text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
                      style={{
                        backgroundColor: selected ? option.selectedBackground : "rgba(255,255,255,0.03)",
                        borderColor: selected ? option.selectedBorder : "rgba(255,255,255,0.1)",
                        borderWidth: selected ? 2 : 1,
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="mt-5">
              <legend className="text-sm font-black text-white">Crowd feel</legend>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {VIBE_CROWD_OPTIONS.map((option) => {
                  const selected = vibeCrowdFeel === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setVibeCrowdFeel(option.value);
                        if (vibeError) setVibeError(null);
                        haptic.light();
                      }}
                      aria-pressed={selected}
                      className={`min-h-[58px] rounded-2xl border px-3 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 ${
                        selected
                          ? "border-2 border-[#8B6CFF] bg-[#8B6CFF]/15 text-white"
                          : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-5 space-y-2">
              <label htmlFor="vibe-note" className="sr-only">
                Add a note
              </label>
              <textarea
                id="vibe-note"
                value={vibeNote}
                onChange={(event) => {
                  setVibeNote(event.target.value.slice(0, VIBE_NOTE_MAX_LENGTH));
                  if (vibeError) setVibeError(null);
                }}
                maxLength={VIBE_NOTE_MAX_LENGTH}
                rows={3}
                placeholder="Add a note (optional)"
                className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#8B6CFF]/60"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-white/35">
                  {VIBE_NOTE_MAX_LENGTH - vibeNote.length} characters remaining
                </span>
                {vibeError && <span className="text-right text-xs font-medium text-rose-300">{vibeError}</span>}
              </div>
            </div>

            <button
              type="button"
              onClick={submitVibeReport}
              disabled={!canSubmitVibe}
              className="mt-5 flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#8B6CFF] px-4 text-sm font-bold text-black shadow-[0_0_24px_rgba(139,108,255,0.28)] transition-colors hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
            >
              {vibeSubmitting ? "Submitting" : "Submit vibe"}
            </button>
          </div>
        </div>
      )}

      {venue && loginPromptOpen && (
        <div
          ref={loginDialogRef}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vibe-login-title"
          tabIndex={-1}
        >
          <button
            type="button"
            aria-label="Close login prompt"
            className="absolute inset-0 cursor-default"
            onClick={() => setLoginPromptOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 mx-auto w-full max-w-lg rounded-t-3xl border border-white/10 bg-[#11111A] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 id="vibe-login-title" className="font-display text-lg font-black text-white">
                  Login required
                </h2>
                <p className="mt-1 text-sm text-white/50">Sign in to report the vibe at {venue.name}.</p>
              </div>
              <button
                type="button"
                aria-label="Close login prompt"
                onClick={() => setLoginPromptOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <Link
              href={`/login?return=${encodeURIComponent(`/venues/${venueId}`)}`}
              className="mt-5 flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#8B6CFF] px-4 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
            >
              Log in
            </Link>
          </div>
        </div>
      )}

      {venue && !vibeReportOpen && !loginPromptOpen && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+4rem)] left-0 right-0 z-[60] border-t border-white/[0.08] bg-[#0A0A0E]/95 px-4 py-3 backdrop-blur-xl" role="region" aria-label="Venue actions">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            {authChecked && !accessToken ? (
              <Link
                href="/login"
                aria-label="Save venue"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
              >
                <Heart size={19} aria-hidden="true" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={toggleSaved}
                disabled={!authChecked || savePending}
                aria-label={saved ? "Remove from saved" : "Save venue"}
                aria-pressed={saved}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 disabled:opacity-60 ${
                  saved ? "text-white" : "text-white/55 hover:text-white"
                }`}
              >
                <Heart size={19} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={toggleVenueAlert}
              disabled={!authChecked || alertPending}
              aria-label={alerting ? `Disable busy alerts for ${venue.name}` : `Alert me when ${venue.name} gets busy`}
              aria-pressed={alerting}
              className={`flex min-h-[54px] min-w-[7.35rem] shrink-0 items-center justify-center rounded-2xl border px-3 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 disabled:opacity-60 ${
                alerting
                  ? "border-[#8B6CFF]/55 bg-[#8B6CFF]/15 text-[#8B6CFF] shadow-[0_0_20px_rgba(139,108,255,0.18)]"
                  : "border-white/10 bg-white/[0.04] text-white/35 hover:border-white/20 hover:text-white/70"
              }`}
            >
              {alerting ? "Alerting 🔔" : "Alert Me"}
            </button>

            <Link
              href={vibeCheckHref}
              onClick={() => {
                haptic.light();
                trackAnalytics("check_in", { venue_id: venue.id });
              }}
              aria-label={checkInConfirmed ? "Check-in recorded" : "Report the vibe"}
              className={`flex min-h-[54px] flex-1 items-center justify-center gap-2 rounded-2xl px-5 text-base font-black shadow-[0_0_24px_rgba(139,108,255,0.28)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 ${
                checkInConfirmed
                  ? "bg-[#1A1A2E] text-white hover:bg-[#1A1A2E]"
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
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
