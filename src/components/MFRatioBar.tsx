"use client";

// ============================================================
// MFRatioBar — M/F crowd ratio indicator
//
// Shows the canonical male-blue to female-pink M/F split only when we have enough data.
// ============================================================

import { cn } from "@/lib/utils";

interface MFRatioBarProps {
  mfRatio: number | null | undefined;
  sampleSize: number | null | undefined;
  compact?: boolean;
  className?: string;
}

export const MIN_SAMPLE_SIZE_FOR_RATIO = 3;

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function formatRecentCheckInBasis(sampleSize: number | null | undefined): string {
  const count = Math.max(0, Math.round(sampleSize ?? 0));
  return `Based on ${count} check-in${count === 1 ? "" : "s"} in the last 4 hours`;
}

export function getMFRatioPercents(mfRatio: number | null | undefined): { male: number; female: number } | null {
  if (mfRatio == null || !Number.isFinite(mfRatio)) return null;

  // Canonical contract: 0 = all M, 0.5 = equal, 1 = all F.
  // Some older rows still carry 0-100 male percentages; tolerate them until all signals are migrated.
  if (mfRatio > 1) {
    const male = clampPercent(mfRatio);
    return { male, female: 100 - male };
  }

  const female = clampPercent(mfRatio * 100);
  return { male: 100 - female, female };
}

export function MFRatioBar({ mfRatio, sampleSize, compact = false, className }: MFRatioBarProps) {
  const percents = getMFRatioPercents(mfRatio);
  const hasData = percents !== null && (sampleSize ?? 0) >= MIN_SAMPLE_SIZE_FOR_RATIO;

  if (!hasData) {
    return (
      <div
        className={cn("space-y-1.5", className)}
        role="img"
        aria-label="Male/female ratio: not enough data yet"
      >
        <div className={cn("h-2 w-full rounded-full bg-[#1A1A2E]", compact && "h-1.5")} aria-hidden="true" />
        <p className={cn("font-semibold text-white/45", compact ? "text-[11px]" : "text-xs")}>
          Need 3 check-ins in the last 4 hours
        </p>
      </div>
    );
  }

  const { male, female } = percents;

  return (
    <div
      className={cn("space-y-1.5", className)}
      role="img"
      aria-label={`Male/female ratio: ${male}% male, ${female}% female`}
    >
      <div className={cn("flex h-2 w-full overflow-hidden rounded-full bg-[#1A1A2E]", compact && "h-1.5")} aria-hidden="true">
        <div
          className="h-full bg-[#4A90D9]"
          style={{ width: `${male}%` }}
        />
        <div
          className="h-full bg-[#E8649A]"
          style={{ width: `${female}%` }}
        />
      </div>
      <p className={cn("font-semibold text-white/60", compact ? "text-[11px]" : "text-xs")}>
        {male}% M · {female}% F
      </p>
      <p className={cn("font-semibold text-white/40", compact ? "text-[11px]" : "text-xs")}>
        {formatRecentCheckInBasis(sampleSize)}
      </p>
    </div>
  );
}

export default MFRatioBar;
