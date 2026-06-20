export function timeAgo(isoString: string): string {
  const timestamp = Date.parse(isoString);
  if (!Number.isFinite(timestamp)) return "Updated recently";

  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const elapsedHours = Math.floor(elapsedMs / (60 * 60 * 1000));

  if (elapsedHours < 1) return "● Live";
  if (elapsedHours < 24) return `Updated ${elapsedHours}h ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays <= 1) return "Updated yesterday";

  return `Updated ${elapsedDays} days ago`;
}
