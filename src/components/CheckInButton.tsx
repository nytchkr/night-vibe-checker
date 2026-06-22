"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase-browser";

type CheckInState = "idle" | "loading" | "checked-in" | "error" | "requires-auth";

type CheckInButtonProps = {
  venueId: string;
  venueName: string;
};

const CHECK_IN_LOCK_MS = 60 * 60 * 1000;
const CHECK_IN_CREATED_EVENT = "nightvibe:check-in-created";

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

export function CheckInButton({ venueId, venueName }: CheckInButtonProps) {
  const [state, setState] = useState<CheckInState>("idle");
  const [checkedInUntil, setCheckedInUntil] = useState<number | null>(null);

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

    try {
      const client = createBrowserClient();
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setState("requires-auth");
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
        return;
      }

      if (response.status === 429) {
        const now = Date.now();
        lockCheckIn(now);
        return;
      }

      if (!response.ok) throw new Error("check-in failed");

      const now = Date.now();
      lockCheckIn(now);
      window.dispatchEvent(new CustomEvent(CHECK_IN_CREATED_EVENT, {
        detail: { venueId, venueName },
      }));
    } catch {
      setState("error");
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
    <button
      type="button"
      onClick={() => void checkIn()}
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
          <span className="sr-only">Checking in</span>
        </>
      ) : checkedIn ? (
        "✓ Checked In"
      ) : error ? (
        "Try again"
      ) : (
        "Check In"
      )}
    </button>
  );
}
