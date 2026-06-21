import { NextResponse } from "next/server";
import { getAdminStats } from "@/lib/adminStats";

export const dynamic = "force-dynamic";

function getAuthorizationKey(req: Request): string {
  const authorization = req.headers.get("authorization")?.trim() ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return authorization;
}

export async function GET(req: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || getAuthorizationKey(req) !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getAdminStats();
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch admin stats",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
