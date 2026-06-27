"use client";

// ============================================================
// MFRatioBar — M/F crowd ratio indicator
//
// Shows the canonical male-blue to female-pink M/F split only when we have enough data.
// ============================================================

import { cn } from "@/lib/utils";
import { MIN_SAMPLE_SIZE_FOR_RATIO } from "@/lib/signalThresholds";

interface MFRatioBarProps {
  mfRatio: number | null | undefined;
  sampleSize: number | null | undefined;
  compact?: boolean;
  className?: string;
}

export { MIN_SAMPLE_SIZE_FOR_RATIO };

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function formatRecentCheckInBasis(sampleSize: number | null | undefined): string {
  const count = Math.max(0, Math.round(sampleSize ?? 0));
  return `From ${count} check-in${count === 1 ? "" : "s"}`;
}

export function getMFRatioPercents(mfRatio: number | null | undefined): { male: number; female: number } | null {
  if (mfRatio == null || !Number.isFinite(mfRatio)) return null;
  const male = clampPercent(mfRatio);
  return { male, female: 100 - male };
}

export function MFRatioBar({ mfRatio, sampleSize, compact = false, className }: MFRatioBarProps) {
  const percents = getMFRatioPercents(mfRatio);
  const hasData = percents !== null && (sampleSize ?? 0) >= MIN_SAMPLE_SIZE_FOR_RATIO;

  if (!hasData) {
    return null;
  }

  const { male, female } = percents;

  return (
    <div
      className={cn("space-y-1.5", className)}
      role="img"
      aria-label={`Male/female ratio: ${male}% male, ${female}% female`}
    >
      <div className={cn("flex h-2 w-full overflow-hidden rounded-full bg-white/[0.08]", compact && "h-1.5")} aria-hidden="true">
        <div
          className="venue-fill-motion h-full bg-[#8B6CFF]"
          style={{ width: `${male}%` }}
        />
        <div
          className="venue-fill-motion h-full bg-[#F0568C]"
          style={{ width: `${female}%` }}
        />
      </div>
      <p className={cn("font-semibold text-[#9CA2AE]", compact ? "text-[11px]" : "text-xs")}>
        {male}% M · {female}% F
      </p>
      <p className={cn("font-semibold text-[#9CA2AE]", compact ? "text-[11px]" : "text-xs")}>
        {formatRecentCheckInBasis(sampleSize)}
      </p>
    </div>
  );
}

export default MFRatioBar;
