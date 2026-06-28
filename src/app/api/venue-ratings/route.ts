import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { sql } from "@/lib/db";
import { assertSupabaseServerEnv, MissingSupabaseEnvError } from "@/lib/supabase";
import type { APIResponse } from "@/types";

// Uses service role — bypasses RLS intentionally for server-side validation and writes.
type VenueRatingsData = {
  averageRating: number | null;
  ratingCount: number;
  userRating: number | null;
};

type VenueRatingsResponse = APIResponse<VenueRatingsData> & VenueRatingsData;

const VenueIdSchema = z.string().trim().min(1).max(200);
const WRITE_ID_ALLOWLIST = /[^a-zA-Z0-9_-]/g;

const RatingBodySchema = z.object({
  venue_id: VenueIdSchema,
  rating: z.number().int().min(1).max(5),
  user_id: z.string().trim().max(100).optional(),
});

const PRIVATE_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache",
};

const EDGE_CACHE_HEADERS = {
  "Cache-Control": "s-maxage=30, stale-while-revalidate=60",
};

function meta() {
  return { cached: false, generatedAt: new Date().toISOString() };
}

function json<T>(body: APIResponse<T>, init?: ResponseInit): NextResponse<APIResponse<T>> {
  return NextResponse.json(body, init);
}

function missingConfigResponse(error: unknown, headers?: HeadersInit): NextResponse<APIResponse<never>> | null {
  if (!(error instanceof MissingSupabaseEnvError)) return null;
  return json<never>(
    { status: "error", error: { code: "MISSING_ENV", message: "Server configuration is incomplete." }, meta: meta() },
    { status: 503, headers },
  );
}

function normalizeStoredRating(rating: unknown): number | null {
  const n = Number(rating);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

function sanitizeWriteId(value: string): string {
  return value.trim().replace(WRITE_ID_ALLOWLIST, "");
}

function summarizeRatings(rows: Array<{ rating: unknown }>): Pick<VenueRatingsData, "averageRating" | "ratingCount"> {
  const ratings = rows
    .map((row) => normalizeStoredRating(row.rating))
    .filter((r): r is number => r !== null);

  if (ratings.length === 0) return { averageRating: null, ratingCount: 0 };

  const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  return { averageRating: Math.round(avg * 10) / 10, ratingCount: ratings.length };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    assertSupabaseServerEnv();
  } catch (error) {
    const response = missingConfigResponse(error, PRIVATE_CACHE_HEADERS);
    if (response) return response;
    throw error;
  }

  const venueIdParam = req.nextUrl.searchParams.get("venue_id") ?? req.nextUrl.searchParams.get("venueId");
  const venueId = VenueIdSchema.safeParse(venueIdParam);
  if (!venueId.success) {
    return json<never>(
      {
        status: "error",
        error: { code: "VALIDATION_ERROR", message: "venueId query parameter is required." },
        meta: meta(),
      },
      { status: 400, headers: PRIVATE_CACHE_HEADERS },
    );
  }

  const data = await sql`
    SELECT rating
    FROM venue_ratings
    WHERE venue_id = ${venueId.data}
  `;

  const summary = summarizeRatings(data as Array<{ rating: unknown }>);

  const userId = await getAuthenticatedUserId(req);
  const responseHeaders = userId ? PRIVATE_CACHE_HEADERS : EDGE_CACHE_HEADERS;

  let userRating: number | null = null;
  if (userId) {
    const [userRow] = (await sql`
      SELECT rating
      FROM venue_ratings
      WHERE venue_id = ${venueId.data}
        AND user_id = ${userId}
      LIMIT 1
    `) as Array<{ rating?: unknown }>;

    userRating = normalizeStoredRating(userRow?.rating);
  }

  const responseData: VenueRatingsData = { ...summary, userRating };

  return NextResponse.json<VenueRatingsResponse>(
    { status: "success", ...responseData, data: responseData, meta: meta() },
    { headers: responseHeaders },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    assertSupabaseServerEnv();
  } catch (error) {
    const response = missingConfigResponse(error);
    if (response) return response;
    throw error;
  }

  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return json<never>(
      {
        status: "error",
        error: { code: "UNAUTHORIZED", message: "Login required to rate venues." },
        meta: meta(),
      },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json<never>(
      { status: "error", error: { code: "INVALID_JSON", message: "Request body must be valid JSON." }, meta: meta() },
      { status: 400 },
    );
  }

  const candidate = body as { rating?: unknown; venue_id?: unknown; user_id?: unknown };
  const submittedRating = candidate.rating;
  if (typeof submittedRating !== "number" || !Number.isInteger(submittedRating) || submittedRating < 1 || submittedRating > 5) {
    return NextResponse.json({ error: "Invalid rating. Must be 1-5." }, { status: 400 });
  }
  if (typeof candidate.venue_id !== "string" || !candidate.venue_id.trim() || candidate.venue_id.length > 200) {
    return NextResponse.json({ error: "venue_id is required." }, { status: 400 });
  }
  if (candidate.user_id !== undefined && (typeof candidate.user_id !== "string" || candidate.user_id.length > 100)) {
    return NextResponse.json({ error: "Invalid user_id." }, { status: 400 });
  }

  const sanitizedBody = {
    ...candidate,
    venue_id: sanitizeWriteId(candidate.venue_id),
    user_id: typeof candidate.user_id === "string" ? sanitizeWriteId(candidate.user_id) : undefined,
  };
  if (!sanitizedBody.venue_id) {
    return NextResponse.json({ error: "venue_id is required." }, { status: 400 });
  }

  const parsed = RatingBodySchema.safeParse(sanitizedBody);
  if (!parsed.success) {
    return json<never>(
      {
        status: "error",
        error: { code: "VALIDATION_ERROR", message: "venue_id and rating (1-5) are required." },
        meta: meta(),
      },
      { status: 400 },
    );
  }

  const { rating, user_id: submittedUserId } = parsed.data;
  const venueId = parsed.data.venue_id;
  if (!venueId) {
    return json<never>(
      {
        status: "error",
        error: { code: "VALIDATION_ERROR", message: "venue_id and rating (1-5) are required." },
        meta: meta(),
      },
      { status: 400 },
    );
  }
  if (submittedUserId && submittedUserId !== userId) {
    return json<never>(
      {
        status: "error",
        error: { code: "FORBIDDEN", message: "Cannot rate a venue for a different user." },
        meta: meta(),
      },
      { status: 403 },
    );
  }

  await sql`
    INSERT INTO venue_ratings (venue_id, user_id, rating)
    VALUES (${venueId}, ${userId}, ${rating})
    ON CONFLICT (venue_id, user_id) DO UPDATE SET rating = EXCLUDED.rating
  `;

  return json({ status: "success", data: { venue_id: venueId, user_id: userId, rating }, meta: meta() });
}
