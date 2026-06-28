"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { getMapViewportStyle, MapLoadingSkeleton } from "@/components/MapLoadingSkeleton";
import { CITIES, DEFAULT_CITY } from "@/lib/cities";
import type { City, CityId } from "@/lib/cities";

const VenueMap = dynamic(() => import("@/components/VenueMap"), {
  ssr: false,
  loading: () => <MapLoadingSkeleton />,
});
const CITY_STORAGE_KEY = "nytchkr:selected-city";
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
    <section
      className="bg-[#0A0A0E] text-white"
      role="region"
      aria-label="Venue map"
      style={getMapViewportStyle()}
    >
      <VenueMap city={selectedCity} onCityChange={handleCityChange} />
    </section>
  );
}
