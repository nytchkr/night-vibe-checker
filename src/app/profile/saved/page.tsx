"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Heart } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { PageTransition } from "@/components/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { APIResponse, ConsumerVenue } from "@/types";

type SavedVenueIdsResponse = APIResponse<{ savedVenueIds: string[] }> & {
  place_ids?: string[];
  venueIds?: string[];
  savedVenueIds?: string[];
};

type VenuesResponse = APIResponse<{ venues: ConsumerVenue[] }>;

type SavedVenueItem = {
  id: string;
  name: string;
  category: string;
  address?: string;
};

function getSavedVenueIds(json: SavedVenueIdsResponse): string[] {
  const ids = json.place_ids ?? json.venueIds ?? json.savedVenueIds ?? json.data?.savedVenueIds ?? [];
  return Array.isArray(ids) ? ids : [];
}

function joinSavedVenues(savedVenueIds: string[], venues: ConsumerVenue[]): SavedVenueItem[] {
  const venuesById = new Map<string, ConsumerVenue>();
  venues.forEach((venue) => {
    venuesById.set(venue.id, venue);
    venuesById.set(venue.placeId, venue);
  });

  return savedVenueIds.map((id) => {
    const venue = venuesById.get(id);
    if (!venue) return { id, name: id, category: "Saved venue" };

    return {
      id: venue.id,
      name: venue.name,
      category: venue.category,
      address: venue.address,
    };
  });
}

function LoadingRows() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading saved venues">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-20 rounded-[18px] bg-white/10" />
      ))}
    </div>
  );
}

export default function ProfileSavedPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedVenueIds, setSavedVenueIds] = useState<string[]>([]);
  const [venues, setVenues] = useState<ConsumerVenue[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedVenues() {
      setLoading(true);
      setError("");

      try {
        const client = createBrowserClient();
        const { data } = await client.auth.getSession();
        const session: Session | null = data.session;

        if (!session?.access_token) {
          if (!cancelled) {
            setSavedVenueIds([]);
            setVenues([]);
            setError("Sign in to view your saved venues.");
          }
          return;
        }

        const [savedRes, venuesRes] = await Promise.all([
          fetch("/api/saved-venues", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
          fetch("/api/venues"),
        ]);

        if (!savedRes.ok || !venuesRes.ok) {
          if (!cancelled) {
            setSavedVenueIds([]);
            setVenues([]);
            setError("Could not load your saved venues right now.");
          }
          return;
        }

        const savedJson = (await savedRes.json()) as SavedVenueIdsResponse;
        const venuesJson = (await venuesRes.json()) as VenuesResponse;

        if (cancelled) return;
        setSavedVenueIds(getSavedVenueIds(savedJson));
        setVenues(Array.isArray(venuesJson.data?.venues) ? venuesJson.data.venues : []);
      } catch {
        if (!cancelled) {
          setSavedVenueIds([]);
          setVenues([]);
          setError("Could not load your saved venues right now.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSavedVenues();

    return () => {
      cancelled = true;
    };
  }, []);

  const savedVenues = useMemo(() => joinSavedVenues(savedVenueIds, venues), [savedVenueIds, venues]);

  return (
    <PageTransition>
      <div className="min-h-screen-safe bg-[#0A0A0E] text-white">
        <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0A0A0E]/92 px-4 backdrop-blur-xl">
          <div className="mx-auto max-w-lg py-4">
            <Link
              href="/profile"
              className="inline-flex min-h-11 items-center text-[13px] font-semibold text-[#9CA2AE] transition-colors hover:text-[#F4F5F8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
            >
              &larr; You
            </Link>
            <h1 className="mt-2 font-display text-[30px] font-semibold tracking-normal text-[#F4F5F8]">
              Saved venues
            </h1>
          </div>
        </header>

        <main className="mx-auto max-w-lg px-4 py-6 pb-20">
          {loading && <LoadingRows />}

          {!loading && error && (
            <p className="rounded-[18px] border border-[#F0568C]/25 bg-[#F0568C]/10 p-4 text-[13px] font-medium text-[#F0568C]">
              {error}
            </p>
          )}

          {!loading && !error && savedVenues.length === 0 && (
            <section className="px-4 py-12 text-center text-white/60">
              <Heart size={24} strokeWidth={1.9} aria-hidden="true" className="mx-auto" />
              <h2 className="mt-3 text-[15px] font-semibold leading-6">
                Save spots you want to revisit.
              </h2>
              <Link
                href="/explore"
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-[13px] font-semibold text-[#0A0A0E] transition-colors hover:bg-[#9B82FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
              >
                Browse South End venues
              </Link>
            </section>
          )}

          {!loading && !error && savedVenues.length > 0 && (
            <ul className="space-y-3">
              {savedVenues.map((venue) => (
                <li key={venue.id}>
                  <Link
                    href={`/venues/${encodeURIComponent(venue.id)}`}
                    className="group flex items-center justify-between gap-4 rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-4 transition-colors hover:bg-white/[0.055] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-[#F4F5F8]">{venue.name}</span>
                      <span className="mt-1 block truncate text-[12px] font-medium text-[#9CA2AE]">
                        {venue.category}
                      </span>
                      {venue.address && (
                        <span className="mt-1 block truncate text-[12px] font-medium text-[#9CA2AE]">
                          {venue.address}
                        </span>
                      )}
                    </span>
                    <ChevronRight
                      className="h-5 w-5 shrink-0 text-[#9CA2AE] transition-colors group-hover:text-[#F4F5F8]"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </PageTransition>
  );
}
