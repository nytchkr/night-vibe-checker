export type RewardMessageInput = {
  pointsAwarded?: number | null;
  events?: string[] | null;
  streakCount?: number | null;
};

export type RewardMessages = {
  pointsBadge: string | null;
  streakBadge: string | null;
  toast: string;
};

export function formatRewardMessages({ pointsAwarded, events, streakCount }: RewardMessageInput): RewardMessages {
  const points = normalizePositiveInteger(pointsAwarded);
  const eventSet = new Set(events ?? []);
  const hasStreak = eventSet.has("streak");
  const displayStreak = hasStreak ? Math.max(normalizePositiveInteger(streakCount) ?? 0, 3) : null;
  const parts: string[] = [];

  if (points) parts.push(`+${points} pts`);
  if (eventSet.has("first_report")) parts.push("first report tonight +5");
  if (hasStreak) parts.push("streak +20");

  return {
    pointsBadge: points ? `+${points} pts` : null,
    streakBadge: displayStreak ? `Day ${displayStreak} streak 🔥` : null,
    toast: parts.length > 0 ? parts.join(" · ") : "Check-in recorded!",
  };
}

function normalizePositiveInteger(value: number | null | undefined): number | null {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric);
}
