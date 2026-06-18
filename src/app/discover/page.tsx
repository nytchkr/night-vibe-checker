"use client";

// ============================================================
// Discover Page  (/discover)
//
// Shows a map view of nearby venues when a Google Maps API key
// is configured (NEXT_PUBLIC_GOOGLE_MAPS_KEY).
//
// Fallback: if the key is absent the map is replaced with a
// friendly placeholder and a list of nearby venues fetched
// from GET /api/venues?q=nearby.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { VenueCard } from "@/components/VenueCard";
import { Toast } from "@/components/Toast";
import type { VenueBasic } from "@/types";

// --------------- Map placeholder ----------------------------

function MapComingSoon() {
  return (
    <div
      aria-label="Map view coming soon"
      className="
        flex flex-col items-center justify-center gap-4
        rounded-2xl bg-white/5 border border-white/10
        h-52 px-6 text-center
      "
    >
      {/* Compass icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={40}
        height={40}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[#00F5D4] opacity-70"
        aria-hidden="true"
      >
        <circle cx={12} cy={12} r={10} />
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      </svg>
      <div className="space-y-1">
        <p className="text-white font-semibold text-base">Map coming soon</p>
        <p className="text-white/40 text-sm">
          Add a Google Maps key to enable the interactive map.
          <br />
          Showing nearby spots below.
        </p>
      </div>
    </div>
  );
}

// --------------- Google Maps wrapper (lazy-loaded) ----------
// Only imported when the API key is present, so the bundle
// never loads @vis.gl/react-google-maps unless needed.

interface MapsViewProps {
  apiKey: string;
  venues: VenueBasic[];
  onVenueSelect: (venue: VenueBasic) => void;
}

// Lazy component — Next.js dynamic import with ssr: false so
// the Google Maps SDK is only loaded client-side.
const GoogleMapsView = dynamic(
  () => import("./GoogleMapsView").catch(() => {
    // If the package isn't installed, return a no-op component
    // so the page doesn't crash. The map-coming-soon placeholder
    // will already be shown by the key-absent branch.
    return { default: () => <MapComingSoon /> };
  }),
  {
    ssr: false,
    loading: () => (
      <div
        aria-label="Loading map"
        className="
          flex items-center justify-center
          rounded-2xl bg-white/5 border border-white/10
          h-52
        "
      >
        <span className="text-white/40 text-sm animate-pulse">Loading map…</span>
      </div>
    ),
  }
) as React.ComponentType<MapsViewProps>;

// --------------- Loading skeleton ---------------------------

function VenueListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading venues">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl bg-white/5 border border-white/10 h-24"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

// --------------- Empty state --------------------------------

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center space-y-4">
      <p className="text-white/40 text-sm">No nearby venues found.</p>
      <button
        onClick={onRefresh}
        className="
          px-5 py-2.5 rounded-xl text-sm font-semibold text-white
          bg-gradient-to-r from-purple-600 to-pink-600
          hover:from-purple-500 hover:to-pink-500
          focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400
          transition-all duration-150
        "
      >
        Refresh
      </button>
    </div>
  );
}

// --------------- Main page ----------------------------------

export default function DiscoverPage() {
  const router = useRouter();
  const hasMapsKey =
    typeof process !== "undefined" &&
    Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY);

  const [venues, setVenues] = useState<VenueBasic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }

  const fetchVenues = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/venues?q=nearby");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      // API may return { data: [...] } or a bare array
      const list: VenueBasic[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
        ? json.data
        : [];
      setVenues(list);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load venues.";
      setFetchError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  function handleVibeCheck(venue: VenueBasic) {
    const params = new URLSearchParams({
      venueId: venue.placeId,
      venueName: venue.name,
    });
    router.push(`/vibe-check?${params.toString()}`);
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0A0A0F]/90 backdrop-blur-xl border-b border-white/10 px-4">
        <div className="max-w-lg mx-auto py-4">
          <h1 className="text-white font-bold text-lg leading-none">Discover</h1>
          <p className="text-white/40 text-xs mt-0.5">
            Find tonight&apos;s best spots near you
          </p>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {/* Map section */}
        <section aria-label="Map view">
          {hasMapsKey ? (
            <GoogleMapsView
              apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY as string}
              venues={venues}
              onVenueSelect={handleVibeCheck}
            />
          ) : (
            <MapComingSoon />
          )}
        </section>

        {/* Nearby venues list */}
        <section aria-label="Nearby venues">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-base">Nearby Spots</h2>
            {!isLoading && (
              <button
                onClick={fetchVenues}
                aria-label="Refresh nearby venues"
                className="
                  text-white/40 hover:text-[#00F5D4]
                  transition-colors duration-150
                  focus:outline-none focus-visible:text-[#00F5D4]
                "
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
            )}
          </div>

          {/* States */}
          {isLoading && <VenueListSkeleton />}

          {!isLoading && fetchError && (
            <div
              role="alert"
              className="rounded-2xl bg-rose-950/60 border border-rose-500/40 p-5 text-center space-y-3"
            >
              <p className="text-rose-300 text-sm font-medium">{fetchError}</p>
              <button
                onClick={fetchVenues}
                className="
                  px-5 py-2 rounded-xl text-sm font-semibold text-white
                  bg-gradient-to-r from-purple-600 to-pink-600
                  hover:from-purple-500 hover:to-pink-500
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400
                  transition-all duration-150
                "
              >
                Try Again
              </button>
            </div>
          )}

          {!isLoading && !fetchError && venues.length === 0 && (
            <EmptyState onRefresh={fetchVenues} />
          )}

          {!isLoading && !fetchError && venues.length > 0 && (
            <div className="space-y-3">
              {venues.map((venue) => (
                <VenueCard
                  key={venue.placeId}
                  venue={venue}
                  variant="full"
                  onVibeCheck={handleVibeCheck}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
