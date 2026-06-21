"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark } from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";

const SAVED_VENUES_EVENT = "nightvibe:saved-venues-changed";

type SaveVenueButtonProps = {
  venueId: string;
  venueName: string;
  accessToken?: string | null;
  initialSaved?: boolean;
  className?: string;
  onSavedChange?: (venueId: string, saved: boolean) => void;
};

export function SaveVenueButton({
  venueId,
  venueName,
  accessToken,
  initialSaved = false,
  className,
  onSavedChange,
}: SaveVenueButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const haptic = useHaptic();
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setSaved(initialSaved);
  }, [initialSaved]);

  function currentPath() {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!accessToken) {
      router.push(`/login?return=${encodeURIComponent(currentPath())}`);
      return;
    }

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
      const res = await fetch("/api/saved-venues", {
        method: nextSaved ? "POST" : "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ venueId }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      window.dispatchEvent(new CustomEvent(SAVED_VENUES_EVENT));
    } catch {
      setSaved(!nextSaved);
      onSavedChange?.(venueId, !nextSaved);
      window.dispatchEvent(new CustomEvent(SAVED_VENUES_EVENT));
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label={`${saved ? "Unsave" : "Save"} ${venueName}`}
      aria-pressed={saved}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:opacity-60 ${
        saved
          ? "border-[#8B6CFF]/65 bg-[#8B6CFF]/15 text-[#8B6CFF] shadow-[0_0_18px_rgba(139,108,255,0.22)]"
          : "border-white/15 bg-[#0A0A0E]/75 text-white/62 hover:border-[#8B6CFF]/45 hover:text-[#8B6CFF]"
      } ${className ?? ""}`}
    >
      <Bookmark size={18} strokeWidth={2.4} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}

export default SaveVenueButton;
