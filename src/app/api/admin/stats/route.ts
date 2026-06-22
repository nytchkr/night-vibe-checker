import { NextRequest, NextResponse } from "next/server";
import { getAdminStats } from "@/lib/adminStats";
import { isAuthorizedAdminRequest } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAuthorizedAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getAdminStats();
    return NextResponse.json({ data: stats, ...stats });
  } catch (error) {
    console.error("[admin stats GET] failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch admin stats" },
      { status: 500 }
    );
  }
}
