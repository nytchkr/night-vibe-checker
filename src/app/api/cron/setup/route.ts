import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/apiSecurity";
import { qstash } from "@/lib/qstash";

export const dynamic = "force-dynamic";

const SCHEDULES = [
  {
    id: "nytchkr-besttime-refresh",
    cron: "0 */4 * * *",
    path: "/api/cron/besttime-refresh",
  },
] as const;

function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!url) throw new Error("NEXT_PUBLIC_SITE_URL is not set.");
  return url.replace(/\/+$/, "");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let baseUrl: string;
  try {
    baseUrl = siteUrl();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cron setup is not configured.";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const scheduled = await Promise.all(
    SCHEDULES.map(async (schedule) => {
      const url = `${baseUrl}${schedule.path}`;
      const result = await qstash.schedules.create({
        destination: url,
        cron: schedule.cron,
        method: "POST",
        scheduleId: schedule.id,
      });

      return {
        id: result.scheduleId,
        cron: schedule.cron,
        url,
      };
    }),
  );

  return NextResponse.json({ scheduled });
}
