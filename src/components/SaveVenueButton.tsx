"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { track } from "@vercel/analytics";
import { Heart } from "lucide-react";
import { useOnboardingGate } from "@/components/OnboardingGate";
import { useHaptic } from "@/hooks/useHaptic";

const SAVED_VENUES_EVENT = "nytchkr:saved-venues-changed";

type SaveVenueButtonProps = {
  venueId: string;
  venueName: string;
  accessToken?: string | null;
  initialSaved?: boolean;
  className?: string;
  label?: string;
  includeVenueNameInLabel?: boolean;
  apiPath?: "/api/saved-venues" | "/api/favorites";
  onSavedChange?: (venueId: string, saved: boolean) => void;
};

function trackAnalytics(event: string, properties: Record<string, string | number | boolean | null>) {
  try {
    track(event, properties);
  } catch {
    // Analytics must never break the UI.
  }
}

export function SaveVenueButton({
  venueId,
  venueName,
  accessToken,
  initialSaved = false,
  className,
  label,
  includeVenueNameInLabel = true,
  apiPath = "/api/saved-venues",
  onSavedChange,
}: SaveVenueButtonProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { consumePendingAction, requireAuth } = useOnboardingGate();
  const haptic = useHaptic();
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);
  const isAuthenticated = Boolean(session?.user?.id || accessToken);

  useEffect(() => {
    setSaved(initialSaved);
  }, [initialSaved]);

  useEffect(() => {
    let cancelled = false;

    async function refreshSavedState() {
      try {
        if (!isAuthenticated) {
          if (!cancelled) setSaved(false);
          return;
        }

        const res = await fetch(apiPath, {
          credentials: "include",
        });
        if (!res.ok) return;

        const json = await res.json();
        const ids = json?.venueIds ?? json?.savedVenueIds ?? json?.data?.savedVenueIds ?? [];
        if (!cancelled && Array.isArray(ids)) {
          setSaved(ids.includes(venueId));
        }
      } catch {
        if (!cancelled) setSaved(initialSaved);
      }
    }

    void refreshSavedState();

    return () => {
      cancelled = true;
    };
  }, [initialSaved, isAuthenticated, venueId]);

  function currentPath() {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  const toggleSaved = useCallback(async () => {
    if (!isAuthenticated) return;
    const nextSaved = !saved;

    if (nextSaved) {
      haptic.light();
    } else {
      haptic.error();
    }
    setSaved(nextSaved);
    setPending(true);
    onSavedChange?.(venueId, nextSaved);

    try {
      const res = await fetch(apiPath, {
        method: nextSaved ? "POST" : "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ venueId }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      trackAnalytics(nextSaved ? "save_venue" : "unsave_venue", { venueId });
      window.dispatchEvent(new CustomEvent(SAVED_VENUES_EVENT));
    } catch {
      setSaved(!nextSaved);
      onSavedChange?.(venueId, !nextSaved);
      window.dispatchEvent(new CustomEvent(SAVED_VENUES_EVENT));
    } finally {
      setPending(false);
    }
  }, [apiPath, haptic, isAuthenticated, onSavedChange, saved, venueId]);

  useEffect(() => {
    if (!isAuthenticated || pending) return;
    if (!consumePendingAction(`save:${venueId}`)) return;
    void toggleSaved();
  }, [consumePendingAction, isAuthenticated, pending, toggleSaved, venueId]);

  async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!isAuthenticated) {
      await requireAuth({
        id: `save:${venueId}`,
        label: `Sign in to save ${venueName}.`,
        returnTo: currentPath(),
        onAuthenticated: toggleSaved,
      });
      return;
    }

    await toggleSaved();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label={includeVenueNameInLabel ? `${saved ? "Unsave" : "Save"} ${venueName}` : saved ? "Unsave venue" : "Save venue"}
      aria-pressed={saved}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:opacity-60 ${
        saved
          ? "border-[#8B6CFF]/65 bg-[#8B6CFF]/15 text-[#8B6CFF] shadow-[0_0_18px_rgba(139,108,255,0.22)]"
          : "border-white/15 bg-[#0A0A0E]/75 text-white/62 hover:border-[#8B6CFF]/45 hover:text-[#8B6CFF]"
      } ${className ?? ""}`}
    >
      <Heart size={18} strokeWidth={2.4} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
      {label ? <span>{saved ? "Saved" : label}</span> : null}
    </button>
  );
}

export default SaveVenueButton;
