"use client";

export default function Error({
  error: _error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0E] px-6 text-center font-sans text-white">
      <p className="font-display text-sm font-black uppercase tracking-normal text-[#8B6CFF]">NightVibe</p>
      <h1 className="mt-4 font-display text-3xl font-black tracking-normal text-white">
        Something went sideways.
      </h1>
      <p className="mt-3 max-w-sm text-sm font-medium leading-6 text-white/60">
        The vibe check hit an unexpected snag. Try again without losing your place.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 rounded-full bg-[#8B6CFF] px-6 py-3 font-display text-sm font-black text-[#0A0A0E] shadow-[0_0_28px_rgba(139,108,255,0.24)] transition-colors hover:bg-[#F0568C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      >
        Try again
      </button>
    </div>
  );
}
