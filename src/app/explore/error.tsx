"use client";

import Link from "next/link";

export default function ExploreError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen-safe flex-col items-center justify-center bg-[#0A0A0E] px-6 text-center font-sans text-white">
      <p className="font-display text-sm font-black uppercase tracking-normal text-[#8B6CFF]">Explore</p>
      <h1 className="mt-4 font-display text-3xl font-black tracking-normal text-white">
        Something went wrong.
      </h1>
      <p className="mt-3 max-w-sm text-sm font-medium leading-6 text-white/60">
        We could not load the venue list. Try again or head back to the map.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-[#8B6CFF] px-6 py-3 font-display text-sm font-black text-[#0A0A0E] shadow-[0_0_28px_rgba(139,108,255,0.24)] transition-colors hover:bg-[#F0568C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          Try again
        </button>
        <Link
          href="/map"
          className="rounded-full border border-white/15 px-6 py-3 font-display text-sm font-black text-white transition-colors hover:border-[#F0568C]/50 hover:text-[#F0568C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          Go back to map
        </Link>
      </div>
    </main>
  );
}
