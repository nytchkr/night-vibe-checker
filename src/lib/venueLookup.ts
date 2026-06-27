import { supabaseAdmin } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_VENUE_LOOKUP_LENGTH = 200;

export type VenueLookupResult = {
  data: Record<string, unknown> | null;
  error: unknown;
};

type RawLookupResult = {
  data?: unknown;
  error?: unknown;
};

export function normalizeVenueLookupId(value: string | null | undefined): string {
  try {
    return decodeURIComponent(value ?? "")
      .trim()
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .slice(0, MAX_VENUE_LOOKUP_LENGTH);
  } catch {
    return "";
  }
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return (data[0] as Record<string, unknown> | undefined) ?? null;
  return (data as Record<string, unknown> | null) ?? null;
}

async function queryVisibleVenue(
  column: "id" | "place_id" | "slug",
  id: string,
  selectClause: string
): Promise<VenueLookupResult> {
  const result = (await supabaseAdmin
    .from("venues")
    .select(selectClause)
    .eq(column, id)
    .eq("hidden", false)
    .limit(1)) as RawLookupResult;

  return {
    data: firstRow(result.data),
    error: result.error ?? null,
  };
}

export async function findVisibleVenueByIdOrPlaceId(
  rawId: string | null | undefined,
  selectClause: string
): Promise<VenueLookupResult> {
  const id = normalizeVenueLookupId(rawId);
  if (!id) return { data: null, error: null };

  const placeResult = await queryVisibleVenue("place_id", id, selectClause);

  if (placeResult.error || placeResult.data) return placeResult;

  if (isUuid(id)) return queryVisibleVenue("id", id, selectClause);

  return queryVisibleVenue("slug", id, selectClause);
}
