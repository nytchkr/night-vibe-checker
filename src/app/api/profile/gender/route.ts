import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

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

async function createProfileClient(req: NextRequest) {
  const cookieStore = await cookies();
  const authHeader = req.headers.get("Authorization");

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll().map(({ name, value }) => ({ name, value })),
      },
      global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

async function getAuthedUser(req: NextRequest) {
  const supabase = await createProfileClient(req);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return { supabase, userId: null };
  }

  return { supabase, userId: data.user.id };
}

export async function GET(req: NextRequest): Promise<NextResponse<GenderResponse | ErrorResponse>> {
  const { supabase, userId } = await getAuthedUser(req);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("gender")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not load profile gender." }, { status: 500 });
  }

  const gender = GenderSchema.shape.gender.safeParse(data?.gender);
  const value = gender.success ? gender.data : null;
  return NextResponse.json({ data: { gender: value }, gender: value });
}

export async function PATCH(req: NextRequest): Promise<NextResponse<OkResponse | ErrorResponse>> {
  const { supabase, userId } = await getAuthedUser(req);

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

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, gender: parsed.data.gender }, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ error: "Could not save profile gender." }, { status: 500 });
  }

  return NextResponse.json({ data: { ok: true }, ok: true });
}
