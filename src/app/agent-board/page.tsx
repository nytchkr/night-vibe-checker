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
    <div className="flex min-h-screen items-center justify-center bg-[#08080D] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
            Admin
          </p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white">
            Agent Board
          </h1>
          <p className="mt-1 text-sm text-white/40">
            Enter the admin password to continue.
          </p>
        </div>

        {hasError && (
          <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            Incorrect password. Please try again.
          </div>
        )}

        <form action={authenticate} className="space-y-4">
          <input
            name="password"
            type="password"
            placeholder="Admin password"
            autoComplete="current-password"
            required
            className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/25 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/20"
          />
          <button
            type="submit"
            className="w-full rounded-xl bg-cyan-400 py-3 text-sm font-bold text-black transition-colors hover:bg-cyan-300"
          >
            Access Board
          </button>
        </form>
      </div>
    </div>
  );
}
