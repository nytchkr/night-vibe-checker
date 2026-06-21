"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { hasCompletedOnboarding } from "@/components/OnboardingOverlay";
import { CITIES, DEFAULT_CITY } from "@/lib/cities";
import type { City, CityId } from "@/lib/cities";

function MapLoadingSkeleton() {
  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#0A0A0E]" role="status" aria-label="Loading map">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:42px_42px] opacity-60" />
      <div className="absolute left-4 top-4 h-10 w-40 animate-pulse rounded-full bg-white/[0.06]" />
      <div className="absolute left-1/2 top-14 h-9 w-52 -translate-x-1/2 animate-pulse rounded-full bg-white/[0.06]" />
      <div className="absolute bottom-20 left-1/2 h-9 w-64 -translate-x-1/2 animate-pulse rounded-full bg-white/[0.06]" />
      <div className="absolute inset-x-0 bottom-0 h-[72px] rounded-t-3xl border-t border-white/[0.08] bg-[#0A0A0E]/95 px-4 pt-3 backdrop-blur-xl">
        <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />
        <div className="mx-auto mt-3 h-9 w-44 animate-pulse rounded-full bg-white/[0.06]" />
      </div>
      <span className="sr-only">Loading map venues...</span>
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
const CITY_QUERY_PARAM = "city";

function getAvailableCityById(cityId: string | null): City {
  return CITIES.find((city) => city.id === cityId && !city.comingSoon) ?? DEFAULT_CITY;
}

function cleanUnsupportedCityParam() {
  const url = new URL(window.location.href);
  const cityId = url.searchParams.get(CITY_QUERY_PARAM);
  if (!cityId) return;

  const hasAvailableCityParam = CITIES.some((city) => city.id === cityId && !city.comingSoon);
  if (hasAvailableCityParam) return;

  url.searchParams.delete(CITY_QUERY_PARAM);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
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
    cleanUnsupportedCityParam();

    const urlCityId = new URL(window.location.href).searchParams.get(CITY_QUERY_PARAM);
    const storedCityId = window.localStorage.getItem(CITY_STORAGE_KEY);
    const nextCity = getAvailableCityById(urlCityId ?? storedCityId);

    setSelectedCity(nextCity);
    window.localStorage.setItem(CITY_STORAGE_KEY, nextCity.id);
  }, []);

  function handleCityChange(cityId: CityId) {
    const nextCity = getAvailableCityById(cityId);
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
