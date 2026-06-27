type OpenNowBadgeProps = {
  openNow: boolean | null;
};

export function OpenNowBadge({ openNow }: OpenNowBadgeProps) {
  if (openNow === false) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#F0568C]/30 bg-[#F0568C]/12 px-2 py-0.5 text-xs font-semibold text-[#FDA4C4] shadow-lg shadow-black/10 backdrop-blur-sm transition-all duration-200 ease-out">
        <span className="h-1.5 w-1.5 rounded-full bg-[#F0568C] shadow-[0_0_10px_rgba(240,86,140,0.65)]" aria-hidden="true" />
        Closed
      </span>
    );
  }

  if (openNow == null) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] px-2 py-0.5 text-xs font-semibold text-white/60 shadow-lg shadow-black/10 backdrop-blur-sm transition-all duration-200 ease-out"
        aria-label="Hours unknown"
        title="Hours unknown"
      >
        ?
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-green-500/25 bg-green-900/50 px-2 py-0.5 text-xs font-semibold text-green-400 shadow-lg shadow-black/10 backdrop-blur-sm transition-all duration-200 ease-out">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.7)]" aria-hidden="true" />
      Open
    </span>
  );
}

export default OpenNowBadge;
