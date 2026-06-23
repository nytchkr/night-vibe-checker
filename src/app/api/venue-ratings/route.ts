import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";
import type { APIResponse } from "@/types";

type VenueRatingValue = "up" | "down";

type VenueRatingsData = {
  upCount: number;
  downCount: number;
  userRating: VenueRatingValue | null;
};

type VenueRatingsResponse = APIResponse<VenueRatingsData> & VenueRatingsData;

const VenueIdSchema = z.string().trim().min(1);

const RatingBodySchema = z.object({
  venueId: VenueIdSchema,
  rating: z.enum(["up", "down"]),
});

const PRIVATE_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache",
};

function meta() {
  return { cached: false, generatedAt: new Date().toISOString() };
}

function json<T>(body: APIResponse<T>, init?: ResponseInit): NextResponse<APIResponse<T>> {
  return NextResponse.json(body, init);
}

async function getBearerUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

function missingConfigResponse(error: unknown, headers?: HeadersInit): NextResponse<APIResponse<never>> | null {
  if (!(error instanceof MissingSupabaseEnvError)) return null;
  return json<never>(
    { status: "error", error: { code: "MISSING_ENV", message: "Server configuration is incomplete." }, meta: meta() },
    { status: 503, headers },
  );
}

function countRatings(rows: Array<{ rating: unknown }>): Pick<VenueRatingsData, "upCount" | "downCount"> {
  return rows.reduce(
    (counts, row) => {
      const rating = normalizeStoredRating(row.rating);
      if (rating === "up") counts.upCount += 1;
      if (rating === "down") counts.downCount += 1;
      return counts;
    },
    { upCount: 0, downCount: 0 },
  );
}

function normalizeStoredRating(rating: unknown): VenueRatingValue | null {
  if (rating === "up" || rating === "down") return rating;
  const numericRating = Number(rating);
  if (!Number.isFinite(numericRating)) return null;
  if (numericRating >= 4) return "up";
  if (numericRating <= 2) return "down";
  return null;
}

function ratingToStoredValue(rating: VenueRatingValue): number {
  return rating === "up" ? 5 : 1;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    assertSupabaseServerEnv();
  } catch (error) {
    const response = missingConfigResponse(error, PRIVATE_CACHE_HEADERS);
    if (response) return response;
    throw error;
  }

  const venueIdParam = req.nextUrl.searchParams.get("venueId");
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

  const userId = await getBearerUserId(req.headers.get("Authorization"));
  const { data, error } = await supabaseAdmin
    .from("venue_ratings")
    .select("rating")
    .eq("venue_id", venueId.data);

  if (error) {
    return json<never>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not fetch venue ratings." }, meta: meta() },
      { status: 500, headers: PRIVATE_CACHE_HEADERS },
    );
  }

  let userRating: VenueRatingValue | null = null;
  if (userId) {
    const { data: userRow, error: userError } = await supabaseAdmin
      .from("venue_ratings")
      .select("rating")
      .eq("venue_id", venueId.data)
      .eq("user_id", userId)
      .maybeSingle();

    if (userError) {
      return json<never>(
        { status: "error", error: { code: "DB_ERROR", message: "Could not fetch your venue rating." }, meta: meta() },
        { status: 500, headers: PRIVATE_CACHE_HEADERS },
      );
    }

    userRating = normalizeStoredRating(userRow?.rating);
  }

  const counts = countRatings((data ?? []) as Array<{ rating: unknown }>);
  const response: VenueRatingsData = { ...counts, userRating };

  return NextResponse.json<VenueRatingsResponse>(
    { status: "success", ...response, data: response, meta: meta() },
    { headers: PRIVATE_CACHE_HEADERS },
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

  const userId = await getBearerUserId(req.headers.get("Authorization"));
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

  const parsed = RatingBodySchema.safeParse(body);
  if (!parsed.success) {
    return json<never>(
      {
        status: "error",
        error: { code: "VALIDATION_ERROR", message: "venueId and rating ('up' or 'down') are required." },
        meta: meta(),
      },
      { status: 400 },
    );
  }

  const { venueId, rating } = parsed.data;
  const { error } = await supabaseAdmin
    .from("venue_ratings")
    .upsert({ venue_id: venueId, user_id: userId, rating: ratingToStoredValue(rating) }, { onConflict: "venue_id,user_id" });

  if (error) {
    return json<never>(
      { status: "error", error: { code: "DB_ERROR", message: "Could not save venue rating." }, meta: meta() },
      { status: 500 },
    );
  }

  return json({ status: "success", data: { venueId, rating }, meta: meta() });
}
