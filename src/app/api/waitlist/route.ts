import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSupabaseServerEnv, MissingSupabaseEnvError, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const WaitlistBodySchema = z.object({
  email: z.string().trim().email().max(320),
});

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    assertSupabaseServerEnv();
  } catch (error) {
    if (error instanceof MissingSupabaseEnvError) {
      return jsonError("Server configuration is incomplete.", 503);
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const parsed = WaitlistBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid email.", 400);
  }

  const email = normalizeEmail(parsed.data.email);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("waitlist")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (existingError) {
    return jsonError("Could not check waitlist status.", 500);
  }

  if (existing) {
    return NextResponse.json({ error: "Already on the list!" }, { status: 409 });
  }

  const { error: insertError } = await supabaseAdmin.from("waitlist").insert({ email });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "Already on the list!" }, { status: 409 });
    }

    return jsonError("Could not join waitlist.", 500);
  }

  return NextResponse.json({ success: true });
}
