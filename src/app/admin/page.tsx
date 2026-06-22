import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE_NAME,
  getAdminCookieToken,
  isValidAdminCookieToken,
  isValidAdminPassword,
} from "@/lib/adminPasswordAuth";
import type { AdminStats } from "@/lib/adminStats";
import { TriggerSignalRefreshButton } from "./TriggerSignalRefreshButton";

export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

async function authenticate(formData: FormData) {
  "use server";

  const password = formData.get("pw");
  if (!isValidAdminPassword(password)) {
    redirect("/admin?error=1");
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: ADMIN_COOKIE_NAME,
    value: getAdminCookieToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  redirect("/admin");
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <p className="text-sm text-white/60">{label}</p>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-white">{value.toLocaleString()}</p>
    </div>
  );
}

function LoginForm({ hasError }: { hasError: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0A0A0E] px-4 text-white">
      <form action={authenticate} className="w-full max-w-sm rounded-lg border border-white/10 bg-white/[0.04] p-6">
        <h1 className="text-2xl font-semibold">NightVibe admin</h1>
        <label className="mt-5 block text-sm text-white/70" htmlFor="admin-password">
          Password
        </label>
        <input
          id="admin-password"
          name="pw"
          type="password"
          autoComplete="current-password"
          className="mt-2 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-white outline-none focus:border-[#8B6CFF]"
          required
        />
        {hasError ? <p className="mt-3 text-sm text-[#F0568C]">Invalid admin password.</p> : null}
        <button className="mt-5 w-full rounded-md bg-[#8B6CFF] px-4 py-2 font-semibold text-white" type="submit">
          Enter dashboard
        </button>
      </form>
    </main>
  );
}

async function getStats(): Promise<AdminStats> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const response = await fetch(`${protocol}://${host}/api/admin/stats`, {
    headers: {
      authorization: `Bearer ${process.env.ADMIN_PASSWORD ?? ""}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load admin stats: HTTP ${response.status}`);
  }

  return response.json() as Promise<AdminStats>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = (await searchParams) ?? {};
  const suppliedPassword = firstParam(params.pw);

  if (suppliedPassword && isValidAdminPassword(suppliedPassword)) {
    redirect(`/api/admin/auth?pw=${encodeURIComponent(suppliedPassword)}&next=/admin`);
  }

  const cookieStore = await cookies();
  const isAuthorized = isValidAdminCookieToken(cookieStore.get(ADMIN_COOKIE_NAME)?.value);

  if (!isAuthorized) {
    return <LoginForm hasError={firstParam(params.error) === "1" || Boolean(suppliedPassword)} />;
  }

  const stats = await getStats();

  return (
    <main className="min-h-screen bg-[#0A0A0E] px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8B6CFF]">NightVibe Admin</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">Signal Operations Dashboard</h1>
          </div>
          <TriggerSignalRefreshButton />
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Venues total" value={stats.venues_total} />
          <StatCard label="Check-ins 24h" value={stats.checkins_24h} />
          <StatCard label="Check-ins 7d" value={stats.checkins_7d} />
          <StatCard label="Check-ins all-time" value={stats.checkins_all_time} />
        </section>

        <section className="rounded-lg border border-[#F0568C]/30 bg-[#F0568C]/10 p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-white">Venues missing BestTime ID</h2>
            <span className="rounded-full bg-[#F0568C]/20 px-3 py-1 text-sm font-semibold text-[#F0568C]">
              {stats.missing_besttime.length}
            </span>
          </div>
          {stats.missing_besttime.length === 0 ? (
            <p className="mt-3 text-sm text-white/65">All venues have BestTime IDs.</p>
          ) : (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {stats.missing_besttime.map((venue) => (
                <li key={venue.id} className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm">
                  <span className="font-medium text-white">{venue.name}</span>
                  <span className="ml-2 font-mono text-xs text-white/45">{venue.place_id}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.04]">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-lg font-semibold">Signal staleness</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-white/50">
                <tr className="border-b border-white/10">
                  <th className="px-5 py-3 font-medium">Venue</th>
                  <th className="px-5 py-3 font-medium">Last refresh</th>
                  <th className="px-5 py-3 font-medium">Hours since refresh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {stats.stale_signals.length === 0 ? (
                  <tr>
                    <td className="px-5 py-6 text-white/55" colSpan={3}>
                      No venue signals found.
                    </td>
                  </tr>
                ) : (
                  stats.stale_signals.map((signal) => (
                    <tr key={signal.venue_id}>
                      <td className="px-5 py-3 text-white/85">{signal.venue_name}</td>
                      <td className="px-5 py-3 text-white/70">{formatDate(signal.last_busyness_refresh)}</td>
                      <td className="px-5 py-3 tabular-nums text-white/80">
                        {signal.hours_since_refresh === null ? "Never" : signal.hours_since_refresh.toLocaleString()}
                      </td>
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
