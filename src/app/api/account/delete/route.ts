import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

type DeleteAccountResponse = { success: true } | { error: string };

function errorResponse(message: string, status: number): NextResponse<DeleteAccountResponse> {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse<DeleteAccountResponse>> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return errorResponse("Authentication required.", 401);

  try {
    await sql`DELETE FROM saved_venues WHERE user_id = ${userId}`;
    await sql`DELETE FROM profiles WHERE id = ${userId}`;

    return NextResponse.json({ success: true });
  } catch {
    return errorResponse("Could not delete account.", 500);
  }
}
