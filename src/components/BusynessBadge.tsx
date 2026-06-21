"use client";

import type { BusynessSource } from "@/types";

type Props = {
  source: BusynessSource | null | undefined;
};

export function BusynessBadge({ source }: Props) {
  if (source === "live" || source === "crowd") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[11px] font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        LIVE
      </span>
    );
  }

  if (source === "forecast") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-[#9CA2AE] text-[11px] font-semibold">
        FORECAST
      </span>
    );
  }

  return null;
}

export default BusynessBadge;
