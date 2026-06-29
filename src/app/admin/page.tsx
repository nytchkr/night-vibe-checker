import { requireAdminPage } from "@/lib/adminAuth";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

type VenueRow = {
  id: string;
  name: string | null;
  category: string | null;
  address: string | null;
};

async function loadVenues(): Promise<VenueRow[]> {
  return (await sql`
    SELECT id, name, category, address
    FROM venues
    WHERE COALESCE(hidden, false) = false
    ORDER BY name ASC
    LIMIT 500
  `) as VenueRow[];
}

function RemoveButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="min-h-11 rounded-md border border-red-400/40 px-3 text-xs font-bold text-red-200 transition-colors hover:bg-red-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
    >
      {label}
    </button>
  );
}

export default async function AdminPage() {
  const admin = await requireAdminPage("/admin");
  const venues = await loadVenues();

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

      </div>
    </main>
  );
}
