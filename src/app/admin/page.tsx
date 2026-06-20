import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { AdminPageClient } from "@/components/admin/AdminPageClient";
import { supabaseAdmin } from "@/lib/supabase";
import type { AdminCheckIn } from "@/types/admin";

export const dynamic = "force-dynamic";

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function mapAdminCheckIn(row: Record<string, unknown>): AdminCheckIn {
  return {
    id: row.id as string,
    venueId: row.venue_id as string,
    busyness: row.busyness as AdminCheckIn["busyness"],
    crowdFeel: row.crowd_feel as AdminCheckIn["crowdFeel"],
    note: (row.note ?? undefined) as string | undefined,
    hidden: row.hidden as boolean,
    createdAt: row.created_at as string,
    userId: (row.user_id ?? null) as string | null,
    placeId: (row.place_id ?? "") as string,
    venueName: (row.venue_name ?? undefined) as string | undefined,
  };
}

export default async function AdminPage() {
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
    }
  );

  const [{ data: sessionData }, { data: userData }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);

  const session = sessionData.session;
  const user = userData.user;
  const adminEmails = getAdminEmails();

  if (!session?.access_token || !user?.email || !adminEmails.includes(user.email.toLowerCase())) {
    redirect(`/login?return=${encodeURIComponent("/admin")}`);
  }

  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("id, venue_id, place_id, venue_name, busyness, crowd_feel, note, hidden, created_at, user_id")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Failed to fetch admin check-ins: ${error.message}`);
  }

  return (
    <AdminPageClient
      checkIns={((data ?? []) as Record<string, unknown>[]).map(mapAdminCheckIn)}
      token={session.access_token}
    />
  );
}
