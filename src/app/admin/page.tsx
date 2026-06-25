import { requireAdminPage } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type CheckInRow = {
  id: string;
  venue_id: string | null;
  user_id: string | null;
  busyness: string | null;
  crowd_feel: string | null;
  created_at: string;
  venues?: { name?: string | null } | { name?: string | null }[] | null;
};

type VenueRow = {
  id: string;
  name: string | null;
  category: string | null;
  address: string | null;
};

type UserScoreRow = {
  user_id: string;
  points_total: number | null;
  last_checkin_at: string | null;
};

function venueName(row: CheckInRow): string {
  const relation = row.venues;
  const venue = Array.isArray(relation) ? relation[0] : relation;
  return venue?.name || row.venue_id || "Unknown venue";
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function missingTable(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null | undefined;
  const message = candidate?.message?.toLowerCase() ?? "";
  return candidate?.code === "42P01" || message.includes("does not exist") || message.includes("could not find the table");
}

async function loadRecentCheckIns(): Promise<{ rows: CheckInRow[]; emailByUserId: Map<string, string> }> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("check_ins")
    .select("id, venue_id, user_id, busyness, crowd_feel, created_at, venues(name)")
    .eq("hidden", false)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  const rows = (data ?? []) as CheckInRow[];
  const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id))));
  const emailEntries = await Promise.all(
    userIds.map(async (userId) => {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
      return [userId, userData.user?.email ?? userId] as const;
    }),
  );

  return { rows, emailByUserId: new Map(emailEntries) };
}

async function loadVenues(): Promise<VenueRow[]> {
  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("id, name, category, address")
    .eq("hidden", false)
    .order("name", { ascending: true })
    .limit(500);

  if (error) throw error;
  return (data ?? []) as VenueRow[];
}

async function loadFlaggedAccounts(): Promise<{ rows: UserScoreRow[]; available: boolean }> {
  const { data, error } = await supabaseAdmin
    .from("user_scores")
    .select("user_id, points_total, last_checkin_at")
    .eq("flagged_for_review", true)
    .order("last_checkin_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) {
    if (missingTable(error)) return { rows: [], available: false };
    throw error;
  }

  return { rows: (data ?? []) as UserScoreRow[], available: true };
}

function RemoveButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="min-h-9 rounded-md border border-red-400/40 px-3 text-xs font-bold text-red-200 transition-colors hover:bg-red-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
    >
      {label}
    </button>
  );
}

export default async function AdminPage() {
  const admin = await requireAdminPage("/admin");
  const [{ rows: checkIns, emailByUserId }, venues, flaggedAccounts] = await Promise.all([
    loadRecentCheckIns(),
    loadVenues(),
    loadFlaggedAccounts(),
  ]);

  return (
    <main className="min-h-screen bg-[#0A0A0E] px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="border-b border-white/10 pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">Internal moderation</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Admin</h1>
          <p className="mt-2 text-sm text-white/55">Signed in as {admin.email ?? admin.id}</p>
        </header>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-black uppercase tracking-[0.12em]">Check-in Moderation</h2>
            <p className="mt-1 text-sm text-white/50">Recent visible check-ins from the last 7 days.</p>
          </div>
          <div className="overflow-x-auto border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.12em] text-white/45">
                <tr>
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">Venue</th>
                  <th className="px-3 py-3">User Email</th>
                  <th className="px-3 py-3">Busyness</th>
                  <th className="px-3 py-3">Crowd Feel</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {checkIns.length === 0 ? (
                  <tr><td className="px-3 py-5 text-white/45" colSpan={7}>No recent visible check-ins.</td></tr>
                ) : checkIns.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="max-w-[11rem] truncate px-3 py-3 font-mono text-xs text-white/50">{row.id}</td>
                    <td className="px-3 py-3 font-semibold">{venueName(row)}</td>
                    <td className="px-3 py-3 text-white/65">{row.user_id ? emailByUserId.get(row.user_id) ?? row.user_id : "Anonymous"}</td>
                    <td className="px-3 py-3 text-white/65">{row.busyness ?? "Unknown"}</td>
                    <td className="px-3 py-3 text-white/65">{row.crowd_feel ?? "None"}</td>
                    <td className="px-3 py-3 text-white/65">{formatDate(row.created_at)}</td>
                    <td className="px-3 py-3">
                      <form action={`/api/admin/check-ins/${encodeURIComponent(row.id)}/hide`} method="post">
                        <RemoveButton label="Remove" />
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-black uppercase tracking-[0.12em]">Venue Moderation</h2>
            <p className="mt-1 text-sm text-white/50">Visible venues. Removing a venue hides it from consumer lists and detail lookup.</p>
          </div>
          <div className="overflow-x-auto border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.12em] text-white/45">
                <tr>
                  <th className="px-3 py-3">Venue</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Address</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {venues.length === 0 ? (
                  <tr><td className="px-3 py-5 text-white/45" colSpan={4}>No visible venues.</td></tr>
                ) : venues.map((venue) => (
                  <tr key={venue.id} className="align-top">
                    <td className="px-3 py-3 font-semibold">{venue.name ?? venue.id}</td>
                    <td className="px-3 py-3 text-white/65">{venue.category ?? "Uncategorized"}</td>
                    <td className="px-3 py-3 text-white/65">{venue.address ?? "No address"}</td>
                    <td className="px-3 py-3">
                      <form action={`/api/admin/venues/${encodeURIComponent(venue.id)}/hide`} method="post">
                        <RemoveButton label="Remove" />
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-black uppercase tracking-[0.12em]">Flagged Accounts</h2>
            <p className="mt-1 text-sm text-white/50">Manual review queue for rewards scoring flags.</p>
          </div>
          {!flaggedAccounts.available || flaggedAccounts.rows.length === 0 ? (
            <div className="border border-white/10 px-4 py-5 text-sm text-white/55">
              No flagged accounts &mdash; rewards system not yet active.
            </div>
          ) : (
            <div className="overflow-x-auto border border-white/10">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.12em] text-white/45">
                  <tr>
                    <th className="px-3 py-3">User ID</th>
                    <th className="px-3 py-3">Points Total</th>
                    <th className="px-3 py-3">Last Check-in</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {flaggedAccounts.rows.map((row) => (
                    <tr key={row.user_id} className="align-top">
                      <td className="max-w-[16rem] truncate px-3 py-3 font-mono text-xs text-white/60">{row.user_id}</td>
                      <td className="px-3 py-3 text-white/65">{row.points_total ?? 0}</td>
                      <td className="px-3 py-3 text-white/65">{formatDate(row.last_checkin_at)}</td>
                      <td className="px-3 py-3">
                        <form action={`/api/admin/accounts/${encodeURIComponent(row.user_id)}/clear-flag`} method="post">
                          <RemoveButton label="Clear flag" />
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
