import { NextRequest, NextResponse } from "next/server";
import { refreshGooglePlacesDetailsForVenue, type PlaceDetailsVenueRow } from "@/lib/googlePlacesDetails";
import { supabaseAdmin } from "@/lib/supabase";
import { isAuthorizedCronRequest } from "@/lib/apiSecurity";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  return isAuthorizedCronRequest(req);
}

async function refreshPlacesDetails(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("venues")
      .select("id, place_id, name, current_popularity_updated_at")
      .not("place_id", "is", null)
      .not("place_id", "like", "fallback:%")
      .eq("hidden", false)
      .order("current_popularity_updated_at", { ascending: true, nullsFirst: true })
      .limit(50);

    if (error) throw error;

    let updated = 0;
    let skipped = 0;
    const errors: Array<{ venueId: string; error: string }> = [];

    for (const venue of (data ?? []) as PlaceDetailsVenueRow[]) {
      try {
        const result = await refreshGooglePlacesDetailsForVenue(venue, { refreshStaticFields: false });
        if (result.popularityUpdated) {
          updated += 1;
        } else {
          skipped += 1;
          await supabaseAdmin
            .from("venues")
            .update({ current_popularity_updated_at: new Date().toISOString() })
            .eq("id", venue.id);
        }
      } catch (err) {
        skipped += 1;
        errors.push({
          venueId: venue.id,
          error: err instanceof Error ? err.message : "Unknown refresh error",
        });
      }
    }

    return NextResponse.json({ updated, skipped, errors });
  } catch (err) {
    console.error("[cron/refresh-places-details] Refresh failed:", err);
    return NextResponse.json({ error: "Refresh Places details failed." }, { status: 500 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return refreshPlacesDetails(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return refreshPlacesDetails(req);
}
