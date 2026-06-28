import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { publicRateLimit } from "@/lib/apiRateLimit";
import { sql } from "@/lib/db";
import { assertSupabaseServerEnv, MissingSupabaseEnvError } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const WaitlistBodySchema = z.object({
  email: z.string().trim().email().max(320),
});

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function jsonError(error: string, status: number, headers?: Record<string, string>): NextResponse {
  return NextResponse.json({ error }, { status, headers });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rate = await publicRateLimit(req, "waitlist", 10);
  if (rate.response) return rate.response;

  try {
    assertSupabaseServerEnv();
  } catch (error) {
    if (error instanceof MissingSupabaseEnvError) {
      return jsonError("Server configuration is incomplete.", 503, rate.headers);
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400, rate.headers);
  }

  const parsed = WaitlistBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid email.", 400, rate.headers);
  }

  const email = normalizeEmail(parsed.data.email);

  const existing = (await sql`
    SELECT email
    FROM waitlist
    WHERE email = ${email}
    LIMIT 1
  `) as Array<{ email: string }>;

  if (existing.length > 0) {
    return NextResponse.json({ error: "Already on the list!" }, { status: 409, headers: rate.headers });
  }

  try {
    await sql`
      INSERT INTO waitlist (email)
      VALUES (${email})
    `;
  } catch (insertError) {
    if (insertError instanceof Error && insertError.message.includes("duplicate")) {
      return NextResponse.json({ error: "Already on the list!" }, { status: 409, headers: rate.headers });
    }

    return jsonError("Could not join waitlist.", 500, rate.headers);
  }

  return NextResponse.json({ success: true }, { headers: rate.headers });
}
