import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import VibeCheckClient from "./VibeCheckClient";

export const dynamic = "force-dynamic";

type VibeCheckPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildReturnPath(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value != null) {
      query.set(key, value);
    }
  }

  const queryString = query.toString();
  return `/vibe-check${queryString ? `?${queryString}` : ""}`;
}

export default async function VibeCheckPage({ searchParams }: VibeCheckPageProps) {
  const params = (await searchParams) ?? {};
  const returnPath = buildReturnPath(params);
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll().map(({ name, value }) => ({ name, value })),
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { data } = await supabase.auth.getSession();

  if (!data.session?.access_token) {
    redirect(`/login?return=${encodeURIComponent(returnPath)}`);
  }

  return (
    <VibeCheckClient
      initialVenueId={firstParam(params.venueId)}
      initialVenueName={firstParam(params.venueName)}
      returnPath={returnPath}
    />
  );
}
