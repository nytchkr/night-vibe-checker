/*
-- CREATE TABLE IF NOT EXISTS saved_venues (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, place_id text NOT NULL, created_at timestamptz DEFAULT now(), UNIQUE(user_id, place_id));
*/

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { sql } from "@/lib/db";
import type { APIResponse } from "@/types";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    place_id: z.string().trim().min(1).max(200).optional(),
    venueId: z.string().trim().min(1).max(200).optional(),
  })
  .transform((body) => ({ placeId: body.place_id ?? body.venueId }))
  .refine((body): body is { placeId: string } => Boolean(body.placeId), {
    message: "place_id is required.",
  });

const PRIVATE_GET_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache",
};

type SavedVenueIdsResponse = APIResponse<{ savedVenueIds: string[] }> & {
  place_ids: string[];
  venueIds: string[];
  savedVenueIds: string[];
};

type SavedVenueMutationResponse = APIResponse<{ venueId: string; saved: boolean }> & {
  venueId: string;
  saved: boolean;
};

async function getUserId(req: NextRequest): Promise<string | null> {
  return getAuthenticatedUserId(req);
}

function unauthorized(meta: { cached: boolean; generatedAt: string; requestId: string }, headers?: HeadersInit) {
  return NextResponse.json<APIResponse<never>>(
    { status: "error", error: { code: "UNAUTHORIZED", message: "Login required to save venues." }, meta },
    { status: 401, headers }
  );
}

async function readVenueId(req: NextRequest, meta: { cached: boolean; generatedAt: string; requestId: string }) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      response: NextResponse.json<APIResponse<never>>(
        { status: "error", error: { code: "INVALID_JSON", message: "Request body must be valid JSON." }, meta },
        { status: 400 }
      ),
    };
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return {
      response: NextResponse.json<APIResponse<never>>(
        { status: "error", error: { code: "VALIDATION_ERROR", message: "place_id is required." }, meta },
        { status: 400 }
      ),
    };
  }

  return { placeId: parsed.data.placeId };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const meta = { cached: false, generatedAt: new Date().toISOString(), requestId: uuidv4() };

  const userId = await getUserId(req);
  if (!userId) return unauthorized(meta, PRIVATE_GET_CACHE_HEADERS);

  const data = (await sql`
    SELECT venue_id
    FROM saved_venues
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `) as Array<{ venue_id: string }>;

  const savedVenueIds = data.map((row) => row.venue_id);

  return NextResponse.json<SavedVenueIdsResponse>({
    status: "success",
    place_ids: savedVenueIds,
    venueIds: savedVenueIds,
    savedVenueIds,
    data: { savedVenueIds },
    meta,
  }, { headers: PRIVATE_GET_CACHE_HEADERS });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const meta = { cached: false, generatedAt: new Date().toISOString(), requestId: uuidv4() };

  const userId = await getUserId(req);
  if (!userId) return unauthorized(meta);

  const parsed = await readVenueId(req, meta);
  if (parsed.response) return parsed.response;

  await sql`
    INSERT INTO saved_venues (user_id, venue_id)
    VALUES (${userId}, ${parsed.placeId})
    ON CONFLICT (user_id, venue_id) DO NOTHING
  `;

  return NextResponse.json<SavedVenueMutationResponse>({
    status: "success",
    ok: true,
    venueId: parsed.placeId,
    saved: true,
    data: { venueId: parsed.placeId, saved: true },
    meta,
  } as SavedVenueMutationResponse & { ok: true });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const meta = { cached: false, generatedAt: new Date().toISOString(), requestId: uuidv4() };

  const userId = await getUserId(req);
  if (!userId) return unauthorized(meta);

  const parsed = await readVenueId(req, meta);
  if (parsed.response) return parsed.response;

  await sql`
    DELETE FROM saved_venues
    WHERE user_id = ${userId}
      AND venue_id = ${parsed.placeId}
  `;

  return NextResponse.json<SavedVenueMutationResponse>({
    status: "success",
    ok: true,
    venueId: parsed.placeId,
    saved: false,
    data: { venueId: parsed.placeId, saved: false },
    meta,
  } as SavedVenueMutationResponse & { ok: true });
}
