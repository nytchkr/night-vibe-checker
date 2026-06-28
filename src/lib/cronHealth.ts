import { sql } from "@/lib/db";

type CronRunInput = {
  jobName: string;
  startedAt: number;
  venuesUpdated?: number | null;
  error?: string | null;
};

export async function logCronRun({
  jobName,
  startedAt,
  venuesUpdated = null,
  error = null,
}: CronRunInput): Promise<void> {
  const durationMs = Math.max(0, Date.now() - startedAt);
  try {
    await sql`
      INSERT INTO cron_runs (job_name, duration_ms, venues_updated, error)
      VALUES (${jobName}, ${durationMs}, ${venuesUpdated}, ${error})
    `;
  } catch (insertError) {
    console.error(`[cron-health] Failed to log ${jobName}:`, insertError);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    return JSON.stringify(obj);
  }
  return String(error ?? "Unknown error");
}
