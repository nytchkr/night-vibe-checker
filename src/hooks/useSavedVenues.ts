"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";

export const SAVED_VENUES_EVENT = "nightvibe:saved-venues-changed";

type SavedVenuesResponse = {
  place_ids?: string[];
  venueIds?: string[];
  savedVenueIds?: string[];
  data?: {
    savedVenueIds?: string[];
  };
};

function readSavedIds(json: SavedVenuesResponse): string[] {
  const ids = json.place_ids ?? json.venueIds ?? json.savedVenueIds ?? json.data?.savedVenueIds ?? [];
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
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

      const res = await fetch("/api/saved-venues", {
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
      const res = await fetch("/api/saved-venues", {
        method: nextSaved ? "POST" : "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ place_id: placeId }),
      });

      if (!res.ok) throw new Error(`${res.status}`);
      window.dispatchEvent(new CustomEvent(SAVED_VENUES_EVENT));
      return nextSaved;
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

  return { isSaved, toggle, loading };
}
