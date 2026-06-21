"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";
import { Button } from "@/components/ui/button";
import { buildVenueShareClipboardText, buildVenueShareData } from "@/lib/venueShare";
import type { ConsumerVenue } from "@/types";

type LegacyShareButtonProps = {
  venueName: string;
  vibeScore: number;
  summary: string;
  onCopied?: () => void;
  caption?: string;
  className?: string;
};

type VenueShareButtonProps = {
  venue: ConsumerVenue;
  caption?: string;
  onCopied?: () => void;
  className?: string;
};

type ShareButtonProps = LegacyShareButtonProps | VenueShareButtonProps;

function isVenueShare(props: ShareButtonProps): props is VenueShareButtonProps {
  return "venue" in props;
}

function trackAnalytics(event: string, properties: Record<string, string | number | boolean | null>) {
  try {
    track(event, properties);
  } catch {
    // Analytics must never break the UI.
  }
}

export function ShareButton(props: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const caption = props.caption;
  const isVenue = isVenueShare(props);

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const shareData = isVenue
      ? buildVenueShareData(props.venue)
      : {
          title: `Night Vibe: ${props.venueName}`,
          text: `Vibe Score: ${props.vibeScore.toFixed(1)}/10 — ${props.summary.slice(0, 100)}${props.summary.length > 100 ? "…" : ""}`,
          url,
        };

    if (isVenue) {
      trackAnalytics("share_venue", { venueId: props.venue.id });
    }

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        if (isVenue) {
          trackAnalytics("share_card_shared", {
            venue_id: props.venue.id,
            method: "native",
          });
        }
        return;
      } catch {
        // user cancelled or browser blocked — fall through to clipboard
      }
    }

    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) return;
      await navigator.clipboard.writeText(buildVenueShareClipboardText({ ...shareData, url: shareData.url ?? url }));
      setCopied(true);
      props.onCopied?.();
      setTimeout(() => setCopied(false), 2000);
      if (isVenue) {
        trackAnalytics("share_card_shared", {
          venue_id: props.venue.id,
          method: "clipboard",
        });
      }
    } catch {
      // clipboard unavailable — silent fail
    }
  }

  return (
    <div className={["relative", props.className].filter(Boolean).join(" ")}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleShare}
        aria-label={isVenue ? "Share venue" : "Share vibe report"}
        title={copied ? "Link copied!" : "Share"}
        className="
          h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] p-0
          text-white/45 hover:border-[#8B6CFF]/35 hover:bg-[#8B6CFF]/10 hover:text-[#F4F5F8]
          focus-visible:text-white focus-visible:ring-white/30
        "
      >
        <ShareIcon />
        <span className="sr-only">{copied ? "Copied to clipboard!" : "Share"}</span>
      </Button>
      {copied ? (
        <span
          role="status"
          className="absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-full border border-[#8B6CFF]/25 bg-black/85 px-2.5 py-1 text-xs font-medium text-[#F4F5F8] shadow-lg"
        >
          Link copied!
        </span>
      ) : null}
      {caption ? (
        <p className="mt-1 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx={18} cy={5} r={3} />
      <circle cx={6} cy={12} r={3} />
      <circle cx={18} cy={19} r={3} />
      <line x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
      <line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
    </svg>
  );
}

export default ShareButton;
