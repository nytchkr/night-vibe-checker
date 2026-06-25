"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import L from "leaflet";
import type { Map as LeafletMap } from "leaflet";
import "leaflet.markercluster";
import { track } from "@vercel/analytics";
import { Check, ChevronDown, MapPin, RefreshCw, Search, X } from "lucide-react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { getBusynessState } from "@/lib/busyness";
import { CITIES } from "@/lib/cities";
import { inZone } from "@/lib/zone";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useHaptic } from "@/hooks/useHaptic";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { getMapViewportStyle, MapLoadingSkeleton } from "@/components/MapLoadingSkeleton";
import { fetchTrendingVenueIds } from "@/lib/trendingVenueIds";
import { useDevice } from "@/lib/useDevice";
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
  "28202": [35.2271, -80.8433],
  "28203": [35.2126, -80.8598],
  "28204": [35.2208, -80.8325],
  "28205": [35.2267, -80.8183],
  "28206": [35.2567, -80.827],
  "28207": [35.2051, -80.8299],
  "28208": [35.2257, -80.8765],
  "28209": [35.1873, -80.8598],
  "28210": [35.1567, -80.8598],
  "28211": [35.2123, -80.8098],
  "28212": [35.2001, -80.7932],
  "28213": [35.2876, -80.8098],
  "28214": [35.2567, -80.9265],
  "28216": [35.3123, -80.8765],
  "28217": [35.1765, -80.8765],
  "28269": [35.3567, -80.8098],
};

const OUT_OF_ZONE_GEO_MESSAGE = "You're outside our launch zone. Showing South End Charlotte.";
const VENUE_FETCH_TIMEOUT_MS = 10_000;
const SLOW_LOAD_DELAY_MS = 5_000;
const SOUTH_END_MAP_CENTER: [number, number] = [35.2178, -80.8597];
const MAP_DEFAULT_ZOOM = 15;
const MAP_CLUSTER_MAX_ZOOM = 14;
const MAP_CLUSTER_RADIUS = 50;

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

function useSwipeDownToClose(isOpen: boolean, onClose: () => void) {
  const dragRef = useRef({ pointerId: -1, startY: 0, currentY: 0 });

  return {
    onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
      if (!isOpen) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { pointerId: event.pointerId, startY: event.clientY, currentY: event.clientY };
    },
    onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
      if (dragRef.current.pointerId !== event.pointerId) return;
      dragRef.current.currentY = event.clientY;
    },
    onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
      if (dragRef.current.pointerId !== event.pointerId) return;
      const draggedDown = dragRef.current.currentY - dragRef.current.startY;
      dragRef.current.pointerId = -1;
      if (draggedDown > 80) onClose();
    },
    onPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
      if (dragRef.current.pointerId !== event.pointerId) return;
      dragRef.current.pointerId = -1;
    },
  };
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
  const nameLower = venue.name.toLowerCase();
  if (filter === "Bars") return category.includes("bar") && !nameLower.includes("lounge") && !nameLower.includes("rooftop") && !nameLower.includes("sky bar");
  if (filter === "Clubs") return category.includes("club") || category.includes("night_club");
  if (filter === "Restaurants") return category.includes("restaurant") || category.includes("food");
  // Lounges: category says "lounge", OR bar venue with lounge/rooftop in name
  return category.includes("lounge") || nameLower.includes("lounge") || nameLower.includes("rooftop") || nameLower.includes("sky bar");
}

function matchesBusynessFilter(venue: ConsumerVenue, filter: BusynessMapFilter) {
  if (filter === "All") return true;
  if (filter === "Busy") return (venue.signal?.busyness0To100 ?? -1) >= 50;
  return venue.signal?.busynessSource === "live";
}

function resetMapView(map: LeafletMap, center: [number, number], { animate = false }: { animate?: boolean } = {}) {
  map.setView(center, MAP_DEFAULT_ZOOM, {
    animate,
    duration: animate ? 0.35 : undefined,
  });

  window.setTimeout(() => map.invalidateSize({ pan: false }), 0);
  window.setTimeout(() => map.invalidateSize({ pan: false }), 250);
}

function CityMapCenter({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    resetMapView(map, center);

    function resetVisibleMap() {
      if (document.visibilityState === "hidden") return;
      resetMapView(map, center);
    }

    window.addEventListener("pageshow", resetVisibleMap);
    window.addEventListener("focus", resetVisibleMap);
    document.addEventListener("visibilitychange", resetVisibleMap);

    return () => {
      window.removeEventListener("pageshow", resetVisibleMap);
      window.removeEventListener("focus", resetVisibleMap);
      document.removeEventListener("visibilitychange", resetVisibleMap);
    };
  }, [center, map]);

  return null;
}

function RecenterButton({ center }: { center: [number, number] }) {
  const map = useMap();

  return (
    <button
      type="button"
      aria-label="Recenter to South End"
      onClick={() => map.flyTo(center, MAP_DEFAULT_ZOOM)}
      className="fixed bottom-20 left-4 z-50 flex h-11 items-center gap-2 rounded-[14px] border border-white/[0.08] bg-[#0A0A0E]/90 px-4 text-xs font-semibold text-[#F4F5F8] shadow-2xl backdrop-blur transition-colors hover:bg-[#101017] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 lg:bottom-6"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="7" />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      </svg>
      South End
    </button>
  );
}

function createVenueClusterIcon(cluster: L.MarkerCluster) {
  const count = cluster.getChildCount();
  const size = count < 5 ? 40 : count < 20 ? 56 : 72;

  return L.divIcon({
    html: `<span>${count}</span>`,
    className: "venue-cluster-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createVenueClusterPin(venue: ConsumerVenue, selectedVenueId: string | null, isTrending: boolean) {
  const isSelected = selectedVenueId === venue.id;
  const busyness = venue.signal?.busyness0To100 ?? null;
  const color = getBusynessColor(busyness);
  const dotSize = isSelected ? 18 : 14;
  const pulse = hasLivePinPulse(venue);

  return L.divIcon({
    html: `<span class="${pulse ? "venue-pin-live-dot" : ""}" style="--venue-pin-color:${color}; --venue-pin-dot-size:${dotSize}px; background:${color};"></span>`,
    className: `venue-cluster-pin${isSelected ? " venue-cluster-pin-selected" : ""}${isTrending ? " venue-cluster-pin-trending" : ""}`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    tooltipAnchor: [0, -30],
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
  trendingVenueIds,
  onVenueClick,
}: {
  venues: ConsumerVenue[];
  selectedVenueId: string | null;
  trendingVenueIds: Set<string>;
  onVenueClick: (venue: ConsumerVenue) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      disableClusteringAtZoom: MAP_CLUSTER_MAX_ZOOM + 1,
      iconCreateFunction: createVenueClusterIcon,
      maxClusterRadius: MAP_CLUSTER_RADIUS,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: false,
    });

    clusterGroup.on("clusterclick", (event: L.LeafletEvent & { layer?: L.MarkerCluster }) => {
      const cluster = event.layer;
      const venueCount = cluster?.getChildCount();
      if (typeof venueCount !== "number") return;
      trackAnalytics("map_cluster_expanded", { venue_count: venueCount });

      const currentZoom = map.getZoom();
      const maxZoom = map.getMaxZoom();
      const targetZoom = Number.isFinite(maxZoom) ? Math.min(currentZoom + 2, maxZoom) : currentZoom + 2;

      map.flyTo(cluster.getLatLng(), targetZoom, {
        animate: true,
        duration: 0.45,
      });
    });

    venues.forEach((venue) => {
      const marker = L.marker([venue.lat, venue.lng], {
        alt: `${venue.name} map pin`,
        icon: createVenueClusterPin(venue, selectedVenueId, trendingVenueIds.has(venue.id)),
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
  }, [map, onVenueClick, selectedVenueId, trendingVenueIds, venues]);

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
  const swipeHandlers = useSwipeDownToClose(open, () => setOpen(false));

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
        className="absolute left-4 top-4 z-[1000] inline-flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-[14px] border border-white/[0.08] bg-[#0A0A0E]/90 px-3.5 py-2 text-sm font-semibold text-[#F4F5F8] shadow-2xl backdrop-blur transition-colors hover:bg-[#101017] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
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
          <div
            className="absolute inset-x-0 bottom-0 touch-pan-y overscroll-contain rounded-t-[18px] border-t border-white/[0.08] bg-[#0A0A0E] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-22px_70px_rgba(0,0,0,0.68)]"
            {...swipeHandlers}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
            <div className="mx-auto mt-4 flex w-full max-w-md items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold text-[#F4F5F8]">Choose a neighborhood</h2>
                <p className="mt-1 truncate text-xs font-semibold text-[#9CA2AE]">Charlotte, NC</p>
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
                      <span className="mt-1 block truncate text-xs font-semibold text-white/55">
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

  function recenterForZip(nextZip: string) {
    const normalizedZip = nextZip.trim();
    const center = CHARLOTTE_ZIP_CENTERS[normalizedZip];
    if (!center) {
      setShowInvalid(true);
      return;
    }
    trackAnalytics("zip_recenter", { zip: normalizedZip });
    setShowInvalid(false);
    map.setView(center, map.getZoom(), {
      animate: true,
      duration: 0.7,
    });
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextZip = event.target.value.replace(/\D/g, "").slice(0, 5);
    setZip(nextZip);
    setShowInvalid(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    recenterForZip(zip);
  }

  return (
    <form
      onSubmit={handleSubmit}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      className="absolute left-4 top-16 z-[1000] w-[min(15.5rem,calc(100vw-2rem))]"
    >
      <div
        className={`flex h-11 items-center rounded-[14px] border bg-white/[0.035] px-3 shadow-2xl backdrop-blur transition-colors ${
          showInvalid ? "border-[#FF5B6A]/70" : "border-white/[0.08]"
        } focus-within:ring-2 focus-within:ring-[#8B6CFF]/70`}
      >
        <input
          aria-describedby={showInvalid ? "zip-recenter-error" : undefined}
          aria-invalid={showInvalid}
          aria-label="Search by zip"
          inputMode="numeric"
          maxLength={5}
          onChange={handleChange}
          pattern="[0-9]*"
          placeholder="Search by zip..."
          type="text"
          value={zip}
          className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold text-[#F4F5F8] outline-none placeholder:text-[#9CA2AE]"
        />
        <button
          type="submit"
          aria-label="Search zip"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] text-[#F4F5F8] transition-colors hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          <Search aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {showInvalid && (
        <p id="zip-recenter-error" role="status" className="mt-2 px-3 text-xs font-bold text-[#FF6B9A]">
          Not live in your area yet
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
        className="w-full rounded-[14px] border border-white/[0.08] bg-[#0A0A0E]/90 px-3 py-1.5 pr-9 text-base text-[#F4F5F8] shadow-2xl backdrop-blur placeholder:text-[#9CA2AE] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 [&::-webkit-search-cancel-button]:appearance-none"
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
          className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-lg leading-none text-white/65 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          ×
        </button>
      )}
      {showDropdown && (
        <div
          role="listbox"
          aria-label="Venue suggestions"
          className="absolute top-full z-50 mt-2 w-full overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#0A0A0E] shadow-xl"
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
                  <span className="mt-0.5 block truncate text-xs text-white/55">{venue.category}</span>
                </button>
              );
            })
          ) : (
            <div className="px-4 py-3 text-xs text-white/55">No venues found</div>
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
      className="scroll-touch absolute right-4 top-28 z-[1000] flex max-w-[calc(100vw-2rem)] gap-1 overflow-x-auto whitespace-nowrap rounded-[14px] border border-white/[0.08] bg-[#0A0A0E]/90 p-1 shadow-2xl backdrop-blur [scrollbar-width:none] sm:top-16 [&::-webkit-scrollbar]:hidden"
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
        className="scroll-touch pointer-events-auto flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                  ? "border-[#8B6CFF] bg-[#8B6CFF] text-[#0A0A0E] shadow-[0_0_18px_rgba(139,108,255,0.25)]"
                  : "border-white/[0.08] bg-[#0A0A0E]/90 text-[#9CA2AE] hover:bg-[#101017] hover:text-[#F4F5F8]"
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
  const swipeHandlers = useSwipeDownToClose(isOpen, onClose);
  const [draftCategory, setDraftCategory] = useState<MapCategoryFilter>(activeCategoryFilter);
  const [draftOpenNow, setDraftOpenNow] = useState(openNowFilter);

  useFocusTrap(isOpen, dialogRef, onClose);

  useEffect(() => {
    if (!isOpen) return;
    setDraftCategory(activeCategoryFilter);
    setDraftOpenNow(openNowFilter);
  }, [activeCategoryFilter, isOpen, openNowFilter]);

  if (!isOpen) return null;

  const openNowActiveClass = draftOpenNow ? "bg-[#8B6CFF] text-[#0A0A0E]" : "bg-white/[0.06] text-white/65";
  const closeWithHaptic = () => {
    haptic.light();
    onClose();
  };
  const applyWithHaptic = () => {
    haptic.light();
    onApply(draftCategory, draftOpenNow);
  };

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
        onClick={closeWithHaptic}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />
      <div
        className="bottom-sheet scroll-touch gpu-layer absolute inset-x-0 bottom-0 max-h-[60vh] touch-pan-y overflow-y-auto overscroll-contain rounded-t-[18px] bg-[#0A0A0E] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-22px_70px_rgba(0,0,0,0.68)]"
        {...swipeHandlers}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
        <div className="mx-auto mt-4 w-full max-w-xl">
          <div className="flex items-center justify-between gap-4">
            <h2 id="venue-filter-title" className="font-display text-base font-semibold text-[#F4F5F8]">
              Filter venues
            </h2>
            <button
              type="button"
              aria-label="Close filters"
              onClick={closeWithHaptic}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/75 transition hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          <section className="mt-6" aria-labelledby="venue-filter-category">
            <h3 id="venue-filter-category" className="text-[11.5px] font-semibold text-[#9CA2AE]">
              Category
            </h3>
            <div className="scroll-touch -mx-4 mt-3 flex overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            <h3 id="venue-filter-status" className="text-[11.5px] font-semibold text-[#9CA2AE]">
              Status
            </h3>
            <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl bg-white/[0.04] p-3">
              <span className="text-sm font-semibold text-[#F4F5F8]">Open now</span>
              <button
                type="button"
                aria-pressed={draftOpenNow}
                onClick={() => {
                  haptic.light();
                  setDraftOpenNow((current) => !current);
                }}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${openNowActiveClass}`}
              >
                Open now
              </button>
            </div>
          </section>

          <button
            type="button"
            onClick={applyWithHaptic}
            className="mt-6 h-12 w-full rounded-[14px] bg-[#8B6CFF] text-sm font-semibold text-[#0A0A0E] shadow-[0_0_20px_rgba(139,108,255,0.32)] transition hover:bg-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#101017]"
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
  const { isDesktop } = useDevice();
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
  const [trendingVenueIds, setTrendingVenueIds] = useState<Set<string>>(() => new Set());
  const mapRef = useRef<LeafletMap | null>(null);
  const mapViewportStyle = isDesktop ? { height: "100vh", minHeight: "0" } : getMapViewportStyle();
  const cityCenter = useMemo<[number, number]>(
    () => (city.id === "south-end-clt" ? SOUTH_END_MAP_CENTER : [city.lat, city.lng]),
    [city.id, city.lat, city.lng],
  );

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
    const controller = new AbortController();

    async function loadTrendingVenues() {
      try {
        setTrendingVenueIds(await fetchTrendingVenueIds(controller.signal));
      } catch {
        if (!controller.signal.aborted) setTrendingVenueIds(new Set());
      }
    }

    void loadTrendingVenues();
    return () => controller.abort();
  }, []);

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

  useEffect(() => {
    function invalidateVisibleMap() {
      window.setTimeout(() => mapRef.current?.invalidateSize({ pan: false }), 150);
    }

    window.addEventListener("resize", invalidateVisibleMap, { passive: true });
    return () => window.removeEventListener("resize", invalidateVisibleMap);
  }, []);

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
      className="relative w-full overflow-hidden bg-[#0A0A0E] lg:h-screen"
      style={mapViewportStyle}
    >
      {(pulling || refreshing) && (
        <div
          className="pointer-events-none fixed left-0 right-0 top-0 z-[1200] flex justify-center px-4 pt-3"
          role={refreshing ? "status" : undefined}
          aria-live="polite"
        >
          <div className="rounded-[14px] border border-white/[0.08] bg-[#0A0A0E]/90 px-4 py-2 text-xs font-semibold text-[#9CA2AE] shadow-2xl backdrop-blur">
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
          zoom={MAP_DEFAULT_ZOOM}
          scrollWheelZoom={false}
          style={{ ...mapViewportStyle, width: "100%" }}
          className="gpu-layer z-0"
          whenReady={() => {
            if (mapRef.current) resetMapView(mapRef.current, cityCenter);
          }}
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

          <ClusteredVenueMarkers
            venues={filteredVenues}
            selectedVenueId={selectedVenueId}
            trendingVenueIds={trendingVenueIds}
            onVenueClick={selectVenueFromMap}
          />
        </MapContainer>
      </MapErrorBoundary>

      <CitySelector city={city} onCityChange={onCityChange} />
      <BusynessFilterBar activeFilter={activeBusynessFilter} onFilterChange={setActiveBusynessFilter} />
      <CategoryFilterPills activeFilter={activeCategoryFilter} onFilterChange={setActiveCategoryFilter} />
      <FilterFab
        hasActiveFilters={hasActiveFilters}
        onClick={() => {
          haptic.light();
          setIsFilterSheetOpen(true);
        }}
      />

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
        <div className="pointer-events-none absolute right-4 top-4 z-[1000] rounded-[14px] border border-white/[0.08] bg-[#0A0A0E]/90 px-3 py-1.5 text-xs font-semibold text-[#9CA2AE] shadow-2xl backdrop-blur">
          Showing {filteredVenues.length} of {visibleVenues.length}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-20 left-1/2 z-[1000] flex -translate-x-1/2 gap-3 whitespace-nowrap rounded-[14px] border border-white/[0.08] bg-[#0A0A0E]/90 px-4 py-2 text-xs font-semibold text-[#9CA2AE] shadow-2xl backdrop-blur-sm">
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
            <p className="absolute inset-x-0 bottom-28 text-center text-xs font-semibold text-white/55">
              Taking longer than usual...
            </p>
          )}
        </div>
      )}

      {showEmptyState && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[999] flex -translate-y-1/2 justify-center px-6">
          <div className="w-full max-w-xs text-center text-white/60">
            <MapPin aria-hidden="true" className="mx-auto h-6 w-6" strokeWidth={1.9} />
            <p className="mt-3 text-sm font-semibold leading-5">
              No spots found nearby. Try zooming out.
            </p>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center px-4">
          <div className="w-full max-w-xs rounded-[18px] border border-white/[0.08] bg-[#0A0A0E]/90 px-6 py-4 text-center text-[#F4F5F8] shadow-2xl backdrop-blur">
            <h2 className="font-display text-base font-semibold">Couldn&apos;t load spots</h2>
            <p className="mt-2 text-sm font-semibold text-[#9CA2AE]">{error}</p>
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
              className="mt-3 block w-full text-xs font-semibold text-white/55 underline underline-offset-4 transition hover:text-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
            >
              Reload page
            </button>
          </div>
        </div>
      )}

      <Link
        href="/vibe-check"
        className="fixed bottom-28 right-4 z-[1000] rounded-full bg-[#8B6CFF] px-5 py-3 font-black text-[#0A0A0E] shadow-[0_0_20px_rgba(139,108,255,0.5)] transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 lg:bottom-6"
      >
        + Report vibe
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
          display: block;
          isolation: isolate;
          position: relative;
        }

        .venue-pin-live-dot::before {
          animation: livePin 2s ease-out infinite;
          background: transparent;
          border: 2px solid var(--venue-pin-color);
          border-radius: inherit;
          content: "";
          inset: 0;
          opacity: 0.7;
          position: absolute;
          transform-origin: center;
          z-index: -1;
        }

        @keyframes livePin {
          0% {
            opacity: 0.7;
            transform: scale(1);
          }

          70% {
            opacity: 0;
            transform: scale(2.4);
          }

          100% {
            opacity: 0;
            transform: scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .venue-pin-live-dot::before {
            animation: none !important;
          }
        }

        .venue-cluster-icon {
          align-items: center;
          background: #8B6CFF;
          border: 2px solid rgba(255, 255, 255, 0.88);
          border-radius: 9999px;
          box-shadow: 0 0 24px rgba(139, 108, 255, 0.42), 0 10px 30px rgba(0, 0, 0, 0.52);
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
          min-height: 44px;
          min-width: 44px;
        }

        .venue-cluster-pin > span {
          border-radius: 9999px;
          display: block;
          height: var(--venue-pin-dot-size, 14px);
          width: var(--venue-pin-dot-size, 14px);
        }

        .venue-cluster-pin-selected {
          border-color: #8B6CFF;
          border-width: 3px;
        }

        .venue-cluster-pin-trending > span {
          box-shadow: 0 0 8px #F0568C;
        }
      `}</style>
    </main>
  );
}

export default VenueMap;
