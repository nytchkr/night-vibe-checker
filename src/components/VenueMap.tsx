"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import L from "leaflet";
import type { Map as LeafletMap } from "leaflet";
import "leaflet.markercluster";
import { track } from "@vercel/analytics";
import { Check, ChevronDown, RefreshCw, X } from "lucide-react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { getBusynessState } from "@/lib/busyness";
import { CITIES } from "@/lib/cities";
import { inZone } from "@/lib/zone";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useHaptic } from "@/hooks/useHaptic";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { getMapViewportStyle, MapLoadingSkeleton } from "@/components/MapLoadingSkeleton";
import type { City, CityId } from "@/lib/cities";
import type { APIResponse, ConsumerVenue } from "@/types";
import type { MapSheetSnap } from "@/components/MapBottomSheet";
const MapBottomSheet = dynamic(() => import("@/components/MapBottomSheet"), {
  ssr: false,
  loading: () => null,
});
const VenueBottomSheet = dynamic(() => import("@/components/VenueBottomSheet"), {
  ssr: false,
  loading: () => null,
});
type MapCategoryFilter = "All" | "Bars" | "Clubs" | "Restaurants" | "Lounges";

const CATEGORY_FILTERS: MapCategoryFilter[] = ["All", "Bars", "Clubs", "Restaurants", "Lounges"];
const BUSYNESS_FILTERS = ["All", "Busy", "Live only"] as const;
const EXPLORE_VENUES_EVENT = "nightvibe:explore-venues-updated";

const CHARLOTTE_ZIP_CENTERS: Record<string, [number, number]> = {
  "28104": [35.0589, -80.724],
  "28105": [35.1168, -80.7237],
  "28110": [35.003, -80.549],
  "28112": [34.982, -80.549],
  "28117": [35.5849, -80.884],
  "28134": [35.0855, -80.8923],
  "28173": [34.9246, -80.7434],
  "28202": [35.2271, -80.8431],
  "28203": [35.2065, -80.8651],
  "28204": [35.2156, -80.8306],
  "28205": [35.2303, -80.8015],
  "28206": [35.2612, -80.8283],
  "28207": [35.1965, -80.832],
  "28208": [35.222, -80.9088],
  "28209": [35.1767, -80.859],
  "28210": [35.144, -80.8694],
  "28211": [35.1823, -80.7971],
  "28212": [35.2002, -80.7685],
  "28213": [35.282, -80.7842],
  "28214": [35.2474, -80.9461],
  "28215": [35.247, -80.738],
  "28216": [35.3079, -80.8826],
  "28217": [35.1617, -80.9085],
  "28223": [35.3055, -80.7321],
  "28226": [35.1106, -80.854],
  "28227": [35.1868, -80.7201],
  "28262": [35.3188, -80.7425],
  "28269": [35.3561, -80.8141],
  "28270": [35.1231, -80.7629],
  "28273": [35.1352, -80.939],
  "28277": [35.0559, -80.8434],
  "28278": [35.1321, -81.008],
};

const OUT_OF_ZONE_GEO_MESSAGE = "You're outside our launch zone. Showing South End Charlotte.";
const VENUE_FETCH_TIMEOUT_MS = 10_000;
const SLOW_LOAD_DELAY_MS = 5_000;
const CHARLOTTE_AREA_ZIP_PATTERN = /^28[12]\d{2}$/;

class MapErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-[#0A0A0E] px-4 text-center text-sm font-semibold text-white/70">
          Map failed to load. Please reload the page.
        </div>
      );
    }

    return this.props.children;
  }
}

function trackAnalytics(event: string, properties: Record<string, string | number | boolean | null>) {
  try {
    track(event, properties);
  } catch {
    // Analytics must never break the UI.
  }
}

type BusynessMapFilter = (typeof BUSYNESS_FILTERS)[number];

function getBusynessColor(pct: number | null): string {
  if (pct == null) return "#4F5567";
  if (pct <= 33) return "#5C6573";
  if (pct <= 66) return "#FFB020";
  return "#FF5B6A";
}

function hasLivePinPulse(venue: ConsumerVenue): boolean {
  return venue.signal?.busynessSource === "live";
}

function matchesCategoryFilter(venue: ConsumerVenue, filter: MapCategoryFilter) {
  if (filter === "All") return true;

  const category = venue.category.toLowerCase();
  if (filter === "Bars") return category.includes("bar");
  if (filter === "Clubs") return category.includes("club") || category.includes("night_club");
  if (filter === "Restaurants") return category.includes("restaurant") || category.includes("food");
  return category.includes("lounge");
}

function matchesBusynessFilter(venue: ConsumerVenue, filter: BusynessMapFilter) {
  if (filter === "All") return true;
  if (filter === "Busy") return (venue.signal?.busyness0To100 ?? -1) >= 50;
  return venue.signal?.busynessSource === "live";
}

function CityMapCenter({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, 15);
  }, [center, map]);

  return null;
}

function RecenterButton({ center }: { center: [number, number] }) {
  const map = useMap();

  return (
    <button
      type="button"
      aria-label="Recenter map"
      onClick={() => map.flyTo(center, 15)}
      className="fixed bottom-20 left-4 z-50 flex h-11 items-center gap-2 rounded-full bg-black/75 px-4 text-xs font-black uppercase tracking-[0.14em] text-white shadow-2xl backdrop-blur transition-colors hover:bg-black/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="7" />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      </svg>
      Recenter
    </button>
  );
}

function createVenueClusterIcon(cluster: L.MarkerCluster) {
  return L.divIcon({
    html: `<span>${cluster.getChildCount()}</span>`,
    className: "venue-cluster-icon",
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function createVenueClusterPin(venue: ConsumerVenue, selectedVenueId: string | null) {
  const isSelected = selectedVenueId === venue.id;
  const busyness = venue.signal?.busyness0To100 ?? null;
  const color = getBusynessColor(busyness);
  const size = isSelected ? 18 : 14;
  const pulse = hasLivePinPulse(venue);

  return L.divIcon({
    html: `<span class="${pulse ? "venue-pin-live-dot" : ""}" style="background:${color};"></span>`,
    className: `venue-cluster-pin${isSelected ? " venue-cluster-pin-selected" : ""}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, -(size / 2 + 8)],
  });
}

function createVenueTooltip(name: string) {
  const tooltip = document.createElement("span");
  tooltip.textContent = name;
  tooltip.style.fontSize = "12px";
  tooltip.style.fontWeight = "700";
  return tooltip;
}

function ClusteredVenueMarkers({
  venues,
  selectedVenueId,
  onVenueClick,
}: {
  venues: ConsumerVenue[];
  selectedVenueId: string | null;
  onVenueClick: (venue: ConsumerVenue) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      disableClusteringAtZoom: 15,
      iconCreateFunction: createVenueClusterIcon,
      maxClusterRadius: 60,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
    });

    clusterGroup.on("clusterclick", (event: L.LeafletEvent & { layer?: L.MarkerCluster }) => {
      const venueCount = event.layer?.getChildCount();
      if (typeof venueCount !== "number") return;
      trackAnalytics("map_cluster_expanded", { venue_count: venueCount });
    });

    venues.forEach((venue) => {
      const marker = L.marker([venue.lat, venue.lng], {
        alt: `${venue.name} map pin`,
        icon: createVenueClusterPin(venue, selectedVenueId),
        keyboard: true,
        title: venue.name,
      });

      marker.on("add", () => {
        const markerElement = marker.getElement();
        markerElement?.setAttribute("role", "button");
        markerElement?.setAttribute("aria-label", `Open ${venue.name} details`);
      });
      marker.bindTooltip(createVenueTooltip(venue.name), {
        direction: "top",
        offset: [0, -10],
        opacity: 0.95,
      });
      marker.on("click", () => onVenueClick(venue));
      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);
    return () => {
      map.removeLayer(clusterGroup);
    };
  }, [map, onVenueClick, selectedVenueId, venues]);

  return null;
}

function CitySelector({
  city,
  onCityChange,
}: {
  city: City;
  onCityChange: (cityId: CityId) => void;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(open, dialogRef, () => setOpen(false));

  function selectCity(cityId: CityId) {
    const nextCity = CITIES.find((option) => option.id === cityId);
    if (nextCity && nextCity.id !== city.id) {
      trackAnalytics("city_changed", {
        from_city: city.name,
        to_city: nextCity.name,
      });
    }
    onCityChange(cityId);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Choose neighborhood, currently ${city.name}`}
        onClick={() => setOpen(true)}
        className="absolute left-4 top-4 z-[1000] inline-flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border border-white/10 bg-black/75 px-3.5 py-2 text-sm font-black text-white shadow-2xl backdrop-blur transition-colors hover:bg-black/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      >
        <span className="truncate">{city.name}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-white/70" />
      </button>

      {open && (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-[1400]"
          role="dialog"
          aria-modal="true"
          aria-label="Choose map city"
          tabIndex={-1}
        >
          <button
            type="button"
            aria-label="Close city selector"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/55"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-white/[0.08] bg-[#0A0A0E] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-22px_70px_rgba(0,0,0,0.68)]">
            <div className="mx-auto h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
            <div className="mx-auto mt-4 flex w-full max-w-md items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-display text-base font-black text-white">Choose a neighborhood</h2>
                <p className="mt-1 truncate text-xs font-semibold text-white/45">Charlotte, NC</p>
              </div>
              <button
                type="button"
                aria-label="Close city selector"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/75 transition hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div className="mx-auto mt-4 flex w-full max-w-md flex-col gap-2">
              {CITIES.map((option) => {
                const isSelected = option.id === city.id;
                const comingSoon = "comingSoon" in option && option.comingSoon;

                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-current={isSelected ? "true" : undefined}
                    disabled={comingSoon}
                    onClick={() => !comingSoon && selectCity(option.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
                      comingSoon
                        ? "cursor-not-allowed border-white/[0.05] bg-white/[0.02] opacity-50"
                        : isSelected
                          ? "border-[#8B6CFF]/45 bg-[#8B6CFF]/15 text-white"
                          : "border-white/[0.08] bg-white/[0.04] text-white hover:bg-white/[0.07]"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black">{option.name}</span>
                      <span className="mt-1 block truncate text-xs font-semibold text-white/45">
                        {comingSoon ? "Coming soon" : option.city}
                      </span>
                    </span>
                    {isSelected && !comingSoon && <Check aria-hidden="true" className="h-5 w-5 shrink-0 text-[#8B6CFF]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ZipRecenterControl() {
  const map = useMap();
  const [zip, setZip] = useState("");
  const [showInvalid, setShowInvalid] = useState(false);
  const invalidTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (invalidTimerRef.current) {
        clearTimeout(invalidTimerRef.current);
      }
    };
  }, []);

  function flashInvalid() {
    setShowInvalid(true);
    if (invalidTimerRef.current) {
      clearTimeout(invalidTimerRef.current);
    }
    invalidTimerRef.current = setTimeout(() => setShowInvalid(false), 2500);
  }

  function recenterForZip(nextZip: string) {
    const normalizedZip = nextZip.trim();
    const center = CHARLOTTE_ZIP_CENTERS[normalizedZip];
    if (!CHARLOTTE_AREA_ZIP_PATTERN.test(normalizedZip) || !center) {
      flashInvalid();
      return;
    }
    trackAnalytics("zip_recenter", { zip: normalizedZip });
    setShowInvalid(false);
    map.setView(center, 14, {
      animate: true,
      duration: 0.7,
    });
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextZip = event.target.value.replace(/\D/g, "").slice(0, 5);
    setZip(nextZip);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    recenterForZip(zip);
  }

  function clearZip() {
    setZip("");
    setShowInvalid(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      className="absolute left-4 top-16 z-[1000] w-[min(13rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-black/75 p-2 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center gap-2">
        <input
          aria-label="Charlotte zip"
          inputMode="numeric"
          maxLength={5}
          onChange={handleChange}
          pattern="[0-9]*"
          placeholder="Zip"
          type="text"
          value={zip}
          className={`h-9 min-w-0 flex-1 rounded-full border bg-white/[0.06] px-3 text-sm font-bold text-white shadow-inner placeholder:text-white/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
            showInvalid ? "border-red-500" : "border-white/10"
          }`}
        />
        {zip.length > 0 && (
          <button
            type="button"
            aria-label="Clear zip code"
            onClick={clearZip}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/70 transition hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
        <button
          type="submit"
          className="h-9 shrink-0 rounded-full bg-[#8B6CFF] px-3 text-xs font-black text-[#0A0A0E] transition hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          Go
        </button>
      </div>
      {showInvalid && (
        <p role="status" className="mt-2 px-1 text-xs font-bold text-[#FF6B9A]">
          Enter a Charlotte zip code
        </p>
      )}
    </form>
  );
}

function VenueSearchControl({
  onVenueSelect,
  searchQuery,
  setSearchQuery,
  venues,
}: {
  onVenueSelect: (venue: ConsumerVenue) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  venues: ConsumerVenue[];
}) {
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!normalizedSearchQuery) return [];
    return venues.filter((venue) => venue.name.toLowerCase().includes(normalizedSearchQuery)).slice(0, 6);
  }, [normalizedSearchQuery, venues]);
  const showDropdown = isDropdownOpen && normalizedSearchQuery.length > 0;

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [normalizedSearchQuery]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current || containerRef.current.contains(event.target as Node)) return;
      setIsDropdownOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  function selectSuggestion(venue: ConsumerVenue) {
    setSearchQuery(venue.name);
    setIsDropdownOpen(false);
    trackAnalytics("search_suggestion_clicked", { venue_id: venue.id });
    onVenueSelect(venue);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!showDropdown && event.key !== "Escape") return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsDropdownOpen(true);
      setActiveSuggestionIndex((currentIndex) => {
        if (suggestions.length === 0) return 0;
        return (currentIndex + 1) % suggestions.length;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsDropdownOpen(true);
      setActiveSuggestionIndex((currentIndex) => {
        if (suggestions.length === 0) return 0;
        return (currentIndex - 1 + suggestions.length) % suggestions.length;
      });
      return;
    }

    if (event.key === "Enter") {
      if (!showDropdown || suggestions.length === 0) return;
      event.preventDefault();
      selectSuggestion(suggestions[activeSuggestionIndex] ?? suggestions[0]);
      return;
    }

    if (event.key === "Escape") {
      setIsDropdownOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="absolute left-1/2 top-14 z-[500] w-52 -translate-x-1/2">
      <input aria-label="Search venues"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
        onChange={(event) => {
          setSearchQuery(event.target.value);
          setIsDropdownOpen(true);
        }}
        onClick={(event) => event.stopPropagation()}
        onFocus={() => setIsDropdownOpen(true)}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        placeholder="Search venues..."
        type="search"
        value={searchQuery}
        className="w-full rounded-full border border-white/10 bg-black/70 px-3 py-1.5 pr-9 text-sm text-white shadow-2xl backdrop-blur placeholder:text-white/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {searchQuery.length > 0 && (
        <button
          type="button"
          aria-label="Clear venue search"
          onClick={(event) => {
            event.stopPropagation();
            setSearchQuery("");
            setIsDropdownOpen(false);
          }}
          onMouseDown={(event) => event.stopPropagation()}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-lg leading-none text-white/65 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          ×
        </button>
      )}
      {showDropdown && (
        <div
          role="listbox"
          aria-label="Venue suggestions"
          className="absolute top-full z-50 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#111118] shadow-xl"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {suggestions.length > 0 ? (
            suggestions.map((venue, index) => {
              const isActive = index === activeSuggestionIndex;

              return (
                <button
                  key={venue.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => selectSuggestion(venue)}
                  onMouseEnter={() => setActiveSuggestionIndex(index)}
                  className={`block w-full cursor-pointer px-4 py-3 text-left transition-colors hover:bg-white/[0.06] ${
                    isActive ? "bg-white/[0.08]" : ""
                  }`}
                >
                  <span className="block truncate text-sm font-bold text-white">{venue.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-white/40">{venue.category}</span>
                </button>
              );
            })
          ) : (
            <div className="px-4 py-3 text-xs text-white/35">No venues found</div>
          )}
        </div>
      )}
    </div>
  );
}

function BusynessFilterBar({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: BusynessMapFilter;
  onFilterChange: (filter: BusynessMapFilter) => void;
}) {
  return (
    <div
      aria-label="Map busyness filter"
      className="absolute right-4 top-28 z-[1000] flex max-w-[calc(100vw-2rem)] gap-1 rounded-full border border-white/10 bg-[#1A1A2E]/80 p-1 shadow-2xl backdrop-blur sm:top-16"
      role="group"
    >
      {BUSYNESS_FILTERS.map((filter) => {
        const isActive = activeFilter === filter;

        return (
          <button
            key={filter}
            type="button"
            aria-pressed={isActive}
            onClick={() => onFilterChange(filter)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
              isActive ? "bg-[#8B6CFF] shadow-[0_0_16px_rgba(139,108,255,0.35)]" : "text-white/70 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            {filter}
          </button>
        );
      })}
    </div>
  );
}

function CategoryFilterPills({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: MapCategoryFilter;
  onFilterChange: (filter: MapCategoryFilter) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[7.5rem] z-[1000] sm:top-[6.25rem]">
      <div
        aria-label="Map category filter"
        className="pointer-events-auto flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
      >
        {CATEGORY_FILTERS.map((filter) => {
          const isActive = activeFilter === filter;

          return (
            <button
              key={filter}
              type="button"
              aria-pressed={isActive}
              onClick={() => onFilterChange(filter)}
              className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black shadow-2xl backdrop-blur transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
                isActive
                  ? "border-[#00F5D4]/45 bg-[#00F5D4] text-[#061013] shadow-[0_0_18px_rgba(0,245,212,0.25)]"
                  : "border-white/10 bg-black/70 text-white/75 hover:bg-black/90 hover:text-white"
              }`}
            >
              {filter}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FilterFab({
  hasActiveFilters,
  onClick,
}: {
  hasActiveFilters: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Filter venues"
      onClick={onClick}
      className="fixed bottom-44 right-4 z-[1050] flex h-12 w-12 items-center justify-center rounded-full border border-[#8B6CFF]/30 bg-[#8B6CFF]/15 text-[#8B6CFF] shadow-[0_0_20px_rgba(139,108,255,0.22)] backdrop-blur transition hover:bg-[#8B6CFF]/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
        <path d="M4 7h4" />
        <path d="M14 7h6" />
        <circle cx="11" cy="7" r="2" />
        <path d="M4 12h10" />
        <path d="M20 12h0" />
        <circle cx="17" cy="12" r="2" />
        <path d="M4 17h7" />
        <path d="M17 17h3" />
        <circle cx="14" cy="17" r="2" />
      </svg>
      {hasActiveFilters && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border border-[#0A0A0E] bg-[#F0568C] shadow-[0_0_10px_rgba(240,86,140,0.7)]"
        />
      )}
    </button>
  );
}

function VenueFilterSheet({
  activeCategoryFilter,
  isOpen,
  onApply,
  onClose,
  openNowFilter,
}: {
  activeCategoryFilter: MapCategoryFilter;
  isOpen: boolean;
  onApply: (category: MapCategoryFilter, openNow: boolean) => void;
  onClose: () => void;
  openNowFilter: boolean;
}) {
  const haptic = useHaptic();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [draftCategory, setDraftCategory] = useState<MapCategoryFilter>(activeCategoryFilter);
  const [draftOpenNow, setDraftOpenNow] = useState(openNowFilter);

  useFocusTrap(isOpen, dialogRef, onClose);

  useEffect(() => {
    if (!isOpen) return;
    setDraftCategory(activeCategoryFilter);
    setDraftOpenNow(openNowFilter);
  }, [activeCategoryFilter, isOpen, openNowFilter]);

  if (!isOpen) return null;

  const openNowActiveClass = draftOpenNow ? "bg-[#8B6CFF] text-[#0A0A0E]" : "bg-white/[0.06] text-white/60";

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[1500]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="venue-filter-title"
      tabIndex={-1}
    >
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[60vh] overflow-y-auto rounded-t-2xl bg-[#111118] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-22px_70px_rgba(0,0,0,0.68)]">
        <div className="mx-auto h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
        <div className="mx-auto mt-4 w-full max-w-xl">
          <div className="flex items-center justify-between gap-4">
            <h2 id="venue-filter-title" className="font-display text-base font-bold text-white">
              Filter Venues
            </h2>
            <button
              type="button"
              aria-label="Close filters"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/75 transition hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          <section className="mt-6" aria-labelledby="venue-filter-category">
            <h3 id="venue-filter-category" className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
              Category
            </h3>
            <div className="-mx-4 mt-3 flex overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CATEGORY_FILTERS.map((filter) => {
                const isActive = draftCategory === filter;

                return (
                  <button
                    key={filter}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      haptic.light();
                      setDraftCategory(filter);
                    }}
                    className={`mr-2 shrink-0 rounded-full px-4 py-2 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
                      isActive ? "bg-[#8B6CFF] text-[#0A0A0E]" : "bg-white/[0.06] text-white/60 hover:bg-white/[0.09] hover:text-white/75"
                    }`}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-6" aria-labelledby="venue-filter-status">
            <h3 id="venue-filter-status" className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
              Status
            </h3>
            <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl bg-white/[0.04] p-3">
              <span className="text-sm font-bold text-white">Open Now</span>
              <button
                type="button"
                aria-pressed={draftOpenNow}
                onClick={() => setDraftOpenNow((current) => !current)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${openNowActiveClass}`}
              >
                Open Now
              </button>
            </div>
          </section>

          <button
            type="button"
            onClick={() => onApply(draftCategory, draftOpenNow)}
            className="mt-6 h-12 w-full rounded-full bg-[#8B6CFF] text-sm font-black text-[#0A0A0E] shadow-[0_0_20px_rgba(139,108,255,0.32)] transition hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111118]"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export function VenueMap({
  city,
  onCityChange,
}: {
  city: City;
  onCityChange: (cityId: CityId) => void;
}) {
  const haptic = useHaptic();
  const [venues, setVenues] = useState<ConsumerVenue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [detailVenueId, setDetailVenueId] = useState<string | null>(null);
  const [sheetSnap, setSheetSnap] = useState<MapSheetSnap>("collapsed");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<MapCategoryFilter>("All");
  const [activeBusynessFilter, setActiveBusynessFilter] = useState<BusynessMapFilter>("All");
  const [openNowFilter, setOpenNowFilter] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [slowLoad, setSlowLoad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUserOutsideLaunchZone, setIsUserOutsideLaunchZone] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const mapViewportStyle = getMapViewportStyle();
  const cityCenter = useMemo<[number, number]>(() => [city.lat, city.lng], [city.lat, city.lng]);

  const fetchVenues = useCallback(async (signal?: AbortSignal, { showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) setLoading(true);
    setError(null);

    const controller = new AbortController();
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, VENUE_FETCH_TIMEOUT_MS);
    const handleAbort = () => controller.abort();
    signal?.addEventListener("abort", handleAbort, { once: true });

    try {
      const res = await fetch("/api/venues", { signal: controller.signal });
      if (!res.ok) throw new Error(`Venue fetch failed: ${res.status}`);
      const json = (await res.json()) as APIResponse<{ venues: ConsumerVenue[] }>;
      const nextVenues = json.data?.venues ?? [];
      clearTimeout(timeoutId);
      setVenues(nextVenues);
      window.dispatchEvent(new CustomEvent<string[]>(EXPLORE_VENUES_EVENT, {
        detail: nextVenues.map((venue) => venue.id),
      }));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (!didTimeout) return;
        setVenues([]);
        setError("Loading took too long — tap to retry.");
        return;
      }
      setVenues([]);
      setError("Couldn't load venues. Check your connection and tap to retry.");
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", handleAbort);
      if ((!signal?.aborted || didTimeout) && showLoading) {
        setLoading(false);
      }
    }
  }, []);

  const refreshVisibleVenues = useCallback(async () => {
    await fetchVenues(undefined, { showLoading: false });
  }, [fetchVenues]);

  const { pulling, refreshing } = usePullToRefresh(refreshVisibleVenues);

  useEffect(() => {
    const controller = new AbortController();
    void fetchVenues(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchVenues]);

  useEffect(() => {
    if (!loading) {
      setSlowLoad(false);
      return;
    }

    const timeoutId = setTimeout(() => setSlowLoad(true), SLOW_LOAD_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [loading]);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsUserOutsideLaunchZone(!inZone(position.coords.latitude, position.coords.longitude));
      },
      () => undefined,
      { maximumAge: 5 * 60 * 1000, timeout: 8000 },
    );
  }, []);

  const visibleVenues = useMemo(
    () => venues.filter((venue) => venue.zoneId === city.zoneId && Number.isFinite(venue.lat) && Number.isFinite(venue.lng)),
    [city.zoneId, venues],
  );
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredVenues = useMemo(() => {
    return visibleVenues.filter((venue) => {
      const matchesSearch = !normalizedSearchQuery || venue.name.toLowerCase().includes(normalizedSearchQuery);
      const matchesOpenNow = !openNowFilter || venue.openNow === true;
      return matchesSearch && matchesOpenNow && matchesCategoryFilter(venue, activeCategoryFilter) && matchesBusynessFilter(venue, activeBusynessFilter);
    });
  }, [activeBusynessFilter, activeCategoryFilter, normalizedSearchQuery, openNowFilter, visibleVenues]);
  const showSearchCount = normalizedSearchQuery.length > 0 && filteredVenues.length < visibleVenues.length;
  const showEmptyState = !loading && !error && visibleVenues.length === 0;
  const hasActiveFilters = activeCategoryFilter !== "All" || activeBusynessFilter !== "All" || openNowFilter;
  const detailVenue = useMemo(
    () => (detailVenueId ? venues.find((venue) => venue.id === detailVenueId) ?? null : null),
    [detailVenueId, venues],
  );

  useEffect(() => {
    if (!selectedVenueId) return;
    if (filteredVenues.some((venue) => venue.id === selectedVenueId)) return;
    setSelectedVenueId(null);
    setDetailVenueId(null);
  }, [filteredVenues, selectedVenueId]);

  const selectVenueFromList = useCallback((venue: ConsumerVenue) => {
    haptic.light();
    setSelectedVenueId(venue.id);
    setSheetSnap("mid");
    mapRef.current?.flyTo([venue.lat, venue.lng], Math.max(mapRef.current.getZoom(), 16), {
      animate: true,
      duration: 0.5,
    });
  }, [haptic]);

  const selectVenueFromSearch = useCallback((venue: ConsumerVenue) => {
    setActiveCategoryFilter("All");
    setActiveBusynessFilter("All");
    setOpenNowFilter(false);
    selectVenueFromList(venue);
  }, [selectVenueFromList]);

  const selectVenueFromMap = useCallback((venue: ConsumerVenue) => {
    haptic.light();
    trackAnalytics("map_pin_tapped", { venueId: venue.id });
    setSelectedVenueId(venue.id);
    setDetailVenueId(venue.id);
    setSheetSnap("mid");
  }, [haptic]);

  return (
    <main
      className="relative w-full overflow-hidden bg-[#0A0A0E]"
      style={mapViewportStyle}
    >
      {(pulling || refreshing) && (
        <div
          className="pointer-events-none fixed left-0 right-0 top-0 z-[1200] flex justify-center px-4 pt-3"
          role={refreshing ? "status" : undefined}
          aria-live="polite"
        >
          <div className="rounded-full border border-white/10 bg-black/75 px-4 py-2 text-xs font-black text-white/55 shadow-2xl backdrop-blur">
            {refreshing ? (
              <span className="flex items-center gap-2">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#8B6CFF] border-t-transparent" aria-hidden="true" />
                <span className="sr-only">Refreshing map venues...</span>
              </span>
            ) : (
              "Pull to refresh"
            )}
          </div>
        </div>
      )}

      <MapErrorBoundary>
        <MapContainer
          ref={mapRef}
          center={cityCenter}
          zoom={15}
          scrollWheelZoom={false}
          style={{ ...mapViewportStyle, width: "100%" }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <CityMapCenter center={cityCenter} />
          <ZipRecenterControl />
          <VenueSearchControl
            onVenueSelect={selectVenueFromSearch}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            venues={visibleVenues}
          />
          <RecenterButton center={cityCenter} />

          <ClusteredVenueMarkers venues={filteredVenues} selectedVenueId={selectedVenueId} onVenueClick={selectVenueFromMap} />
        </MapContainer>
      </MapErrorBoundary>

      <CitySelector city={city} onCityChange={onCityChange} />
      <BusynessFilterBar activeFilter={activeBusynessFilter} onFilterChange={setActiveBusynessFilter} />
      <CategoryFilterPills activeFilter={activeCategoryFilter} onFilterChange={setActiveCategoryFilter} />
      <FilterFab hasActiveFilters={hasActiveFilters} onClick={() => setIsFilterSheetOpen(true)} />

      <VenueFilterSheet
        activeCategoryFilter={activeCategoryFilter}
        isOpen={isFilterSheetOpen}
        onApply={(category, openNow) => {
          setActiveCategoryFilter(category);
          setOpenNowFilter(openNow);
          setIsFilterSheetOpen(false);
        }}
        onClose={() => setIsFilterSheetOpen(false)}
        openNowFilter={openNowFilter}
      />

      {showSearchCount && (
        <div className="pointer-events-none absolute right-4 top-4 z-[1000] rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-xs font-black text-white/75 shadow-2xl backdrop-blur">
          Showing {filteredVenues.length} of {visibleVenues.length}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-20 left-1/2 z-[1000] flex -translate-x-1/2 gap-3 whitespace-nowrap rounded-full border border-white/10 bg-black/70 px-4 py-2 text-xs font-bold text-white/70 shadow-2xl backdrop-blur-sm">
        <span>
          <span style={{ color: getBusynessState(100).color }}>●</span> Packed
        </span>
        <span>
          <span style={{ color: getBusynessState(50).color }}>●</span> Moderate
        </span>
        <span>
          <span style={{ color: getBusynessState(0).color }}>●</span> Quiet
        </span>
      </div>

      {loading && (
        <div className="pointer-events-none absolute inset-0 z-[1000]">
          <MapLoadingSkeleton className="h-full" style={{ height: "100%", minHeight: "100%" }} />
          {slowLoad && (
            <p className="absolute inset-x-0 bottom-28 text-center text-xs font-semibold text-white/40">
              Taking longer than usual...
            </p>
          )}
        </div>
      )}

      {showEmptyState && (
        <div className="pointer-events-none absolute inset-x-0 bottom-44 z-[999] flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-xs rounded-2xl border border-white/10 bg-black/80 px-5 py-4 text-center text-white shadow-2xl backdrop-blur">
            <p className="text-sm font-black">{city.name} — coming soon</p>
            <p className="mt-1 text-xs font-semibold text-white/55">We&apos;re live in South End Charlotte right now.</p>
            <button
              type="button"
              onClick={() => onCityChange("south-end-clt")}
              className="mt-3 inline-flex items-center justify-center rounded-full bg-[#8B6CFF] px-4 py-2 text-xs font-black text-[#0A0A0E] shadow-[0_0_14px_rgba(139,108,255,0.28)] transition hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              Go to South End
            </button>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center px-4">
          <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-black/70 px-6 py-4 text-center text-white shadow-2xl backdrop-blur">
            <h2 className="font-display text-base font-black">Couldn&apos;t load spots</h2>
            <p className="mt-2 text-sm font-semibold text-white/70">{error}</p>
            <button
              type="button"
              onClick={() => void fetchVenues()}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-[#8B6CFF] px-5 py-2.5 text-sm font-black text-[#0A0A0E] shadow-[0_0_18px_rgba(139,108,255,0.32)] transition hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Retry
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 block w-full text-xs font-semibold text-white/45 underline underline-offset-4 transition hover:text-white/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              Reload page
            </button>
          </div>
        </div>
      )}

      <Link
        href="/vibe-check"
        className="fixed bottom-28 right-4 z-[1000] rounded-full bg-[#8B6CFF] px-5 py-3 font-black text-[#0A0A0E] shadow-[0_0_20px_rgba(139,108,255,0.5)] transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      >
        ＋ Report Vibe
      </Link>

      <MapBottomSheet
        cityName={city.name}
        launchZoneNotice={isUserOutsideLaunchZone ? OUT_OF_ZONE_GEO_MESSAGE : null}
        loading={loading}
        onVenueSelect={selectVenueFromList}
        selectedVenueId={selectedVenueId}
        setSnap={setSheetSnap}
        snap={sheetSnap}
        venues={filteredVenues}
      />

      <VenueBottomSheet
        loading={detailVenueId !== null && !detailVenue}
        venue={detailVenue}
        onClose={() => setDetailVenueId(null)}
      />

      <style jsx global>{`
        .venue-pin-packed {
          filter: drop-shadow(0 0 0 rgba(248, 113, 113, 0.35)) drop-shadow(0 0 12px rgba(248, 113, 113, 0.5));
        }

        .venue-pin-moderate {
          filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.4));
        }

        .venue-pin-quiet {
          filter: drop-shadow(0 0 8px rgba(92, 101, 115, 0.38));
        }

        .venue-pin-live-dot {
          box-shadow: 0 0 0 3px rgba(255, 91, 106, 0.22), 0 0 14px rgba(255, 176, 32, 0.3);
          display: block;
          position: relative;
        }

        .venue-pin-live-dot::after {
          animation: venue-pin-live-source-pulse 1.65s ease-out infinite;
          border: 2px solid rgba(255, 91, 106, 0.62);
          border-radius: inherit;
          box-shadow: 0 0 16px rgba(255, 176, 32, 0.34);
          content: "";
          inset: -6px;
          position: absolute;
        }

        @keyframes venue-pin-live-source-pulse {
          0% {
            opacity: 0.72;
            transform: scale(0.82);
          }

          70% {
            opacity: 0;
            transform: scale(1.55);
          }

          100% {
            opacity: 0;
            transform: scale(1.55);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .venue-pin-live-dot::after {
            animation: none !important;
          }
        }

        .venue-cluster-icon {
          align-items: center;
          background: #0a0a0e;
          border: 2px solid rgba(255, 255, 255, 0.82);
          border-radius: 9999px;
          box-shadow: 0 0 24px rgba(0, 245, 212, 0.34), 0 10px 30px rgba(0, 0, 0, 0.52);
          color: #ffffff;
          display: flex;
          font-size: 14px;
          font-weight: 900;
          justify-content: center;
          line-height: 1;
        }

        .venue-cluster-pin {
          align-items: center;
          border: 1.5px solid rgba(255, 255, 255, 0.15);
          border-radius: 9999px;
          display: flex;
          justify-content: center;
        }

        .venue-cluster-pin > span {
          border-radius: 9999px;
          display: block;
          height: 100%;
          width: 100%;
        }

        .venue-cluster-pin-selected {
          border-color: #00f5d4;
          border-width: 3px;
        }
      `}</style>
    </main>
  );
}

export default VenueMap;
