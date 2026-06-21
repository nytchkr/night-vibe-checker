// Access at /admin?key=<ADMIN_PASSWORD>

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getAdminStats } from "@/lib/adminStats";

export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function truncateId(value: string): string {
  if (!value) return "unknown";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#11111A] p-4">
      <p className="text-sm text-white/55">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{value.toLocaleString()}</p>
    </div>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const params = (await searchParams) ?? {};
  const headerStore = await headers();
  const suppliedKey = headerStore.get("x-admin-key") ?? firstParam(params.key);

  if (!adminPassword || suppliedKey !== adminPassword) {
    notFound();
  }

  const stats = await getAdminStats();

  return (
    <main className="min-h-screen bg-[#0A0A0E] px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8B6CFF]">
            NightVibe Admin
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">Venue and Signal Monitoring</h1>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Venues" value={stats.venues} />
          <StatCard label="Check-ins" value={stats.checkins} />
          <StatCard label="Users" value={stats.users} />
          <StatCard label="Signals updated 24h" value={stats.signals_24h} />
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#11111A]">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="font-semibold">Recent check-ins</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-white/50">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Venue place_id</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Busyness</th>
                  <th className="px-4 py-3 font-medium">Crowd feel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {stats.recent_checkins.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-white/55" colSpan={5}>
                      No check-ins found.
                    </td>
                  </tr>
                ) : (
                  stats.recent_checkins.map((checkIn) => (
                    <tr key={checkIn.id}>
                      <td className="px-4 py-3 font-mono text-xs text-white/80">
                        {truncateId(checkIn.user_id)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-white/80">{checkIn.place_id}</td>
                      <td className="px-4 py-3 text-white/70">{formatDate(checkIn.created_at)}</td>
                      <td className="px-4 py-3 text-white/80">{checkIn.busyness}</td>
                      <td className="px-4 py-3 text-white/80">{checkIn.crowd_feel}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#11111A]">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="font-semibold">Venues missing BestTime IDs</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-white/50">
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 font-medium">place_id</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">missing_since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {stats.missing_besttime.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-white/55" colSpan={3}>
                      No venues are missing BestTime IDs.
                    </td>
                  </tr>
                ) : (
                  stats.missing_besttime.map((venue) => (
                    <tr key={venue.place_id}>
                      <td className="px-4 py-3 font-mono text-xs text-white/80">{venue.place_id}</td>
                      <td className="px-4 py-3 text-white/80">{venue.name}</td>
                      <td className="px-4 py-3 text-white/70">{formatDate(venue.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
