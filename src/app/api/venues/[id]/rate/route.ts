import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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

async function getBearerUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
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

  const userId = await getBearerUserId(req.headers.get("Authorization"));
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

  const { error: upsertError } = await supabaseAdmin
    .from("venue_ratings")
    .upsert(
      { venue_id: venueId, user_id: userId, rating: parsed.data.rating },
      { onConflict: "venue_id,user_id" },
    );

  if (upsertError) {
    return errorJson("DB_ERROR", "Could not save venue rating.", 500);
  }

  const { data, error: averageError } = await supabaseAdmin
    .from("venue_ratings")
    .select("rating")
    .eq("venue_id", venueId);

  if (averageError) {
    return errorJson("DB_ERROR", "Could not load venue rating average.", 500);
  }

  const response = { ok: true, avg_rating: averageRating((data ?? []) as Array<{ rating: unknown }>) };

  return json({ status: "success", ...response, data: response, meta: meta() });
}
