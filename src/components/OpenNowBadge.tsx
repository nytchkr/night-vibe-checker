type OpenNowBadgeProps = {
  openNow: boolean | null;
};

export function OpenNowBadge({ openNow }: OpenNowBadgeProps) {
  if (openNow !== true) return null;

  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-green-700 bg-green-900/50 px-2 py-0.5 text-xs font-semibold text-green-400">
      Open
    </span>
  );
}

export default OpenNowBadge;
