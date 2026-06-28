"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, X } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { div as MotionDiv } from "framer-motion/client";
import { createBrowserClient } from "@/lib/supabase-browser";
import { formatRewardMessages } from "@/lib/rewardMessages";
import { useHaptic } from "@/hooks/useHaptic";
import { useToast } from "@/hooks/useToast";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useReducedMotion } from "@/hooks/useReducedMotion";

type CheckInState = "idle" | "loading" | "checked-in" | "error" | "requires-auth";

type CheckInButtonProps = {
  venueId: string;
  venueName: string;
};

const CHECK_IN_COOLDOWN_MS = 20 * 60 * 1000;
const CHECK_IN_COUNTDOWN_INTERVAL_MS = 60 * 1000;
const CHECK_IN_CREATED_EVENT = "nytchkr:check-in-created";
const CHECK_IN_REFRESH_KEY = "nytchkr.check-in-refresh";

type CheckInResponse = {
  data?: {
    pointsAwarded?: number;
    events?: string[];
    streakCount?: number;
  };
};

type RewardAnimation = {
  id: number;
  pointsBadge: string | null;
  streakBadge: string | null;
};

function storageKey(venueId: string) {
  return `nv_last_checkin_${venueId}`;
}

function getStoredCheckInAt(venueId: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(venueId));
  if (!raw) return null;
  const timestamp = Number.parseInt(raw, 10);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function storeCheckInAt(venueId: string, timestamp: number) {
  window.localStorage.setItem(storageKey(venueId), String(timestamp));
}

function clearStoredCheckIn(venueId: string) {
  window.localStorage.removeItem(storageKey(venueId));
}

function timeUntilNextCheckin(checkedInAt: number, now = Date.now()) {
  return Math.max(CHECK_IN_COOLDOWN_MS - (now - checkedInAt), 0);
}

function cooldownMinutesRemaining(milliseconds: number) {
  return Math.max(1, Math.ceil(milliseconds / 60_000));
}

function cooldownMinutesLabel(minutes: number) {
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

function errorMessageFrom(status: number, payload: unknown) {
  const message = typeof payload === "object" && payload && "error" in payload
    ? (payload as { error?: { message?: unknown } }).error?.message
    : null;

  if (typeof message === "string" && message.trim()) return message;
  if (status === 429) return "You already checked in at this venue today.";
  return "Could not check in. Try again.";
}

export function CheckInButton({ venueId, venueName }: CheckInButtonProps) {
  const { showToast } = useToast();
  const haptic = useHaptic();
  const [state, setState] = useState<CheckInState>("idle");
  const [lastCheckInAt, setLastCheckInAt] = useState<number | null>(null);
  const [timeUntilNextCheckinMs, setTimeUntilNextCheckinMs] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rewardAnimation, setRewardAnimation] = useState<RewardAnimation | null>(null);
  const [refreshPayload, setRefreshPayload] = useState<{
    venueId: string;
    venueName: string;
    checkedInAt: number;
  } | null>(null);
  const confirmDialogRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const checkedInAt = getStoredCheckInAt(venueId);
    if (!checkedInAt) {
      setLastCheckInAt(null);
      setTimeUntilNextCheckinMs(0);
      setState("idle");
      return;
    }

    const remaining = timeUntilNextCheckin(checkedInAt);
    if (remaining <= 0) {
      clearStoredCheckIn(venueId);
      setLastCheckInAt(null);
      setTimeUntilNextCheckinMs(0);
      setState("idle");
      return;
    }

    setLastCheckInAt(checkedInAt);
    setTimeUntilNextCheckinMs(remaining);
    setState("checked-in");
  }, [venueId]);

  useEffect(() => {
    if (!lastCheckInAt) return;
    const checkedInAt = lastCheckInAt;
    storeCheckInAt(venueId, checkedInAt);

    function updateCooldown() {
      const remaining = timeUntilNextCheckin(checkedInAt);
      if (remaining <= 0) {
        clearStoredCheckIn(venueId);
        setLastCheckInAt(null);
        setTimeUntilNextCheckinMs(0);
        setState("idle");
        return;
      }

      setTimeUntilNextCheckinMs(remaining);
      setState("checked-in");
    }

    updateCooldown();
    const interval = window.setInterval(updateCooldown, CHECK_IN_COUNTDOWN_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [lastCheckInAt, venueId]);

  useEffect(() => {
    if (!refreshPayload) return;
    window.localStorage.setItem(CHECK_IN_REFRESH_KEY, JSON.stringify(refreshPayload));
    window.dispatchEvent(new CustomEvent(CHECK_IN_CREATED_EVENT, {
      detail: refreshPayload,
    }));
    setRefreshPayload(null);
  }, [refreshPayload]);

  useEffect(() => {
    function handleCheckInCreated(event: Event) {
      const detail = (event as CustomEvent<{ venueId?: string; checkedInAt?: number }>).detail;
      if (detail?.venueId !== venueId) return;

      setLastCheckInAt(detail.checkedInAt ?? Date.now());
    }

    window.addEventListener(CHECK_IN_CREATED_EVENT, handleCheckInCreated);
    return () => window.removeEventListener(CHECK_IN_CREATED_EVENT, handleCheckInCreated);
  }, [venueId]);

  async function checkIn() {
    if (state === "loading" || state === "checked-in") return;

    setState("loading");

    try {
      const client = createBrowserClient();
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setState("requires-auth");
        setConfirmOpen(false);
        return;
      }

      const response = await fetch("/api/check-ins", {
        method: "POST",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ venue_id: venueId }),
      });

      if (response.status === 401) {
        setState("requires-auth");
        setConfirmOpen(false);
        return;
      }

      const json = await response.json().catch(() => null);
      if (response.status === 429) {
        haptic.error();
        setState("idle");
        setConfirmOpen(false);
        showToast("Already checked in tonight!", "info");
        return;
      }

      if (!response.ok) {
        throw new Error(errorMessageFrom(response.status, json));
      }

      const reward = formatRewardMessages({
        pointsAwarded: Number((json as CheckInResponse | null)?.data?.pointsAwarded ?? 0),
        events: (json as CheckInResponse | null)?.data?.events ?? [],
        streakCount: Number((json as CheckInResponse | null)?.data?.streakCount ?? 0),
      });
      const now = Date.now();
      setLastCheckInAt(now);
      setTimeUntilNextCheckinMs(timeUntilNextCheckin(now));
      haptic.success();
      setConfirmOpen(false);
      showToast(`${venueName}: ${reward.toast}`, "success");
      if (reward.pointsBadge || reward.streakBadge) {
        setRewardAnimation({
          id: now,
          pointsBadge: reward.pointsBadge,
          streakBadge: reward.streakBadge,
        });
      }
      setRefreshPayload({
        venueId,
        venueName,
        checkedInAt: now,
      });
    } catch (error) {
      haptic.error();
      setState("error");
      showToast(error instanceof Error ? error.message : "Could not check in. Try again.", "error");
    }
  }

  const checkedIn = state === "checked-in";
  const loading = state === "loading";
  const error = state === "error";
  const cooldownMinutes = cooldownMinutesRemaining(timeUntilNextCheckinMs);
  const cooldownLabel = cooldownMinutesLabel(cooldownMinutes);

  useFocusTrap(confirmOpen, confirmDialogRef, () => {
    if (!loading) setConfirmOpen(false);
  });

  function handleCheckInButtonTap() {
    haptic.light();
    setConfirmOpen(true);
  }

  if (state === "requires-auth") {
    const returnTo = `/venues/${encodeURIComponent(venueId)}`;
    return (
      <Link
        href={`/login?return=${encodeURIComponent(returnTo)}`}
        className="flex min-h-[54px] w-full items-center justify-center rounded-full border border-[#8B6CFF]/35 bg-[#8B6CFF]/10 px-5 text-base font-black text-[#F4F5F8] transition-colors hover:bg-[#8B6CFF]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      >
        Sign in to check in
      </Link>
    );
  }

  return (
    <>
      <div className="relative w-full">
        <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {loading ? `Checking in at ${venueName}` : checkedIn ? `Checked in at ${venueName}. Try again in ${cooldownLabel}.` : error ? `Check-in failed at ${venueName}` : ""}
        </span>
        <button
          type="button"
          onClick={handleCheckInButtonTap}
          disabled={loading || checkedIn}
          aria-label={checkedIn ? `Checked in at ${venueName}; try again in ${cooldownLabel}` : `Check in at ${venueName}`}
          aria-pressed={checkedIn}
          aria-busy={loading}
          className={`flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full px-5 text-base font-black shadow-[0_0_24px_rgba(139,108,255,0.28)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:cursor-not-allowed ${
            checkedIn
              ? "cursor-not-allowed bg-white/[0.04] text-white/40 shadow-none"
              : error
                ? "border border-[#FF5B6A]/35 bg-[#FF5B6A]/10 text-[#FF5B6A] shadow-none hover:bg-[#FF5B6A]/15"
                : "bg-[#8B6CFF] text-[#0A0A0E] hover:bg-[#A896FF]"
          }`}
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              <span>Checking in</span>
            </>
          ) : checkedIn ? (
            `Checked in ✓ · try again in ${cooldownMinutes}m`
          ) : error ? (
            "Try again"
          ) : (
            "Check In"
          )}
        </button>
        <AnimatePresence>
          {rewardAnimation ? (
            <MotionDiv
              key={rewardAnimation.id}
              aria-live="polite"
              aria-atomic="true"
              className="pointer-events-none absolute inset-x-0 -top-4 z-20 flex flex-col items-center gap-1"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: -34, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -54, scale: 0.98 }}
              transition={{ duration: reduceMotion ? 0 : 0.72, ease: "easeOut" }}
              onAnimationComplete={() => {
                window.setTimeout(() => setRewardAnimation(null), reduceMotion ? 300 : 850);
              }}
            >
              {rewardAnimation.pointsBadge ? (
                <span className="rounded-full border border-[#8B6CFF]/55 bg-[#8B6CFF] px-4 py-1.5 text-sm font-black text-[#0A0A0E] shadow-[0_0_24px_rgba(139,108,255,0.45)]">
                  {rewardAnimation.pointsBadge}
                </span>
              ) : null}
              {rewardAnimation.streakBadge ? (
                <span className="rounded-full border border-[#F0568C]/55 bg-[#F0568C] px-3.5 py-1 text-xs font-black text-[#0A0A0E] shadow-[0_0_20px_rgba(240,86,140,0.38)]">
                  {rewardAnimation.streakBadge}
                </span>
              ) : null}
            </MotionDiv>
          ) : null}
        </AnimatePresence>
      </div>

      {confirmOpen ? (
        <div
          ref={confirmDialogRef}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`check-in-confirm-${venueId}`}
          tabIndex={-1}
        >
          <button
            type="button"
            aria-label="Cancel check-in"
            aria-hidden="true"
            tabIndex={-1}
            className="absolute inset-0 cursor-default"
            onClick={() => {
              if (!loading) setConfirmOpen(false);
            }}
          />
          <div className="fixed bottom-0 left-0 right-0 mx-auto w-full max-w-lg rounded-t-[18px] border border-white/[0.08] bg-[#0A0A0E] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 text-white shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={`check-in-confirm-${venueId}`} className="font-display text-lg font-black">
                  Check in to {venueName}?
                </h2>
                <p className="mt-1 text-sm font-medium leading-5 text-white/55">
                  This adds the visit to your You tab and refreshes the venue's live crowd signal.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cancel check-in"
                onClick={() => setConfirmOpen(false)}
                disabled={loading}
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:opacity-50"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={loading}
                className="min-h-12 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:opacity-50"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => void checkIn()}
                disabled={loading}
                aria-busy={loading}
                className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#8B6CFF] px-4 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                    Checking in
                  </>
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
