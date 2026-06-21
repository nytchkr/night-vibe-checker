import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase";

function safeReturnUrl(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/map";
  }
  return value;
}

function authFailedUrl(origin: string, message: string): string {
  const url = new URL("/login", origin);
  url.searchParams.set("error", "auth_failed");
  url.searchParams.set("message", message);
  return url.toString();
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const rawReturnUrl = searchParams.get("return");
  const returnUrl = safeReturnUrl(rawReturnUrl);
  const redirectUrl = `${origin}${returnUrl}`;

  if (code) {
    const response = NextResponse.redirect(redirectUrl);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (cookiesList) => {
            cookiesList.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
            });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(authFailedUrl(origin, "Could not finish sign-in. Please try again."));
    }

    const userId = data.session?.user.id;
    if (userId) {
      const { count, error: countError } = await supabaseAdmin
        .from("check_ins")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if (!countError && count === 0) {
        response.headers.set("Location", `${origin}/profile?welcome=1`);
      }
    }

    return response;
  }

  return NextResponse.redirect(`${origin}${returnUrl}`);
}
