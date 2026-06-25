"use client";

import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { useOnboardingGate } from "@/components/OnboardingGate";
import { useSavedVenues } from "@/hooks/useSavedVenues";
import { createBrowserClient } from "@/lib/supabase-browser";

type SaveButtonProps = {
  placeId: string;
  className?: string;
  requirePro?: boolean;
  onSavedChange?: (saved: boolean) => void;
};

function currentPath() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

function SaveButtonInner({ placeId, className, onSavedChange }: SaveButtonProps) {
  const { isSaved, refreshVenueSavedState, toggle, loading } = useSavedVenues();
  const { requireAuth } = useOnboardingGate();
  const [pending, setPending] = useState(false);
  const saved = isSaved(placeId);
  const Icon = saved ? BookmarkCheck : Bookmark;

  async function hasSession() {
    try {
      const client = createBrowserClient();
      const { data } = await client.auth.getSession();
      return Boolean(data.session);
    } catch {
      return false;
    }
  }

  useEffect(() => {
    async function loadSavedState() {
      try {
        await refreshVenueSavedState(placeId);
      } catch {
        // Keep the list-derived state if the per-venue state check fails.
      }
    }

    void loadSavedState();
  }, [placeId, refreshVenueSavedState]);

  async function toggleSaved() {
    if (pending) return;
    setPending(true);
    try {
      const nextSaved = await toggle(placeId);
      if (typeof nextSaved === "boolean") {
        onSavedChange?.(nextSaved);
      }
    } finally {
      setPending(false);
    }
  }

  async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!(await hasSession())) {
      await requireAuth({
        id: `save:${placeId}`,
        label: "Save this venue",
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
      disabled={pending || loading}
      aria-label={saved ? "Unsave venue" : "Save venue"}
      aria-pressed={saved}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/72 transition-colors hover:border-[#8B6CFF]/50 hover:text-[#8B6CFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:opacity-60 ${
        saved ? "border-[#8B6CFF]/65 bg-[#8B6CFF]/15 text-[#8B6CFF] shadow-[0_0_18px_rgba(139,108,255,0.24)]" : ""
      } ${className ?? ""}`}
    >
      <Icon className="h-[18px] w-[18px]" fill={saved ? "currentColor" : "none"} strokeWidth={2.3} aria-hidden="true" />
    </button>
  );
}

export function SaveButton(props: SaveButtonProps) {
  return <SaveButtonInner {...props} />;
}

export default SaveButton;
