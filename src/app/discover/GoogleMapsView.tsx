"use client";

// ============================================================
// GoogleMapsView
//
// Dynamically imported by /discover/page.tsx only when
// NEXT_PUBLIC_GOOGLE_MAPS_KEY is present.
//
// Tries to use @vis.gl/react-google-maps if installed.
// If the package is absent (import throws) it renders a
// styled iframe embed as a graceful fallback.
// ============================================================

import { useState } from "react";
import type { VenueBasic } from "@/types";
import { VenueCard } from "@/components/VenueCard";

interface GoogleMapsViewProps {
  apiKey: string;
  venues: VenueBasic[];
  onVenueSelect: (venue: VenueBasic) => void;
}

// Attempt to import @vis.gl/react-google-maps.
// The import is wrapped in a try/catch at the module level via
// React.lazy / dynamic, so if the package is missing the parent
// catches it and shows MapComingSoon instead.
let VisGlMap: React.ComponentType<{
  apiKey: string;
  defaultCenter: { lat: number; lng: number };
  defaultZoom: number;
  style?: React.CSSProperties;
  className?: string;
  children?: React.ReactNode;
}> | null = null;

let AdvancedMarker: React.ComponentType<{
  position: { lat: number; lng: number };
  title?: string;
  onClick?: () => void;
}> | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pkg = require("@vis.gl/react-google-maps");
  VisGlMap = pkg.APIProvider
    ? // APIProvider + Map is the v1 pattern
      (() => {
        const { APIProvider, Map } = pkg;
        return function WrappedMap({
          apiKey,
          defaultCenter,
          defaultZoom,
          style,
          className,
          children,
        }: { apiKey: string; defaultCenter: { lat: number; lng: number }; defaultZoom: number; style?: React.CSSProperties; className?: string; children?: React.ReactNode }) {
          return (
            <APIProvider apiKey={apiKey}>
              <Map
                defaultCenter={defaultCenter}
                defaultZoom={defaultZoom}
                style={style}
                className={className}
              >
                {children}
              </Map>
            </APIProvider>
          );
        };
      })()
    : null;
  AdvancedMarker = pkg.AdvancedMarker ?? pkg.Marker ?? null;
} catch {
  // package not installed — handled below
}

// --------------- Iframe fallback ----------------------------

function IframeMap({
  center,
  apiKey,
}: {
  center: { lat: number; lng: number };
  apiKey: string;
}) {
  const src = `https://www.google.com/maps/embed/v1/search?key=${apiKey}&q=nightlife+near+${center.lat},${center.lng}&zoom=14`;
  return (
    <iframe
      title="Nearby venues map"
      src={src}
      className="w-full h-52 rounded-2xl border border-white/10"
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
    />
  );
}

// --------------- Selected venue popup -----------------------

function SelectedVenuePanel({
  venue,
  onVibeCheck,
  onClose,
}: {
  venue: VenueBasic;
  onVibeCheck: (v: VenueBasic) => void;
  onClose: () => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={onClose}
        aria-label="Close venue panel"
        className="
          absolute top-2 right-2 z-10
          w-7 h-7 flex items-center justify-center
          rounded-full bg-white/10 hover:bg-white/20
          text-white/60 hover:text-white
          transition-colors duration-150
          focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400
        "
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1={18} y1={6} x2={6} y2={18} />
          <line x1={6} y1={6} x2={18} y2={18} />
        </svg>
      </button>
      <VenueCard venue={venue} variant="compact" onVibeCheck={onVibeCheck} />
    </div>
  );
}

// --------------- Main component -----------------------------

export default function GoogleMapsView({
  apiKey,
  venues,
  onVenueSelect,
}: GoogleMapsViewProps) {
  const [selectedVenue, setSelectedVenue] = useState<VenueBasic | null>(null);

  // Default center — San Francisco as a sensible fallback; the
  // real app would use the user's geolocation.
  const center = { lat: 37.7749, lng: -122.4194 };

  if (VisGlMap && AdvancedMarker) {
    const MapComp = VisGlMap;
    const MarkerComp = AdvancedMarker;

    return (
      <div className="space-y-3">
        <div className="rounded-2xl overflow-hidden border border-white/10">
          <MapComp
            apiKey={apiKey}
            defaultCenter={center}
            defaultZoom={14}
            style={{ height: "14rem", width: "100%" }}
          >
            {venues.map((venue) => (
              <MarkerComp
                key={venue.placeId}
                position={{ lat: venue.lat, lng: venue.lng }}
                title={venue.name}
                onClick={() => setSelectedVenue(venue)}
              />
            ))}
          </MapComp>
        </div>

        {selectedVenue && (
          <SelectedVenuePanel
            venue={selectedVenue}
            onVibeCheck={onVenueSelect}
            onClose={() => setSelectedVenue(null)}
          />
        )}
      </div>
    );
  }

  // Package not installed — render the iframe embed
  return (
    <div className="space-y-3">
      <IframeMap center={center} apiKey={apiKey} />
      {selectedVenue && (
        <SelectedVenuePanel
          venue={selectedVenue}
          onVibeCheck={onVenueSelect}
          onClose={() => setSelectedVenue(null)}
        />
      )}
    </div>
  );
}
