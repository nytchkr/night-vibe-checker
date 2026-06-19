import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AgentBoard from "@/components/agent-board/AgentBoard";

const COOKIE_NAME = "agent_board_auth";

async function authenticate(formData: FormData) {
  "use server";
  const password = formData.get("password");
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || password !== adminPassword) {
    redirect("/agent-board?error=1");
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, adminPassword, {
    httpOnly: false,
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  redirect("/agent-board");
}

export default async function AgentBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(COOKIE_NAME);
  const adminPassword = process.env.ADMIN_PASSWORD;

  const isAuthenticated =
    adminPassword &&
    authCookie?.value === adminPassword;

  if (isAuthenticated) {
    return <AgentBoard />;
  }

  const params = await searchParams;
  const hasError = params.error === "1";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-900">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Night Vibe Ops
          </p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">
            Agent Board
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter the admin password to continue.
          </p>
        </div>

        {hasError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Incorrect password. Please try again.
          </div>
        )}

        <form action={authenticate} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <input
            name="password"
            type="password"
            placeholder="Admin password"
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700"
          >
            Access Board
          </button>
        </form>
      </div>
    </div>
  );
}
