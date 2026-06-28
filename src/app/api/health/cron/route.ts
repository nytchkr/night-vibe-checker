import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/apiSecurity";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

type JobName = "refresh-busyness" | "refresh-open-now" | "refresh-signals" | "send-alerts";

type CronRunRow = {
  job_name: string;
  ran_at: string | null;
};

const JOBS: Array<{ name: JobName; expectedIntervalMinutes: number }> = [
  { name: "refresh-busyness", expectedIntervalMinutes: 16 * 60 },
  { name: "refresh-open-now", expectedIntervalMinutes: 24 * 60 },
  { name: "refresh-signals", expectedIntervalMinutes: 24 * 60 },
  { name: "send-alerts", expectedIntervalMinutes: 24 * 60 },
];

function isAuthorized(req: NextRequest): boolean {
  return isAuthorizedCronRequest(req);
}

function minutesSince(value: string): number {
  return Math.floor((Date.now() - new Date(value).getTime()) / 60000);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const data = await sql`
    SELECT job_name, ran_at
    FROM cron_runs
    WHERE job_name = ANY(${JOBS.map((job) => job.name)}::text[])
    ORDER BY ran_at DESC
    LIMIT 100
  `;

  const latestRunByJob = new Map<JobName, string>();
  for (const row of (data ?? []) as CronRunRow[]) {
    if (!JOBS.some((job) => job.name === row.job_name) || !row.ran_at) continue;
    const jobName = row.job_name as JobName;
    if (!latestRunByJob.has(jobName)) latestRunByJob.set(jobName, row.ran_at);
  }

  const jobs = JOBS.map((job) => {
    const lastRan = latestRunByJob.get(job.name) ?? null;
    if (!lastRan) {
      return { name: job.name, lastRan, minutesAgo: null, status: "missing" as const };
    }

    const minutesAgo = minutesSince(lastRan);
    return {
      name: job.name,
      lastRan,
      minutesAgo,
      status: minutesAgo > job.expectedIntervalMinutes * 2 ? ("stale" as const) : ("ok" as const),
    };
  });

  return NextResponse.json({ jobs }, { status: 200, headers: NO_STORE_HEADERS });
}
