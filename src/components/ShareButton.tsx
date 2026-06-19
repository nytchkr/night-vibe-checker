"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ShareButtonProps {
  venueName: string;
  vibeScore: number;
  summary: string;
  onCopied?: () => void;
}

export function ShareButton({ venueName, vibeScore, summary, onCopied }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = `Vibe Score: ${vibeScore.toFixed(1)}/10 — ${summary.slice(0, 100)}${summary.length > 100 ? "…" : ""}`;

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: `Night Vibe: ${venueName}`, text, url });
        return;
      } catch {
        // user cancelled or browser blocked — fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — silent fail
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleShare}
      aria-label="Share vibe report"
      title={copied ? "Link copied!" : "Share"}
      className="
        h-8 px-2 text-xs
        text-white/40 hover:bg-white/10 hover:text-white
        focus-visible:text-white focus-visible:ring-white/30
      "
    >
      <ShareIcon />
      <span>{copied ? "Copied to clipboard!" : "Share"}</span>
    </Button>
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
