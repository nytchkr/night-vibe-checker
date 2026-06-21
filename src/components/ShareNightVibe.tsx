"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";
import { Toast } from "@/components/Toast";

const NIGHTVIBE_SHARE_URL = "https://night-vibe-checker.vercel.app";
const NIGHTVIBE_SHARE_DATA = {
  title: "NightVibe",
  text: "Real-time nightlife intel for South End Charlotte. Know before you go.",
  url: NIGHTVIBE_SHARE_URL,
};

function trackShareTap() {
  try {
    track("share_app_tapped");
  } catch {
    // Analytics must never block sharing.
  }
}

async function shareNightVibe(onCopied: () => void) {
  trackShareTap();

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(NIGHTVIBE_SHARE_DATA);
      return;
    } catch {
      // Fall back to clipboard if native sharing is cancelled or blocked.
    }
  }

  if (typeof navigator === "undefined" || !navigator.clipboard) return;

  try {
    await navigator.clipboard.writeText(NIGHTVIBE_SHARE_URL);
    onCopied();
  } catch {
    // Clipboard support is best-effort.
  }
}

export function ShareNightVibeCard() {
  const [toast, setToast] = useState(false);

  return (
    <>
      <div className="rounded-2xl border border-[#8B6CFF]/20 bg-gradient-to-r from-[#8B6CFF]/10 to-[#7B61FF]/10 p-4 text-left">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-sm font-bold text-white">Know before you go 🌃</h2>
            <p className="mt-1 text-xs leading-5 text-white/50">
              Share <span className="font-display">NightVibe</span> with your crew so you can see who's out tonight.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void shareNightVibe(() => setToast(true))}
            className="shrink-0 rounded-full bg-[#8B6CFF] px-5 py-2.5 text-sm font-bold text-[#0A0A0E] transition-colors hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
          >
            Share App
          </button>
        </div>
      </div>
      {toast ? <Toast message="Link copied!" onDone={() => setToast(false)} /> : null}
    </>
  );
}

export function InviteFriendLink() {
  const [toast, setToast] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => void shareNightVibe(() => setToast(true))}
        className="mx-auto mt-6 block text-center text-sm font-bold text-[#8B6CFF] transition-colors hover:text-[#A896FF] focus:outline-none focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
      >
        Invite a Friend
      </button>
      {toast ? <Toast message="Link copied!" onDone={() => setToast(false)} /> : null}
    </>
  );
}
