import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TEST_VENUE = {
  name: "Butter NC",
  address: "Charlotte, NC",
};

function adminPassword(): string | null {
  return process.env.ADMIN_PASSWORD?.trim() || null;
}

function bestTimeApiKey(): string | null {
  return process.env.BESTTIME_API_KEY?.trim() || null;
}

function isAuthorized(req: NextRequest): boolean {
  const password = adminPassword();
  return Boolean(password) && req.headers.get("authorization") === `Bearer ${password}`;
}

function sanitizeBestTimeResponse(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;

  const json = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  delete json.api_key_private;
  delete json.apiKeyPrivate;
  delete json.BESTTIME_API_KEY;
  return json;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { status: "error", error: { code: "UNAUTHORIZED", message: "Missing or invalid ADMIN_PASSWORD Bearer token." } },
      { status: 401 }
    );
  }

  const key = bestTimeApiKey();
  if (!key) {
    return NextResponse.json(
      { status: "error", error: { code: "BESTTIME_API_KEY_MISSING", message: "BESTTIME_API_KEY is not configured." } },
      { status: 503 }
    );
  }

  const params = new URLSearchParams({
    api_key_private: key,
    venue_name: TEST_VENUE.name,
    venue_address: TEST_VENUE.address,
  });

  try {
    const response = await fetch(`https://besttime.app/api/v1/forecasts?${params}`, {
      method: "POST",
      cache: "no-store",
    });
    const raw = await response.json().catch(() => null);
    const data = sanitizeBestTimeResponse(raw);

    return NextResponse.json(
      {
        status: response.ok ? "success" : "error",
        venue: TEST_VENUE,
        bestTimeStatus: response.status,
        data,
      },
      { status: response.ok ? 200 : 502 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown BestTime test error";
    return NextResponse.json(
      { status: "error", error: { code: "BESTTIME_TEST_FAILED", message }, venue: TEST_VENUE },
      { status: 502 }
    );
  }
}
