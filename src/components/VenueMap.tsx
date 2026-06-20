"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import { VenueBottomSheet } from "@/components/VenueBottomSheet";
import type { APIResponse, ConsumerVenue } from "@/types";

const SOUTH_END_CENTER: [number, number] = [35.2178, -80.8597];
const CHARLOTTE_ZIPS: Record<string, [number, number]> = {
  "28202": [35.2271, -80.8431],
  "28203": [35.2074, -80.8641],
  "28204": [35.2088, -80.8396],
  "28205": [35.2237, -80.8051],
  "28206": [35.2526, -80.831],
  "28207": [35.2046, -80.8242],
  "28208": [35.2157, -80.9016],
  "28209": [35.1771, -80.8632],
  "28210": [35.1484, -80.8751],
  "28211": [35.1793, -80.8089],
  "28212": [35.2008, -80.7728],
  "28213": [35.2739, -80.784],
};

type VenuePinStyle = {
  fillColor: string;
  radius: number;
  opacity: number;
};

function getVenuePinStyle(venue: ConsumerVenue): VenuePinStyle {
  const busyness = venue.signal?.busyness0To100;

  if (busyness == null) {
    return { fillColor: "#ffffff", radius: 6, opacity: 0.5 };
  }
  if (busyness >= 67) {
    return { fillColor: "#ef4444", radius: 11, opacity: 1 };
  }
  if (busyness >= 34) {
    return { fillColor: "#eab308", radius: 8, opacity: 1 };
  }
  return { fillColor: "#71717a", radius: 7, opacity: 1 };
}

function FitBounds({ venues }: { venues: ConsumerVenue[] }) {
  const map = useMap();

  useEffect(() => {
    if (venues.length === 0) return;
    const bounds = venues.map((venue) => [venue.lat, venue.lng] as [number, number]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [map, venues.length]);

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
  const [showTooltip, setShowTooltip] = useState(false);

  function submitZip() {
    if (!/^\d{5}$/.test(zip)) {
      setShowTooltip(true);
      window.setTimeout(() => setShowTooltip(false), 1800);
      return;
    }

    const coords = CHARLOTTE_ZIPS[zip];
    if (!coords) {
      setShowTooltip(true);
      window.setTimeout(() => setShowTooltip(false), 1800);
      return;
    }

    setShowTooltip(false);
    map.flyTo(coords, 15);
  }

  return (
    <div className="absolute left-4 top-4 z-[1000]">
      <div className="relative flex items-center gap-1 rounded-xl border border-white/10 bg-black/75 p-1 shadow-2xl backdrop-blur">
        <input
          aria-label="Charlotte zip"
          className="w-36 rounded-lg bg-white/10 px-2.5 py-2 text-sm font-bold text-white placeholder:text-white/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
          inputMode="numeric"
          maxLength={5}
          pattern="[0-9]{5}"
          placeholder="Charlotte zip..."
          value={zip}
          onChange={(event) => setZip(event.target.value.replace(/\D/g, "").slice(0, 5))}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitZip();
          }}
        />
        <button
          aria-label="Search Charlotte zip"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-sm text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
          type="button"
          onClick={submitZip}
        >
          🔍
        </button>
        {showTooltip && (
          <span className="absolute left-0 top-full mt-2 rounded-lg bg-[#ef4444] px-2 py-1 text-xs font-black text-white shadow-xl">
            Charlotte zip only
          </span>
        )}
      </div>
    </div>
  );
}

export function VenueMap() {
  const [venues, setVenues] = useState<ConsumerVenue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<ConsumerVenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const liveIcon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: '<span class="live-pin"></span>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    [],
  );

  useEffect(() => {
    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({ iconRetinaUrl: "", iconUrl: "", shadowUrl: "" });
  }, []);

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
          attribution="© OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds venues={visibleVenues} />
        <RecenterButton />
        <ZipRecenterControl />

        {visibleVenues.map((venue) => {
          const pin = getVenuePinStyle(venue);
          const isLive = venue.signal?.busynessSource === "live";

          if (isLive) {
            return (
              <Marker
                key={venue.id}
                position={[venue.lat, venue.lng]}
                icon={liveIcon}
                eventHandlers={{ click: () => setSelectedVenue(venue) }}
              >
                <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{venue.name}</span>
                </Tooltip>
              </Marker>
            );
          }

          return (
            <CircleMarker
              key={venue.id}
              center={[venue.lat, venue.lng]}
              radius={pin.radius}
              pathOptions={{
                color: "#ffffff",
                fillColor: pin.fillColor,
                opacity: pin.opacity,
                weight: 2,
                fillOpacity: 0.9,
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

      <div className="pointer-events-none absolute left-4 top-[76px] z-[1000] rounded-xl bg-black/70 px-3 py-2 text-xs font-black text-white/80 shadow-2xl backdrop-blur">
        <span>🔴 Packed</span> <span>🟡 Moderate</span> <span>⚫ Quiet</span>
      </div>

      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center bg-[#0a0a0f]/80">
          <p className="animate-pulse text-sm font-black text-white/80">Loading venues...</p>
        </div>
      ) : (
        <div className="pointer-events-none absolute right-4 top-4 z-[1000] rounded-xl bg-black/70 px-3 py-2 text-xs font-black text-white/80 shadow-2xl backdrop-blur">
          {error ?? `${visibleVenues.length} spots`}
        </div>
      )}

      <Link
        href="/vibe-check"
        className="fixed bottom-20 right-4 z-50 rounded-full bg-[#00F5D4] px-5 py-3 font-black text-[#0A0A0F] shadow-[0_0_20px_rgba(0,245,212,0.5)] transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/70"
      >
        ＋ Report Vibe
      </Link>

      <VenueBottomSheet venue={selectedVenue} onClose={() => setSelectedVenue(null)} />
    </main>
  );
}

export default VenueMap;
