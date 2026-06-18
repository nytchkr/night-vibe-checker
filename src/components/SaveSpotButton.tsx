"use client";

// ============================================================
// SaveSpotButton
//
// Bookmark icon button that saves/unsaves a venue for the
// authenticated user via POST/DELETE /api/saved-spots.
//
// Props:
//   venueId            — venue's place_id
//   venueName          — display name (used in aria-label + POST body)
//   address?           — optional address for POST body
//   vibeScoreSnapshot? — optional score to snapshot at save time
//   isSaved?           — initial saved state (avoids GET on mount)
//   className?         — additional classes for the button
// ============================================================

import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";

interface SaveSpotButtonProps {
  venueId: string;
  venueName: string;
  address?: string;
  vibeScoreSnapshot?: number;
  /** Pass true/false to skip the initial GET check; omit to fetch on mount */
  isSaved?: boolean;
  className?: string;
}

export function SaveSpotButton({
  venueId,
  venueName,
  address,
  vibeScoreSnapshot,
  isSaved: isSavedProp,
  className,
}: SaveSpotButtonProps) {
  const [saved, setSaved] = useState<boolean>(isSavedProp ?? false);
  const [pending, setPending] = useState(false);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(isSavedProp !== undefined);

  // On mount: if isSaved prop not provided, check whether this venue is
  // already saved by fetching GET /api/saved-spots and filtering.
  useEffect(() => {
    if (isSavedProp !== undefined) return; // caller supplied initial state

    let cancelled = false;
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) {
          setInitialized(true);
          return;
        }

        const res = await fetch("/api/saved-spots", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) {
          setInitialized(true);
          return;
        }

        const json = await res.json();
        if (!cancelled && json?.status === "success" && Array.isArray(json?.data?.spots)) {
          const alreadySaved = json.data.spots.some(
            (s: { venueId: string }) => s.venueId === venueId
          );
          setSaved(alreadySaved);
        }
      } catch {
        // Network or auth error — silently keep default state
      } finally {
        if (!cancelled) setInitialized(true);
      }
    })();

    return () => { cancelled = true; };
  }, [venueId, isSavedProp]);

  async function handleClick() {
    if (pending) return;

    // Get current session token
    let token: string | null = null;
    try {
      const supabase = createBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      token = sessionData?.session?.access_token ?? null;
    } catch {
      // Supabase unavailable
    }

    if (!token) {
      setTooltip("Sign in to save spots");
      setTimeout(() => setTooltip(null), 2500);
      return;
    }

    // Optimistic toggle
    const nextSaved = !saved;
    setSaved(nextSaved);
    setPending(true);

    try {
      const method = nextSaved ? "POST" : "DELETE";
      const body: Record<string, unknown> = { venueId };
      if (nextSaved) {
        body.venueName = venueName;
        if (address !== undefined) body.address = address;
        if (vibeScoreSnapshot !== undefined) body.vibeScoreSnapshot = vibeScoreSnapshot;
      }

      const res = await fetch("/api/saved-spots", {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setSaved(!nextSaved);
      } else if (nextSaved) {
        setTooltip("Saved!");
        setTimeout(() => setTooltip(null), 2000);
      }
    } catch {
      // Network error — revert
      setSaved(!nextSaved);
    } finally {
      setPending(false);
    }
  }

  // Don't render until we know the initial state (avoids flicker)
  if (!initialized) return null;

  return (
    <div className="relative inline-flex">
      <button
        onClick={handleClick}
        disabled={pending}
        aria-label={saved ? `Unsave ${venueName}` : `Save ${venueName}`}
        title={saved ? "Saved" : "Save spot"}
        className={`
          flex items-center justify-center
          text-white/40 hover:text-white
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-150
          focus:outline-none focus-visible:text-white
          ${className ?? ""}
        `}
      >
        {saved ? <BookmarkFilledIcon /> : <BookmarkOutlineIcon />}
      </button>

      {/* Unauthenticated tooltip */}
      {tooltip && (
        <span
          role="tooltip"
          className="
            absolute bottom-full left-1/2 -translate-x-1/2 mb-2
            whitespace-nowrap rounded-lg bg-zinc-800 border border-white/10
            px-3 py-1.5 text-xs text-white shadow-xl z-50
          "
        >
          {tooltip}
        </span>
      )}
    </div>
  );
}

// --------------- Bookmark SVG icons --------------------------

function BookmarkOutlineIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function BookmarkFilledIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export default SaveSpotButton;
