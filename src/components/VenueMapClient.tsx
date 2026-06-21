"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const VenueMap = dynamic(() => import("@/components/VenueMap"), { ssr: false });
const OnboardingOverlay = dynamic(
  () => import("@/components/OnboardingOverlay").then((mod) => mod.OnboardingOverlay),
  { ssr: false },
);

const ONBOARDING_STORAGE_KEY = "nv_onboarded";

function OnboardingGate() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1") return;

    const show = () => setShouldRender(true);
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(show, { timeout: 1200 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = globalThis.setTimeout(show, 600);
    return () => globalThis.clearTimeout(timeoutId);
  }, []);

  return shouldRender ? <OnboardingOverlay /> : null;
}

export default function VenueMapClient() {
  return (
    <section role="region" aria-label="Venue map">
      <VenueMap />
      <OnboardingGate />
    </section>
  );
}
