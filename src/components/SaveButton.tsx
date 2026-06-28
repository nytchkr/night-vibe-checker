"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ToastProvider";
import { useSavedVenues } from "@/hooks/useSavedVenues";

type SaveButtonProps = {
  placeId: string;
  className?: string;
  ariaLabel?: string;
  requirePro?: boolean;
  onSavedChange?: (saved: boolean) => void;
  children?: ReactNode;
};

function SaveButtonInner({ placeId, className, ariaLabel, onSavedChange, children }: SaveButtonProps) {
  const { data: session } = useSession();
  const { isSaved, refreshVenueSavedState, toggle, loading } = useSavedVenues();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const saved = isSaved(placeId);

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
    } catch {
      showToast("Couldn't save venue", "error");
    } finally {
      setPending(false);
    }
  }

  async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!session?.user?.id) {
      showToast("Sign in to save", "info");
      return;
    }

    await toggleSaved();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending || loading}
      aria-label={ariaLabel ?? (saved ? "Unsave venue" : "Save venue")}
      aria-pressed={saved}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/72 transition-colors hover:border-[#8B6CFF]/50 hover:text-[#8B6CFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:opacity-60 ${
        saved ? "border-[#8B6CFF]/65 bg-[#8B6CFF]/15 text-[#8B6CFF] shadow-[0_0_18px_rgba(139,108,255,0.24)]" : ""
      } ${className ?? ""}`}
    >
      <span aria-hidden="true" className="text-[22px] leading-none">
        {saved ? "♥" : "♡"}
      </span>
      {children ? <span className="text-sm font-black leading-none">{children}</span> : null}
    </button>
  );
}

export function SaveButton(props: SaveButtonProps) {
  return <SaveButtonInner {...props} />;
}

export default SaveButton;
