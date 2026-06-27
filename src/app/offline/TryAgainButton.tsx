"use client";

export function TryAgainButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="rounded-full bg-[#8B6CFF] px-6 py-3 font-display text-sm font-black text-[#0A0A0E] shadow-[0_0_28px_rgba(139,108,255,0.28)] transition-colors hover:bg-[#F0568C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
    >
      Try again
    </button>
  );
}
