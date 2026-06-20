import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { AdminPageClient } from "@/components/admin/AdminPageClient";
import { supabaseAdmin } from "@/lib/supabase";
import type { AdminCheckIn, AdminVenue } from "@/types/admin";

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

function mapAdminVenue(row: Record<string, unknown>): AdminVenue {
  const sig = row.venue_signals;
  const signalRow: Record<string, unknown> | undefined = Array.isArray(sig)
    ? (sig[0] as Record<string, unknown> | undefined)
    : sig != null
    ? (sig as Record<string, unknown>)
    : undefined;

  return {
    id: row.id as string,
    placeId: row.place_id as string,
    name: row.name as string,
    address: row.address as string,
    category: (row.category ?? row.venue_type ?? "establishment") as string,
    hidden: Boolean(row.hidden),
    lastBusynessRefresh: (row.last_busyness_refresh ?? signalRow?.last_busyness_refresh ?? null) as string | null,
    busyness0To100: (signalRow?.busyness_0_100 ?? null) as number | null,
    sampleSize: Number(signalRow?.sample_size ?? 0),
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

  const [{ data: checkInsData, error: checkInsError }, { data: venuesData, error: venuesError }] = await Promise.all([
    supabaseAdmin
      .from("check_ins")
      .select("id, venue_id, place_id, venue_name, busyness, crowd_feel, note, hidden, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("venues")
      .select(`
        id, place_id, name, address, venue_type, category, hidden, last_busyness_refresh,
        venue_signals (
          busyness_0_100, sample_size, last_busyness_refresh
        )
      `)
      .order("name", { ascending: true }),
  ]);

  if (checkInsError || venuesError) {
    throw new Error(`Failed to fetch admin data: ${(checkInsError ?? venuesError)?.message}`);
  }

  return (
    <AdminPageClient
      checkIns={((checkInsData ?? []) as Record<string, unknown>[]).map(mapAdminCheckIn)}
      venues={((venuesData ?? []) as Record<string, unknown>[]).map(mapAdminVenue)}
      token={session.access_token}
    />
  );
}
