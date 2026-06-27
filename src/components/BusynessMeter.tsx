import { BusynessBadge } from "@/components/BusynessBadge";
import { formatSignalConfidenceLabel } from "@/lib/signalConfidenceLabel";
import type { BusynessSource } from "@/types";

interface BusynessMeterProps {
  value: number | null;
  source: BusynessSource | null;
  sampleSize?: number;
  computedAt?: string | null;
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

export function BusynessMeter({ value, source, sampleSize = 0, computedAt = null, className }: BusynessMeterProps) {
  const confidenceLabel = formatSignalConfidenceLabel({ busynessSource: source, sampleSize });

  if (value == null || !Number.isFinite(value)) {
    return (
      <div className={className}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[#9CA2AE]">No crowd data yet</span>
        </div>
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
        <BusynessBadge source={source} computedAt={computedAt} />
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
        <div
          className="venue-fill-motion h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: config.color }}
        />
      </div>
      <p className="mt-1.5 text-xs text-[#9CA2AE]">{confidenceLabel}</p>
    </div>
  );
}

export default BusynessMeter;
