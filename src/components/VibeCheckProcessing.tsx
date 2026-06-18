"use client";

// ============================================================
// VibeCheckProcessing
//
// Loading screen shown while the AI is analyzing a venue.
// Features a pulsing animated ring and descriptive copy.
// Pure CSS animations — no external deps.
// ============================================================

interface VibeCheckProcessingProps {
  /** Name of the venue being analyzed */
  venueName: string;
}

export function VibeCheckProcessing({ venueName }: VibeCheckProcessingProps) {
  return (
    <div
      role="status"
      aria-label={`Analyzing vibe for ${venueName}`}
      className="flex flex-col items-center justify-center gap-6 py-12 px-6 text-center"
    >
      {/* Animated pulsing ring */}
      <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
        {/* Outermost slow pulse ring */}
        <span
          className="absolute inset-0 rounded-full"
          style={{
            border: "2px solid rgba(0,245,212,0.2)",
            animation: "vibeOuterPulse 2.4s ease-out infinite",
          }}
        />
        {/* Middle ring */}
        <span
          className="absolute rounded-full"
          style={{
            inset: 12,
            border: "2px solid rgba(0,245,212,0.35)",
            animation: "vibeOuterPulse 2.4s ease-out 0.4s infinite",
          }}
        />
        {/* Inner glowing ring */}
        <span
          className="absolute rounded-full"
          style={{
            inset: 24,
            border: "3px solid rgba(0,245,212,0.7)",
            boxShadow: "0 0 16px rgba(0,245,212,0.5), inset 0 0 12px rgba(0,245,212,0.2)",
            animation: "vibeInnerSpin 1.4s linear infinite",
          }}
        />
        {/* Center dot */}
        <span
          className="absolute rounded-full"
          style={{
            width: 10,
            height: 10,
            backgroundColor: "#00F5D4",
            boxShadow: "0 0 12px #00F5D4",
            animation: "vibeDotPulse 1.4s ease-in-out infinite",
          }}
        />

        {/* Keyframe definitions injected via a style tag */}
        <style>{`
          @keyframes vibeOuterPulse {
            0%   { opacity: 0.8; transform: scale(1); }
            70%  { opacity: 0;   transform: scale(1.25); }
            100% { opacity: 0;   transform: scale(1.25); }
          }
          @keyframes vibeInnerSpin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @keyframes vibeDotPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%       { opacity: 0.5; transform: scale(0.7); }
          }
        `}</style>
      </div>

      {/* Primary copy */}
      <div className="space-y-2">
        <p className="text-white font-semibold text-lg leading-snug">
          Analyzing the vibe at{" "}
          <span className="text-cyan-400">{venueName}</span>
          &hellip;
        </p>

        {/* Subtext */}
        <p className="text-white/40 text-sm">This takes about 5 seconds</p>
      </div>

      {/* Animated dots for extra liveliness */}
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-cyan-400/60"
            style={{
              animation: `vibeDotPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default VibeCheckProcessing;
