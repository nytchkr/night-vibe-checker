"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import L from "leaflet";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";
import { VenueBottomSheet } from "@/components/VenueBottomSheet";
import type { APIResponse, ConsumerVenue } from "@/types";

const SOUTH_END_CENTER: [number, number] = [35.2178, -80.8597];

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

export function VenueMap() {
  const [venues, setVenues] = useState<ConsumerVenue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<ConsumerVenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#0A0A0F]">
      <MapContainer
        center={SOUTH_END_CENTER}
        zoom={15}
        scrollWheelZoom={false}
        style={{ height: "100dvh", width: "100%" }}
        className="z-0"
      >
        <TileLayer
          attribution="© OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {visibleVenues.map((venue) => {
          const pin = getVenuePinStyle(venue);
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
            />
          );
        })}
      </MapContainer>

      <div className="pointer-events-none fixed left-4 top-4 z-40 rounded-full border border-white/10 bg-[#0A0A0F]/78 px-3 py-2 text-xs font-black text-white/75 shadow-2xl backdrop-blur-xl">
        {loading ? "Loading venues..." : error ?? `${visibleVenues.length} South End spots`}
      </div>

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
