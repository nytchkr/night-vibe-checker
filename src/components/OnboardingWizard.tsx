"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PushOptIn } from "@/components/PushOptIn";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  LEGACY_ONBOARDING_STORAGE_KEY,
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_ZONES_STORAGE_KEY,
  PREFERRED_ZONE_STORAGE_KEY,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";

type WizardStep = 0 | 1 | 2;

const zones = [
  { id: "south-end-charlotte", label: "South End" },
  { id: "dilworth-charlotte", label: "Dilworth" },
  { id: "south-park-charlotte", label: "SouthPark" },
] as const;

function hasCompletedOnboarding() {
  try {
    const onboarded = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    return onboarded === "1" || onboarded === "true";
  } catch {
    return false;
  }
}

export function OnboardingWizard() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>(0);
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsMounted(true);
    setIsOpen(!hasCompletedOnboarding());
  }, []);

  const finish = useCallback(() => {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
      window.localStorage.setItem(LEGACY_ONBOARDING_STORAGE_KEY, "1");
    } catch {
      // The route transition still lets the user continue if storage is unavailable.
    }

    setIsOpen(false);
    router.push("/explore");
  }, [router]);

  useFocusTrap(isOpen, dialogRef);

  if (!isMounted || !isOpen) return null;

  const toggleZone = (zoneId: string) => {
    setSelectedZones((current) => (
      current.includes(zoneId)
        ? current.filter((id) => id !== zoneId)
        : [...current, zoneId]
    ));
  };

  const saveZones = () => {
    if (selectedZones.length === 0) return;

    try {
      window.localStorage.setItem(ONBOARDING_ZONES_STORAGE_KEY, JSON.stringify(selectedZones));
      window.localStorage.setItem(PREFERRED_ZONE_STORAGE_KEY, selectedZones[0]);
    } catch {
      // The wizard can continue even if private browsing blocks storage.
    }

    setStep(2);
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[10000] flex min-h-dvh overflow-y-auto bg-gradient-to-b from-[#0A0A0E] to-[#14141A] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)] text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-wizard-title"
      tabIndex={-1}
    >
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md flex-col">
        <div className="flex items-center justify-center gap-2 py-2" aria-hidden="true">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className={cn(
                "h-1.5 rounded-full transition-all",
                dot === step ? "w-7 bg-[#8B6CFF]" : "w-1.5 bg-white/20",
              )}
            />
          ))}
        </div>

        {step === 0 ? (
          <section className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="relative mb-8 grid h-28 w-28 place-items-center rounded-[2rem] border border-[#8B6CFF]/35 bg-[#8B6CFF]/14 shadow-[0_0_54px_rgba(139,108,255,0.35)]">
              <span className="absolute inset-0 animate-ping rounded-[2rem] bg-[#8B6CFF]/20" aria-hidden="true" />
              <Building2 className="relative h-12 w-12 text-[#C8B9FF]" aria-hidden="true" />
            </div>
            <h1 id="onboarding-wizard-title" className="font-display max-w-sm text-[2.55rem] font-black leading-[1.02] tracking-normal text-white">
              Your city's nightlife, live.
            </h1>
            <p className="mt-4 max-w-xs text-base font-semibold leading-7 text-white/58">
              Real vibes. Real check-ins. No algorithms.
            </p>
            <div className="mt-10 w-full">
              <Button
                type="button"
                onClick={() => setStep(1)}
                className="min-h-[56px] w-full rounded-full bg-[#8B6CFF] py-4 text-base font-black text-white shadow-[0_0_32px_rgba(139,108,255,0.34)] hover:bg-[#9B82FF]"
              >
                Get Started
              </Button>
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="flex flex-1 flex-col justify-center">
            <h1 id="onboarding-wizard-title" className="font-display text-center text-[2.05rem] font-black leading-tight tracking-normal text-white">
              Where do you go out?
            </h1>
            <div className="mt-8 grid gap-3">
              {zones.map((zone) => {
                const isSelected = selectedZones.includes(zone.id);

                return (
                  <Card
                    key={zone.id}
                    className={cn(
                      "rounded-2xl border border-white/[0.08] bg-white/[0.03] p-0 transition-colors",
                      isSelected && "border-[#8B6CFF] bg-[#8B6CFF]/10",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleZone(zone.id)}
                      className="flex min-h-[78px] w-full items-center justify-between gap-4 rounded-2xl p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                      aria-pressed={isSelected}
                    >
                      <span className="text-lg font-black text-white">{zone.label}</span>
                      <span
                        className={cn(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-full border text-white transition-colors",
                          isSelected ? "border-[#8B6CFF] bg-[#8B6CFF]" : "border-white/10 bg-white/[0.04]",
                        )}
                        aria-hidden="true"
                      >
                        {isSelected ? <Check className="h-4 w-4" /> : null}
                      </span>
                    </button>
                  </Card>
                );
              })}
            </div>
            <div className="mt-8">
              <Button
                type="button"
                onClick={saveZones}
                disabled={selectedZones.length === 0}
                className="min-h-[56px] w-full rounded-full bg-[#8B6CFF] py-4 text-base font-black text-white shadow-[0_0_32px_rgba(139,108,255,0.28)] hover:bg-[#9B82FF]"
              >
                Let's Go
              </Button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="flex flex-1 flex-col justify-center text-center">
            <h1 id="onboarding-wizard-title" className="font-display text-[2.1rem] font-black leading-tight tracking-normal text-white">
              Stay in the loop
            </h1>
            <p className="mx-auto mt-3 max-w-xs text-base font-semibold leading-7 text-white/58">
              Get notified when your favorite spots get busy.
            </p>
            <PushOptIn
              buttonLabel="Allow notifications"
              onAttemptComplete={finish}
              className="mt-8 text-left"
            />
            <button
              type="button"
              onClick={finish}
              className="mx-auto mt-6 rounded-full px-5 py-3 text-sm font-black text-white/62 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              Maybe later
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}
