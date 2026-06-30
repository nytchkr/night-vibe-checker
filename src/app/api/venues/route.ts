// ============================================================
// GET /api/venues
// Consumer cached venue list for the locked launch zone.
// No Google/BestTime calls happen during normal page reads.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { sql } from "@/lib/db";
import { checkRateLimit, rateLimitHeaders } from "@/lib/upstashRateLimit";
import { redis } from "@/lib/upstashRedis";
import { LAUNCH_ZONE, LAUNCH_ZONES } from "@/lib/launchZone";
import { inferCanonicalOpenNow } from "@/lib/openNow";
import { mapGoogleOpeningHours } from "@/lib/venueHours";
import { inZone } from "@/lib/zone";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse, ConsumerVenue, VenueSignal } from "@/types";

export const dynamic = "force-dynamic";

const LAUNCH_ZONE_IDS = LAUNCH_ZONES.map((zone) => zone.id);
const LAUNCH_ZONE_ID_SET = new Set<string>(LAUNCH_ZONE_IDS);

const VENUE_SELECT = `
  id, place_id, zone_id, name, address, lat, lng, venue_type, category,
  slug, neighborhood,
  rating, google_rating, total_ratings, user_rating_count, price_level, photo_reference, photo_url, photo_urls, hidden,
  phone, phone_number, website, google_maps_uri, editorial_summary, opening_hours, open_now, besttime_venue_id,
  updated_at,
  venue_signals (
    venue_id, place_id, busyness_0_100, busyness_source,
    confidence_0_1, computed_at, last_busyness_refresh
  )
`;

const VENUE_SELECT_LEGACY = `
  id, place_id, zone_id, name, address, lat, lng, venue_type, category,
  slug,
  rating, google_rating, total_ratings, price_level, photo_reference, photo_url, hidden,
  open_now, updated_at,
  venue_signals (
    venue_id, place_id, busyness_0_100, busyness_source,
    confidence_0_1, computed_at, last_busyness_refresh
  )
`;

const PUBLIC_CACHE_CONTROL = "s-maxage=120, stale-while-revalidate=300";
const PRIVATE_CACHE_CONTROL = "private, no-cache";
const VENUE_LIST_CACHE_KEY = "nv:venues:list";
const VENUE_LIST_CACHE_TTL_SECONDS = 120;

type VenueQueryResult = {
  data: Record<string, unknown>[] | null;
  error: unknown;
};

type VenueSearchRow = {
  id: string;
  search_rank: number;
};

type VenueListPayload = {
  zone: typeof LAUNCH_ZONE;
  venues: ConsumerVenue[];
};

function isAuthenticatedRequest(req: NextRequest): boolean {
  return Boolean(req.headers.get("authorization")?.trim());
}

function cacheHeaders(authenticated: boolean, etag?: string): Record<string, string> {
  return {
    "Cache-Control": authenticated ? PRIVATE_CACHE_CONTROL : PUBLIC_CACHE_CONTROL,
    ...(etag ? { ETag: etag } : {}),
  };
}

function createVenueListEtag(venues: ConsumerVenue[]): string {
  const digest = createHash("sha256").update(JSON.stringify(venues)).digest("base64url");
  return `"venues-${digest}"`;
}

function normalizeCachedVenueList(value: unknown): VenueListPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as { zone?: unknown; venues?: unknown };
  if (!Array.isArray(payload.venues)) return null;
  return {
    zone: LAUNCH_ZONE,
    venues: payload.venues as ConsumerVenue[],
  };
}

async function readCachedVenueList(): Promise<VenueListPayload | null> {
  if (!redis) return null;
  try {
    return normalizeCachedVenueList(await redis.get(VENUE_LIST_CACHE_KEY));
  } catch (error) {
    console.warn("[venues] Redis cache read failed; falling back to DB.", error);
    return null;
  }
}

async function writeCachedVenueList(payload: VenueListPayload): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(VENUE_LIST_CACHE_KEY, payload, { ex: VENUE_LIST_CACHE_TTL_SECONDS });
  } catch (error) {
    console.warn("[venues] Redis cache write failed.", error);
  }
}

function parseOptionalNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOptionalParam(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function distanceMeters(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMeters * 2 * Math.asin(Math.sqrt(a));
}

function mapSignal(row: Record<string, unknown> | undefined): VenueSignal | null {
  if (!row) return null;
  return {
    venueId: row.venue_id as string,
    placeId: row.place_id as string,
    busyness0To100: (row.busyness_0_100 ?? null) as number | null,
    busynessSource: (row.busyness_source ?? null) as VenueSignal["busynessSource"],
    confidence0To1: Number(row.confidence_0_1 ?? 0),
    computedAt: row.computed_at as string,
    updatedAt: null,
    lastBusynessRefresh: (row.last_busyness_refresh ?? null) as string | null,
  };
}

function mapPhotoUrls(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const urls = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return urls.length ? urls : undefined;
}

function mapPhotoUrl(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function mapVenuePhotoUrls(row: Record<string, unknown>): string[] | undefined {
  const urls = new Set<string>();
  if (Array.isArray(row.photo_url)) {
    for (const item of row.photo_url) {
      if (typeof item === "string" && item.length > 0) urls.add(item);
    }
  }
  for (const item of mapPhotoUrls(row.photo_urls) ?? []) urls.add(item);
  return urls.size ? Array.from(urls) : undefined;
}

function mapVenue(row: Record<string, unknown>): ConsumerVenue {
  const sig = row.venue_signals;
  const signalRow: Record<string, unknown> | undefined = Array.isArray(sig)
    ? (sig[0] as Record<string, unknown> | undefined)
    : sig != null
    ? (sig as Record<string, unknown>)
    : undefined;
  const signal = mapSignal(signalRow);
  return {
    id: row.id as string,
    slug: (row.slug ?? undefined) as string | undefined,
    placeId: row.place_id as string,
    zoneId: row.zone_id as string,
    name: row.name as string,
    address: row.address as string,
    lat: Number(row.lat),
    lng: Number(row.lng),
    neighborhood: (row.neighborhood ?? undefined) as string | undefined,
    category: (row.category ?? row.venue_type ?? "establishment") as string,
    rating: row.rating == null ? null : Number(row.rating),
    googleRating: row.google_rating == null ? undefined : Number(row.google_rating),
    totalRatings: row.total_ratings == null ? undefined : Number(row.total_ratings),
    userRatingCount: row.user_rating_count == null ? null : Number(row.user_rating_count),
    priceLevel: row.price_level == null ? null : (Number(row.price_level) as ConsumerVenue["priceLevel"]),
    photoReference: (row.photo_reference ?? undefined) as string | undefined,
    photoUrl: mapPhotoUrl(row.photo_url),
    photoUrls: mapVenuePhotoUrls(row),
    phone: (row.phone ?? row.phone_number ?? undefined) as string | undefined,
    phoneNumber: (row.phone_number ?? row.phone ?? undefined) as string | undefined,
    website: (row.website ?? undefined) as string | undefined,
    googleMapsUri: (row.google_maps_uri ?? undefined) as string | undefined,
    editorialSummary: (row.editorial_summary ?? undefined) as string | undefined,
    openingHours: mapGoogleOpeningHours(row.opening_hours),
    openNow: inferCanonicalOpenNow({
      category: (row.category ?? row.venue_type) as string | null,
      openingHours: row.opening_hours,
      refreshedAt: row.updated_at,
    }),
    besttimeVenueId: (row.besttime_venue_id ?? undefined) as string | undefined,
    hidden: Boolean(row.hidden),
    signal,
  };
}

function isMissingContactColumn(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? "");
  return (
    message.includes("'phone' column") ||
    message.includes("'phone_number' column") ||
    message.includes("'website' column") ||
    message.includes("'google_maps_uri' column") ||
    message.includes("'editorial_summary' column") ||
    message.includes("'user_rating_count' column") ||
    message.includes("'photo_urls' column") ||
    message.includes("'neighborhood' column") ||
    message.includes("'besttime_venue_id' column") ||
    message.includes("venues.phone") ||
    message.includes("venues.phone_number") ||
    message.includes("venues.website") ||
    message.includes("venues.google_maps_uri") ||
    message.includes("venues.editorial_summary") ||
    message.includes("venues.user_rating_count") ||
    message.includes("venues.photo_urls") ||
    message.includes("venues.neighborhood") ||
    message.includes("venues.besttime_venue_id")
  );
}

async function loadVenueRows(
  _select: string,
  params: {
    category: string | null;
    zoneId: string | null;
    searchIds: string[] | null;
  }
): Promise<VenueQueryResult> {
  const zoneIds = params.zoneId ? [params.zoneId] : LAUNCH_ZONE_IDS;
  if (params.searchIds?.length === 0) return { data: [], error: null };

  const rows = await sql`
    SELECT v.*, to_jsonb(vs) AS venue_signals
    FROM venues v
    LEFT JOIN venue_signals vs ON vs.venue_id = v.id
    WHERE v.zone_id = ANY(${zoneIds}::text[])
      AND COALESCE(v.hidden, false) = false
      AND (${params.category}::text IS NULL OR v.category ILIKE ${params.category})
      AND (${params.searchIds}::uuid[] IS NULL OR v.id = ANY(${params.searchIds}::uuid[]))
    ORDER BY v.name ASC
    LIMIT 200
  `;

  return { data: rows as Record<string, unknown>[], error: null };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();
  const generatedAt = new Date().toISOString();
  const authenticated = isAuthenticatedRequest(req);
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous";

  const rate = await checkRateLimit(`venues:${ip}`, 60, 60_000);
  const headers = rateLimitHeaders(rate);
  if (!rate.allowed) {
    const retrySeconds = Math.ceil((rate.retryAfterMs ?? 60_000) / 1000);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "RATE_LIMITED", message: "Too many requests." },
        meta: { cached: true, generatedAt, requestId },
      },
      { status: 429, headers: { ...headers, "Retry-After": String(retrySeconds) } }
    );
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const searchQuery = normalizeOptionalParam(searchParams.get("q"));
    const category = normalizeOptionalParam(searchParams.get("category"));
    const requestedZone = normalizeOptionalParam(searchParams.get("zone"));
    const zoneId = requestedZone && LAUNCH_ZONE_ID_SET.has(requestedZone) ? requestedZone : null;
    const lat = parseOptionalNumber(searchParams.get("lat"));
    const lng = parseOptionalNumber(searchParams.get("lng"));
    const radiusMeters = parseOptionalNumber(searchParams.get("radius"));
    const hasRadiusFilter = lat !== null && lng !== null && radiusMeters !== null && radiusMeters > 0;
    const canUseVenueListCache =
      !authenticated &&
      !searchQuery &&
      !category &&
      !requestedZone &&
      !hasRadiusFilter;

    if (canUseVenueListCache) {
      const cached = await readCachedVenueList();
      if (cached) {
        const etag = createVenueListEtag(cached.venues);
        const responseHeaders = { ...headers, ...cacheHeaders(false, etag) };
        if (req.headers.get("if-none-match") === etag) {
          return new NextResponse(null, { status: 304, headers: responseHeaders });
        }

        return NextResponse.json<APIResponse<VenueListPayload>>(
          {
            status: "success",
            data: cached,
            meta: { cached: true, generatedAt, requestId },
          },
          { headers: responseHeaders }
        );
      }
    }
    let searchRankById = new Map<string, number>();
    let searchIds: string[] | null = null;

    if (searchQuery) {
      const searchRows = (await sql`
        SELECT
          id,
          ts_rank_cd(search_vector, plainto_tsquery('english', ${searchQuery})) AS search_rank
        FROM venues
        WHERE COALESCE(hidden, false) = false
          AND (${zoneId}::text IS NULL OR zone_id = ${zoneId})
          AND (${category}::text IS NULL OR category ILIKE ${category})
          AND (
            search_vector @@ plainto_tsquery('english', ${searchQuery})
            OR name ILIKE ${`%${searchQuery}%`}
            OR address ILIKE ${`%${searchQuery}%`}
          )
        ORDER BY search_rank DESC NULLS LAST, name ASC
        LIMIT 100
      `) as VenueSearchRow[];

      const rankedRows = searchRows.filter((row) => row.id);
      searchIds = rankedRows.map((row) => row.id);
      searchRankById = new Map(rankedRows.map((row) => [row.id, Number(row.search_rank ?? 0)]));

      if (searchIds.length === 0) {
        const venues: ConsumerVenue[] = [];
        const etag = createVenueListEtag(venues);
        const responseHeaders = { ...headers, ...cacheHeaders(authenticated, etag) };
        if (req.headers.get("if-none-match") === etag) {
          return new NextResponse(null, { status: 304, headers: responseHeaders });
        }

        return NextResponse.json<APIResponse<VenueListPayload>>({
          status: "success",
          data: { zone: LAUNCH_ZONE, venues },
          meta: { cached: false, generatedAt, requestId },
        }, { headers: responseHeaders });
      }
    }

    const primaryResult = await loadVenueRows(VENUE_SELECT, { category, zoneId, searchIds });
    let data = primaryResult.data;
    let error = primaryResult.error;

    if (error && isMissingContactColumn(error)) {
      const legacyResult = await loadVenueRows(VENUE_SELECT_LEGACY, { category, zoneId, searchIds });
      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) {
      console.error("[venues] cached DB error:", error);
      return NextResponse.json<APIResponse<never>>(
        {
          status: "error",
          error: { code: "DB_ERROR", message: "Could not load cached venues." },
          meta: { cached: true, generatedAt, requestId },
        },
        { status: 500, headers }
      );
    }

    const venues = (data ?? [])
      .map(mapVenue)
      .filter((venue) => inZone(venue.lat, venue.lng))
      .filter((venue) => {
        if (!hasRadiusFilter) return true;
        return distanceMeters(lat, lng, venue.lat, venue.lng) <= radiusMeters;
      })
      .sort((a, b) => {
        if (searchQuery) {
          const rankDelta = (searchRankById.get(b.id) ?? 0) - (searchRankById.get(a.id) ?? 0);
          if (rankDelta !== 0) return rankDelta;
          return a.name.localeCompare(b.name);
        }

        const aBusyness = a.signal?.busyness0To100;
        const bBusyness = b.signal?.busyness0To100;
        const aRating = a.rating ?? a.googleRating ?? null;
        const bRating = b.rating ?? b.googleRating ?? null;

        if (aBusyness == null && bBusyness == null) {
          if (aRating == null && bRating == null) return a.name.localeCompare(b.name);
          if (aRating == null) return 1;
          if (bRating == null) return -1;
          return bRating - aRating || a.name.localeCompare(b.name);
        }
        if (aBusyness == null) return 1;
        if (bBusyness == null) return -1;
        if (bBusyness !== aBusyness) return bBusyness - aBusyness;
        if (aRating == null && bRating == null) return a.name.localeCompare(b.name);
        if (aRating == null) return 1;
        if (bRating == null) return -1;
        return bRating - aRating || a.name.localeCompare(b.name);
      });

    const etag = createVenueListEtag(venues);
    const responseHeaders = { ...headers, ...cacheHeaders(authenticated, etag) };
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: responseHeaders });
    }

    const payload = { zone: LAUNCH_ZONE, venues };
    if (canUseVenueListCache) await writeCachedVenueList(payload);

    return NextResponse.json<APIResponse<VenueListPayload>>({
      status: "success",
      data: payload,
      meta: { cached: false, generatedAt, requestId },
    }, { headers: responseHeaders });
  } catch (error) {
    console.error("[venues] unexpected error:", error);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "DB_ERROR", message: "Could not load cached venues." },
        meta: { cached: true, generatedAt, requestId },
      },
      { status: 500, headers }
    );
  }
}
