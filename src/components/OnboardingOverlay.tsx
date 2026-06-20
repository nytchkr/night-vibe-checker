"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "nv_onboarded";

type Benefit = {
  icon: string;
  title: string;
  body: string;
};

const benefits: Benefit[] = [
  {
    icon: "🗺",
    title: "See the crowd",
    body: "Map view shows which spots are packed",
  },
  {
    icon: "⚖️",
    title: "M/F split",
    body: "Crowdsourced from real check-ins",
  },
  {
    icon: "🔥",
    title: "BestTime data",
    body: "Hourly foot traffic, cached fresh daily",
  },
];

export function OnboardingOverlay() {
  const [isReady, setIsReady] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const close = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setIsVisible(false);
  }, []);

  useEffect(() => {
    setIsReady(true);
    setIsVisible(window.localStorage.getItem(STORAGE_KEY) !== "1");
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, isVisible]);

  if (!isReady || !isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-screen bg-[#0a0a0a] text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-body"
    >
      <button
        type="button"
        onClick={close}
        className="absolute right-4 top-4 rounded-full px-4 py-3 text-sm font-bold text-white/70 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EF4444]"
      >
        Skip
      </button>

      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-7 pt-20">
        <div className="flex flex-1 flex-col justify-center text-center">
          <div
            className="mx-auto flex h-24 w-24 items-center justify-center rounded-[2rem] border border-[#EF4444]/35 bg-[#EF4444]/12 text-5xl shadow-[0_0_40px_rgba(239,68,68,0.22)]"
            aria-hidden="true"
          >
            🔥
          </div>
          <h2 id="onboarding-title" className="mt-10 text-4xl font-black leading-[1.05] tracking-normal">
            Know before you go
          </h2>
          <p id="onboarding-body" className="mt-4 max-w-xs text-lg font-semibold leading-7 text-white/68">
            Real vibes from real people — see how packed South End is right now.
          </p>

          <div className="mt-9 space-y-3 text-left">
            {benefits.map((benefit) => (
              <div key={benefit.title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl" aria-hidden="true">
                  {benefit.icon}
                </span>
                <div>
                  <p className="text-sm font-black text-white">{benefit.title}</p>
                  <p className="mt-1 text-sm font-semibold leading-5 text-white/62">{benefit.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 pt-7">
          <button
            type="button"
            onClick={close}
            className="flex min-h-[54px] w-full items-center justify-center rounded-full bg-[#EF4444] px-6 text-base font-black text-white shadow-[0_0_28px_rgba(239,68,68,0.28)] transition-colors hover:bg-[#DC2626] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            See the Vibe <span className="ml-2" aria-hidden="true">&rarr;</span>
          </button>
          <Link
            href="/vibe-check"
            onClick={close}
            className="block py-2 text-center text-sm font-bold text-white/60 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EF4444]"
          >
            Report a vibe
          </Link>
        </div>
      </div>
    </div>
  );
}
