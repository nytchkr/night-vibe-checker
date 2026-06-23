"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeToPush } from "@/lib/push";
import { createBrowserClient } from "@/lib/supabase-browser";

export const SAVED_VENUES_EVENT = "nightvibe:saved-venues-changed";

type SavedVenuesResponse = {
  place_ids?: string[];
  venueIds?: string[];
  savedVenueIds?: string[];
  savedVenues?: Array<{ venueId?: string; placeId?: string | null }>;
  data?: {
    savedVenueIds?: string[];
    placeIds?: string[];
    savedVenues?: Array<{ venueId?: string; placeId?: string | null }>;
  };
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

async function savePushSubscription(accessToken: string) {
  const subscription = await subscribeToPush();
  if (!subscription) return;

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(subscription.toJSON()),
  });
}

export function useSavedVenues() {
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);

  const getAccessToken = useCallback(async () => {
    const client = createBrowserClient();
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setSavedIds(new Set());
        return;
      }

      const res = await fetch("/api/venues/saved", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setSavedIds(new Set());
        return;
      }

      const json = (await res.json()) as SavedVenuesResponse;
      setSavedIds(new Set(readSavedIds(json)));
    } catch {
      setSavedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    const client = createBrowserClient();
    void refresh();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(() => {
      void refresh();
    });

    function handleSavedVenuesChanged() {
      void refresh();
    }

    window.addEventListener(SAVED_VENUES_EVENT, handleSavedVenuesChanged);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener(SAVED_VENUES_EVENT, handleSavedVenuesChanged);
    };
  }, [refresh]);

  const isSaved = useCallback((placeId: string) => savedIds.has(placeId), [savedIds]);

  const refreshVenueSavedState = useCallback(async (placeId: string) => {
    const token = await getAccessToken();
    if (!token) {
      setSavedIds((current) => {
        const next = new Set(current);
        next.delete(placeId);
        return next;
      });
      return false;
    }

    const res = await fetch(`/api/venues/${encodeURIComponent(placeId)}/save`, {
      headers: { Authorization: `Bearer ${token}` },
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
  }, [getAccessToken]);

  const toggle = useCallback(async (placeId: string) => {
    const token = await getAccessToken();
    if (!token) {
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
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
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
      if (saved) void savePushSubscription(token);
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
  }, [getAccessToken, savedIds]);

  return { isSaved, savedIds, refreshVenueSavedState, toggle, loading };
}
