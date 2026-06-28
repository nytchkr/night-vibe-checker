import { NextRequest, NextResponse } from "next/server";
import { refreshGooglePlacesDetailsForVenue, type PlaceDetailsVenueRow } from "@/lib/googlePlacesDetails";
import { sql } from "@/lib/db";
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
    const data = await sql`
      SELECT id, place_id, name, current_popularity_updated_at
      FROM venues
      WHERE place_id IS NOT NULL
        AND place_id NOT LIKE 'fallback:%'
        AND COALESCE(hidden, false) = false
      ORDER BY current_popularity_updated_at ASC NULLS FIRST
      LIMIT 50
    `;

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
          await sql`
            UPDATE venues
            SET current_popularity_updated_at = ${new Date().toISOString()}
            WHERE id = ${venue.id}
          `;
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
