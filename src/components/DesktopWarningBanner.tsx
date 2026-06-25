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
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#0A0A0E]/96 px-6 text-white backdrop-blur-md">
      <div className="w-full max-w-md rounded-[24px] border border-white/[0.08] bg-[#0A0A0E] px-6 py-7 text-center shadow-[0_0_48px_rgba(139,108,255,0.24)]">
        <div className="mx-auto mb-5 h-1.5 w-24 rounded-full bg-gradient-to-r from-[#8B6CFF] to-[#F0568C]" />
        <p className="font-display text-2xl font-semibold leading-tight text-white">
          nytchkr is built for mobile.
        </p>
        <p className="mt-3 text-sm font-semibold leading-6 text-white/70">
          Open on your phone for the best experience.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-7 inline-flex h-11 items-center justify-center rounded-full bg-[#8B6CFF] px-6 text-sm font-black text-[#0A0A0E] shadow-[0_0_22px_rgba(240,86,140,0.28)] transition hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F0568C]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
        >
          Continue anyway
        </button>
      </div>
    </div>
  );
}
