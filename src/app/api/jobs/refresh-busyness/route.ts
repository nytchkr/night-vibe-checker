import { NextRequest, NextResponse } from "next/server";
import { refreshBusyness, refreshBusynessForVenue } from "@/lib/besttime";
import { refreshOpenNow } from "@/lib/openNow";
import { supabaseAdmin } from "@/lib/supabase";

function isCronAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  return (
    auth === `Bearer ${secret}` ||
    cronSecret === secret ||
    req.nextUrl.searchParams.get("secret") === secret
  );
}

async function isAdminAuthorized(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;

  const token = auth.slice(7).trim();
  if (!token) return false;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user?.email) return false;

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(data.user.email.toLowerCase());
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req) && !(await isAdminAuthorized(req))) {
    return NextResponse.json({ status: "error", error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") ?? 50), 1), 100);
  const venueId = req.nextUrl.searchParams.get("venueId")?.trim();

  try {
    const results = venueId ? [await refreshBusynessForVenue(venueId)] : await refreshBusyness(limit);
    const openNow = venueId ? undefined : await refreshOpenNow();
    return NextResponse.json({ status: "success", data: { results, openNow } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown refresh error";
    return NextResponse.json(
      { status: "error", error: { code: "REFRESH_BUSYNESS_FAILED", message } },
      { status: 500 }
    );
  }
}

export const GET = POST;
