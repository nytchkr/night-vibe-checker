import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/apiAuth";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const GenderSchema = z.object({
  gender: z.enum(["male", "female", "undisclosed"]),
});

type ProfileGender = z.infer<typeof GenderSchema>["gender"];

type GenderResponse = {
  gender: ProfileGender | null;
};

type OkResponse = {
  ok: true;
};

type ErrorResponse = {
  error: string;
};

async function getAuthedUser(req: NextRequest) {
  return { userId: await getAuthenticatedUserId(req) };
}

export async function GET(req: NextRequest): Promise<NextResponse<GenderResponse | ErrorResponse>> {
  const { userId } = await getAuthedUser(req);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = (await sql`
    SELECT gender
    FROM profiles
    WHERE id = ${userId}
    LIMIT 1
  `) as Array<{ gender?: unknown }>;

  const gender = GenderSchema.shape.gender.safeParse(rows[0]?.gender);
  const value = gender.success ? gender.data : null;
  return NextResponse.json({ data: { gender: value }, gender: value });
}

export async function PATCH(req: NextRequest): Promise<NextResponse<OkResponse | ErrorResponse>> {
  const { userId } = await getAuthedUser(req);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = GenderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "gender must be male, female, or undisclosed." }, { status: 400 });
  }

  await sql`
    INSERT INTO profiles (id, gender)
    VALUES (${userId}, ${parsed.data.gender})
    ON CONFLICT (id) DO UPDATE SET gender = EXCLUDED.gender
  `;

  return NextResponse.json({ data: { ok: true }, ok: true });
}
