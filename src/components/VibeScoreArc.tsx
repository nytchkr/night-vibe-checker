"use client";

type VibeScoreArcProps = {
  score: number | null;
  size?: number;
};

function getScoreColorClass(score: number | null): string {
  if (score == null) return "text-[#00F5D4]";
  if (score <= 33) return "text-[#00F5D4]";
  if (score <= 66) return "text-[#FFD166]";
  return "text-[#F0568C]";
}

function clampScore(score: number | null): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function VibeScoreArc({ score, size = 36 }: VibeScoreArcProps) {
  const normalizedScore = clampScore(score);
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const progress = normalizedScore == null ? 0 : normalizedScore / 100;
  const dashOffset = circumference * (1 - progress);
  const colorClass = getScoreColorClass(normalizedScore);
  const label = normalizedScore == null ? "?" : String(normalizedScore);

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full border border-white/15 bg-[#050507]/80 shadow-[0_0_18px_rgba(0,0,0,0.36)] backdrop-blur-md ${colorClass}`}
      style={{ width: size, height: size }}
      aria-label={normalizedScore == null ? "Vibe score unavailable" : `Vibe score ${normalizedScore} out of 100`}
      role="img"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        className="overflow-visible"
        aria-hidden="true"
      >
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="3"
        />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="origin-center -rotate-90 transition-[stroke-dashoffset] duration-500 ease-out"
        />
        <text
          x="18"
          y="18.5"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-current text-[10px] font-bold"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}

export default VibeScoreArc;
