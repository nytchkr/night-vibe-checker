"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Radio } from "lucide-react";

const STORAGE_KEY = "nv_onboarded";
const SWIPE_THRESHOLD_PX = 42;

type Slide = {
  title: string;
  body: string;
  icon: "location" | "ratio" | "report";
};

const slides: Slide[] = [
  {
    title: "South End Charlotte, live",
    body: "See which bars are packed right now",
    icon: "location",
  },
  {
    title: "Crowd feel, from real check-ins",
    body: "Tap a bar \u2192 see the male/female vibe",
    icon: "ratio",
  },
  {
    title: "Be the signal",
    body: "Check in to help everyone know what's going on",
    icon: "report",
  },
];

function OnboardingIcon({ icon }: { icon: Slide["icon"] }) {
  if (icon === "ratio") {
    return (
      <div
        className="flex h-24 w-24 items-center justify-center rounded-[2rem] border border-[#EF4444]/35 bg-[#EF4444]/12 shadow-[0_0_40px_rgba(239,68,68,0.22)]"
        aria-hidden="true"
      >
        <div className="w-16 space-y-2">
          <div className="flex items-center justify-between text-sm font-black text-white">
            <span>M</span>
            <span>F</span>
          </div>
          <div className="flex h-4 overflow-hidden rounded-full bg-white/12">
            <span className="block w-[58%] bg-[#EF4444]" />
            <span className="block flex-1 bg-white" />
          </div>
        </div>
      </div>
    );
  }

  const Icon = icon === "location" ? MapPin : Radio;

  return (
    <div
      className="flex h-24 w-24 items-center justify-center rounded-[2rem] border border-[#EF4444]/35 bg-[#EF4444]/12 text-[#EF4444] shadow-[0_0_40px_rgba(239,68,68,0.22)]"
      aria-hidden="true"
    >
      <Icon className="h-11 w-11" strokeWidth={2.3} />
    </div>
  );
}

export function OnboardingOverlay() {
  const [isReady, setIsReady] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const isLastSlide = activeIndex === slides.length - 1;
  const activeSlide = slides[activeIndex];

  const close = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setIsVisible(false);
  }, []);

  const next = useCallback(() => {
    if (isLastSlide) {
      close();
      return;
    }

    setActiveIndex((index) => Math.min(index + 1, slides.length - 1));
  }, [close, isLastSlide]);

  const previous = useCallback(() => {
    setActiveIndex((index) => Math.max(index - 1, 0));
  }, []);

  useEffect(() => {
    setIsReady(true);
    setIsVisible(window.localStorage.getItem(STORAGE_KEY) !== "1");
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") previous();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, isVisible, next, previous]);

  const dotLabels = useMemo(() => slides.map((_, index) => `Go to slide ${index + 1}`), []);

  if (!isReady || !isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-screen bg-[#0a0a0a] text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-body"
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current == null) return;
        const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
        const deltaX = endX - touchStartX.current;
        touchStartX.current = null;

        if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;
        if (deltaX < 0) next();
        if (deltaX > 0) previous();
      }}
    >
      <button
        type="button"
        onClick={close}
        className="absolute right-4 top-4 rounded-full px-4 py-3 text-sm font-bold text-white/70 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EF4444]"
      >
        Skip
      </button>

      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-7 pt-20">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <OnboardingIcon icon={activeSlide.icon} />
          <h2 id="onboarding-title" className="mt-10 text-4xl font-black leading-[1.05] tracking-normal">
            {activeSlide.title}
          </h2>
          <p id="onboarding-body" className="mt-4 max-w-xs text-lg font-semibold leading-7 text-white/68">
            {activeSlide.body}
          </p>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-center gap-2" aria-label="Onboarding progress">
            {slides.map((_, index) => (
              <button
                key={dotLabels[index]}
                type="button"
                aria-label={dotLabels[index]}
                aria-current={activeIndex === index ? "step" : undefined}
                onClick={() => setActiveIndex(index)}
                className={`h-2.5 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EF4444] ${
                  activeIndex === index ? "w-8 bg-[#EF4444]" : "w-2.5 bg-white/24"
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={next}
            className="flex min-h-[54px] w-full items-center justify-center rounded-full bg-[#EF4444] px-6 text-base font-black text-white shadow-[0_0_28px_rgba(239,68,68,0.28)] transition-colors hover:bg-[#DC2626] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {isLastSlide ? (
              <span>
                Let&apos;s go <span aria-hidden="true">&rarr;</span>
              </span>
            ) : (
              "Next"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
