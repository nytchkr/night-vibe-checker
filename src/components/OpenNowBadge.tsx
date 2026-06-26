type OpenNowBadgeProps = {
  openNow: boolean | null;
};

export function OpenNowBadge({ openNow }: OpenNowBadgeProps) {
  if (openNow !== true) return null;

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-green-500/25 bg-green-900/50 px-2 py-0.5 text-xs font-semibold text-green-400 shadow-lg shadow-black/10 backdrop-blur-sm transition-all duration-200 ease-out">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.7)]" aria-hidden="true" />
      Open
    </span>
  );
}

export default OpenNowBadge;
