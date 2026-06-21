"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "nv_onboarded";

type Slide = {
  title: string;
  description: string;
  preview: "busyness" | "check-in" | "saved";
};

const slides: Slide[] = [
  {
    title: "Find the vibe",
    description: "Real-time busyness for South End bars. Green = quiet, amber = moderate, red = packed.",
    preview: "busyness",
  },
  {
    title: "Check in",
    description: "Report what you see — how packed it is, who's there. Your reports help everyone.",
    preview: "check-in",
  },
  {
    title: "Save your spots",
    description: "Heart venues to build your personal list of go-to spots.",
    preview: "saved",
  },
];

function BusynessPreview() {
  const pills = [
    { label: "Quiet", className: "border-emerald-300/40 bg-emerald-400/15 text-emerald-100", dot: "bg-emerald-300" },
    { label: "Moderate", className: "border-amber-300/45 bg-amber-400/15 text-amber-100", dot: "bg-amber-300" },
    { label: "Packed", className: "border-red-300/45 bg-red-400/15 text-red-100", dot: "bg-red-300" },
  ];

  return (
    <div className="grid gap-3" aria-hidden="true">
      {pills.map((pill) => (
        <div
          key={pill.label}
          className={`flex items-center justify-between rounded-full border px-4 py-3 ${pill.className}`}
        >
          <span className="flex items-center gap-2 text-sm font-black">
            <span className={`h-2.5 w-2.5 rounded-full ${pill.dot}`} />
            {pill.label}
          </span>
          <span className="text-xs font-bold opacity-70">{pill.label === "Quiet" ? "22%" : pill.label === "Moderate" ? "58%" : "91%"}</span>
        </div>
      ))}
    </div>
  );
}

function CheckInPreview() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div>
        <div className="mb-2 text-left text-xs font-bold uppercase tracking-[0.16em] text-white/45">How packed?</div>
        <div className="grid grid-cols-3 gap-2">
          {["Dead", "Moderate", "Packed"].map((label, index) => (
            <div
              key={label}
              className={`rounded-xl border px-3 py-2 text-center text-xs font-black ${
                index === 1 ? "border-[#00F5D4]/55 bg-[#00F5D4]/15 text-[#B9FFF4]" : "border-white/10 bg-white/[0.04] text-white/55"
              }`}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-left text-xs font-bold uppercase tracking-[0.16em] text-white/45">Crowd read</div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center justify-between text-sm font-bold text-white/75">
            <span>Balanced</span>
            <span>60 reports</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/10">
            <div className="h-2 w-1/2 rounded-full bg-[#00F5D4]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SavedPreview() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-4 text-left shadow-2xl" aria-hidden="true">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#00F5D4]">South End</div>
          <div className="mt-1 text-lg font-black text-white">Canopy Cocktail Bar</div>
          <div className="mt-2 flex gap-2 text-xs font-bold text-white/55">
            <span>Open</span>
            <span>•</span>
            <span>Moderate</span>
          </div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-full border border-[#FF2D78]/40 bg-[#FF2D78]/15 text-xl text-[#FF8BB5]">
          ♥
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {["7 min", "58%", "Saved"].map((label) => (
          <div key={label} className="rounded-2xl bg-black/25 px-2 py-3 text-center text-xs font-black text-white/70">
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function SlidePreview({ preview }: { preview: Slide["preview"] }) {
  if (preview === "busyness") return <BusynessPreview />;
  if (preview === "check-in") return <CheckInPreview />;
  return <SavedPreview />;
}

export function OnboardingOverlay() {
  const [isReady, setIsReady] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const close = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setIsVisible(false);
  }, []);

  const next = useCallback(() => {
    if (activeSlide === slides.length - 1) {
      close();
      return;
    }
    setActiveSlide((slide) => Math.min(slide + 1, slides.length - 1));
  }, [activeSlide, close]);

  useEffect(() => {
    setIsReady(true);
    setIsVisible(window.localStorage.getItem(STORAGE_KEY) !== "1");
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") setActiveSlide((slide) => Math.max(slide - 1, 0));
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, isVisible, next]);

  if (!isReady || !isVisible) return null;

  const slide = slides[activeSlide];
  const isLastSlide = activeSlide === slides.length - 1;

  return (
    <div
      className="fixed inset-0 z-[2000] flex min-h-screen bg-[#0A0A0F]/94 text-white backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-body"
    >
      <button
        type="button"
        onClick={close}
        className="absolute right-4 top-4 rounded-full px-4 py-3 text-sm font-bold text-white/60 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]"
      >
        Skip
      </button>

      <div
        className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-7 pt-20"
        onTouchStart={(event) => setTouchStartX(event.touches[0]?.clientX ?? null)}
        onTouchEnd={(event) => {
          if (touchStartX == null) return;
          const deltaX = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
          if (Math.abs(deltaX) > 48) {
            setActiveSlide((current) => Math.min(Math.max(current + (deltaX < 0 ? 1 : -1), 0), slides.length - 1));
          }
          setTouchStartX(null);
        }}
      >
        <div className="flex flex-1 flex-col justify-center text-center">
          <div className="mb-8 min-h-[230px] rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_0_48px_rgba(0,245,212,0.12)]">
            <div className="flex h-full min-h-[198px] flex-col justify-center rounded-[1.5rem] bg-black/20 p-4">
              <SlidePreview preview={slide.preview} />
            </div>
          </div>

          <h2 id="onboarding-title" className="text-4xl font-black leading-[1.05] tracking-normal">
            {slide.title}
          </h2>
          <p id="onboarding-body" className="mx-auto mt-4 max-w-sm text-base font-semibold leading-6 text-white/68">
            {slide.description}
          </p>

          <div className="mt-7 flex justify-center gap-2" aria-label="Onboarding slides">
            {slides.map((item, index) => (
              <button
                key={item.title}
                type="button"
                onClick={() => setActiveSlide(index)}
                aria-label={`Show ${item.title}`}
                aria-current={index === activeSlide ? "step" : undefined}
                className={`group flex h-6 items-center justify-center rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4] ${
                  index === activeSlide ? "w-8" : "w-6"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`rounded-full transition-all ${
                    index === activeSlide ? "h-2.5 w-8 bg-[#00F5D4]" : "h-2.5 w-2.5 bg-white/24 group-hover:bg-white/40"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="pt-7">
          <button
            type="button"
            onClick={next}
            className="flex min-h-[54px] w-full items-center justify-center rounded-full bg-[#00F5D4] px-6 text-base font-black text-[#071113] shadow-[0_0_28px_rgba(0,245,212,0.24)] transition-colors hover:bg-[#5CFFE8] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {isLastSlide ? "Let's go" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
