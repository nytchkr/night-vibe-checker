import { supabaseAdmin } from "@/lib/supabase";

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
  const { error: insertError } = await supabaseAdmin.from("cron_runs").insert({
    job_name: jobName,
    duration_ms: durationMs,
    venues_updated: venuesUpdated,
    error,
  });

  if (insertError) {
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
