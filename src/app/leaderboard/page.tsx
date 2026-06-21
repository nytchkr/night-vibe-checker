import Link from "next/link";
import type { Metadata } from "next";
import { PageTransition } from "@/components/PageTransition";
import { getMostActiveLeaderboard, type LeaderboardEntry } from "@/lib/leaderboard";

export const metadata: Metadata = {
  title: "Most Active This Week — NightVibe",
  description: "See who's checking in the most at South End Charlotte bars and clubs.",
};

export const revalidate = 300;

function rankLabel(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return String(rank);
}

function Avatar({ entry }: { entry: LeaderboardEntry }) {
  const initial = entry.displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-white/[0.08]">
      {entry.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.avatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm font-black text-white/55">
          {initial}
        </div>
      )}
    </div>
  );
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <li className="mb-2 flex items-center gap-3 rounded-xl bg-white/[0.04] px-4 py-3">
      <div
        className={`w-8 text-center text-sm font-black ${
          entry.rank === 1 ? "text-[#FBBF24]" : "text-white/50"
        }`}
        aria-label={`Rank ${entry.rank}`}
      >
        {rankLabel(entry.rank)}
      </div>
      <Avatar entry={entry} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-white">{entry.displayName}</p>
        <p className="mt-0.5 truncate text-xs text-white/35">
          {entry.topVenue ? `Top spot: ${entry.topVenue}` : "Checking in across South End"}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-[#00F5D4]/12 px-3 py-1 text-xs font-black text-[#00F5D4]">
        {entry.checkInCount}
      </span>
    </li>
  );
}

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
            <ol className="list-none p-0">
              {entries.map((entry) => (
                <LeaderboardRow key={entry.userId} entry={entry} />
              ))}
            </ol>
          )}

          <p className="mt-5 text-xs text-white/20">Updated every 5 minutes</p>
        </main>
      </div>
    </PageTransition>
  );
}
