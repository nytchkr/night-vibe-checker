import Link from "next/link";
import type { Metadata } from "next";
import { LeaderboardRows } from "@/components/LeaderboardRows";
import { PageTransition } from "@/components/PageTransition";
import { getMostActiveLeaderboard, type LeaderboardEntry } from "@/lib/leaderboard";

export const metadata: Metadata = {
  title: "Most Active This Week — NightVibe",
  description: "See who's checking in the most at South End Charlotte bars and clubs.",
};

export const revalidate = 300;

export default async function LeaderboardPage() {
  let entries: LeaderboardEntry[] = [];
  let failed = false;

  try {
    entries = await getMostActiveLeaderboard();
  } catch (error) {
    console.error("[leaderboard page] failed to load:", error);
    failed = true;
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#0A0A0F]">
        <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0A0A0F]/92 px-4 backdrop-blur-xl">
          <div className="mx-auto max-w-lg py-4">
            <Link href="/profile" className="text-xs font-bold text-white/35 transition-colors hover:text-white/60">
              Back to You
            </Link>
            <h1 className="mt-4 text-2xl font-black text-white">Most Active This Week</h1>
            <p className="mt-1 text-sm text-white/40">Top nightlife explorers in South End Charlotte</p>
          </div>
        </header>

        <main className="mx-auto max-w-lg px-4 py-6 pb-32">
          {failed ? (
            <div className="rounded-xl bg-white/[0.04] px-4 py-6 text-center text-sm text-white/45">
              Leaderboard is unavailable right now.
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-xl bg-white/[0.04] px-4 py-6 text-center text-sm text-white/45">
              No check-ins in the last 7 days.
            </div>
          ) : (
            <LeaderboardRows entries={entries} />
          )}

          <p className="mt-5 text-xs text-white/20">Updated every 5 minutes</p>
        </main>
      </div>
    </PageTransition>
  );
}
