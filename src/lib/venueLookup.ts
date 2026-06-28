import { sql } from "@/lib/db";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_VENUE_LOOKUP_LENGTH = 200;

export type VenueLookupResult = {
  data: Record<string, unknown> | null;
  error: unknown;
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

async function queryVisibleVenue(
  column: "id" | "place_id" | "slug",
  id: string,
  _selectClause: string
): Promise<VenueLookupResult> {
  const rows = (
    column === "id"
      ? await sql`
          SELECT v.*, to_jsonb(vs) AS venue_signals
          FROM venues v
          LEFT JOIN venue_signals vs ON vs.venue_id = v.id
          WHERE v.id = ${id}
            AND COALESCE(v.hidden, false) = false
          LIMIT 1
        `
      : column === "place_id"
        ? await sql`
            SELECT v.*, to_jsonb(vs) AS venue_signals
            FROM venues v
            LEFT JOIN venue_signals vs ON vs.venue_id = v.id
            WHERE v.place_id = ${id}
              AND COALESCE(v.hidden, false) = false
            LIMIT 1
          `
        : await sql`
            SELECT v.*, to_jsonb(vs) AS venue_signals
            FROM venues v
            LEFT JOIN venue_signals vs ON vs.venue_id = v.id
            WHERE v.slug = ${id}
              AND COALESCE(v.hidden, false) = false
            LIMIT 1
          `
  ) as Array<Record<string, unknown>>;

  return {
    data: (rows[0] as Record<string, unknown> | undefined) ?? null,
    error: null,
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
