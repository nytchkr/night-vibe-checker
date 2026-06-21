"use client";

import { useId } from "react";
import { motion } from "framer-motion";

type MFBarSource = "live" | "forecast" | null;
const MIN_SAMPLE_SIZE_FOR_RATIO = 2;

interface MFBarProps {
  malePercent: number | null;
  sampleSize: number;
  source: MFBarSource;
  className?: string;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function MFBar({ malePercent, sampleSize, source, className }: MFBarProps) {
  const rawId = useId();
  const layoutId = `mf-bar-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hasData = malePercent !== null && sampleSize >= MIN_SAMPLE_SIZE_FOR_RATIO;

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
          className="h-full bg-[#4F9DFF]"
          initial={{ width: "0%" }}
          animate={{ width: `${male}%` }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        />
        <motion.div
          layoutId={`${layoutId}-female`}
          className="h-full flex-1 bg-[#F0568C]"
          initial={{ width: "0%" }}
          animate={{ width: `${female}%` }}
          transition={{ duration: 0.55, ease: "easeOut", delay: 0.04 }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold text-[#9CA2AE]">
        <span>{male}% guys</span>
        <span>{female}% girls</span>
      </div>
      <p className="mt-1 text-[11px] font-medium text-[#646B79]">
        based on {sampleSize} report{sampleSize === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export default MFBar;
