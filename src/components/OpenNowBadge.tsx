type OpenNowBadgeProps = {
  openNow: boolean | null;
};

export function OpenNowBadge({ openNow }: OpenNowBadgeProps) {
  if (openNow === null) return null;

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
        openNow
          ? "border-green-700 bg-green-900/50 text-green-400"
          : "border-red-800 bg-red-900/30 text-red-400"
      }`}
    >
      {openNow ? "Open" : "Closed"}
    </span>
  );
}

export default OpenNowBadge;
