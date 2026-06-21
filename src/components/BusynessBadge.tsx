"use client";

import type { BusynessSource } from "@/types";

type Props = {
  source: BusynessSource | null | undefined;
  computedAt?: string | null;
};

export function BusynessBadge({ source, computedAt = null }: Props) {
  const label = source ?? null;
  void computedAt;

  if (label === "live" || label === "crowd") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-semibold text-green-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
        LIVE
      </span>
    );
  }

  if (label === "forecast") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#9CA2AE]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#9CA2AE]" />
        FORECAST
      </span>
    );
  }

  return null;
}

export default BusynessBadge;
