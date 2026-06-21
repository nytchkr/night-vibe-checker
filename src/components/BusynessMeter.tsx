"use client";

import { motion } from "framer-motion";
import { BusynessBadge } from "@/components/BusynessBadge";
import type { BusynessSource } from "@/types";

interface BusynessMeterProps {
  value: number | null;
  source: BusynessSource | null;
  className?: string;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function getBusynessConfig(value: number) {
  if (value <= 33) return { label: "Dead", color: "#5C6573" };
  if (value <= 66) return { label: "Moderate", color: "#FFB020" };
  return { label: "Packed", color: "#FF5B6A" };
}

export function BusynessMeter({ value, source, className }: BusynessMeterProps) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <div className={className}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[#646B79]">No busyness data</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10" aria-hidden="true" />
      </div>
    );
  }

  const percent = clampPercent(value);
  const config = getBusynessConfig(percent);

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold" style={{ color: config.color }}>
          {config.label}
        </span>
        <BusynessBadge source={source} />
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10"
        role="meter"
        aria-label={`${config.label} busyness`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}% busy`}
      >
        <motion.div
          className="h-full rounded-full"
          initial={{ width: "0%" }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          style={{ backgroundColor: config.color }}
        />
      </div>
    </div>
  );
}

export default BusynessMeter;
