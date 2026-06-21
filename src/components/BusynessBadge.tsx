"use client";

import type { BusynessSource } from "@/types";
import { getSignalLabel } from "@/lib/signalFreshness";

type Props = {
  source: BusynessSource | null | undefined;
  computedAt?: string | null;
};

export function BusynessBadge({ source, computedAt = null }: Props) {
  const label = getSignalLabel({ busynessSource: source ?? null, computedAt });

  if (label === "live") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[11px] font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        live
      </span>
    );
  }

  if (label === "forecast") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-[#9CA2AE] text-[11px] font-semibold">
        forecast
      </span>
    );
  }

  return null;
}

export default BusynessBadge;
