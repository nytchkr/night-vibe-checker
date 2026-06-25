"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "nightvibe:desktop-warning-dismissed";
const MOBILE_USER_AGENT_PATTERN = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

function isMobileEnvironment() {
  return window.innerWidth < 768 || MOBILE_USER_AGENT_PATTERN.test(navigator.userAgent);
}

export default function DesktopWarningBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    function updateVisibility() {
      const dismissed = window.sessionStorage.getItem(DISMISS_KEY) === "true";
      setIsVisible(!dismissed && !isMobileEnvironment());
    }

    updateVisibility();
    window.addEventListener("resize", updateVisibility);

    return () => window.removeEventListener("resize", updateVisibility);
  }, []);

  function dismiss() {
    window.sessionStorage.setItem(DISMISS_KEY, "true");
    setIsVisible(false);
  }

  if (!isVisible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[10000] flex justify-center text-white">
      <div className="pointer-events-auto flex w-full max-w-xl items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#0A0A0E]/92 px-4 py-3 shadow-[0_0_28px_rgba(139,108,255,0.2)] backdrop-blur-md">
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold leading-tight text-white">
            nytchkr is optimized for mobile.
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-white/60">
            Desktop access is available.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[#8B6CFF] px-4 text-xs font-black text-[#0A0A0E] shadow-[0_0_18px_rgba(240,86,140,0.24)] transition hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F0568C]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
