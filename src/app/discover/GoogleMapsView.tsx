"use client";

// ============================================================
// GoogleMapsView  — NV-041 update
//
// Map popups now show crowd badge when a venue has check-in
// data. SelectedVenuePanel passes crowdBadge to VenueCard
// compact variant (compact doesn't show it — use full for popup).
// ============================================================

import { useState } from "react";
import type { VenueBasic } from "@/types";
import { VenueCard, type CrowdLevel } from "@/components/VenueCard";

interface GoogleMapsViewProps {
  apiKey: string;
  venues: VenueBasic[];
  onVenueSelect: (venue: VenueBasic) => void;
}

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
    ? (() => {
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
              <Map defaultCenter={defaultCenter} defaultZoom={defaultZoom} style={style} className={className}>
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

function IframeMap({ center, apiKey }: { center: { lat: number; lng: number }; apiKey: string }) {
  const src = `https://www.google.com/maps/embed/v1/search?key=${apiKey}&q=nightlife+near+${center.lat},${center.lng}&zoom=14`;
  return (
    <iframe
      title="Nearby venues map"
      src={src}
      className="w-full h-72 rounded-[1.75rem] border border-white/10"
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
    />
  );
}

// --------------- Crowd badge in map popup -------------------

const CROWD_BADGE_CFG: Record<CrowdLevel, { label: string; bg: string; text: string }> = {
  quiet:    { label: "Quiet",    bg: "rgba(34,197,94,0.18)",  text: "#4ade80" },
  moderate: { label: "Moderate", bg: "rgba(251,191,36,0.18)", text: "#fbbf24" },
  packed:   { label: "Packed",   bg: "rgba(249,115,22,0.18)", text: "#fb923c" },
  wild:     { label: "Wild",     bg: "rgba(255,45,120,0.22)", text: "#FF2D78" },
};

// --------------- Selected venue popup -----------------------

function SelectedVenuePanel({
  venue,
  onVibeCheck,
  onClose,
  crowdLevel,
}: {
  venue: VenueBasic;
  onVibeCheck: (v: VenueBasic) => void;
  onClose: () => void;
  crowdLevel?: CrowdLevel;
}) {
  const crowdCfg = crowdLevel ? CROWD_BADGE_CFG[crowdLevel] : null;

  return (
    <div className="relative rounded-[1.75rem] border border-white/10 bg-[#141420] p-2">
      <button
        onClick={onClose}
        aria-label="Close venue panel"
        className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1={18} y1={6} x2={6} y2={18} />
          <line x1={6} y1={6} x2={18} y2={18} />
        </svg>
      </button>

      {/* Crowd badge overlay — shown above the card when level is known */}
      {crowdCfg && (
        <div className="px-3 pt-2 pb-1">
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide"
            style={{ background: crowdCfg.bg, color: crowdCfg.text }}
          >
            {crowdCfg.label}
          </span>
        </div>
      )}

      <VenueCard venue={venue} variant="compact" onVibeCheck={onVibeCheck} />
    </div>
  );
}

// --------------- Main component -----------------------------

export default function GoogleMapsView({ apiKey, venues, onVenueSelect }: GoogleMapsViewProps) {
  const [selectedVenue, setSelectedVenue] = useState<VenueBasic | null>(null);

  const center = { lat: 37.7749, lng: -122.4194 };

  if (VisGlMap && AdvancedMarker) {
    const MapComp = VisGlMap;
    const MarkerComp = AdvancedMarker;

    return (
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#141420]">
          <div className="absolute left-4 top-4 z-10 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[11px] font-semibold text-white/80 backdrop-blur">
            {venues.length} nearby
          </div>
          <MapComp apiKey={apiKey} defaultCenter={center} defaultZoom={14} style={{ height: "18rem", width: "100%" }}>
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
