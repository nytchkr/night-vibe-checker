import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { sql } from "@/lib/db";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import type { APIResponse } from "@/types";

const RatingBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
});

function meta() {
  return { cached: false, generatedAt: new Date().toISOString() };
}

function json<T>(body: APIResponse<T> & T, init?: ResponseInit): NextResponse<APIResponse<T> & T> {
  return NextResponse.json(body, init);
}

function errorJson(
  code: string,
  message: string,
  status: number,
): NextResponse<APIResponse<never>> {
  return NextResponse.json<APIResponse<never>>(
    { status: "error", error: { code, message }, meta: meta() },
    { status },
  );
}

function missingConfigResponse(error: unknown): NextResponse<APIResponse<never>> | null {
  if (!(error instanceof MissingSupabaseEnvError)) return null;
  return errorJson("MISSING_ENV", "Server configuration is incomplete.", 503);
}

function averageRating(rows: Array<{ rating: unknown }>): number {
  const ratings = rows
    .map((row) => Number(row.rating))
    .filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5);

  if (ratings.length === 0) return 0;
  const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
  return Math.round(average * 10) / 10;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    assertSupabaseServerEnv();
  } catch (error) {
    const response = missingConfigResponse(error);
    if (response) return response;
    throw error;
  }

  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return errorJson("UNAUTHORIZED", "Login required to rate this venue.", 401);
  }

  const { id } = await params;
  const venueId = id.trim();
  if (!venueId) {
    return errorJson("MISSING_ID", "Venue id is required.", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const parsed = RatingBodySchema.safeParse(body);
  if (!parsed.success) {
    return errorJson("VALIDATION_ERROR", "Rating must be a number from 1 to 5.", 400);
  }

  await sql`
    INSERT INTO venue_ratings (venue_id, user_id, rating)
    VALUES (${venueId}, ${userId}, ${parsed.data.rating})
    ON CONFLICT (venue_id, user_id) DO UPDATE SET rating = EXCLUDED.rating
  `;

  const data = await sql`
    SELECT rating
    FROM venue_ratings
    WHERE venue_id = ${venueId}
  `;

  const response = { ok: true, avg_rating: averageRating(data as Array<{ rating: unknown }>) };

  return json({ status: "success", ...response, data: response, meta: meta() });
}
