"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import { VenueBottomSheet } from "@/components/VenueBottomSheet";
import type { APIResponse, ConsumerVenue } from "@/types";

const SOUTH_END_CENTER: [number, number] = [35.2178, -80.8597];

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
  if (busyness >= 67) {
    return { className: "venue-pin-packed", fillColor: "#ef4444", fillOpacity: 0.95, radius: 13 };
  }
  if (busyness >= 34) {
    return { className: "venue-pin-moderate", fillColor: "#eab308", fillOpacity: 0.95, radius: 10 };
  }
  return { className: "venue-pin-quiet", fillColor: "#52525b", fillOpacity: 0.95, radius: 7 };
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

export function VenueMap() {
  const [venues, setVenues] = useState<ConsumerVenue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<ConsumerVenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchVenues() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/venues");
        if (!res.ok) throw new Error(`Venue fetch failed: ${res.status}`);
        const json = (await res.json()) as APIResponse<{ venues: ConsumerVenue[] }>;
        if (!cancelled) {
          setVenues(json.data?.venues ?? []);
        }
      } catch {
        if (!cancelled) {
          setError("Map venues are unavailable.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchVenues();

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleVenues = useMemo(
    () => venues.filter((venue) => Number.isFinite(venue.lat) && Number.isFinite(venue.lng)),
    [venues],
  );

  return (
    <main className="relative w-full overflow-hidden bg-[#0A0A0F]" style={{ height: "calc(100dvh - 64px)" }}>
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
        <RecenterButton />

        {visibleVenues.map((venue) => {
          const pin = getVenuePinStyle(venue);

          return (
            <CircleMarker
              key={venue.id}
              center={[venue.lat, venue.lng]}
              radius={pin.radius}
              pathOptions={{
                className: pin.className,
                color: "rgba(255,255,255,0.15)",
                fillColor: pin.fillColor,
                fillOpacity: pin.fillOpacity,
                weight: 1.5,
              }}
              eventHandlers={{ click: () => setSelectedVenue(venue) }}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{venue.name}</span>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-20 left-1/2 z-[1000] flex -translate-x-1/2 gap-3 whitespace-nowrap rounded-full border border-white/10 bg-black/70 px-4 py-2 text-xs font-bold text-white/70 shadow-2xl backdrop-blur-sm">
        <span>
          <span className="text-red-400">●</span> Packed
        </span>
        <span>
          <span className="text-yellow-400">●</span> Moderate
        </span>
        <span>
          <span className="text-zinc-500">●</span> Quiet
        </span>
      </div>

      {loading && (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center bg-[#0a0a0f]/80">
          <p className="animate-pulse text-sm font-black text-white/80">Loading venues...</p>
        </div>
      )}

      {error && !loading && <p className="sr-only">{error}</p>}

      <Link
        href="/vibe-check"
        className="fixed bottom-20 right-4 z-50 rounded-full bg-[#00F5D4] px-5 py-3 font-black text-[#0A0A0F] shadow-[0_0_20px_rgba(0,245,212,0.5)] transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
      >
        ＋ Report Vibe
      </Link>

      <VenueBottomSheet venue={selectedVenue} onClose={() => setSelectedVenue(null)} />

      <style jsx global>{`
        .venue-pin-packed {
          filter: drop-shadow(0 0 0 rgba(239, 68, 68, 0.35)) drop-shadow(0 0 12px rgba(239, 68, 68, 0.5));
          transform-box: fill-box;
          transform-origin: center;
          animation: venue-pin-pulse 1.8s ease-out infinite;
        }

        .venue-pin-moderate {
          filter: drop-shadow(0 0 8px rgba(234, 179, 8, 0.4));
        }

        @keyframes venue-pin-pulse {
          0% {
            filter: drop-shadow(0 0 0 rgba(239, 68, 68, 0.35)) drop-shadow(0 0 12px rgba(239, 68, 68, 0.5));
            transform: scale(1);
          }
          60% {
            filter: drop-shadow(0 0 10px rgba(239, 68, 68, 0.18)) drop-shadow(0 0 18px rgba(239, 68, 68, 0.35));
            transform: scale(1.14);
          }
          100% {
            filter: drop-shadow(0 0 0 rgba(239, 68, 68, 0)) drop-shadow(0 0 12px rgba(239, 68, 68, 0.5));
            transform: scale(1);
          }
        }
      `}</style>
    </main>
  );
}

export default VenueMap;
