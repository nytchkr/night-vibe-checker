import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";

function safeReturnUrl(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/profile";
  return value;
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const returnUrl = safeReturnUrl(searchParams.get("return"));

  if (code) {
    const response = NextResponse.redirect(`${origin}${returnUrl}`);

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

    await supabase.auth.exchangeCodeForSession(code);
    return response;
  }

  return NextResponse.redirect(`${origin}${returnUrl}`);
}
