"use client";

// ============================================================
// Discover Page  (/discover)
//
// Shows a map view of nearby venues when a Google Maps API key
// is configured (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).
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

function MapPreviewFallback() {
  return (
    <div
      aria-label="Map preview"
      className="
        relative isolate overflow-hidden rounded-[1.75rem]
        border border-white/10 bg-[#141420]
        px-5 py-6 min-h-[18rem]
      "
    >
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_25%_20%,rgba(0,245,212,0.16),transparent_32%),radial-gradient(circle_at_78%_72%,rgba(255,45,120,0.16),transparent_34%)]" />
      <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-white/10" />
      <div className="absolute inset-y-0 left-1/2 -z-10 w-px bg-white/10" />

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-white/45 text-[11px] font-semibold uppercase tracking-[0.22em]">
            Live area
          </p>
          <h2 className="mt-2 text-white text-2xl font-extrabold tracking-tight">
            Tonight nearby
          </h2>
          <p className="mt-2 max-w-[17rem] text-white/45 text-sm leading-relaxed">
            Venue cards below are live. Add a Google Maps key to switch this preview into an interactive pin map.
          </p>
        </div>
        <div className="rounded-2xl border border-[#00F5D4]/25 bg-[#00F5D4]/10 px-3 py-2 text-right">
          <span className="block text-[#00F5D4] text-sm font-bold">Preview</span>
          <span className="text-white/35 text-[11px]">Map layer</span>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-2">
        {["Bars", "Clubs", "Lounges"].map((label, index) => (
          <div
            key={label}
            className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3"
          >
            <span className="text-white/35 text-[10px] font-semibold uppercase tracking-wide">
              Zone {index + 1}
            </span>
            <strong className="mt-1 block text-white text-sm">{label}</strong>
          </div>
        ))}
      </div>

      <span className="absolute left-[18%] top-[58%] h-3 w-3 rounded-full bg-[#00F5D4] shadow-[0_0_18px_rgba(0,245,212,0.8)]" />
      <span className="absolute right-[24%] top-[42%] h-3 w-3 rounded-full bg-[#FF2D78] shadow-[0_0_18px_rgba(255,45,120,0.75)]" />
      <span className="absolute right-[38%] bottom-[18%] h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.7)]" />
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
    return { default: () => <MapPreviewFallback /> };
  }),
  {
    ssr: false,
    loading: () => (
      <div
        aria-label="Loading map"
        className="
          flex items-center justify-center
          rounded-[1.75rem] bg-white/5 border border-white/10
          h-72
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
    <div className="rounded-[1.75rem] bg-white/5 border border-white/10 p-8 text-center space-y-4">
      <p className="text-white font-semibold text-sm">No nearby venues found.</p>
      <p className="text-white/40 text-xs">Refresh the area or head back to search with a venue name.</p>
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
    Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

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
      <header className="sticky top-0 z-40 bg-[#0A0A0F]/92 backdrop-blur-xl border-b border-white/10 px-4 relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full"
          style={{
            background:
              "radial-gradient(ellipse 70% 120% at 90% 0%, rgba(255,45,120,0.10) 0%, transparent 60%), radial-gradient(ellipse 50% 100% at 10% 0%, rgba(0,245,212,0.08) 0%, transparent 60%)",
          }}
        />
        <div className="max-w-lg mx-auto py-4">
          <p className="text-[#FF2D78]/60 text-[10px] font-bold uppercase tracking-[0.3em]">
            Explore
          </p>
          <h1 className="mt-1 text-white font-black text-[1.75rem] leading-none tracking-[-0.02em]">
            Map the night
          </h1>
          <p className="text-white/40 text-xs mt-2 font-medium">
            Scan nearby energy — jump straight into a vibe check
          </p>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-lg mx-auto px-4 py-5 space-y-5 pb-32">
        {/* Map section */}
        <section aria-label="Map view">
          {hasMapsKey ? (
            <GoogleMapsView
              apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string}
              venues={venues}
              onVenueSelect={handleVibeCheck}
            />
          ) : (
            <MapPreviewFallback />
          )}
        </section>

        {/* Nearby venues list */}
        <section aria-label="Nearby venues">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-white/35 text-[11px] font-semibold uppercase tracking-[0.2em]">
                Nearby
              </p>
              <h2 className="text-white font-semibold text-base">
                {venues.length ? `${venues.length} spots surfaced` : "Nearby spots"}
              </h2>
            </div>
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
