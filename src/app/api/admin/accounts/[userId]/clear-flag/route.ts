import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { sql } from "@/lib/db";

function missingTable(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null | undefined;
  const message = candidate?.message?.toLowerCase() ?? "";
  return candidate?.code === "42P01" || message.includes("does not exist") || message.includes("could not find the table");
}

function successResponse(req: NextRequest) {
  if ((req.headers.get("accept") ?? "").includes("text/html")) {
    return NextResponse.redirect(new URL("/admin", req.url), 303);
  }

  return NextResponse.json({ status: "success" });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  const { userId } = await params;
  try {
    await sql`
      UPDATE user_scores
      SET flagged_for_review = false
      WHERE user_id = ${userId}
    `;
  } catch (error) {
    if (missingTable(error)) {
      return NextResponse.json({ error: "Rewards system not yet active." }, { status: 404 });
    }

    console.error("[admin/accounts/clear-flag] DB error:", error);
    return NextResponse.json({ error: "Could not clear account flag." }, { status: 500 });
  }

  return successResponse(req);
}
