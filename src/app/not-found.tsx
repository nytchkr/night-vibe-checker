import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0E] px-6 text-center font-sans text-white">
      <p className="font-display text-7xl font-black tracking-normal text-[#8B6CFF]">404</p>
      <p className="mt-5 max-w-sm text-base font-medium leading-7 text-white/70">
        This venue doesn't exist (yet).
      </p>
      <Link
        href="/map"
        className="mt-8 rounded-full border border-[#8B6CFF]/40 bg-[#8B6CFF] px-6 py-3 font-display text-sm font-black text-[#0A0A0E] shadow-[0_0_28px_rgba(139,108,255,0.24)] transition-colors hover:bg-[#F0568C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      >
        Go back to map
      </Link>
    </main>
  );
}
