"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { useFocusTrap } from "@/hooks/useFocusTrap";
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
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const suppressTapRef = useRef(false);

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

  useFocusTrap(isVisible, dialogRef, close);

  if (!isReady || !isVisible) return null;

  const selectZone = (zone: OnboardingZone) => {
    suppressTapRef.current = true;
    window.localStorage.setItem(PREFERRED_ZONE_STORAGE_KEY, zone.id);
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    window.localStorage.setItem(LEGACY_ONBOARDING_STORAGE_KEY, "1");
    setIsVisible(false);
    onClose?.();
    router.push(`/explore?zone=${encodeURIComponent(zone.id)}`);
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
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
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

            <div className="mt-6 grid gap-2.5">
              {ONBOARDING_ZONES.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => selectZone(zone)}
                  className="group flex min-h-[82px] items-center gap-3 rounded-[18px] border border-white/[0.08] bg-white/[0.05] p-3.5 text-left shadow-lg shadow-black/15 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#8B6CFF]/45 hover:bg-white/[0.08] hover:shadow-[#8B6CFF]/15 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#8B6CFF,#FF2D78)] text-white shadow-[0_0_22px_rgba(139,108,255,0.3)]">
                    <MapPin className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-black text-white">{zone.name}</span>
                    <span className="mt-1 block text-sm font-semibold leading-5 text-white/56">{zone.description}</span>
                  </span>
                  <span className="text-xl font-black text-white/35 transition-transform group-hover:translate-x-1 group-hover:text-white/70" aria-hidden="true">
                    →
                  </span>
                </button>
              ))}
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
