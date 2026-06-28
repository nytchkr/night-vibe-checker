"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { ConsumerVenue } from "@/types";

export const SAVED_VENUES_EVENT = "nytchkr:saved-venues-changed";

type SavedVenuesResponse = {
  place_ids?: string[];
  venueIds?: string[];
  savedVenueIds?: string[];
  savedVenues?: RawSavedVenue[];
  data?: {
    savedVenueIds?: string[];
    placeIds?: string[];
    savedVenues?: RawSavedVenue[];
  };
};

type RawSavedVenue = {
  venueId?: string;
  placeId?: string | null;
  alertThreshold?: number;
  savedAt?: string | null;
  createdAt?: string | null;
  currentBusyness?: number | null;
  venue?: ConsumerVenue | null;
};

export type SavedVenue = {
  venueId: string;
  placeId: string | null;
  alertThreshold: number;
  savedAt: string | null;
  createdAt: string | null;
  currentBusyness: number | null;
  venue: ConsumerVenue | null;
};

type SavedVenueStateResponse = {
  venueId?: string;
  saved?: boolean;
  data?: {
    venueId?: string;
    saved?: boolean;
  };
};

function readSavedIds(json: SavedVenuesResponse): string[] {
  const ids = [
    ...(json.place_ids ?? []),
    ...(json.venueIds ?? []),
    ...(json.savedVenueIds ?? []),
    ...(json.data?.savedVenueIds ?? []),
    ...(json.data?.placeIds ?? []),
    ...((json.savedVenues ?? json.data?.savedVenues ?? []).flatMap((item) => [item.venueId, item.placeId])),
  ];
  return ids.filter((id): id is string => typeof id === "string" && id.length > 0);
}

function toSortableTime(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function readSavedVenues(json: SavedVenuesResponse): SavedVenue[] {
  const rawVenues = json.savedVenues ?? json.data?.savedVenues ?? [];

  return rawVenues
    .flatMap((item): SavedVenue[] => {
      if (typeof item.venueId !== "string" || item.venueId.length === 0) return [];
      const savedAt = item.savedAt ?? item.createdAt ?? null;

      return [{
        venueId: item.venueId,
        placeId: item.placeId ?? item.venue?.placeId ?? null,
        alertThreshold: item.alertThreshold ?? 70,
        savedAt,
        createdAt: item.createdAt ?? savedAt,
        currentBusyness: item.currentBusyness ?? item.venue?.signal?.busyness0To100 ?? null,
        venue: item.venue ?? null,
      }];
    })
    .sort((a, b) => toSortableTime(b.savedAt) - toSortableTime(a.savedAt));
}

export function useSavedVenues() {
  const { data: session, status } = useSession();
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [savedVenues, setSavedVenues] = useState<SavedVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!session?.user?.id) {
        setSavedIds(new Set());
        setSavedVenues([]);
        setError("Sign in to view your saved venues.");
        return;
      }

      const res = await fetch("/api/venues/saved", {
        credentials: "include",
      });

      if (!res.ok) {
        setSavedIds(new Set());
        setSavedVenues([]);
        setError("Could not load your saved venues right now.");
        return;
      }

      const json = (await res.json()) as SavedVenuesResponse;
      setSavedIds(new Set(readSavedIds(json)));
      setSavedVenues(readSavedVenues(json));
    } catch {
      setSavedIds(new Set());
      setSavedVenues([]);
      setError("Could not load your saved venues right now.");
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (status === "loading") return;

    void refresh();

    function handleSavedVenuesChanged() {
      void refresh();
    }

    window.addEventListener(SAVED_VENUES_EVENT, handleSavedVenuesChanged);

    return () => {
      window.removeEventListener(SAVED_VENUES_EVENT, handleSavedVenuesChanged);
    };
  }, [refresh, status]);

  const isSaved = useCallback((placeId: string) => savedIds.has(placeId), [savedIds]);

  const refreshVenueSavedState = useCallback(async (placeId: string) => {
    if (!session?.user?.id) {
      setSavedIds((current) => {
        const next = new Set(current);
        next.delete(placeId);
        return next;
      });
      return false;
    }

    const res = await fetch(`/api/venues/${encodeURIComponent(placeId)}/save`, {
      credentials: "include",
    });

    if (!res.ok) return null;

    const json = (await res.json()) as SavedVenueStateResponse;
    const saved = json.saved ?? json.data?.saved ?? false;
    const canonicalVenueId = json.venueId ?? json.data?.venueId ?? placeId;

    setSavedIds((current) => {
      const next = new Set(current);
      if (saved) {
        next.add(placeId);
        next.add(canonicalVenueId);
      } else {
        next.delete(placeId);
        next.delete(canonicalVenueId);
      }
      return next;
    });

    return saved;
  }, [session?.user?.id]);

  const toggle = useCallback(async (placeId: string) => {
    if (!session?.user?.id) {
      throw new Error("AUTH_REQUIRED");
    }

    const wasSaved = savedIds.has(placeId);
    const nextSaved = !wasSaved;
    setSavedIds((current) => {
      const next = new Set(current);
      if (nextSaved) {
        next.add(placeId);
      } else {
        next.delete(placeId);
      }
      return next;
    });

    try {
      const res = await fetch(`/api/venues/${encodeURIComponent(placeId)}/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error(`${res.status}`);
      const json = (await res.json()) as SavedVenueStateResponse;
      const saved = json.saved ?? json.data?.saved ?? nextSaved;
      const canonicalVenueId = json.venueId ?? json.data?.venueId ?? placeId;
      setSavedIds((current) => {
        const next = new Set(current);
        if (saved) {
          next.add(placeId);
          next.add(canonicalVenueId);
        } else {
          next.delete(placeId);
          next.delete(canonicalVenueId);
        }
        return next;
      });
      window.dispatchEvent(new CustomEvent(SAVED_VENUES_EVENT));
      return saved;
    } catch (error) {
      setSavedIds((current) => {
        const next = new Set(current);
        if (wasSaved) {
          next.add(placeId);
        } else {
          next.delete(placeId);
        }
        return next;
      });
      throw error;
    }
  }, [savedIds, session?.user?.id]);

  return { error, isSaved, loading, refresh, refreshVenueSavedState, savedIds, savedVenues, toggle };
}
