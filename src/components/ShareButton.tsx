"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildVenueShareClipboardText } from "@/lib/venueShare";

type ShareButtonProps = {
  title: string;
  text: string;
  url?: string;
  className?: string;
};

export function ShareButton(props: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const shareData: ShareData = {
      title: props.title,
      text: props.text,
      url: props.url ?? url,
    };

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // If native sharing is cancelled or blocked, fall back to a copied venue link.
      }
    }

    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) return;
      await navigator.clipboard.writeText(buildVenueShareClipboardText(shareData));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser.
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleShare}
        aria-label="Share venue"
        title="Share venue"
        className={[
          `
          h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] p-0
          text-white/55 hover:border-[#8B6CFF]/35 hover:bg-[#8B6CFF]/10 hover:text-[#F4F5F8]
          focus-visible:text-white focus-visible:ring-[#8B6CFF]/60
        `,
          props.className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      {copied ? (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[1300] mx-auto w-fit max-w-[calc(100vw-2rem)] rounded-full border border-[#8B6CFF]/25 bg-black/90 px-4 py-2 text-sm font-semibold text-[#F4F5F8] shadow-2xl shadow-black/40"
        >
          Link copied
        </div>
      ) : null}
    </>
  );
}

export default ShareButton;
