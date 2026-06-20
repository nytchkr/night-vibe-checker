"use client";

import dynamic from "next/dynamic";
import { OnboardingOverlay } from "@/components/OnboardingOverlay";

const VenueMap = dynamic(() => import("@/components/VenueMap"), { ssr: false });

export default function VenueMapClient() {
  return (
    <section role="region" aria-label="Venue map">
      <VenueMap />
      <OnboardingOverlay />
    </section>
  );
}
