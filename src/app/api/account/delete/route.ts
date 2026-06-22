import { NextRequest, NextResponse } from "next/server";
import { MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type DeleteAccountResponse = { success: true } | { error: string };

function readBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

function errorResponse(message: string, status: number): NextResponse<DeleteAccountResponse> {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse<DeleteAccountResponse>> {
  const token = readBearerToken(req);
  if (!token) return errorResponse("Missing bearer token.", 401);

  try {
    const { data, error: authError } = await supabaseAdmin.auth.getUser(token);
    const userId = data.user?.id;

    if (authError || !userId) return errorResponse("Invalid or expired session.", 401);

    const { error: checkInsError } = await supabaseAdmin
      .from("check_ins")
      .delete()
      .eq("user_id", userId);

    if (checkInsError) return errorResponse("Could not delete account check-ins.", 500);

    const { error: savedVenuesError } = await supabaseAdmin
      .from("saved_venues")
      .delete()
      .eq("user_id", userId);

    if (savedVenuesError) return errorResponse("Could not delete saved venues.", 500);

    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteUserError) return errorResponse("Could not delete account.", 500);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof MissingSupabaseEnvError) {
      return errorResponse("Account deletion is not configured.", 503);
    }

    return errorResponse("Could not delete account.", 500);
  }
}
