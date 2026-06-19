"use client";

// ============================================================
// MFRatioBar — M/F crowd ratio indicator
//
// Shows a blue-to-pink gradient bar when we have enough data.
// Gray placeholder when sample is too small or data is absent.
// ============================================================

interface MFRatioBarProps {
  malePercent: number | null;
  confidence: number | null;
  sampleSize: number;
}

export function MFRatioBar({ malePercent, confidence, sampleSize }: MFRatioBarProps) {
  const hasData = malePercent !== null && sampleSize >= 3;

  if (!hasData) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">M/F</span>
          <span className="text-[11px] text-white/30">No reads yet</span>
        </div>
        {/* Gray placeholder bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div className="h-full w-full rounded-full bg-[#6B7280]/40" />
        </div>
      </div>
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
      {/* Blue (male) → pink (female) gradient fill */}
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-white/10"
        role="img"
        aria-label={`${malePercent}% male, ${femalePercent}% female`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: "100%",
            background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${malePercent}%, #EC4899 ${malePercent}%, #EC4899 100%)`,
          }}
        />
      </div>
    </div>
  );
}

export default MFRatioBar;
