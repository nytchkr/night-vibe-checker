"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, HelpCircle, MapPin } from "lucide-react";
import * as motion from "framer-motion/client";
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

export function OnboardingOverlay({ forceOpen = false, onClose }: OnboardingOverlayProps = {}) {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<OnboardingZone["id"] | null>(null);
  const [showNytchkrInfo, setShowNytchkrInfo] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const suppressTapRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

  const close = useCallback(() => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    window.localStorage.setItem(LEGACY_ONBOARDING_STORAGE_KEY, "1");
    setIsVisible(false);
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    setIsReady(true);
    setIsVisible(forceOpen || !hasCompletedOnboarding());
  }, [forceOpen]);

  useEffect(() => {
    return () => {
      if (navigationTimerRef.current) window.clearTimeout(navigationTimerRef.current);
    };
  }, []);

  useFocusTrap(isVisible, dialogRef, close);

  if (!isReady || !isVisible) return null;

  const selectZone = (zone: OnboardingZone) => {
    if (selectedZoneId) return;
    suppressTapRef.current = true;
    triggerHapticFeedback(6);
    setSelectedZoneId(zone.id);
    window.localStorage.setItem(PREFERRED_ZONE_STORAGE_KEY, zone.id);
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    window.localStorage.setItem(LEGACY_ONBOARDING_STORAGE_KEY, "1");
    navigationTimerRef.current = window.setTimeout(() => {
      setIsVisible(false);
      onClose?.();
      router.push(`/explore?zone=${encodeURIComponent(zone.id)}`);
    }, 420);
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
        className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-5 pt-9"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-1 flex-col justify-center">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: "easeOut" }}
          >
            <p className="text-center text-xs font-black uppercase tracking-[0.24em] text-white/45">nytchkr</p>
            <h2
              id="onboarding-title"
              className="mx-auto mt-3 max-w-sm bg-[linear-gradient(110deg,#8B6CFF_0%,#FF2D78_58%,#F4F5F8_100%)] bg-clip-text text-center font-display text-[2.35rem] font-black leading-[1.04] tracking-normal text-transparent"
            >
              Find where Charlotte goes tonight
            </h2>
            <p id="onboarding-body" className="mx-auto mt-3 max-w-xs text-center text-sm font-semibold leading-6 text-white/62">
              Pick your area and Explore will open with spots filtered for that part of Charlotte.
            </p>
            <div className="relative mt-3 flex justify-center">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs font-black text-white/48 underline decoration-white/20 underline-offset-4 transition-colors hover:text-white/78 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                aria-expanded={showNytchkrInfo}
                aria-describedby={showNytchkrInfo ? "nytchkr-info-popover" : undefined}
                onClick={() => setShowNytchkrInfo((value) => !value)}
              >
                <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                What is nytchkr?
              </button>
              {showNytchkrInfo ? (
                <div
                  id="nytchkr-info-popover"
                  role="tooltip"
                  className="absolute top-7 z-10 w-[min(18rem,calc(100vw-3rem))] rounded-2xl border border-white/[0.1] bg-[#15131F] px-4 py-3 text-center text-xs font-semibold leading-5 text-white/70 shadow-2xl shadow-black/35"
                >
                  nytchkr shows real Charlotte nightlife spots with crowd signals from trusted venue data and community check-ins.
                </div>
              ) : null}
            </div>

            <div className="mt-6 grid gap-2.5">
              {ONBOARDING_ZONES.map((zone) => {
                const isSelected = selectedZoneId === zone.id;

                return (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => selectZone(zone)}
                    disabled={selectedZoneId !== null}
                    className="group relative flex min-h-[92px] overflow-hidden rounded-[18px] border border-white/[0.08] bg-white/[0.05] p-3.5 text-left shadow-lg shadow-black/15 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#8B6CFF]/45 hover:bg-white/[0.08] hover:shadow-[#8B6CFF]/15 active:scale-[0.99] disabled:cursor-default disabled:opacity-70 disabled:hover:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                  >
                    <span
                      className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:animate-pulse group-hover:opacity-100"
                      style={{
                        background:
                          "radial-gradient(circle at 18% 20%, rgba(0,245,212,0.18), transparent 34%), radial-gradient(circle at 82% 78%, rgba(255,45,120,0.16), transparent 38%), linear-gradient(135deg, rgba(139,108,255,0.12), transparent 58%)",
                      }}
                      aria-hidden="true"
                    />
                    <span className="relative flex w-full items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#8B6CFF,#FF2D78)] text-white shadow-[0_0_22px_rgba(139,108,255,0.3)]">
                        {isSelected ? <Check className="h-5 w-5" aria-hidden="true" /> : <MapPin className="h-5 w-5" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="block text-base font-black text-white">{zone.name}</span>
                          <span className="rounded-full border border-[#00F5D4]/20 bg-[#00F5D4]/10 px-2 py-0.5 text-[11px] font-black text-[#9FFCF0]">
                            {zone.spotCount} spots
                          </span>
                        </span>
                        <span className="mt-1 block text-sm font-semibold leading-5 text-white/56">{zone.description}</span>
                      </span>
                      <motion.span
                        className="text-xl font-black text-white/35 transition-colors group-hover:text-white/70"
                        aria-hidden="true"
                        animate={isSelected && !prefersReducedMotion ? { scale: [1, 1.18, 1], color: "rgba(255,255,255,0.9)" } : { scale: 1 }}
                        transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: "easeOut" }}
                      >
                        {isSelected ? "✓" : "→"}
                      </motion.span>
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>

        <div className="pt-5">
          <button
            type="button"
            onClick={close}
            className="flex min-h-[52px] w-full items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.06] px-6 text-sm font-black text-white/75 transition-colors hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
          >
            Skip, show me everything
          </button>
        </div>
      </div>
    </div>
  );
}
