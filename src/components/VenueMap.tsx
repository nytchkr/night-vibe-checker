"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import { getBusynessState } from "@/lib/busyness";
import type { APIResponse, ConsumerVenue } from "@/types";
import MapBottomSheet from "@/components/MapBottomSheet";
import type { MapSheetSnap } from "@/components/MapBottomSheet";

const SOUTH_END_CENTER: [number, number] = [35.2178, -80.8597];
const CHARLOTTE_ZIP_CENTERS: Record<string, [number, number]> = {
  "28202": [35.2271, -80.8431],
  "28203": [35.2178, -80.8597],
  "28204": [35.22, -80.83],
  "28205": [35.23, -80.79],
  "28206": [35.25, -80.82],
  "28207": [35.21, -80.81],
  "28208": [35.22, -80.9],
  "28209": [35.17, -80.85],
  "28210": [35.14, -80.88],
  "28211": [35.19, -80.78],
  "28212": [35.2, -80.75],
};

type VenuePinStyle = {
  className: string;
  fillOpacity: number;
  fillColor: string;
  radius: number;
};

function getVenuePinStyle(venue: ConsumerVenue): VenuePinStyle {
  const busyness = venue.signal?.busyness0To100;

  if (busyness == null) {
    return { className: "venue-pin-null", fillColor: "#3f3f46", fillOpacity: 0.5, radius: 5 };
  }
  const state = getBusynessState(busyness);
  if (state.level === "packed") return { className: "venue-pin-packed", fillColor: state.color, fillOpacity: 0.95, radius: 13 };
  if (state.level === "moderate") return { className: "venue-pin-moderate", fillColor: state.color, fillOpacity: 0.95, radius: 10 };
  return { className: "venue-pin-quiet", fillColor: state.color, fillOpacity: 0.95, radius: 7 };
}

function FitBounds() {
  const map = useMap();

  useEffect(() => {
    map.setView(SOUTH_END_CENTER, 15);
  }, [map]);

  return null;
}

function RecenterButton() {
  const map = useMap();

  return (
    <button
      type="button"
      aria-label="Recenter map"
      onClick={() => map.flyTo(SOUTH_END_CENTER, 15)}
      className="fixed bottom-20 left-4 z-50 flex h-11 items-center gap-2 rounded-full bg-black/75 px-4 text-xs font-black uppercase tracking-[0.14em] text-white shadow-2xl backdrop-blur transition-colors hover:bg-black/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
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
    invalidTimerRef.current = setTimeout(() => setShowInvalid(false), 650);
  }

  function recenterForZip(nextZip: string) {
    const center = CHARLOTTE_ZIP_CENTERS[nextZip];
    if (!center) {
      flashInvalid();
      return;
    }
    setShowInvalid(false);
    map.setView(center, 15);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextZip = event.target.value.replace(/\D/g, "").slice(0, 5);
    setZip(nextZip);
    if (nextZip.length === 5) {
      recenterForZip(nextZip);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    recenterForZip(zip);
  }

  return (
    <input
      aria-label="Charlotte zip"
      inputMode="numeric"
      maxLength={5}
      onChange={handleChange}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => event.stopPropagation()}
      pattern="[0-9]*"
      placeholder="Charlotte zip"
      type="text"
      value={zip}
      className={`absolute left-1/2 top-4 z-[500] w-36 -translate-x-1/2 rounded-full border bg-black/70 px-3 py-1.5 text-sm text-white shadow-2xl backdrop-blur placeholder:text-white/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70 ${
        showInvalid ? "border-red-500" : "border-white/10"
      }`}
    />
  );
}

export function VenueMap() {
  const [venues, setVenues] = useState<ConsumerVenue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [sheetSnap, setSheetSnap] = useState<MapSheetSnap>("collapsed");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapHeightClass =
    process.env.NEXT_PUBLIC_ENV === "development" ? "h-[calc(100dvh-100px)]" : "h-[calc(100dvh-80px)]";

  const fetchVenues = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/venues", { signal });
      if (!res.ok) throw new Error(`Venue fetch failed: ${res.status}`);
      const json = (await res.json()) as APIResponse<{ venues: ConsumerVenue[] }>;
      setVenues(json.data?.venues ?? []);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setVenues([]);
      setError("Map venues are unavailable.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchVenues(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchVenues]);

  const visibleVenues = useMemo(
    () => venues.filter((venue) => Number.isFinite(venue.lat) && Number.isFinite(venue.lng)),
    [venues],
  );
  const showEmptyState = !loading && !error && visibleVenues.length === 0;

  return (
    <main className={`relative w-full overflow-hidden bg-[#0A0A0F] ${mapHeightClass}`}>
      <MapContainer
        center={SOUTH_END_CENTER}
        zoom={15}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <FitBounds />
        <ZipRecenterControl />
        <RecenterButton />

        {visibleVenues.map((venue) => {
          const pin = getVenuePinStyle(venue);
          const isLive = venue.signal?.busynessSource === "live";

          return (
            <Fragment key={venue.id}>
              {isLive && (
                <CircleMarker
                  center={[venue.lat, venue.lng]}
                  radius={pin.radius * 1.65}
                  pathOptions={{
                    className: "venue-pin-live-pulse",
                    color: pin.fillColor,
                    fillColor: pin.fillColor,
                    fillOpacity: 0.18,
                    opacity: 0.32,
                    weight: 1,
                  }}
                  interactive={false}
                />
              )}
              <CircleMarker
                center={[venue.lat, venue.lng]}
                radius={pin.radius}
                pathOptions={{
                  className: pin.className,
                  color: "rgba(255,255,255,0.15)",
                  fillColor: pin.fillColor,
                  fillOpacity: pin.fillOpacity,
                  weight: 1.5,
                }}
                eventHandlers={{
                  click: () => {
                    setSelectedVenueId(venue.id);
                    setSheetSnap("mid");
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{venue.name}</span>
                </Tooltip>
              </CircleMarker>
            </Fragment>
          );
        })}
      </MapContainer>

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
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center px-4">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/70 px-6 py-4 text-sm font-black text-white shadow-2xl backdrop-blur">
            <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-[#00F5D4]" />
            <span>Loading spots...</span>
          </div>
        </div>
      )}

      {showEmptyState && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center px-4">
          <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-black/70 px-6 py-4 text-center text-white shadow-2xl backdrop-blur">
            <h2 className="text-base font-black">No spots found</h2>
            <p className="mt-2 text-sm font-semibold text-white/70">South End Charlotte venues coming soon</p>
            <button
              type="button"
              onClick={() => void fetchVenues()}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-[#00F5D4] px-5 py-2.5 text-sm font-black text-[#0A0A0F] shadow-[0_0_18px_rgba(0,245,212,0.32)] transition hover:bg-[#66ffea] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center px-4">
          <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-black/70 px-6 py-4 text-center text-white shadow-2xl backdrop-blur">
            <h2 className="text-base font-black">Couldn&apos;t load spots</h2>
            <p className="mt-2 text-sm font-semibold text-white/70">Try again to refresh the South End map.</p>
            <button
              type="button"
              onClick={() => void fetchVenues()}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-[#00F5D4] px-5 py-2.5 text-sm font-black text-[#0A0A0F] shadow-[0_0_18px_rgba(0,245,212,0.32)] transition hover:bg-[#66ffea] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Retry
            </button>
          </div>
          <p className="sr-only">{error}</p>
        </div>
      )}

      <Link
        href="/vibe-check"
        className="fixed bottom-28 right-4 z-[1000] rounded-full bg-[#00F5D4] px-5 py-3 font-black text-[#0A0A0F] shadow-[0_0_20px_rgba(0,245,212,0.5)] transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
      >
        ＋ Report Vibe
      </Link>

      <MapBottomSheet selectedVenueId={selectedVenueId} setSnap={setSheetSnap} snap={sheetSnap} venues={visibleVenues} />

      <style jsx global>{`
        .venue-pin-packed {
          filter: drop-shadow(0 0 0 rgba(248, 113, 113, 0.35)) drop-shadow(0 0 12px rgba(248, 113, 113, 0.5));
        }

        .venue-pin-moderate {
          filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.4));
        }

        .venue-pin-quiet {
          filter: drop-shadow(0 0 8px rgba(74, 222, 128, 0.34));
        }
      `}</style>
    </main>
  );
}

export default VenueMap;
