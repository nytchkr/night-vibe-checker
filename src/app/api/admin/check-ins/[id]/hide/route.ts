import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";

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
  const { error } = await supabaseAdmin
    .from("check_ins")
    .update({ hidden: true })
    .eq("id", id);

  if (error) {
    console.error("[admin/check-ins/hide] DB error:", error);
    return NextResponse.json({ error: "Could not hide check-in." }, { status: 500 });
  }

  return successResponse(req);
}
