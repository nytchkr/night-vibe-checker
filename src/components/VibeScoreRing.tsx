"use client";

// ============================================================
// VibeScoreRing
//
// SVG ring that fills in from 0 to `score` on mount.
// Color transitions from cool blue (low) through amber to
// hot pink/red (high) matching a nightlife "temperature" feel.
// ============================================================

import { useEffect, useRef, useState } from "react";

interface VibeScoreRingProps {
  /** 0–10 vibe score */
  score: number;
  /** Outer diameter in px (default 120) */
  size?: number;
  /** Ring stroke width in px (default 10) */
  strokeWidth?: number;
  /** Optional additional class names */
  className?: string;
}

// Map a 0–10 score to an HSL color.
// 0   → 220° (cool blue)
// 5   → 45°  (amber)
// 10  → 330° (hot pink)
function scoreToColor(score: number): string {
  const t = Math.max(0, Math.min(score, 10)) / 10;
  // Piecewise hue: blue→amber for lower half, amber→pink for upper half
  const hue = t < 0.5
    ? 220 - (220 - 45) * (t / 0.5)           // 220 → 45
    : 45 - (45 - 330 + 360) * ((t - 0.5) / 0.5); // 45 → 330 (wrapping through 0)

  // Saturation and lightness stay vivid
  const saturation = 85;
  const lightness = 55 + (1 - t) * 5; // slightly lighter at low scores

  return `hsl(${hue % 360}, ${saturation}%, ${lightness}%)`;
}

export function VibeScoreRing({
  score,
  size = 120,
  strokeWidth = 10,
  className = "",
}: VibeScoreRingProps) {
  const clampedScore = Math.max(0, Math.min(score, 10));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Animate from 0 to final dashOffset on mount
  const [animatedScore, setAnimatedScore] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const DURATION_MS = 900;

  useEffect(() => {
    // Reset and re-animate whenever score prop changes
    setAnimatedScore(0);
    startRef.current = null;

    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / DURATION_MS, 1);

      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(eased * clampedScore);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [clampedScore]);

  // stroke-dashoffset drives the fill: full circumference = empty ring
  const offset = circumference - (animatedScore / 10) * circumference;
  const color = scoreToColor(animatedScore);

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-label={`Vibe score ${clampedScore} out of 10`}
      role="img"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        // Rotate so the ring starts at the top (12 o'clock)
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        {/* Animated foreground arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke 0.1s ease" }}
          // Glow effect via filter
          filter="url(#vibeGlow)"
        />
        <defs>
          {/* Score-proportional glow: cyan at low scores, magenta at high */}
          <filter id="vibeGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation={1.5 + (animatedScore / 10) * 5} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* Score label */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ color }}
      >
        <span
          className="font-bold leading-none tabular-nums"
          style={{ fontSize: size * 0.26 }}
        >
          {animatedScore.toFixed(1)}
        </span>
        <span
          className="text-white/50 font-medium uppercase tracking-widest"
          style={{ fontSize: size * 0.1 }}
        >
          vibe
        </span>
      </div>
    </div>
  );
}

export default VibeScoreRing;
