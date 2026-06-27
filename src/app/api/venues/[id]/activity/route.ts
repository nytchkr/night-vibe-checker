// ============================================================
// GET /api/venues/[id]/activity
// Recent public check-ins for a venue.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { publicRateLimit } from "@/lib/apiRateLimit";
import { supabaseAdmin } from "@/lib/supabase";
import { findVisibleVenueByIdOrPlaceId, normalizeVenueLookupId } from "@/lib/venueLookup";
import { v4 as uuidv4 } from "uuid";
import type { APIResponse } from "@/types";

const ACTIVITY_WINDOW_HOURS = 3;
const ACTIVITY_LIMIT = 10;
export const dynamic = "force-dynamic";

const DYNAMIC_HEADERS = {
  "Cache-Control": "private, no-store",
};

export interface VenueActivityItem {
  displayName: string;
  avatarUrl: string | null;
  checkedInAt: string;
  minutesAgo: number;
}

type CheckInActivityRow = {
  user_id: string | null;
  created_at: string;
};

type PublicProfile = {
  displayName: string;
  avatarUrl: string | null;
};

function minutesAgo(checkedInAt: string): number {
  const checkedInMs = new Date(checkedInAt).getTime();
  if (!Number.isFinite(checkedInMs)) return 0;
  return Math.max(0, Math.floor((Date.now() - checkedInMs) / 60_000));
}

function stringMetadataValue(metadata: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

async function getPublicProfile(userId: string): Promise<PublicProfile> {
  const fallback: PublicProfile = { displayName: "Someone", avatarUrl: null };

  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data.user) return fallback;

    const metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    const displayName =
      stringMetadataValue(metadata, ["display_name", "full_name", "name"]) ??
      (typeof data.user.email === "string" && data.user.email.includes("@")
        ? data.user.email.split("@")[0]
        : null) ??
      fallback.displayName;
    const avatarUrl = stringMetadataValue(metadata, ["avatar_url", "picture"]);

    return { displayName, avatarUrl };
  } catch {
    return fallback;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const rate = publicRateLimit(req, "venue-activity", 60);
  if (rate.response) return rate.response;
  const headers = { ...DYNAMIC_HEADERS, ...rate.headers };
  const requestId = uuidv4();
  const generatedAt = new Date().toISOString();
  const meta = { cached: true, generatedAt, requestId };

  const { id: rawId } = await params;
  const id = normalizeVenueLookupId(rawId);
  if (!id) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "MISSING_ID", message: "Venue id is required." },
        meta,
      },
      { status: 400, headers }
    );
  }

  const { data: venue, error: venueError } = await findVisibleVenueByIdOrPlaceId(id, "id");

  if (venueError || !venue) {
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "VENUE_NOT_FOUND", message: "Venue was not found." },
        meta,
      },
      { status: 404, headers }
    );
  }

  const cutoff = new Date(Date.now() - ACTIVITY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data: checkIns, error: checkInsError } = await supabaseAdmin
    .from("check_ins")
    .select("user_id, created_at")
    .eq("venue_id", venue.id as string)
    .eq("hidden", false)
    .not("user_id", "is", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_LIMIT);

  if (checkInsError) {
    console.error("[venues/activity GET] DB error:", checkInsError);
    return NextResponse.json<APIResponse<never>>(
      {
        status: "error",
        error: { code: "DB_ERROR", message: "Could not fetch venue activity." },
        meta,
      },
      { status: 500, headers }
    );
  }

  const rows = ((checkIns ?? []) as CheckInActivityRow[]).filter((row) => row.user_id);
  const uniqueUserIds = Array.from(new Set(rows.map((row) => row.user_id as string)));
  const profileEntries = await Promise.all(
    uniqueUserIds.map(async (userId) => [userId, await getPublicProfile(userId)] as const)
  );
  const profiles = new Map<string, PublicProfile>(profileEntries);

  const activity: VenueActivityItem[] = rows.map((row) => {
    const profile = profiles.get(row.user_id as string) ?? { displayName: "Someone", avatarUrl: null };
    return {
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      checkedInAt: row.created_at,
      minutesAgo: minutesAgo(row.created_at),
    };
  });

  return NextResponse.json<APIResponse<{ activity: VenueActivityItem[] }>>(
    {
      status: "success",
      data: { activity },
      meta,
    },
    { status: 200, headers }
  );
}
