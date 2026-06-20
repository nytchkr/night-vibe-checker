import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type VenueRow = {
  id: string;
  place_id: string | null;
};

type RefreshError = {
  venueId: string;
  placeId?: string;
  error: string;
};

type GooglePlaceDetailsResponse = {
  status?: string;
  error_message?: string;
  result?: {
    opening_hours?: {
      open_now?: boolean;
    };
  };
};

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  return (
    auth === `Bearer ${secret}` ||
    cronSecret === secret ||
    req.nextUrl.searchParams.get("secret") === secret
  );
}

async function fetchOpenNow(placeId: string, googlePlacesKey: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "opening_hours");
  url.searchParams.set("key", googlePlacesKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Places HTTP ${response.status}`);
  }

  const payload = (await response.json()) as GooglePlaceDetailsResponse;
  if (payload.status && payload.status !== "OK") {
    throw new Error(payload.error_message ?? `Google Places status ${payload.status}`);
  }

  return payload.result?.opening_hours?.open_now ?? null;
}

async function refreshOpenNowFromGoogle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const googlePlacesKey = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_PLACES_KEY;
  if (!googlePlacesKey) {
    return NextResponse.json(
      { error: "Missing GOOGLE_PLACES_API_KEY server environment variable." },
      { status: 500 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("id, place_id")
    .eq("hidden", false)
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const errors: RefreshError[] = [];
  const updates: Array<{ id: string; open_now: boolean | null }> = [];

  for (const venue of (data ?? []) as VenueRow[]) {
    if (!venue.place_id) {
      errors.push({ venueId: venue.id, error: "Missing place_id" });
      continue;
    }

    try {
      const openNow = await fetchOpenNow(venue.place_id, googlePlacesKey);
      updates.push({ id: venue.id, open_now: openNow });
    } catch (err) {
      errors.push({
        venueId: venue.id,
        placeId: venue.place_id,
        error: err instanceof Error ? err.message : "Unknown Google Places error",
      });
    }
  }

  if (updates.length) {
    const { error: upsertError } = await supabaseAdmin.from("venues").upsert(updates, {
      onConflict: "id",
    });

    if (upsertError) {
      return NextResponse.json(
        {
          refreshed: 0,
          errors: [...errors, { venueId: "batch", error: upsertError.message }],
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ refreshed: updates.length, errors });
}

export async function GET(req: NextRequest) {
  return refreshOpenNowFromGoogle(req);
}

export async function POST(req: NextRequest) {
  return refreshOpenNowFromGoogle(req);
}
