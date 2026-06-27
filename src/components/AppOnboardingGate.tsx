"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { hasCompletedOnboarding } from "@/components/OnboardingOverlay";

const OnboardingOverlay = dynamic(
  () => import("@/components/OnboardingOverlay").then((mod) => mod.OnboardingOverlay),
  { ssr: false },
);

export function AppOnboardingGate() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (hasCompletedOnboarding()) return;

    const timeoutId = window.setTimeout(() => setShouldRender(true), 150);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return shouldRender ? <OnboardingOverlay /> : null;
}
