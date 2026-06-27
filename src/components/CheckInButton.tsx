"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, X } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Toast } from "@/components/Toast";

type CheckInState = "idle" | "loading" | "checked-in" | "error" | "requires-auth";

type CheckInButtonProps = {
  venueId: string;
  venueName: string;
};

const CHECK_IN_LOCK_MS = 60 * 60 * 1000;
const CHECK_IN_CREATED_EVENT = "nightvibe:check-in-created";
const CHECK_IN_REFRESH_KEY = "nightvibe.check-in-refresh";

type CheckInToast = {
  message: string;
  tone: "success" | "error";
  retry?: boolean;
};

type StreakResponse = {
  currentStreak?: number;
};

function storageKey(venueId: string) {
  return `nightvibe.check-in.${venueId}`;
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

function errorMessageFrom(status: number, payload: unknown) {
  const message = typeof payload === "object" && payload && "error" in payload
    ? (payload as { error?: { message?: unknown } }).error?.message
    : null;

  if (typeof message === "string" && message.trim()) return message;
  if (status === 429) return "You already checked in at this venue today.";
  return "Could not check in. Try again.";
}

async function getCurrentStreak(token: string): Promise<number | null> {
  try {
    const response = await fetch("/api/profile/streak", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const json = (await response.json()) as StreakResponse;
    const streak = Number(json.currentStreak ?? 0);
    return Number.isFinite(streak) ? streak : null;
  } catch {
    return null;
  }
}

export function CheckInButton({ venueId, venueName }: CheckInButtonProps) {
  const [state, setState] = useState<CheckInState>("idle");
  const [checkedInUntil, setCheckedInUntil] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<CheckInToast | null>(null);

  function lockCheckIn(timestamp: number) {
    storeCheckInAt(venueId, timestamp);
    setCheckedInUntil(timestamp + CHECK_IN_LOCK_MS);
  }

  useEffect(() => {
    const checkedInAt = getStoredCheckInAt(venueId);
    if (!checkedInAt) {
      setCheckedInUntil(null);
      setState("idle");
      return;
    }

    const expiresIn = CHECK_IN_LOCK_MS - (Date.now() - checkedInAt);
    if (expiresIn <= 0) {
      clearStoredCheckIn(venueId);
      setCheckedInUntil(null);
      setState("idle");
      return;
    }

    setCheckedInUntil(checkedInAt + CHECK_IN_LOCK_MS);
  }, [venueId]);

  useEffect(() => {
    if (!checkedInUntil) return;
    const expiresIn = checkedInUntil - Date.now();
    if (expiresIn <= 0) {
      clearStoredCheckIn(venueId);
      setCheckedInUntil(null);
      setState("idle");
      return;
    }

    setState("checked-in");
    const timer = window.setTimeout(() => {
      clearStoredCheckIn(venueId);
      setCheckedInUntil(null);
      setState("idle");
    }, expiresIn);

    return () => window.clearTimeout(timer);
  }, [checkedInUntil, venueId]);

  useEffect(() => {
    function handleCheckInCreated(event: Event) {
      const detail = (event as CustomEvent<{ venueId?: string }>).detail;
      if (detail?.venueId !== venueId) return;

      const checkedInAt = getStoredCheckInAt(venueId) ?? Date.now();
      setCheckedInUntil(checkedInAt + CHECK_IN_LOCK_MS);
    }

    window.addEventListener(CHECK_IN_CREATED_EVENT, handleCheckInCreated);
    return () => window.removeEventListener(CHECK_IN_CREATED_EVENT, handleCheckInCreated);
  }, [venueId]);

  async function checkIn() {
    if (state === "loading" || state === "checked-in") return;

    setState("loading");
    setToast(null);

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
      if (!response.ok) {
        throw new Error(errorMessageFrom(response.status, json));
      }

      const now = Date.now();
      const streak = await getCurrentStreak(token);
      const streakText = streak && streak > 1 ? ` 🔥 ${streak} day streak!` : "";
      lockCheckIn(now);
      setConfirmOpen(false);
      setToast({
        tone: "success",
        message: `Checked in to ${venueName}!${streakText}`,
      });
      window.localStorage.setItem(CHECK_IN_REFRESH_KEY, JSON.stringify({
        venueId,
        venueName,
        checkedInAt: now,
      }));
      window.dispatchEvent(new CustomEvent(CHECK_IN_CREATED_EVENT, {
        detail: { venueId, venueName, checkedInAt: now },
      }));
    } catch (error) {
      setState("error");
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not check in. Try again.",
        retry: true,
      });
    }
  }

  if (state === "requires-auth") {
    const returnTo = `/venues/${encodeURIComponent(venueId)}`;
    return (
      <Link
        href={`/login?return=${encodeURIComponent(returnTo)}`}
        className="flex min-h-[54px] w-full items-center justify-center rounded-full border border-[#8B6CFF]/35 bg-[#8B6CFF]/10 px-5 text-base font-black text-[#F4F5F8] transition-colors hover:bg-[#8B6CFF]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
      >
        Sign in to check in
      </Link>
    );
  }

  const checkedIn = state === "checked-in";
  const loading = state === "loading";
  const error = state === "error";

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={loading || checkedIn}
        aria-label={checkedIn ? `Checked in at ${venueName}` : `Check in at ${venueName}`}
        className={`flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full px-5 text-base font-black shadow-[0_0_24px_rgba(139,108,255,0.28)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 disabled:cursor-not-allowed ${
          checkedIn
            ? "bg-emerald-400 text-[#06120D] shadow-[0_0_24px_rgba(52,211,153,0.22)]"
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
          "✓ Checked In"
        ) : error ? (
          "Try again"
        ) : (
          "Check In"
        )}
      </button>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`check-in-confirm-${venueId}`}
        >
          <button
            type="button"
            aria-label="Cancel check-in"
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
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 disabled:opacity-50"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={loading}
                className="min-h-12 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 disabled:opacity-50"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => void checkIn()}
                disabled={loading}
                className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#8B6CFF] px-4 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60 disabled:cursor-not-allowed disabled:opacity-70"
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

      {toast ? (
        <Toast
          message={toast.message}
          durationMs={toast.tone === "error" ? 5000 : 3500}
          actionLabel={toast.retry ? "Retry" : undefined}
          onAction={toast.retry ? () => void checkIn() : undefined}
          onDone={() => setToast(null)}
          className={`bottom-[calc(env(safe-area-inset-bottom)+8.75rem)] rounded-[14px] px-5 py-3 font-semibold shadow-2xl ${
            toast.tone === "success"
              ? "border-[#8B6CFF]/45 bg-[#6D45FF] text-white shadow-[#8B6CFF]/20"
              : "border-[#FF5B6A]/35 bg-[#3A1016] text-[#FFE9EC] shadow-black/30"
          }`}
        />
      ) : null}
    </>
  );
}
