"use client";

import { useId } from "react";
import * as motion from "framer-motion/client";
import { useReducedMotion } from "@/hooks/useReducedMotion";

type MFBarSource = "live" | "forecast" | null;
const MIN_SAMPLE_SIZE_FOR_RATIO = 5;

interface MFBarProps {
  malePercent: number | null;
  sampleSize: number;
  source: MFBarSource;
  showWhenRatioPresent?: boolean;
  className?: string;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function MFBar({ malePercent, sampleSize, source, showWhenRatioPresent = false, className }: MFBarProps) {
  const rawId = useId();
  const prefersReducedMotion = useReducedMotion();
  const layoutId = `mf-bar-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hasData = malePercent !== null && (showWhenRatioPresent || sampleSize >= MIN_SAMPLE_SIZE_FOR_RATIO);

  if (!hasData) {
    return null;
  }

  const male = clampPercent(malePercent);
  const female = 100 - male;
  const sourceLabel = source ? ` ${source}` : "";

  return (
    <div className={className}>
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-white/10"
        role="meter"
        aria-label={`${male}% guys, ${female}% girls${sourceLabel}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={male}
        aria-valuetext={`${male}% guys, ${female}% girls`}
      >
        <motion.div
          layoutId={`${layoutId}-male`}
          className="h-full bg-[#8B6CFF]"
          initial={prefersReducedMotion ? false : { width: "0%" }}
          animate={{ width: `${male}%` }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: "easeOut" }}
        />
        <motion.div
          layoutId={`${layoutId}-female`}
          className="h-full flex-1 bg-[#F0568C]"
          initial={prefersReducedMotion ? false : { width: "0%" }}
          animate={{ width: `${female}%` }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: "easeOut", delay: 0 }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold text-[#9CA2AE]">
        <span>{male}% guys</span>
        <span>{female}% girls</span>
      </div>
      <p className="mt-1 text-[11px] font-medium text-[#9CA2AE]">
        based on {sampleSize} report{sampleSize === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export default MFBar;
