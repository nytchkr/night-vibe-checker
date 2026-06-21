"use client";

import { useEffect, useMemo, useState } from "react";
import type { BusynessSource, ConsumerVenue } from "@/types";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; venue: ConsumerVenue }
  | { status: "not-found" }
  | { status: "error" };

function clampBusyness(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function sourceLabel(source: BusynessSource | null | undefined) {
  if (source === "live") return "BestTime live";
  if (source === "forecast") return "BestTime forecast";
  if (source === "crowd") return "Crowd reports";
  return "No live read";
}

export function WidgetClient({ venueId }: { venueId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadVenue() {
      try {
        const response = await fetch("/api/venues?surface=widget", {
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          if (!cancelled) setState({ status: "error" });
          return;
        }

        const json = await response.json();
        const venues = (json?.data?.venues ?? []) as ConsumerVenue[];
        const decodedVenueId = decodeURIComponent(venueId);
        const venue = venues.find(
          (candidate) => candidate.id === decodedVenueId || candidate.placeId === decodedVenueId
        );

        if (!cancelled) setState(venue ? { status: "ready", venue } : { status: "not-found" });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    }

    loadVenue();

    return () => {
      cancelled = true;
    };
  }, [venueId]);

  const content = useMemo(() => {
    if (state.status === "loading") {
      return <p className="text-sm text-white/60">Loading venue signal...</p>;
    }

    if (state.status === "not-found") {
      return (
        <>
          <p className="text-4xl font-black text-[#00F5D4]">404</p>
          <h1 className="mt-2 text-xl font-black text-white">Venue not found</h1>
          <p className="mt-2 text-sm text-white/55">This NightVibe widget needs a cached venue.</p>
        </>
      );
    }

    if (state.status === "error") {
      return (
        <>
          <h1 className="text-xl font-black text-white">Signal unavailable</h1>
          <p className="mt-2 text-sm text-white/55">NightVibe could not load this venue right now.</p>
        </>
      );
    }

    const busyness = clampBusyness(state.venue.signal?.busyness0To100);
    const source = sourceLabel(state.venue.signal?.busynessSource);

    return (
      <>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#00F5D4]">NightVibe</p>
            <h1 className="mt-2 truncate text-2xl font-black text-white">{state.venue.name}</h1>
            <p className="mt-1 truncate text-sm text-white/55">{state.venue.address}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-3xl font-black text-white">{busyness}%</p>
            <p className="text-xs text-white/45">busy</p>
          </div>
        </div>

        <div className="mt-6" aria-label={`Busyness ${busyness}%`}>
          <div className="h-3 overflow-hidden rounded-full bg-white/10">
            <div
              data-testid="busyness-bar-fill"
              className="h-full rounded-full bg-[#00F5D4]"
              style={{ width: `${busyness}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-white/45">
            <span>Quiet</span>
            <span>{source}</span>
            <span>Packed</span>
          </div>
        </div>
      </>
    );
  }, [state]);

  return (
    <main className="min-h-screen bg-[#0A0A0F] p-4 text-white">
      <section
        aria-label="NightVibe busyness widget"
        className="mx-auto max-w-md rounded-lg border border-white/10 bg-[#141420] p-5 shadow-2xl shadow-black/30"
      >
        {content}
      </section>
    </main>
  );
}
