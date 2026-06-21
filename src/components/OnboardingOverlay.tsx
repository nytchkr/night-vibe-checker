"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";

export const ONBOARDING_STORAGE_KEY = "nightvibe.onboarded";
const LEGACY_STORAGE_KEY = "nv_onboarded";

type Slide = {
  title: string;
  subtitle: string;
  preview: "map" | "leaderboard" | "alerts";
};

const slides: Slide[] = [
  {
    title: "Know Before You Go 🌃",
    subtitle: "Real-time busyness and crowd intel for South End Charlotte",
    preview: "map",
  },
  {
    title: "Check In & Earn Cred 🎯",
    subtitle: "Log your nights out. See how you stack up on the leaderboard.",
    preview: "leaderboard",
  },
  {
    title: "Your Night, Your Call ✅",
    subtitle: "Filter by vibe. Get push alerts. Know what's packed.",
    preview: "alerts",
  },
];

export function hasCompletedOnboarding() {
  return (
    window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1" ||
    window.localStorage.getItem(LEGACY_STORAGE_KEY) === "1"
  );
}

function MapDotsPreview() {
  const dots = [
    { left: "20%", top: "28%", size: "h-3 w-3", color: "bg-[#00F5D4]", delay: "0s" },
    { left: "68%", top: "32%", size: "h-2.5 w-2.5", color: "bg-[#FF2D78]", delay: "0.35s" },
    { left: "44%", top: "58%", size: "h-4 w-4", color: "bg-amber-300", delay: "0.7s" },
    { left: "76%", top: "72%", size: "h-3 w-3", color: "bg-[#00F5D4]", delay: "1.05s" },
  ];

  return (
    <div
      className="relative h-64 overflow-hidden rounded-[28px] border border-white/10 bg-[#07070B] shadow-[0_0_60px_rgba(0,245,212,0.14)]"
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(0,245,212,0.16),transparent_32%),linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[length:100%_100%,38px_38px,38px_38px]" />
      <div className="absolute left-[13%] top-[22%] h-px w-[68%] rotate-12 bg-[#00F5D4]/20" />
      <div className="absolute left-[25%] top-[62%] h-px w-[55%] -rotate-[18deg] bg-[#FF2D78]/18" />
      {dots.map((dot) => (
        <div
          key={`${dot.left}-${dot.top}`}
          className="absolute grid place-items-center"
          style={{ left: dot.left, top: dot.top }}
        >
          <span
            className={`absolute ${dot.size} rounded-full ${dot.color} opacity-45 blur-[1px] animate-ping`}
            style={{ animationDelay: dot.delay, animationDuration: "1.8s" }}
          />
          <span className={`relative ${dot.size} rounded-full ${dot.color} shadow-[0_0_18px_currentColor]`} />
        </div>
      ))}
      <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/10 bg-black/45 p-3 backdrop-blur-md">
        <div className="flex items-center justify-between text-xs font-semibold text-white/55">
          <span>South End live map</span>
          <span className="text-[#00F5D4]">4 packed now</span>
        </div>
      </div>
    </div>
  );
}

function LeaderboardPreview() {
  const rows = [
    { rank: "🏆", name: "Maya", detail: "12 check-ins", color: "border-[#00F5D4]/35 bg-[#00F5D4]/12" },
    { rank: "🥈", name: "Jordan", detail: "9 check-ins", color: "border-white/12 bg-white/[0.06]" },
    { rank: "🥉", name: "Chris", detail: "7 check-ins", color: "border-[#FF2D78]/30 bg-[#FF2D78]/10" },
  ];

  return (
    <div
      className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4 shadow-[0_0_54px_rgba(255,45,120,0.12)]"
      aria-hidden="true"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="text-left">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#00F5D4]">Tonight</div>
          <div className="mt-1 text-lg font-black text-white">Cred board</div>
        </div>
        <div className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs font-bold text-white/60">
          South End
        </div>
      </div>
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={row.name} className={`flex items-center gap-3 rounded-2xl border px-3 py-3 ${row.color}`}>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-black/30 text-lg">{row.rank}</span>
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-sm font-black text-white">
                {index + 1}. {row.name}
              </div>
              <div className="text-xs font-semibold text-white/48">{row.detail}</div>
            </div>
            <div className="h-2 w-14 rounded-full bg-white/10">
              <div className="h-2 rounded-full bg-[#00F5D4]" style={{ width: `${88 - index * 18}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertsPreview() {
  const filters = ["Packed", "Balanced", "Open now"];

  return (
    <div
      className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_80%_12%,rgba(0,245,212,0.14),transparent_34%),rgba(255,255,255,0.045)] p-4 text-left shadow-[0_0_54px_rgba(0,245,212,0.1)]"
      aria-hidden="true"
    >
      <div className="rounded-3xl border border-[#00F5D4]/25 bg-[#00F5D4]/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#00F5D4]">Vibe alert</div>
            <div className="mt-2 text-xl font-black text-white">Sycamore just got packed</div>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[#00F5D4] text-xl text-[#071113]">!</div>
        </div>
        <div className="mt-4 text-sm font-semibold leading-5 text-white/62">Live check-ins are moving fast. Decide before the line does.</div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {filters.map((filter, index) => (
          <div
            key={filter}
            className={`rounded-2xl border px-2 py-3 text-center text-xs font-black ${
              index === 0
                ? "border-[#FF2D78]/35 bg-[#FF2D78]/12 text-[#FF9ABD]"
                : "border-white/10 bg-black/25 text-white/55"
            }`}
          >
            {filter}
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
        <div className="flex items-center justify-between text-xs font-bold text-white/55">
          <span>Crowd signal</span>
          <span className="text-[#00F5D4]">82%</span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-white/10">
          <div className="h-2 w-[82%] rounded-full bg-[#00F5D4]" />
        </div>
      </div>
    </div>
  );
}

function SlidePreview({ preview }: { preview: Slide["preview"] }) {
  if (preview === "map") return <MapDotsPreview />;
  if (preview === "leaderboard") return <LeaderboardPreview />;
  return <AlertsPreview />;
}

export function OnboardingOverlay() {
  const [isReady, setIsReady] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const suppressTapRef = useRef(false);

  const close = useCallback(() => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    window.localStorage.setItem(LEGACY_STORAGE_KEY, "1");
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
    setIsVisible(!hasCompletedOnboarding());
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
  const previous = () => setActiveSlide((current) => Math.max(current - 1, 0));
  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) <= 56) return;

    suppressTapRef.current = true;
    window.setTimeout(() => {
      suppressTapRef.current = false;
    }, 0);

    if (info.offset.x < 0) next();
    if (info.offset.x > 0) previous();
  };
  const handleTapAdvance = () => {
    if (suppressTapRef.current) return;
    next();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-screen bg-[#0A0A0F]/95 text-white backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-body"
      onClick={handleTapAdvance}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          close();
        }}
        className="absolute right-4 top-4 z-10 rounded-full px-4 py-3 text-sm font-semibold text-white/30 transition-colors hover:text-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]"
      >
        Skip
      </button>

      <div
        className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-7 pt-16"
      >
        <div className="flex flex-1 flex-col justify-center text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.title}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.14}
              onDragEnd={handleDragEnd}
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="cursor-pointer"
            >
              <div className="mb-8">
                <SlidePreview preview={slide.preview} />
              </div>

              <h2 id="onboarding-title" className="text-[2.55rem] font-black leading-[1.05] tracking-normal">
                {slide.title}
              </h2>
              <p id="onboarding-body" className="mx-auto mt-4 max-w-sm text-base font-semibold leading-6 text-white/66">
                {slide.subtitle}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-7 flex justify-center gap-2" aria-label="Onboarding slides">
            {slides.map((item, index) => (
              <button
                key={item.title}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveSlide(index);
                }}
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

        <div className="pt-7" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            onClick={next}
            className="flex min-h-[54px] w-full items-center justify-center rounded-full bg-[#00F5D4] px-6 text-base font-black text-[#071113] shadow-[0_0_28px_rgba(0,245,212,0.24)] transition-colors hover:bg-[#5CFFE8] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {isLastSlide ? "Let's Go →" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
