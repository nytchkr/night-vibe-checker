import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { sql } from "@/lib/db";

function successResponse(req: NextRequest) {
  if ((req.headers.get("accept") ?? "").includes("text/html")) {
    return NextResponse.redirect(new URL("/admin", req.url), 303);
  }

  return NextResponse.json({ status: "success" });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  await sql`UPDATE venues SET hidden = true WHERE id = ${id}`;

  return successResponse(req);
}
