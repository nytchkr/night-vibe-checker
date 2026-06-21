"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { hasCompletedOnboarding } from "@/components/OnboardingOverlay";
import { CITIES, DEFAULT_CITY } from "@/lib/cities";
import type { City, CityId } from "@/lib/cities";

function MapLoadingSkeleton() {
  return (
    <div className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-[#0A0A0E]">
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.07)_45%,transparent_75%)]"
      />
      <p className="relative text-sm font-semibold text-white/30">Loading map...</p>
    </div>
  );
}

const VenueMap = dynamic(() => import("@/components/VenueMap"), {
  ssr: false,
  loading: () => <MapLoadingSkeleton />,
});
const OnboardingOverlay = dynamic(
  () => import("@/components/OnboardingOverlay").then((mod) => mod.OnboardingOverlay),
  { ssr: false },
);

const CITY_STORAGE_KEY = "nightvibe:selected-city";

function getCityById(cityId: string | null): City {
  return CITIES.find((city) => city.id === cityId) ?? DEFAULT_CITY;
}

function OnboardingGate() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (hasCompletedOnboarding()) return;

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
  const [selectedCity, setSelectedCity] = useState<City>(DEFAULT_CITY);

  useEffect(() => {
    setSelectedCity(getCityById(window.localStorage.getItem(CITY_STORAGE_KEY)));
  }, []);

  function handleCityChange(cityId: CityId) {
    const nextCity = getCityById(cityId);
    setSelectedCity(nextCity);
    window.localStorage.setItem(CITY_STORAGE_KEY, nextCity.id);
  }

  return (
    <section role="region" aria-label="Venue map">
      <VenueMap city={selectedCity} onCityChange={handleCityChange} />
      <OnboardingGate />
    </section>
  );
}
