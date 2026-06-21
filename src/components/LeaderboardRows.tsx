"use client";

import { useHaptic } from "@/hooks/useHaptic";
import type { LeaderboardEntry } from "@/lib/leaderboard";

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
        <img src={entry.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm font-black text-white/55">
          {initial}
        </div>
      )}
    </div>
  );
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const haptic = useHaptic();

  return (
    <li className="mb-2">
      <button
        type="button"
        onClick={haptic.light}
        className="flex w-full items-center gap-3 rounded-xl bg-white/[0.04] px-4 py-3 text-left transition-colors hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
      >
        <div
          className={`w-8 text-center text-sm font-black ${
            entry.rank === 1 ? "text-[#FFB020]" : "text-white/50"
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
        <span className="shrink-0 rounded-full bg-[#8B6CFF]/12 px-3 py-1 text-xs font-black text-[#8B6CFF]">
          {entry.checkInCount}
        </span>
      </button>
    </li>
  );
}

export function LeaderboardRows({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <ol className="list-none p-0">
      {entries.map((entry) => (
        <LeaderboardRow key={entry.userId} entry={entry} />
      ))}
    </ol>
  );
}
