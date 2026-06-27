"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { useHaptic } from "@/hooks/useHaptic";

type ShareButtonProps = {
  venueId: string;
  venueName: string;
  className?: string;
  children?: ReactNode;
  "aria-label"?: string;
};

type VenueShareCardResponse = {
  shareUrl: string;
  text: string;
};

type VenueShareMethod = "native" | "clipboard" | "failed";

export function buildVenueShareEndpoint(venueId: string): string {
  return `/api/venues/${encodeURIComponent(venueId)}/share-card`;
}

export function createVenueShareData(venueName: string, shareCard: VenueShareCardResponse): ShareData {
  return {
    title: `${venueName} on NightVibe`,
    text: shareCard.text,
    url: shareCard.shareUrl,
  };
}

export function buildVenueShareClipboardText(shareData: ShareData): string {
  const text = shareData.text ?? "";
  if (shareData.url && text.includes(shareData.url)) return text;
  return [text, shareData.url].filter(Boolean).join(" ");
}

export function trackVenueShareEvent(venueId: string, method: VenueShareMethod) {
  console.log("venue_share", { venueId, method });
}

export function ShareButton(props: ShareButtonProps) {
  const haptic = useHaptic();
  const { showToast } = useToast();
  const [sharing, setSharing] = useState(false);

  async function handleShare() {
    if (sharing) return;
    haptic.light();
    setSharing(true);

    try {
      const response = await fetch(buildVenueShareEndpoint(props.venueId), {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Share card request failed: ${response.status}`);

      const shareCard = (await response.json()) as VenueShareCardResponse;
      const shareData = createVenueShareData(props.venueName, shareCard);

      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share(shareData);
          trackVenueShareEvent(props.venueId, "native");
          return;
        } catch {
          // Fall back to clipboard when the native sheet is cancelled or blocked.
        }
      }

      if (typeof navigator === "undefined" || !navigator.clipboard) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(buildVenueShareClipboardText(shareData));
      trackVenueShareEvent(props.venueId, "clipboard");
      showToast("Link copied!", "success");
    } catch {
      trackVenueShareEvent(props.venueId, "failed");
      showToast("Could not share this venue.", "error");
    } finally {
      setSharing(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleShare}
      disabled={sharing}
      aria-label={props["aria-label"] ?? "Share venue"}
      title="Share venue"
      className={[
        `
        h-11 w-11 rounded-full p-0
        text-[#D8DCE5] hover:bg-white/10 hover:text-white
        focus-visible:text-white focus-visible:ring-[#8B6CFF]/70 disabled:cursor-not-allowed disabled:opacity-60
      `,
        props.className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Share2 className="h-4 w-4" aria-hidden="true" />
      {props.children}
    </Button>
  );
}

export default ShareButton;
