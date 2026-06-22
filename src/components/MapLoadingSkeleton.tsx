import type { CSSProperties } from "react";

export function getMapViewportStyle(): CSSProperties {
  return {
    height: process.env.NEXT_PUBLIC_ENV === "development"
      ? "calc(100dvh - 5.25rem - env(safe-area-inset-bottom))"
      : "calc(100dvh - 4rem - env(safe-area-inset-bottom))",
    minHeight: "420px",
  };
}

export function MapLoadingSkeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`relative w-full overflow-hidden bg-[#0A0A0E] text-white transition-opacity duration-300 ${className}`}
      style={style ?? getMapViewportStyle()}
      role="status"
      aria-label="Loading map"
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:42px_42px] opacity-60" />
      <div className="absolute left-4 top-4 h-10 w-40 animate-pulse rounded-full bg-white/[0.06]" />
      <div className="absolute left-1/2 top-14 h-9 w-52 -translate-x-1/2 animate-pulse rounded-full bg-white/[0.06]" />
      <div className="absolute bottom-20 left-1/2 h-9 w-64 -translate-x-1/2 animate-pulse rounded-full bg-white/[0.06]" />
      <div className="absolute inset-x-0 bottom-0 h-[120px] rounded-t-3xl border-t border-white/[0.08] bg-[#0A0A0E]/95 px-4 pt-3 backdrop-blur-xl">
        <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />
        <div className="mx-auto mt-3 h-9 w-44 animate-pulse rounded-full bg-white/[0.06]" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-[#0A0A0E]/80 px-7 py-6 shadow-2xl backdrop-blur">
          <span className="h-10 w-10 animate-pulse rounded-full bg-white/[0.08]" aria-hidden="true" />
          <span className="text-sm font-semibold text-white/50">Loading map...</span>
        </div>
      </div>
    </div>
  );
}
