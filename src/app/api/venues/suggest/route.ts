// ============================================================
// GET /api/venues/suggest
// Fast venue-name autocomplete for Explore search.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const CACHE_CONTROL = "s-maxage=30, stale-while-revalidate=60";

type VenueSuggestionRow = {
  id: string;
  name: string;
  category: string | null;
  zone_id: string | null;
};

type VenueSuggestion = {
  id: string;
  name: string;
  category: string | null;
  zoneId: string | null;
};

function mapSuggestion(row: VenueSuggestionRow): VenueSuggestion {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    zoneId: row.zone_id,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json(
      { error: { code: "INVALID_QUERY", message: "q must be at least 2 characters." } },
      { status: 400 },
    );
  }

  const data = await sql`
    SELECT id, name, category, zone_id
    FROM venues
    WHERE name ILIKE ${`%${q}%`}
      AND COALESCE(hidden, false) = false
    LIMIT 5
  `;

  const suggestions = (data as VenueSuggestionRow[]).map(mapSuggestion);

  return NextResponse.json(
    { suggestions },
    { headers: { "Cache-Control": CACHE_CONTROL } },
  );
}
