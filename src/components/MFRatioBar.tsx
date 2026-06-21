"use client";

// ============================================================
// MFRatioBar — M/F crowd ratio indicator
//
// Shows the canonical male-blue to female-pink M/F split only when we have enough data.
// ============================================================

interface MFRatioBarProps {
  malePercent: number | null;
  confidence: number | null;
  sampleSize: number;
}

const MIN_SAMPLE_SIZE_FOR_RATIO = 2;

export function MFRatioBar({ malePercent, confidence, sampleSize }: MFRatioBarProps) {
  const hasData = malePercent !== null && sampleSize >= MIN_SAMPLE_SIZE_FOR_RATIO;

  if (!hasData) {
    return (
      <p className="text-sm text-[#9CA2AE]">
        No live reads yet — be the first to report
      </p>
    );
  }

  const femalePercent = 100 - malePercent;
  const confidencePct = confidence != null ? Math.round(confidence * 100) : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">M/F</span>
        <span className="text-[11px] text-white/45">
          {malePercent}% M · {femalePercent}% F
          {confidencePct != null && (
            <span className="ml-1 text-white/28">({confidencePct}% conf)</span>
          )}
        </span>
      </div>
      {/* Male blue → female pink split */}
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-white/10"
        role="img"
        aria-label={`${malePercent}% male, ${femalePercent}% female`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: "100%",
            background: `linear-gradient(to right, #4F9DFF 0%, #4F9DFF ${malePercent}%, #F0568C ${malePercent}%, #F0568C 100%)`,
          }}
        />
      </div>
    </div>
  );
}

export default MFRatioBar;
