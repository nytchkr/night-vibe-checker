// ============================================================
// GET/POST/DELETE /api/push/venue-alert
// Authenticated venue-level push alert subscriptions.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { sql } from "@/lib/db";
import type { APIResponse } from "@/types";

const VenueAlertSchema = z.object({
  venueId: z.string().trim().min(1, "venueId is required"),
});

const PRIVATE_GET_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache",
};

type ResponseMeta = {
  cached: boolean;
  generatedAt: string;
  requestId: string;
};

type VenueAlertStateResponse = APIResponse<{ venueId: string; alerting: boolean }> & {
  venueId: string;
  alerting: boolean;
};

async function getUserId(req: NextRequest): Promise<string | null> {
  return getAuthenticatedUserId(req);
}

function responseMeta(): ResponseMeta {
  return { cached: false, generatedAt: new Date().toISOString(), requestId: uuidv4() };
}

function unauthorized(meta: ResponseMeta, headers?: HeadersInit) {
  return NextResponse.json<APIResponse<never>>(
    { status: "error", error: { code: "UNAUTHORIZED", message: "Login required to manage venue alerts." }, meta },
    { status: 401, headers },
  );
}

function validationError(meta: ResponseMeta, headers?: HeadersInit) {
  return NextResponse.json<APIResponse<never>>(
    { status: "error", error: { code: "VALIDATION_ERROR", message: "venueId is required." }, meta },
    { status: 400, headers },
  );
}

async function readVenueId(req: NextRequest, meta: ResponseMeta) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      response: NextResponse.json<APIResponse<never>>(
        { status: "error", error: { code: "INVALID_JSON", message: "Request body must be valid JSON." }, meta },
        { status: 400 },
      ),
    };
  }

  const parsed = VenueAlertSchema.safeParse(body);
  if (!parsed.success) {
    return { response: validationError(meta) };
  }

  return { venueId: parsed.data.venueId };
}

function stateResponse(venueId: string, alerting: boolean, meta: ResponseMeta, headers?: HeadersInit) {
  return NextResponse.json<VenueAlertStateResponse>({
    status: "success",
    venueId,
    alerting,
    data: { venueId, alerting },
    meta,
  }, { headers });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const meta = responseMeta();

  const userId = await getUserId(req);
  if (!userId) return unauthorized(meta, PRIVATE_GET_CACHE_HEADERS);

  const parsed = VenueAlertSchema.safeParse({
    venueId: req.nextUrl.searchParams.get("venueId") ?? "",
  });
  if (!parsed.success) return validationError(meta, PRIVATE_GET_CACHE_HEADERS);

  const data = (await sql`
    SELECT id
    FROM push_venue_alerts
    WHERE user_id = ${userId}
      AND venue_id = ${parsed.data.venueId}
    LIMIT 1
  `) as Array<{ id: string }>;

  return stateResponse(parsed.data.venueId, data.length > 0, meta, PRIVATE_GET_CACHE_HEADERS);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const meta = responseMeta();

  const userId = await getUserId(req);
  if (!userId) return unauthorized(meta);

  const parsed = await readVenueId(req, meta);
  if (parsed.response) return parsed.response;

  await sql`
    INSERT INTO push_venue_alerts (user_id, venue_id)
    VALUES (${userId}, ${parsed.venueId})
    ON CONFLICT (user_id, venue_id) DO NOTHING
  `;

  return stateResponse(parsed.venueId, true, meta);
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const meta = responseMeta();

  const userId = await getUserId(req);
  if (!userId) return unauthorized(meta);

  const parsed = await readVenueId(req, meta);
  if (parsed.response) return parsed.response;

  await sql`
    DELETE FROM push_venue_alerts
    WHERE user_id = ${userId}
      AND venue_id = ${parsed.venueId}
  `;

  return stateResponse(parsed.venueId, false, meta);
}
