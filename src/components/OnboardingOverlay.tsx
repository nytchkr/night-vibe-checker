"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin, Radio, Sparkles, UsersRound } from "lucide-react";
import { div as MotionDiv, span as MotionSpan } from "framer-motion/client";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { triggerHapticFeedback } from "@/lib/haptics";
import {
  LEGACY_ONBOARDING_STORAGE_KEY,
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_ZONES,
  PREFERRED_ZONE_STORAGE_KEY,
  type OnboardingZone,
} from "@/lib/onboarding";

export function hasCompletedOnboarding() {
  const onboarded = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
  return (
    onboarded === "true" ||
    onboarded === "1"
  );
}

type OnboardingOverlayProps = {
  forceOpen?: boolean;
  onClose?: () => void;
};

type OnboardingStep = "zone" | "how";

export function OnboardingOverlay({ forceOpen = false, onClose }: OnboardingOverlayProps = {}) {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [step, setStep] = useState<OnboardingStep>("zone");
  const [selectedZoneId, setSelectedZoneId] = useState<OnboardingZone["id"] | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const suppressTapRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

  const close = useCallback(() => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    window.localStorage.setItem(LEGACY_ONBOARDING_STORAGE_KEY, "1");
    setIsVisible(false);
    onClose?.();
  }, [onClose]);

  const complete = useCallback(() => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    window.localStorage.setItem(LEGACY_ONBOARDING_STORAGE_KEY, "1");
    setIsVisible(false);
    onClose?.();
    if (selectedZoneId) {
      router.push(`/explore?zone=${encodeURIComponent(selectedZoneId)}`);
    }
  }, [onClose, router, selectedZoneId]);

  useEffect(() => {
    setIsReady(true);
    setIsVisible(forceOpen || !hasCompletedOnboarding());
  }, [forceOpen]);

  useFocusTrap(isVisible, dialogRef, close);

  if (!isReady || !isVisible) return null;

  const selectZone = (zone: OnboardingZone) => {
    suppressTapRef.current = true;
    triggerHapticFeedback(6);
    setSelectedZoneId(zone.id);
    window.localStorage.setItem(PREFERRED_ZONE_STORAGE_KEY, zone.id);
    window.setTimeout(() => {
      suppressTapRef.current = false;
      setStep("how");
    }, prefersReducedMotion ? 0 : 180);
  };

  const handleBackdropClick = () => {
    if (suppressTapRef.current) return;
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[10000] flex max-h-dvh overflow-y-auto bg-[#0A0A0E]/96 text-white backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-body"
      tabIndex={-1}
      onClick={handleBackdropClick}
    >
      <div
        className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-5 pt-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={close}
            className="rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white/58 transition-colors hover:bg-white/[0.08] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
          >
            Skip
          </button>
        </div>

        <div className="flex flex-1 flex-col justify-center">
          <MotionDiv
            key={step}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: "easeOut" }}
          >
            <p className="text-center text-xs font-black uppercase tracking-[0.24em] text-white/45">
              {step === "zone" ? "Step 1 of 2" : "Step 2 of 2"}
            </p>
            <h2
              id="onboarding-title"
              className="mx-auto mt-3 max-w-sm bg-[linear-gradient(110deg,#8B6CFF_0%,#F0568C_62%,#F4F5F8_100%)] bg-clip-text text-center font-display text-[2.25rem] font-black leading-[1.04] tracking-normal text-transparent"
            >
              {step === "zone" ? "Pick your zone" : "How it works"}
            </h2>
            <p id="onboarding-body" className="mx-auto mt-3 max-w-xs text-center text-sm font-semibold leading-6 text-white/62">
              {step === "zone"
                ? "Start with the part of Charlotte you care about tonight."
                : "nytchkr keeps the plan simple once you know where you are headed."}
            </p>

            {step === "zone" ? (
              <div className="mt-6 grid gap-3">
                {ONBOARDING_ZONES.map((zone) => {
                  const isSelected = selectedZoneId === zone.id;

                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => selectZone(zone)}
                      className="group relative flex min-h-[116px] overflow-hidden rounded-[18px] border border-white/[0.08] bg-white/[0.05] p-3 text-left shadow-lg shadow-black/15 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#8B6CFF]/45 hover:bg-white/[0.08] hover:shadow-[#8B6CFF]/15 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                      aria-pressed={isSelected}
                    >
                      <span
                        className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:animate-pulse group-hover:opacity-100"
                        style={{
                          background:
                            "radial-gradient(circle at 18% 20%, rgba(139,108,255,0.22), transparent 34%), radial-gradient(circle at 82% 78%, rgba(240,86,140,0.18), transparent 38%)",
                        }}
                        aria-hidden="true"
                      />
                      <span className="relative flex w-full items-center gap-3">
                        <span className="relative h-[84px] w-[112px] shrink-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#11111A]">
                          <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(139,108,255,0.16),rgba(240,86,140,0.1))]" aria-hidden="true" />
                          <span className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[length:22px_22px]" aria-hidden="true" />
                          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 84" role="img" aria-label={`${zone.mapPreview.label} map preview`}>
                            <path d={zone.mapPreview.route} fill="none" stroke="rgba(255,255,255,0.26)" strokeWidth="5" strokeLinecap="round" />
                            <path d={zone.mapPreview.route} fill="none" stroke="#8B6CFF" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                          {zone.mapPreview.pins.map((pin, index) => (
                            <span
                              key={`${zone.id}-${index}`}
                              className="absolute h-3 w-3 rounded-full border border-white/80 shadow-[0_0_18px_rgba(139,108,255,0.5)]"
                              style={{
                                left: pin.left,
                                top: pin.top,
                                backgroundColor: pin.tone === "pink" ? "#F0568C" : "#8B6CFF",
                              }}
                              aria-hidden="true"
                            />
                          ))}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="block text-base font-black text-white">{zone.name}</span>
                            <span className="rounded-full border border-[#F0568C]/25 bg-[#F0568C]/12 px-2 py-0.5 text-[11px] font-black text-[#FF9FBE]">
                              {zone.spotCount} spots
                            </span>
                          </span>
                          <span className="mt-1 block text-sm font-semibold leading-5 text-white/56">{zone.description}</span>
                          <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-white/45">
                            <MapPin className="h-3.5 w-3.5 text-[#8B6CFF]" aria-hidden="true" />
                            {zone.mapPreview.label}
                          </span>
                        </span>
                        <MotionSpan
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.07] text-sm font-black text-white/42 transition-colors group-hover:text-white/78"
                          aria-hidden="true"
                          animate={isSelected && !prefersReducedMotion ? { scale: [1, 1.18, 1], backgroundColor: "rgba(139,108,255,0.32)" } : { scale: 1 }}
                          transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: "easeOut" }}
                        >
                          {isSelected ? <Check className="h-4 w-4" /> : "→"}
                        </MotionSpan>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-8 space-y-3">
                {[
                  { icon: Check, label: "Check-in at a venue" },
                  { icon: Radio, label: "See live busyness" },
                  { icon: Sparkles, label: "Discover trending spots" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.05] p-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#8B6CFF,#F0568C)] text-white shadow-[0_0_24px_rgba(139,108,255,0.28)]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="text-base font-black text-white">{label}</span>
                  </div>
                ))}
                <div className="mt-5 rounded-3xl border border-[#8B6CFF]/20 bg-[#8B6CFF]/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-black text-white">
                    <UsersRound className="h-4 w-4 text-[#F0568C]" aria-hidden="true" />
                    {selectedZoneId ? "Your zone is saved." : "You can pick a zone later."}
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-6 text-white/58">
                    Explore opens around your selected area, then updates as real venue signals come in.
                  </p>
                </div>
              </div>
            )}
          </MotionDiv>
        </div>

        {step === "how" ? (
          <div className="pt-5">
            <button
              type="button"
              onClick={complete}
              className="flex min-h-[52px] w-full items-center justify-center rounded-full bg-[linear-gradient(135deg,#8B6CFF,#F0568C)] px-6 text-sm font-black text-white shadow-[0_0_28px_rgba(139,108,255,0.28)] transition-transform hover:scale-[1.01] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F0568C]/70"
            >
              Start exploring
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
